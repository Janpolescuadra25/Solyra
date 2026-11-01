import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import test from 'node:test';

import { RateLimiter, getEffectiveWorkspaceRole, requireWorkspaceRole } from '../src/auth/middleware.js';
import { signSessionToken } from '../src/auth/utils.js';
import { handleOrganizationRoutes, handleWorkspaceRoutes } from '../src/index.js';

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

test('organization workspace creation route creates a workspace linked to the org for owners and admins', async () => {
  const ownerId = randomUUID();
  const orgId = randomUUID();
  const createdIds: string[] = [];
  const workspaces = new Map<string, any>();

  const bundle = {
    audit: { recordEvent: async () => ({}) },
    organizations: {
      findById: async (targetOrgId: string) => (targetOrgId === orgId ? { id: orgId, name: 'Org', slug: 'org', ownerId, createdAt: new Date(), updatedAt: new Date() } : null),
      getMember: async (targetOrgId: string, targetUserId: string) => (
        targetOrgId === orgId && targetUserId === ownerId ? { organizationId: orgId, userId: ownerId, role: 'owner', joinedAt: new Date() } : null
      ),
      listWorkspaces: async (targetOrgId: string) => (targetOrgId === orgId ? createdIds : []),
      linkWorkspace: async ({ organizationId, workspaceId }: { organizationId: string; workspaceId: string }) => {
        createdIds.push(workspaceId);
        return { id: randomUUID(), organizationId, workspaceId, assignedAt: new Date() };
      },
      getWorkspaceOrganization: async () => null,
    },
    workspaces: {
      findBySlug: async (slug: string) => Array.from(workspaces.values()).find((workspace) => workspace.slug === slug) ?? null,
      findById: async (workspaceId: string) => workspaces.get(workspaceId) ?? null,
      create: async (workspace: any) => {
        workspaces.set(workspace.id, workspace);
        return workspace;
      },
      listByOrganization: async (targetOrgId: string) => (targetOrgId === orgId ? Array.from(workspaces.values()) : []),
    },
  } as any;

  const request = createRequest('POST', `/api/organizations/${orgId}/workspaces`, { userId: ownerId, organizationId: orgId, orgRole: 'owner' }, {
    name: 'Direct Org Workspace',
    slug: 'direct-org-ws',
    description: 'Created directly within org',
  });
  const response = createMockResponse();

  const handled = await handleOrganizationRoutes(request, response, bundle, `/api/organizations/${orgId}/workspaces`, new RateLimiter(60_000, 5));

  assert.equal(handled, true);
  assert.equal(response.statusCode, 201);
  const payload = JSON.parse(response.body ?? '{}');
  assert.equal(payload.success, true);
  assert.equal(payload.workspace.name, 'Direct Org Workspace');
  assert.equal(payload.workspace.slug, 'direct-org-ws');
  assert.ok(createdIds.includes(payload.workspace.id));
});

test('organization workspace creation route rejects regular members with 403', async () => {
  const ownerId = randomUUID();
  const memberId = randomUUID();
  const orgId = randomUUID();
  const bundle = {
    audit: { recordEvent: async () => ({}) },
    organizations: {
      findById: async (targetOrgId: string) => (targetOrgId === orgId ? { id: orgId, name: 'Org', slug: 'org', ownerId, createdAt: new Date(), updatedAt: new Date() } : null),
      getMember: async (targetOrgId: string, targetUserId: string) => (
        targetOrgId === orgId && targetUserId === memberId ? { organizationId: orgId, userId: memberId, role: 'member', joinedAt: new Date() } : null
      ),
      listWorkspaces: async () => [],
      linkWorkspace: async () => ({ id: randomUUID(), organizationId: orgId, workspaceId: randomUUID(), assignedAt: new Date() }),
      getWorkspaceOrganization: async () => null,
    },
    workspaces: {
      findBySlug: async () => null,
      findById: async () => null,
      create: async (workspace: any) => workspace,
      listByOrganization: async () => [],
    },
  } as any;

  const request = createRequest('POST', `/api/organizations/${orgId}/workspaces`, { userId: memberId, organizationId: orgId, orgRole: 'member' }, { name: 'Unauthorized Workspace' });
  const response = createMockResponse();

  const handled = await handleOrganizationRoutes(request, response, bundle, `/api/organizations/${orgId}/workspaces`, new RateLimiter(60_000, 5));

  assert.equal(handled, true);
  assert.equal(response.statusCode, 403);
});

