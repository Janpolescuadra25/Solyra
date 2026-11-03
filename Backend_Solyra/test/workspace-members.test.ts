import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import test from 'node:test';

import { signSessionToken } from '../src/auth/utils.js';
import { handleWorkspaceRoutes } from '../src/index.js';
import { InMemoryWorkspaceRepository } from '../src/persistence/in-memory/workspace.repository.js';

const jwtSecret = 'solyra-dev-jwt-secret-do-not-use-in-production-change-me';

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as string | undefined,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    writeHead(statusCode: number, headers?: Record<string, string>) {
      this.statusCode = statusCode;
      if (headers) {
        Object.assign(this.headers, headers);
      }
      return this;
    },
    end(payload?: string | Record<string, unknown>) {
      this.body = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
      return this;
    },
  } as any;
}

function createRequest(method: string, path: string, session?: Record<string, unknown>, body?: unknown) {
  const payload = body === undefined ? null : JSON.stringify(body);
  const requestStream = payload === null ? Readable.from([]) : Readable.from([payload]);

  return {
    method,
    url: `http://localhost${path}`,
    headers: {
      ...(payload !== null ? { 'content-type': 'application/json' } : {}),
      ...(session ? { authorization: `Bearer ${signSessionToken({
        sub: String(session.userId ?? 'test-user'),
        workspaceId: session.workspaceId ?? null,
        organizationId: session.organizationId ?? null,
        role: String(session.role ?? 'member'),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }, jwtSecret)}` } : {}),
    },
    socket: { remoteAddress: '127.0.0.1' },
    on: requestStream.on.bind(requestStream),
    once: requestStream.once.bind(requestStream),
    destroy: () => undefined,
  } as any;
}

