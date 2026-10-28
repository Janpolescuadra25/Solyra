import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

import { isValidOrganizationSlug } from '@solyra/shared';
import { InMemoryOrganizationRepository } from '../src/persistence/in-memory/organization.repository.js';
import { PostgresOrganizationRepository } from '../src/persistence/postgres/repositories/organization.repository.js';
import { SessionRepository } from '../src/persistence/postgres/repositories/session.repository.js';

test('isValidOrganizationSlug accepts valid slugs', () => {
  assert.equal(isValidOrganizationSlug('acme'), true);
  assert.equal(isValidOrganizationSlug('acme-corp'), true);
  assert.equal(isValidOrganizationSlug('team-123'), true);
});

test('isValidOrganizationSlug rejects invalid slugs', () => {
  assert.equal(isValidOrganizationSlug('A'), false);
  assert.equal(isValidOrganizationSlug('acme_corp'), false);
  assert.equal(isValidOrganizationSlug('-acme'), false);
  assert.equal(isValidOrganizationSlug('acme-'), false);
  assert.equal(isValidOrganizationSlug('a'.repeat(50)), false);
});

test('InMemoryOrganizationRepository creates an organization and auto-assigns the owner membership', async () => {
  const repo = new InMemoryOrganizationRepository();
  const org = await repo.create({ name: 'Acme', slug: 'acme', ownerId: '11111111-1111-4111-8111-111111111111' });

  assert.equal(org.slug, 'acme');
  assert.equal((await repo.listMembers(org.id)).length, 1);
  assert.equal((await repo.getMember(org.id, org.ownerId))?.role, 'owner');
});

test('InMemoryOrganizationRepository rejects duplicate slugs', async () => {
  const repo = new InMemoryOrganizationRepository();

  await repo.create({ name: 'Acme', slug: 'acme', ownerId: '11111111-1111-4111-8111-111111111111' });
  await assert.rejects(
    () => repo.create({ name: 'Duplicate', slug: 'acme', ownerId: '22222222-2222-4222-8222-222222222222' }),
    /already exists/i,
  );
});

test('InMemoryOrganizationRepository manages member roles and member removal', async () => {
  const repo = new InMemoryOrganizationRepository();
  const org = await repo.create({ name: 'Acme', slug: 'acme', ownerId: '11111111-1111-4111-8111-111111111111' });

  const member = await repo.addMember({ organizationId: org.id, userId: '22222222-2222-4222-8222-222222222222', role: 'member' });
  assert.equal(member.role, 'member');

  const updated = await repo.updateMemberRole(org.id, member.userId, 'admin');
  assert.equal(updated, true);
  assert.equal((await repo.getMember(org.id, member.userId))?.role, 'admin');

  const removed = await repo.removeMember(org.id, member.userId);
  assert.equal(removed, true);
  assert.equal(await repo.getMember(org.id, member.userId), null);
});

test('InMemoryOrganizationRepository links workspaces and resolves the owning organization', async () => {
  const repo = new InMemoryOrganizationRepository();
  const org = await repo.create({ name: 'Acme', slug: 'acme', ownerId: '11111111-1111-4111-8111-111111111111' });

  const link = await repo.linkWorkspace({ organizationId: org.id, workspaceId: 'workspace-123' });
  assert.equal(link.workspaceId, 'workspace-123');
  assert.deepEqual(await repo.listWorkspaces(org.id), ['workspace-123']);
  assert.equal((await repo.getWorkspaceOrganization('workspace-123'))?.id, org.id);

  const unlinked = await repo.unlinkWorkspace(org.id, 'workspace-123');
  assert.equal(unlinked, true);
  assert.deepEqual(await repo.listWorkspaces(org.id), []);
});

test('PostgresOrganizationRepository rolls back an incomplete create operation', async () => {
  const orgs: Array<{ id: string; name: string; slug: string; owner_id: string; created_at: Date; updated_at: Date }> = [];
  const members: Array<{ id: string; organization_id: string; user_id: string; role: string; joined_at: Date }> = [];

  const pool = {
    async connect() {
      return {
        async query(sql: string, params?: unknown[]) {
          if (sql.includes('BEGIN')) {
            return { rows: [] };
          }

          if (sql.includes('INSERT INTO organizations')) {
            const row = {
              id: randomUUID(),
              name: params?.[0],
              slug: params?.[1],
              owner_id: params?.[2],
              created_at: new Date(),
              updated_at: new Date(),
            };
            orgs.push(row as any);
            return { rows: [row] };
          }

          if (sql.includes('INSERT INTO organization_members')) {
            throw new Error('member insert failed');
          }

          if (sql.includes('COMMIT')) {
            return { rows: [] };
          }

          if (sql.includes('ROLLBACK')) {
            orgs.pop();
            return { rows: [] };
          }

          return { rows: [] };
        },
        release() {},
      };
    },
  } as any;

  const repo = new PostgresOrganizationRepository(pool);

  await assert.rejects(
    () => repo.create({ name: 'Broken Org', slug: 'broken-org', ownerId: '11111111-1111-4111-8111-111111111111' }),
    /member insert failed/i,
  );

  assert.equal(orgs.length, 0);
  assert.equal(members.length, 0);
});

test('SessionRepository preserves standard workspace session behavior without organizationId', async () => {
  const sessionRepo = new SessionRepository({
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO sessions')) {
        return {
          rows: [{
            id: params?.[0],
            user_id: params?.[1],
            workspace_id: params?.[2],
            token_hash: params?.[3],
            expires_at: params?.[4],
            created_at: new Date(),
            revoked_at: null,
            revocation_reason: null,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  } as any);

  const session = await sessionRepo.createSession({
    id: 'session-no-org',
    userId: 'user-1',
    workspaceId: 'workspace-1',
    tokenHash: 'hash-123',
    expiresAt: new Date(Date.now() + 60_000),
  });

  assert.equal(session.workspaceId, 'workspace-1');
  assert.equal(session.organizationId, null);
  assert.equal(session.userId, 'user-1');
});

test('InMemoryOrganizationRepository returns organizations from a user list and can list member records', async () => {
  const repo = new InMemoryOrganizationRepository();
  const first = await repo.create({ name: 'Acme', slug: 'acme', ownerId: '11111111-1111-4111-8111-111111111111' });
  const second = await repo.create({ name: 'Beta', slug: 'beta', ownerId: '22222222-2222-4222-8222-222222222222' });

  const byUser = await repo.listByUser('11111111-1111-4111-8111-111111111111');
  assert.equal(byUser.some((org) => org.id === first.id), true);
  assert.equal(byUser.some((org) => org.id === second.id), false);
  assert.equal((await repo.listMembers(second.id)).length, 1);
});

test('InMemoryOrganizationRepository rejects invalid slug format before creating data', async () => {
  const repo = new InMemoryOrganizationRepository();

  await assert.rejects(
    () => repo.create({ name: 'Bad Org', slug: 'Bad_Slug', ownerId: '11111111-1111-4111-8111-111111111111' }),
    /slug/i,
  );
});

test('PostgresOrganizationRepository accepts valid org input and maps all row fields', async () => {
  const repo = new PostgresOrganizationRepository({
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT * FROM organizations WHERE id = $1')) {
        return { rows: [{ id: 'org-1', name: 'Acme', slug: 'acme', owner_id: '11111111-1111-4111-8111-111111111111', created_at: new Date(), updated_at: new Date() }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  } as any);

  const org = await repo.findById('org-1');
  assert.equal(org?.name, 'Acme');
  assert.equal(org?.slug, 'acme');
});