test('organization workspace creation route rejects missing creation name with 400', async () => {
  const ownerId = randomUUID();
  const orgId = randomUUID();
  const bundle = {
    audit: { recordEvent: async () => ({}) },
    organizations: {
      findById: async (targetOrgId: string) => (targetOrgId === orgId ? { id: orgId, name: 'Org', slug: 'org', ownerId, createdAt: new Date(), updatedAt: new Date() } : null),
      getMember: async (targetOrgId: string, targetUserId: string) => (
        targetOrgId === orgId && targetUserId === ownerId ? { organizationId: orgId, userId: ownerId, role: 'owner', joinedAt: new Date() } : null
      ),
      listWorkspaces: async () => [],
      linkWorkspace: async () => ({ id: randomUUID(), organizationId: orgId, workspaceId: randomUUID(), assignedAt: new Date() }),
      getWorkspaceOrganization: async () => null,
    },
    workspaces: {
      findBySlug: async () => null,
      findById: async () => null,
      create: async (workspace: any) => workspace,
      listByOrganization: async () => [],
    },
  } as any;

  const request = createRequest('POST', `/api/organizations/${orgId}/workspaces`, { userId: ownerId, organizationId: orgId, orgRole: 'owner' }, {});
  const response = createMockResponse();

  const handled = await handleOrganizationRoutes(request, response, bundle, `/api/organizations/${orgId}/workspaces`, new RateLimiter(60_000, 5));

  assert.equal(handled, true);
  assert.equal(response.statusCode, 400);
  const payload = JSON.parse(response.body ?? '{}');
  assert.match(payload.error, /name is required/i);
});

