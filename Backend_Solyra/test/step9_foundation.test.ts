import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { PostgresMemoryRepository } from '../src/persistence/postgres/repositories/memory.repository.js';
import { ensureOwnerSeed, OWNER_EMAIL, requireOwnerPassword } from '../src/persistence/postgres/seed.js';

describe('PostgresMemoryRepository semantic search', () => {
  test('returns records ranked by cosine similarity', async () => {
    const repository = new PostgresMemoryRepository({
      async query(sql: string, values: unknown[]) {
        assert.match(sql, /cosine_similarity/);
        assert.equal(values[0], 'tenant-9');
        assert.deepEqual(JSON.parse(String(values[1])), [1, 0, 0]);
        assert.equal(values[2], 0.7);
        assert.equal(values[3], 10);

        return {
          rows: [
            {
              id: 'memory-2',
              tenant_id: 'tenant-9',
              tier: 'working',
              key: 'near-match',
              content: 'Near match',
              embedding: [0.96, 0.04, 0],
              salience: 0.74,
              metadata: '{}',
              created_at: '2024-01-01T00:00:00.000Z',
              updated_at: '2024-01-01T00:00:00.000Z',
            },
            {
              id: 'memory-1',
              tenant_id: 'tenant-9',
              tier: 'working',
              key: 'exact-match',
              content: 'Exact match',
              embedding: [1, 0, 0],
              salience: 0.92,
              metadata: '{}',
              created_at: '2024-01-01T00:00:00.000Z',
              updated_at: '2024-01-01T00:00:00.000Z',
            },
          ],
        };
      },
    } as any);

    const result = await repository.searchBySemanticSimilarity('tenant-9', [1, 0, 0], 0.7, 10);

    assert.equal(result.success, true);
    assert.deepEqual(result.data?.map((item) => item.key), ['near-match', 'exact-match']);
    assert.equal(result.data?.[0].content, 'Near match');
  });

  test('rejects invalid semantic search parameters', async () => {
    const repository = new PostgresMemoryRepository({
      async query() {
        return { rows: [] };
      },
    } as any);

    const lowSimilarity = await repository.searchBySemanticSimilarity('tenant-9', [1, 0, 0], -0.1, 10);
    assert.equal(lowSimilarity.success, false);
    assert.match(String(lowSimilarity.error), /minSimilarity/i);

    const highSimilarity = await repository.searchBySemanticSimilarity('tenant-9', [1, 0, 0], 1.5, 10);
    assert.equal(highSimilarity.success, false);
    assert.match(String(highSimilarity.error), /minSimilarity/i);

    const badLimit = await repository.searchBySemanticSimilarity('tenant-9', [1, 0, 0], 0.7, 0);
    assert.equal(badLimit.success, false);
    assert.match(String(badLimit.error), /limit/i);
  });
});

describe('owner seed configuration', () => {
  test('fails closed when OWNER_INITIAL_PASSWORD is missing', () => {
    assert.throws(() => requireOwnerPassword({}), /OWNER_INITIAL_PASSWORD environment variable is required/i);
  });

  test('creates or updates the owner user and default workspace', async () => {
    const queries: string[] = [];
    const fakePool = {
      async query(sql: string, values: unknown[] = []) {
        queries.push(`${sql}::${String(values[0] ?? '')}`);

        if (sql.startsWith('SELECT * FROM users WHERE email = $1')) {
          return { rows: [{ id: 'owner-uuid', email: OWNER_EMAIL, role: 'user', is_active: false, onboarding_state: 'pending' }], rowCount: 1 };
        }

        if (sql.startsWith('UPDATE users SET')) {
          return { rows: [{ id: 'owner-uuid' }], rowCount: 1 };
        }

        if (sql.startsWith('SELECT * FROM workspaces WHERE owner_id = $1 AND slug = $2')) {
          return { rows: [], rowCount: 0 };
        }

        if (sql.startsWith('INSERT INTO workspaces')) {
          return { rows: [{ id: 'workspace-owner' }], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      },
      async end() {
        return;
      },
    } as any;

    const result = await ensureOwnerSeed(fakePool, 'OwnerPassword123!');

    assert.equal(result.userId, 'owner-uuid');
    assert.ok(result.workspaceId.length > 0);
    assert.equal(queries.some((query) => query.includes('UPDATE users')), true);
    assert.equal(queries.some((query) => query.includes('INSERT INTO workspaces')), true);
  });
});
