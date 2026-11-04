import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import test from 'node:test';

import { RateLimiter, requireOrgRole } from '../src/auth/middleware.js';
import { hashToken, signSessionToken } from '../src/auth/utils.js';
import { handleOrganizationRoutes } from '../src/index.js';

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

function createRequest(method: string, path: string, token?: string, body?: unknown) {
  const payload = body === undefined ? null : JSON.stringify(body);
  const requestStream = payload === null ? Readable.from([]) : Readable.from([payload]);

  return {
    method,
    url: `http://localhost${path}`,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(payload !== null ? { 'content-type': 'application/json' } : {}),
    },
    socket: { remoteAddress: '127.0.0.1' },
    on: requestStream.on.bind(requestStream),
    once: requestStream.once.bind(requestStream),
    destroy: () => undefined,
  } as any;
}

test('requireOrgRole authorizes tenant members and rejects unauthorized users', async () => {
  const userId = randomUUID();
  const sessionReq = {
    headers: {
      authorization: `Bearer ${signSessionToken({
        sub: userId,
        workspaceId: null,
        organizationId: 'organization-1',
        role: 'member',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }, jwtSecret)}`,
    },
  } as any;

  const res = { writeHead: () => undefined, end: () => undefined } as any;
  const bundleWithMember = {
    organizations: {
      findById: async (_orgId: string) => ({ id: 'organization-1', name: 'Org 1' }),
      getMember: async (_orgId: string, memberUserId: string) => {
        if (memberUserId === userId) {
          return { role: 'member', userId, organizationId: 'organization-1' };
        }
        return null;
      },
    },
    sessions: {
      findSessionByTokenHash: async () => ({
        id: randomUUID(),
        userId,
        workspaceId: null,
        organizationId: 'organization-1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        revokedAt: null,
        revocationReason: null,
      }),
    },
    users: {
      findById: async () => ({ id: userId, isActive: true }),
    },
  } as any;

  const allowed = await requireOrgRole(sessionReq, res, bundleWithMember, ['member', 'admin'], 'organization-1');
  assert.equal(allowed, true);

  const forbiddenBundle = {
    ...bundleWithMember,
    organizations: {
      ...bundleWithMember.organizations,
      getMember: async () => null,
    },
  };

  const blocked = await requireOrgRole(sessionReq, res, forbiddenBundle, ['member', 'admin'], 'organization-1');
  assert.equal(blocked, false);
});

