import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import test from 'node:test';

import { RateLimiter } from '../src/auth/middleware.js';
import { handleOrganizationRoutes } from '../src/index.js';

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
  const stream = payload === null ? Readable.from([]) : Readable.from([payload]);

  return {
    method,
    url: `http://localhost${path}`,
    headers: {
      ...(payload !== null ? { 'content-type': 'application/json' } : {}),
    },
    socket: { remoteAddress: '127.0.0.1' },
    session,
    on: stream.on.bind(stream),
    once: stream.once.bind(stream),
    destroy: () => undefined,
  } as any;
}

test('organization workspace routes list and link linked workspaces with org RBAC gating', async () => {
  const ownerId = randomUUID();
  const memberId = randomUUID();
  const orgId = randomUUID();
  const workspaceId = randomUUID();
  const workspace = { id: workspaceId, slug: 'alpha', name: 'Alpha', ownerId: randomUUID(), isIsolated: false, settings: {}, createdAt: new Date(), updatedAt: new Date() };

  const bundle = {
    audit: { recordEvent: async () => ({}) },
    users: { findById: async () => ({ id: ownerId, isActive: true }) },
    sessions: { findSessionByTokenHash: async () => null },
    organizations: {
      findById: async (targetOrgId: string) => (targetOrgId === orgId ? { id: orgId, name: 'Org', slug: 'org', ownerId, createdAt: new Date(), updatedAt: new Date() } : null),
      getMember: async (targetOrgId: string, targetUserId: string) => {
        if (targetOrgId === orgId && targetUserId === ownerId) {
          return { organizationId: orgId, userId: ownerId, role: 'owner', joinedAt: new Date() };
        }
        if (targetOrgId === orgId && targetUserId === memberId) {
          return { organizationId: orgId, userId: memberId, role: 'member', joinedAt: new Date() };
        }
        return null;
      },
      listWorkspaces: async (targetOrgId: string) => (targetOrgId === orgId ? [workspaceId] : []),
      linkWorkspace: async ({ organizationId, workspaceId: nextWorkspaceId }: { organizationId: string; workspaceId: string }) => ({
        id: randomUUID(), organizationId, workspaceId: nextWorkspaceId, assignedAt: new Date(),
      }),
      unlinkWorkspace: async () => true,
      getWorkspaceOrganization: async (targetWorkspaceId: string) => (targetWorkspaceId === workspaceId ? { id: orgId, name: 'Org', slug: 'org', ownerId, createdAt: new Date(), updatedAt: new Date() } : null),
    },
    workspaces: {
      findById: async (targetWorkspaceId: string) => (targetWorkspaceId === workspaceId ? workspace : null),
      listByOrganization: async (targetOrgId: string) => (targetOrgId === orgId ? [workspace] : []),
    },
  } as any;

  const listRequest = createRequest('GET', `/api/organizations/${orgId}/workspaces`, { userId: ownerId, organizationId: orgId, orgRole: 'owner' });
  const listResponse = createMockResponse();
  const listHandled = await handleOrganizationRoutes(listRequest, listResponse, bundle, `/api/organizations/${orgId}/workspaces`, new RateLimiter(60_000, 5));
  assert.equal(listHandled, true);
  assert.equal(listResponse.statusCode, 200);
  const listPayload = JSON.parse(listResponse.body ?? '{}');
  assert.equal(listPayload.success, true);
  assert.deepEqual(listPayload.workspaces.map((item: { id: string }) => item.id), [workspaceId]);

  const duplicateRequest = createRequest('POST', `/api/organizations/${orgId}/workspaces`, { userId: ownerId, organizationId: orgId, orgRole: 'owner' }, { workspaceId });
  const duplicateResponse = createMockResponse();
  const duplicateHandled = await handleOrganizationRoutes(duplicateRequest, duplicateResponse, bundle, `/api/organizations/${orgId}/workspaces`, new RateLimiter(60_000, 5));
  assert.equal(duplicateHandled, true);
  assert.equal(duplicateResponse.statusCode, 409);

  const unauthorizedRequest = createRequest('POST', `/api/organizations/${orgId}/workspaces`, { userId: memberId, organizationId: orgId, orgRole: 'member' }, { workspaceId: randomUUID() });
  const unauthorizedResponse = createMockResponse();
  const unauthorizedHandled = await handleOrganizationRoutes(unauthorizedRequest, unauthorizedResponse, bundle, `/api/organizations/${orgId}/workspaces`, new RateLimiter(60_000, 5));
  assert.equal(unauthorizedHandled, true);
  assert.equal(unauthorizedResponse.statusCode, 403);
});