test('workspace member listing returns members with user metadata', async () => {
  const repo = new InMemoryWorkspaceRepository();
  const workspaceId = randomUUID();

  await repo.create({
    id: workspaceId,
    slug: 'member-list',
    name: 'Member list workspace',
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
    isIsolated: false,
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await repo.addMember(workspaceId, 'user-1', 'member');
  const members = repo.listMembers(workspaceId);

  assert.equal(members.length, 1);
  assert.equal(members[0].role, 'member');
  assert.equal(members[0].user?.email, 'user-1@example.com');
  assert.equal(members[0].user?.fullName, 'Test User');
});

test('workspace member role updates normalize and persist', async () => {
  const repo = new InMemoryWorkspaceRepository();
  const workspaceId = randomUUID();

  await repo.create({
    id: workspaceId,
    slug: 'member-role-updates',
    name: 'Member role updates',
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
    isIsolated: false,
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await repo.addMember(workspaceId, 'user-1', 'member');
  const updated = repo.updateMemberRole(workspaceId, 'user-1', 'ADMIN');

  assert.equal(updated.role, 'admin');
  const member = repo.getMember(workspaceId, 'user-1');
  assert.equal(member?.role, 'admin');
});

test('workspace member role updates reject invalid roles and last-owner demotion', async () => {
  const repo = new InMemoryWorkspaceRepository();
  const workspaceId = randomUUID();

  await repo.create({
    id: workspaceId,
    slug: 'owner-protection',
    name: 'Owner protection',
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
    isIsolated: false,
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await repo.addMember(workspaceId, 'owner-1', 'owner');
  assert.throws(() => repo.updateMemberRole(workspaceId, 'owner-1', 'not-a-role'), /invalid/i);
  assert.throws(() => repo.updateMemberRole(workspaceId, 'owner-1', 'member'), /sole workspace owner/i);
});

test('workspace member role updates allow secondary owners to be demoted', async () => {
  const repo = new InMemoryWorkspaceRepository();
  const workspaceId = randomUUID();

  await repo.create({
    id: workspaceId,
    slug: 'secondary-owner',
    name: 'Secondary owner',
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
    isIsolated: false,
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await repo.addMember(workspaceId, 'owner-1', 'owner');
  await repo.addMember(workspaceId, 'owner-2', 'owner');
  const updated = repo.updateMemberRole(workspaceId, 'owner-1', 'member');

  assert.equal(updated.role, 'member');
  assert.equal(repo.getMember(workspaceId, 'owner-1')?.role, 'member');
});

test('workspace role-update route blocks self-changes and admin owner edits', async () => {
  const ownerId = randomUUID();
  const adminId = randomUUID();
  const workspaceId = randomUUID();
  const buildBundle = (sessionUserId: string, targetUserId: string, callerRole: string) => ({
    sessions: {
      findSessionByTokenHash: async () => ({
        id: randomUUID(),
        userId: sessionUserId,
        workspaceId: null,
        organizationId: null,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        revokedAt: null,
        revocationReason: null,
      }),
    },
    users: {
      findById: async () => ({ id: sessionUserId, isActive: true }),
    },
    workspaces: {
      findById: async () => ({
        id: workspaceId,
        slug: 'route-policy',
        name: 'Route policy',
        ownerId,
        isIsolated: false,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      getMember: async (_workspaceId: string, userId: string) => {
        if (userId === ownerId) {
          return { workspaceId, userId: ownerId, role: 'owner', joinedAt: new Date() };
        }
        if (userId === adminId) {
          return { workspaceId, userId: adminId, role: 'admin', joinedAt: new Date() };
        }
        if (userId === targetUserId) {
          return { workspaceId, userId: targetUserId, role: 'member', joinedAt: new Date() };
        }
        return null;
      },
      listMembers: async () => [
        { workspaceId, userId: ownerId, role: 'owner', joinedAt: new Date() },
        { workspaceId, userId: adminId, role: 'admin', joinedAt: new Date() },
      ],
      updateMemberRole: async (_workspaceId: string, _userId: string, newRole: string) => ({
        workspaceId,
        userId: _userId,
        role: newRole,
        joinedAt: new Date(),
      }),
    },
    organizations: {
      getOrganizationByWorkspaceId: async () => null,
    },
    audit: {
      recordEvent: async () => undefined,
    },
  } as any);

  const selfToken = signSessionToken({ sub: ownerId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }, jwtSecret);
  const selfRequest = createRequest('PUT', `/api/workspaces/${workspaceId}/members/${ownerId}/role`, { userId: ownerId }, { role: 'member' });
  selfRequest.headers.authorization = `Bearer ${selfToken}`;
  const selfResponse = createMockResponse();
  const selfHandled = await handleWorkspaceRoutes(selfRequest, selfResponse, buildBundle(ownerId, ownerId, 'owner') as any, `/api/workspaces/${workspaceId}/members/${ownerId}/role`);

  assert.equal(selfHandled, true);
  assert.equal(selfResponse.statusCode, 400);

  const adminToken = signSessionToken({ sub: adminId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }, jwtSecret);
  const adminRequest = createRequest('PUT', `/api/workspaces/${workspaceId}/members/${ownerId}/role`, { userId: adminId }, { role: 'member' });
  adminRequest.headers.authorization = `Bearer ${adminToken}`;
  const adminResponse = createMockResponse();
  const adminHandled = await handleWorkspaceRoutes(adminRequest, adminResponse, buildBundle(adminId, ownerId, 'admin') as any, `/api/workspaces/${workspaceId}/members/${ownerId}/role`);

  assert.equal(adminHandled, true);
  assert.equal(adminResponse.statusCode, 403);
});

test('workspace role update route records the audit event for member-role changes', async () => {
  const ownerId = randomUUID();
  const targetUserId = randomUUID();
  const workspaceId = randomUUID();
  const auditEvents: any[] = [];

  const bundle = {
    sessions: {
      findSessionByTokenHash: async () => ({
        id: randomUUID(),
        userId: ownerId,
        workspaceId: null,
        organizationId: null,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        revokedAt: null,
        revocationReason: null,
      }),
    },
    users: {
      findById: async () => ({ id: ownerId, isActive: true }),
    },
    workspaces: {
      findById: async () => ({
        id: workspaceId,
        slug: 'audit-role-update',
        name: 'Audit role update',
        ownerId,
        isIsolated: false,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      getMember: async (_workspaceId: string, userId: string) => {
        if (userId === ownerId) {
          return { workspaceId, userId: ownerId, role: 'owner', joinedAt: new Date() };
        }
        if (userId === targetUserId) {
          return { workspaceId, userId: targetUserId, role: 'member', joinedAt: new Date() };
        }
        return null;
      },
      listMembers: async () => [
        { workspaceId, userId: ownerId, role: 'owner', joinedAt: new Date() },
        { workspaceId, userId: targetUserId, role: 'member', joinedAt: new Date() },
      ],
      updateMemberRole: async (_workspaceId: string, _userId: string, newRole: string) => ({
        workspaceId,
        userId: _userId,
        role: newRole,
        joinedAt: new Date(),
      }),
    },
    organizations: {
      getOrganizationByWorkspaceId: async () => null,
    },
    audit: {
      recordEvent: async (event: any) => {
        auditEvents.push(event);
        return event;
      },
    },
  } as any;

  const token = signSessionToken({ sub: ownerId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }, jwtSecret);
  const request = createRequest('PUT', `/api/workspaces/${workspaceId}/members/${targetUserId}/role`, { userId: ownerId }, { role: 'admin' });
  request.headers.authorization = `Bearer ${token}`;
  const response = createMockResponse();

  const handled = await handleWorkspaceRoutes(request, response, bundle, `/api/workspaces/${workspaceId}/members/${targetUserId}/role`);
  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(auditEvents.length > 0, true);
  assert.equal(auditEvents[0].eventType, 'workspace.member.role_updated');
  assert.equal(auditEvents[0].details.previousRole, 'member');
  assert.equal(auditEvents[0].details.newRole, 'admin');
});