test('organization routes enforce RBAC and support role changes', async () => {
  const ownerId = randomUUID();
  const memberId = randomUUID();
  const orgId = randomUUID();
  const ownerToken = signSessionToken({
    sub: ownerId,
    workspaceId: null,
    organizationId: orgId,
    role: 'owner',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  }, jwtSecret);
  const memberToken = signSessionToken({
    sub: memberId,
    workspaceId: null,
    organizationId: orgId,
    role: 'member',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  }, jwtSecret);

  const org = {
    id: orgId,
    name: 'Route Org',
    slug: 'route-org',
    ownerId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const membershipMap = new Map<string, { userId: string; role: 'owner' | 'admin' | 'member'; organizationId: string }>([
    [ownerId, { userId: ownerId, role: 'owner', organizationId: orgId }],
    [memberId, { userId: memberId, role: 'member', organizationId: orgId }],
  ]);

  const bundle = {
    audit: { recordEvent: async () => ({}) },
    organizations: {
      create: async (input: { name: string; slug: string; ownerId: string }) => ({
        id: orgId,
        name: input.name,
        slug: input.slug,
        ownerId: input.ownerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      listByUser: async (userId: string) => (membershipMap.has(userId) ? [org] : []),
      findById: async (targetOrgId: string) => (targetOrgId === orgId ? org : null),
      getMember: async (targetOrgId: string, targetUserId: string) => {
        if (targetOrgId !== orgId) return null;
        return membershipMap.get(targetUserId) ?? null;
      },
      listMembers: async (targetOrgId: string) => {
        if (targetOrgId !== orgId) return [];
        return Array.from(membershipMap.values());
      },
      addMember: async ({ organizationId, userId, role }: { organizationId: string; userId: string; role: string }) => {
        if (organizationId !== orgId) throw new Error('Organization not found');
        membershipMap.set(userId, { userId, role: role as 'owner' | 'admin' | 'member', organizationId });
        return { userId, role, organizationId };
      },
      updateMemberRole: async (targetOrgId: string, targetUserId: string, role: 'owner' | 'admin' | 'member') => {
        if (targetOrgId !== orgId || !membershipMap.has(targetUserId)) {
          return false;
        }
        membershipMap.set(targetUserId, { ...membershipMap.get(targetUserId)!, role });
        return true;
      },
      removeMember: async (targetOrgId: string, targetUserId: string) => {
        if (targetOrgId !== orgId || !membershipMap.has(targetUserId)) {
          return false;
        }
        membershipMap.delete(targetUserId);
        return true;
      },
    },
    sessions: {
      findSessionByTokenHash: async (tokenHash: string) => {
        const ownerSessionHash = hashToken(ownerToken);
        const memberSessionHash = hashToken(memberToken);

        if (tokenHash === ownerSessionHash) {
          return {
            id: randomUUID(),
            userId: ownerId,
            workspaceId: null,
            organizationId: orgId,
            tokenHash: ownerSessionHash,
            expiresAt: new Date(Date.now() + 60_000),
            createdAt: new Date(),
            revokedAt: null,
            revocationReason: null,
          };
        }

        if (tokenHash === memberSessionHash) {
          return {
            id: randomUUID(),
            userId: memberId,
            workspaceId: null,
            organizationId: orgId,
            tokenHash: memberSessionHash,
            expiresAt: new Date(Date.now() + 60_000),
            createdAt: new Date(),
            revokedAt: null,
            revocationReason: null,
          };
        }

        return null;
      },
    },
    users: {
      findById: async (targetUserId: string) => ({ id: targetUserId, isActive: true }),
    },
  } as any;

  const listRequest = createRequest('GET', '/api/organizations', ownerToken);
  const listResponse = createMockResponse();
  const listHandled = await handleOrganizationRoutes(listRequest, listResponse, bundle, '/api/organizations', new RateLimiter(60_000, 5));

  assert.equal(listHandled, true);
  assert.equal(listResponse.statusCode, 200);
  const listPayload = JSON.parse(listResponse.body ?? '{}');
  assert.equal(listPayload.success, true);
  assert.equal(Array.isArray(listPayload.organizations), true);

  const roleUpdateRequest = createRequest('PUT', `/api/organizations/${orgId}/members/${memberId}/role`, ownerToken, { role: 'admin' });
  const roleUpdateResponse = createMockResponse();
  const roleUpdated = await handleOrganizationRoutes(
    roleUpdateRequest,
    roleUpdateResponse,
    bundle,
    `/api/organizations/${orgId}/members/${memberId}/role`,
    new RateLimiter(60_000, 5),
  );

  assert.equal(roleUpdated, true);
  assert.equal(roleUpdateResponse.statusCode, 200);
  const roleUpdatePayload = JSON.parse(roleUpdateResponse.body ?? '{}');
  assert.equal(roleUpdatePayload.success, true);
  assert.equal(membershipMap.get(memberId)?.role, 'admin');

  membershipMap.set(memberId, { userId: memberId, role: 'member', organizationId: orgId });

  const forbiddenRequest = createRequest('PUT', `/api/organizations/${orgId}/members/${ownerId}/role`, memberToken, { role: 'member' });
  const forbiddenResponse = createMockResponse();
  const forbiddenHandled = await handleOrganizationRoutes(
    forbiddenRequest,
    forbiddenResponse,
    bundle,
    `/api/organizations/${orgId}/members/${ownerId}/role`,
    new RateLimiter(60_000, 5),
  );

  assert.equal(forbiddenHandled, true);
  assert.equal(forbiddenResponse.statusCode, 403);
  const forbiddenPayload = JSON.parse(forbiddenResponse.body ?? '{}');
  assert.equal(forbiddenPayload.success, false);
});

test('organization audit-log route enforces admin access and filters by action', async () => {
  const ownerId = randomUUID();
  const adminId = randomUUID();
  const memberId = randomUUID();
  const orgId = randomUUID();
  const workspaceId = randomUUID();

  const ownerToken = signSessionToken({
    sub: ownerId,
    workspaceId: null,
    organizationId: orgId,
    role: 'owner',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  }, jwtSecret);

  const memberToken = signSessionToken({
    sub: memberId,
    workspaceId: null,
    organizationId: orgId,
    role: 'member',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  }, jwtSecret);

  const members = new Map<string, { userId: string; role: 'owner' | 'admin' | 'member'; organizationId: string }>([
    [ownerId, { userId: ownerId, role: 'owner', organizationId: orgId }],
    [adminId, { userId: adminId, role: 'admin', organizationId: orgId }],
    [memberId, { userId: memberId, role: 'member', organizationId: orgId }],
  ]);

  const bundle = {
    audit: {
      queryEvents: async (filters: Record<string, any>) => {
        const action = filters.action ?? 'all';
        const items = [
          {
            id: 'audit-1',
            userId: ownerId,
            user_id: ownerId,
            workspaceId: workspaceId,
            workspace_id: workspaceId,
            organizationId: orgId,
            organization_id: orgId,
            action: 'organization.member_added',
            eventType: 'organization.member_added',
            targetType: 'organization_member',
            target_type: 'organization_member',
            targetId: adminId,
            target_id: adminId,
            metadata: { role: 'admin' },
            details: { role: 'admin' },
            createdAt: new Date('2026-11-04T12:00:00.000Z'),
            created_at: new Date('2026-11-04T12:00:00.000Z'),
          },
          {
            id: 'audit-2',
            userId: adminId,
            user_id: adminId,
            workspaceId: workspaceId,
            workspace_id: workspaceId,
            organizationId: orgId,
            organization_id: orgId,
            action: 'workspace.member.role_updated',
            eventType: 'workspace.member.role_updated',
            targetType: 'workspace_member',
            target_type: 'workspace_member',
            targetId: memberId,
            target_id: memberId,
            metadata: { previousRole: 'member', newRole: 'viewer' },
            details: { previousRole: 'member', newRole: 'viewer' },
            createdAt: new Date('2026-11-04T12:30:00.000Z'),
            created_at: new Date('2026-11-04T12:30:00.000Z'),
          },
        ];

        const filtered = items.filter((event) => {
          if (filters.organization_id && event.organizationId !== filters.organization_id) {
            return false;
          }
          if (filters.workspace_id && event.workspaceId !== filters.workspace_id) {
            return false;
          }
          if (filters.action && event.action !== filters.action) {
            return false;
          }
          if (filters.user_id && event.userId !== filters.user_id) {
            return false;
          }
          if (filters.start_date && new Date(event.createdAt) < new Date(filters.start_date)) {
            return false;
          }
          if (filters.end_date && new Date(event.createdAt) > new Date(filters.end_date)) {
            return false;
          }
          return action === 'all' || action === event.action;
        });

        return {
          events: filtered.slice(filters.offset ?? 0, (filters.offset ?? 0) + (filters.limit ?? filtered.length)),
          total: filtered.length,
          limit: filters.limit ?? filtered.length,
          offset: filters.offset ?? 0,
        };
      },
    },
    organizations: {
      findById: async (targetOrgId: string) => (targetOrgId === orgId ? { id: orgId, name: 'Audit Org', slug: 'audit-org', ownerId } : null),
      getMember: async (targetOrgId: string, targetUserId: string) => {
        if (targetOrgId !== orgId) return null;
        return members.get(targetUserId) ?? null;
      },
    },
    sessions: {
      findSessionByTokenHash: async (tokenHash: string) => {
        const ownerSessionHash = hashToken(ownerToken);
        const memberSessionHash = hashToken(memberToken);

        if (tokenHash === ownerSessionHash) {
          return {
            id: randomUUID(),
            userId: ownerId,
            workspaceId: null,
            organizationId: orgId,
            tokenHash: ownerSessionHash,
            expiresAt: new Date(Date.now() + 60_000),
            createdAt: new Date(),
            revokedAt: null,
            revocationReason: null,
          };
        }

        if (tokenHash === memberSessionHash) {
          return {
            id: randomUUID(),
            userId: memberId,
            workspaceId: null,
            organizationId: orgId,
            tokenHash: memberSessionHash,
            expiresAt: new Date(Date.now() + 60_000),
            createdAt: new Date(),
            revokedAt: null,
            revocationReason: null,
          };
        }

        return null;
      },
    },
    users: {
      findById: async (targetUserId: string) => ({ id: targetUserId, isActive: true }),
    },
  } as any;

  const authorizedRequest = createRequest('GET', `/api/organizations/${orgId}/audit-logs?action=organization.member_added&limit=25`, ownerToken);
  const authorizedResponse = createMockResponse();
  const authorizedHandled = await handleOrganizationRoutes(
    authorizedRequest,
    authorizedResponse,
    bundle,
    `/api/organizations/${orgId}/audit-logs?action=organization.member_added&limit=25`,
    new RateLimiter(60_000, 5),
  );

  assert.equal(authorizedHandled, true);
  assert.equal(authorizedResponse.statusCode, 200);
  const authorizedPayload = JSON.parse(authorizedResponse.body ?? '{}');
  assert.equal(authorizedPayload.success, true);
  assert.equal(authorizedPayload.auditLogs.length, 1);
  assert.equal(authorizedPayload.auditLogs[0].action, 'organization.member_added');

  const forbiddenRequest = createRequest('GET', `/api/organizations/${orgId}/audit-logs?limit=25`, memberToken);
  const forbiddenResponse = createMockResponse();
  const forbiddenHandled = await handleOrganizationRoutes(
    forbiddenRequest,
    forbiddenResponse,
    bundle,
    `/api/organizations/${orgId}/audit-logs?limit=25`,
    new RateLimiter(60_000, 5),
  );

  assert.equal(forbiddenHandled, true);
  assert.equal(forbiddenResponse.statusCode, 403);
  const forbiddenPayload = JSON.parse(forbiddenResponse.body ?? '{}');
  assert.equal(forbiddenPayload.success, false);
});