test('organization workspace linking rejects non-owner attempts with 403', async () => {
  const ownerId = randomUUID();
  const otherUserId = randomUUID();
  const orgId = randomUUID();
  const workspaceId = randomUUID();
  const workspace = {
    id: workspaceId,
    slug: 'someone-elses-workspace',
    name: 'Someone Else Workspace',
    ownerId: otherUserId,
    isIsolated: false,
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const bundle = {
    audit: { recordEvent: async () => ({}) },
    organizations: {
      findById: async (targetOrgId: string) => (targetOrgId === orgId ? { id: orgId, name: 'Org', slug: 'org', ownerId, createdAt: new Date(), updatedAt: new Date() } : null),
      getMember: async (targetOrgId: string, targetUserId: string) => {
        if (targetOrgId === orgId && targetUserId === ownerId) {
          return { organizationId: orgId, userId: ownerId, role: 'owner', joinedAt: new Date() };
        }
        return null;
      },
      listWorkspaces: async () => [],
      linkWorkspace: async () => ({ id: randomUUID(), organizationId: orgId, workspaceId, assignedAt: new Date() }),
      getWorkspaceOrganization: async () => null,
    },
    workspaces: {
      findById: async (targetWorkspaceId: string) => (targetWorkspaceId === workspaceId ? workspace : null),
      listByOrganization: async () => [],
    },
  } as any;

  const request = createRequest('POST', `/api/organizations/${orgId}/workspaces`, { userId: ownerId, organizationId: orgId, orgRole: 'owner' }, { workspaceId });
  const response = createMockResponse();

  const handled = await handleOrganizationRoutes(request, response, bundle, `/api/organizations/${orgId}/workspaces`, new RateLimiter(60_000, 5));

  assert.equal(handled, true);
  assert.equal(response.statusCode, 403);

  const payload = JSON.parse(response.body ?? '{}');
  assert.equal(payload.code, 'FORBIDDEN_NOT_WORKSPACE_OWNER');
  assert.match(payload.error, /workspace owner/i);
});

test('organization workspace linking allows owner to link a workspace', async () => {
  const ownerId = randomUUID();
  const orgId = randomUUID();
  const workspaceId = randomUUID();
  const workspace = {
    id: workspaceId,
    slug: 'owned-workspace',
    name: 'Owned Workspace',
    ownerId,
    isIsolated: false,
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const bundle = {
    audit: { recordEvent: async () => ({}) },
    organizations: {
      findById: async (targetOrgId: string) => (targetOrgId === orgId ? { id: orgId, name: 'Org', slug: 'org', ownerId, createdAt: new Date(), updatedAt: new Date() } : null),
      getMember: async (targetOrgId: string, targetUserId: string) => (
        targetOrgId === orgId && targetUserId === ownerId ? { organizationId: orgId, userId: ownerId, role: 'owner', joinedAt: new Date() } : null
      ),
      listWorkspaces: async () => [],
      linkWorkspace: async ({ organizationId, workspaceId: nextWorkspaceId }: { organizationId: string; workspaceId: string }) => ({
        id: randomUUID(),
        organizationId,
        workspaceId: nextWorkspaceId,
        assignedAt: new Date(),
      }),
      getWorkspaceOrganization: async () => null,
    },
    workspaces: {
      findById: async (targetWorkspaceId: string) => (targetWorkspaceId === workspaceId ? workspace : null),
      listByOrganization: async () => [],
    },
  } as any;

  const request = createRequest('POST', `/api/organizations/${orgId}/workspaces`, { userId: ownerId, organizationId: orgId, orgRole: 'owner' }, { workspaceId });
  const response = createMockResponse();

  const handled = await handleOrganizationRoutes(request, response, bundle, `/api/organizations/${orgId}/workspaces`, new RateLimiter(60_000, 5));

  assert.equal(handled, true);
  assert.ok([200, 201].includes(response.statusCode));

  const payload = JSON.parse(response.body ?? '{}');
  assert.equal(payload.success, true);
    if (payload.link) {
    assert.equal(payload.link.workspaceId, workspaceId);
  }
});

test('organization workspace creation route rejects duplicate slugs with 409', async () => {
  const ownerId = randomUUID();
  const orgId = randomUUID();
  const existing = { id: randomUUID(), slug: 'duplicate-slug', name: 'First Workspace', ownerId, isIsolated: false, settings: {}, createdAt: new Date(), updatedAt: new Date() };
  const bundle = {
    audit: { recordEvent: async () => ({}) },
    organizations: {
      findById: async (targetOrgId: string) => (targetOrgId === orgId ? { id: orgId, name: 'Org', slug: 'org', ownerId, createdAt: new Date(), updatedAt: new Date() } : null),
      getMember: async (targetOrgId: string, targetUserId: string) => (
        targetOrgId === orgId && targetUserId === ownerId ? { organizationId: orgId, userId: ownerId, role: 'owner', joinedAt: new Date() } : null
      ),
      listWorkspaces: async () => [existing.id],
      linkWorkspace: async () => ({ id: randomUUID(), organizationId: orgId, workspaceId: randomUUID(), assignedAt: new Date() }),
      getWorkspaceOrganization: async () => null,
    },
    workspaces: {
      findBySlug: async (slug: string) => (slug === existing.slug ? existing : null),
      findById: async () => null,
      create: async (workspace: any) => workspace,
      listByOrganization: async () => [existing],
    },
  } as any;

  const request = createRequest('POST', `/api/organizations/${orgId}/workspaces`, { userId: ownerId, organizationId: orgId, orgRole: 'owner' }, {
    name: 'Duplicate Workspace',
    slug: 'duplicate-slug',
  });
  const response = createMockResponse();

  const handled = await handleOrganizationRoutes(request, response, bundle, `/api/organizations/${orgId}/workspaces`, new RateLimiter(60_000, 5));

  assert.equal(handled, true);
  assert.equal(response.statusCode, 409);
  const payload = JSON.parse(response.body ?? '{}');
  assert.match(payload.error, /already exists/i);
});

test('workspace role resolution follows direct ownership, workspace membership, and org inheritance priority', async () => {
  const ownerId = randomUUID();
  const workspaceMemberId = randomUUID();
  const orgAdminId = randomUUID();
  const orgMemberId = randomUUID();
  const unrelatedId = randomUUID();
  const workspaceId = randomUUID();
  const orgId = randomUUID();

  const bundle = {
    workspaces: {
      findById: async (targetWorkspaceId: string) => {
        if (targetWorkspaceId !== workspaceId) {
          return null;
        }
        return {
          id: workspaceId,
          slug: 'priority-space',
          name: 'Priority space',
          ownerId,
          isIsolated: false,
          settings: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
      getMember: async (targetWorkspaceId: string, targetUserId: string) => {
        if (targetWorkspaceId !== workspaceId) {
          return null;
        }
        if (targetUserId === workspaceMemberId) {
          return { workspaceId, userId: workspaceMemberId, role: 'member', joinedAt: new Date() };
        }
        return null;
      },
    },
    organizations: {
      getOrganizationByWorkspaceId: async (targetWorkspaceId: string) => {
        if (targetWorkspaceId !== workspaceId) {
          return null;
        }
        return { id: orgId, name: 'Org', slug: 'org', ownerId, createdAt: new Date(), updatedAt: new Date() };
      },
      getMember: async (targetOrgId: string, targetUserId: string) => {
        if (targetOrgId !== orgId) {
          return null;
        }
        if (targetUserId === orgAdminId) {
          return { organizationId: orgId, userId: orgAdminId, role: 'admin', joinedAt: new Date() };
        }
        if (targetUserId === orgMemberId) {
          return { organizationId: orgId, userId: orgMemberId, role: 'member', joinedAt: new Date() };
        }
        return null;
      },
    },
  } as any;

  const ownerResolution = await getEffectiveWorkspaceRole(bundle, workspaceId, ownerId);
  assert.deepEqual(ownerResolution, { role: 'owner', source: 'direct_owner' });

  const memberResolution = await getEffectiveWorkspaceRole(bundle, workspaceId, workspaceMemberId);
  assert.deepEqual(memberResolution, { role: 'member', source: 'workspace_member' });

  const orgAdminResolution = await getEffectiveWorkspaceRole(bundle, workspaceId, orgAdminId);
  assert.deepEqual(orgAdminResolution, { role: 'admin', source: 'org_inherited', inheritedFrom: { organizationId: orgId, orgRole: 'admin' } });

  const orgMemberResolution = await getEffectiveWorkspaceRole(bundle, workspaceId, orgMemberId);
  assert.deepEqual(orgMemberResolution, { role: 'member', source: 'org_inherited', inheritedFrom: { organizationId: orgId, orgRole: 'member' } });

  const noAccessResolution = await getEffectiveWorkspaceRole(bundle, workspaceId, unrelatedId);
  assert.deepEqual(noAccessResolution, { role: null, source: 'none' });
});

test('workspace member routes enforce RBAC on role and membership access', async () => {
  const ownerId = randomUUID();
  const memberId = randomUUID();
  const workspaceId = randomUUID();
  const orgId = randomUUID();

  const token = signSessionToken({ sub: memberId, sessionId: 'workspace-session' }, 'solyra-dev-jwt-secret-do-not-use-in-production-change-me');
  const bundle = {
    users: { findById: async (userId: string) => ({ id: userId, isActive: true }) },
    sessions: { findSessionByTokenHash: async () => ({ userId: memberId, workspaceId: null, organizationId: orgId, expiresAt: new Date(Date.now() + 3600_000), revokedAt: null }) },
    workspaces: {
      findById: async (targetWorkspaceId: string) => {
        if (targetWorkspaceId !== workspaceId) return null;
        return { id: workspaceId, slug: 'memberspace', name: 'Member Space', ownerId, isIsolated: false, settings: {}, createdAt: new Date(), updatedAt: new Date() };
      },
      getMember: async (targetWorkspaceId: string, targetUserId: string) => {
        if (targetWorkspaceId !== workspaceId) return null;
        if (targetUserId === memberId) {
          return { workspaceId, userId: memberId, role: 'member', joinedAt: new Date() };
        }
        return null;
      },
      listMembers: async (targetWorkspaceId: string) => targetWorkspaceId === workspaceId ? [{ workspaceId, userId: memberId, role: 'member', joinedAt: new Date() }] : [],
    },
    organizations: {
      getOrganizationByWorkspaceId: async (targetWorkspaceId: string) => targetWorkspaceId === workspaceId ? { id: orgId, name: 'Org', slug: 'org', ownerId, createdAt: new Date(), updatedAt: new Date() } : null,
      getMember: async (targetOrgId: string, targetUserId: string) => {
        if (targetOrgId !== orgId) return null;
        if (targetUserId === ownerId) {
          return { organizationId: orgId, userId: ownerId, role: 'owner', joinedAt: new Date() };
        }
        return null;
      },
    },
  } as any;

  const req = {
    method: 'GET',
    url: `http://localhost/api/workspaces/${workspaceId}/members`,
    headers: { authorization: `Bearer ${token}` },
    socket: { remoteAddress: '127.0.0.1' },
    session: { userId: memberId, workspaceId: null, organizationId: orgId, orgRole: 'member', expiresAt: new Date(Date.now() + 3600_000), createdAt: new Date(), revokedAt: null },
  } as any;
  const res = createMockResponse();

  const authorized = await requireWorkspaceRole(req, res, bundle, ['member'], workspaceId);
  assert.equal(authorized, true);
  assert.equal(req.effectiveWorkspaceRole?.role, 'member');

  const deniedReq = {
    method: 'POST',
    url: `http://localhost/api/workspaces/${workspaceId}/members`,
    headers: { authorization: `Bearer ${token}` },
    socket: { remoteAddress: '127.0.0.1' },
    session: { userId: memberId, workspaceId: null, organizationId: orgId, orgRole: 'member', expiresAt: new Date(Date.now() + 3600_000), createdAt: new Date(), revokedAt: null },
  } as any;
  const deniedRes = createMockResponse();

  const denied = await requireWorkspaceRole(deniedReq, deniedRes, bundle, ['admin'], workspaceId);
  assert.equal(denied, false);
  assert.equal(deniedRes.statusCode, 403);

  const workspaceRoute = await handleWorkspaceRoutes(req, res, bundle, `/api/workspaces/${workspaceId}/members`);
  assert.equal(workspaceRoute, true);
  assert.equal(res.statusCode, 200);
});

test('workspace member management rejects invalid roles and owner removal attempts', async () => {
  const ownerId = randomUUID();
  const memberId = randomUUID();
  const workspaceId = randomUUID();
  const orgId = randomUUID();
  const workspace = {
    id: workspaceId,
    slug: 'member-admins',
    name: 'Member Admins',
    ownerId,
    isIsolated: false,
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const bundle = {
    users: { findById: async (userId: string) => ({ id: userId, isActive: true }) },
    sessions: { findSessionByTokenHash: async () => ({ userId: ownerId, workspaceId, organizationId: orgId, expiresAt: new Date(Date.now() + 3600_000), revokedAt: null }) },
    workspaces: {
      findById: async (targetWorkspaceId: string) => (targetWorkspaceId === workspaceId ? workspace : null),
      getMember: async (targetWorkspaceId: string, targetUserId: string) => {
        if (targetWorkspaceId !== workspaceId) return null;
        if (targetUserId === ownerId) {
          return { workspaceId, userId: ownerId, role: 'owner', joinedAt: new Date() };
        }
        if (targetUserId === memberId) {
          return { workspaceId, userId: memberId, role: 'member', joinedAt: new Date() };
        }
        return null;
      },
      listMembers: async () => [
        { workspaceId, userId: ownerId, role: 'owner', joinedAt: new Date() },
        { workspaceId, userId: memberId, role: 'member', joinedAt: new Date() },
      ],
      addMember: async () => ({ workspaceId, userId: memberId, role: 'viewer', joinedAt: new Date() }),
      removeMember: async () => true,
    },
    organizations: {
      getOrganizationByWorkspaceId: async (targetWorkspaceId: string) => (targetWorkspaceId === workspaceId ? { id: orgId, name: 'Org', slug: 'org', ownerId, createdAt: new Date(), updatedAt: new Date() } : null),
      getMember: async (targetOrgId: string, targetUserId: string) => {
        if (targetOrgId !== orgId) return null;
        if (targetUserId === ownerId) {
          return { organizationId: orgId, userId: ownerId, role: 'owner', joinedAt: new Date() };
        }
        return null;
      },
    },
  } as any;

  const validToken = signSessionToken({ sub: ownerId, sessionId: 'owner-workspace-session' }, 'solyra-dev-jwt-secret-do-not-use-in-production-change-me');
  const invalidRequest = createRequest('POST', `/api/workspaces/${workspaceId}/members`, { userId: ownerId, workspaceId, organizationId: orgId, orgRole: 'owner' }, { userId: memberId, role: 'owner' });
  invalidRequest.headers.authorization = `Bearer ${validToken}`;
  const invalidResponse = createMockResponse();
  const invalidHandled = await handleWorkspaceRoutes(invalidRequest, invalidResponse, bundle, `/api/workspaces/${workspaceId}/members`);
  assert.equal(invalidHandled, true);
  assert.equal(invalidResponse.statusCode, 400);

  const removalRequest = createRequest('DELETE', `/api/workspaces/${workspaceId}/members/${ownerId}`, { userId: ownerId, workspaceId, organizationId: orgId, orgRole: 'owner' });
  removalRequest.headers.authorization = `Bearer ${validToken}`;
  const removalResponse = createMockResponse();
  const removalHandled = await handleWorkspaceRoutes(removalRequest, removalResponse, bundle, `/api/workspaces/${workspaceId}/members/${ownerId}`);
  assert.equal(removalHandled, true);
  assert.equal(removalResponse.statusCode, 400);
});
