import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

import { createPostgresPool, checkPostgresHealth, createPostgresPersistence } from '../src/persistence/postgres/index.js';
import { assertConnectedToTestDatabase, validatePostgresTestSafety } from '../src/persistence/postgres/guard.js';

const databaseUrl = process.env.SOLYRA_TEST_DB_URL;
if (!databaseUrl) {
  throw new Error("SAFETY ABORT: PostgreSQL test operations require explicit SOLYRA_TEST_DB_URL environment variable.");
}

const { targetDbName } = validatePostgresTestSafety({ nodeEnv: process.env.NODE_ENV, testDbUrl: databaseUrl });
const adminDatabaseUrl = databaseUrl.replace(/\/[^/]+$/, '/postgres');

async function assert(condition: boolean, message: string): Promise<void> {
  if (!condition) {
    throw new Error(`[FAIL] ${message}`);
  }

  console.log(`[PASS] ${message}`);
}

async function assertThrows(fn: () => Promise<unknown> | unknown, expectedMessage: string): Promise<void> {
  try {
    await fn();
    throw new Error(`Expected function to throw containing "${expectedMessage}"`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expectedMessage)) {
      throw new Error(`Expected error to include "${expectedMessage}" but got: ${message}`);
    }
    console.log(`[PASS] Invalid parameter rejected: ${expectedMessage}`);
  }
}

async function ensureDatabase(): Promise<void> {
  const adminPool = new Pool({
    connectionString: adminDatabaseUrl,
    max: 1,
    idleTimeoutMillis: 1000,
  });

  try {
    const exists = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDbName]);
    if (exists.rowCount === 0) {
      await adminPool.query(`CREATE DATABASE "${targetDbName}"`);
      console.log(`Created PostgreSQL database: ${targetDbName}`);
    }
  } finally {
    await adminPool.end();
  }
}

async function loadSql(relativePath: string): Promise<string> {
  const fileUrl = new URL(relativePath, import.meta.url);
  return readFileSync(fileUrl, 'utf8');
}

async function resetSchema(pool: Pool): Promise<void> {
  const dropSql = `
    DROP TABLE IF EXISTS memory_records CASCADE;
    DROP TABLE IF EXISTS knowledge_nodes CASCADE;
    DROP TABLE IF EXISTS chat_messages CASCADE;
    DROP TABLE IF EXISTS chat_sessions CASCADE;
    DROP TABLE IF EXISTS workspace_members CASCADE;
    DROP TABLE IF EXISTS workspaces CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
  `;

  await pool.query(dropSql);
  await pool.query(await loadSql('../src/persistence/postgres/init_db.sql'));
  await pool.query(await loadSql('../src/persistence/postgres/schema.sql'));
}

async function runVerification(): Promise<void> {
  console.log('=== Solyra PostgreSQL Verification ===');

  await ensureDatabase();

  const pool = createPostgresPool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  try {
    const client = await pool.connect();
    try {
      await assertConnectedToTestDatabase(client, targetDbName);
    } finally {
      client.release();
    }

    const health = await checkPostgresHealth(pool);
    if (!health.healthy) {
      throw new Error(`PostgreSQL health check failed: ${health.error ?? 'unknown error'}`);
    }

    await resetSchema(pool);

    const bundle = createPostgresPersistence(pool);
    const ready = await bundle.checkHealth();
    await assert(ready.healthy, `PostgreSQL health check passed in ${ready.latencyMs}ms`);

    const tenantA = 'tenant-a';
    const tenantB = 'tenant-b';

    const firstRecord = {
      id: 'memory-001',
      tenantId: tenantA,
      tier: 'working' as const,
      key: 'current-task',
      content: 'Implement the PostgreSQL memory adapter.',
      salience: 0.92,
      metadata: { category: 'feature' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const secondRecord = {
      id: 'memory-002',
      tenantId: tenantA,
      tier: 'working' as const,
      key: 'follow-up',
      content: 'Verify readiness routing and health checks.',
      salience: 0.76,
      metadata: { category: 'ops' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const crossTenantRecord = {
      id: 'memory-003',
      tenantId: tenantB,
      tier: 'working' as const,
      key: 'current-task',
      content: 'Tenant-b work should stay isolated.',
      salience: 0.81,
      metadata: { category: 'isolation' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const storeFirst = await bundle.memory.store(firstRecord);
    await assert(storeFirst.success, 'Memory record stored successfully');

    const storeSecond = await bundle.memory.store(secondRecord);
    await assert(storeSecond.success, 'Second memory record stored successfully');

    const retrieve = await bundle.memory.retrieve(tenantA, 'working', 'current-task');
    await assert(retrieve.success && retrieve.data?.content === firstRecord.content, 'Memory retrieval returned the stored record');

    const search = await bundle.memory.searchBySalience(tenantA, 'working', 0.75);
    await assert(search.success && search.data?.length === 2, 'Salience search returned tenant-scoped records');
    await assert(search.data?.[0]?.key === 'current-task', 'Results sorted by descending salience');

    const storeThird = await bundle.memory.store(crossTenantRecord);
    await assert(storeThird.success, 'Cross-tenant memory record stored successfully');

    const crossTenantSearch = await bundle.memory.searchBySalience(tenantB, 'working', 0.8);
    await assert(crossTenantSearch.success && crossTenantSearch.data?.length === 1, 'Cross-tenant memory search respected tenant isolation');
    await assert(crossTenantSearch.data?.[0]?.content.includes('isolated'), 'Cross-tenant record remained isolated');

    const deleteResult = await bundle.memory.delete(tenantA, 'working', 'current-task');
    await assert(deleteResult.success && deleteResult.data === true, 'Delete returned true for the tenant-scoped record');

    const postDelete = await bundle.memory.retrieve(tenantA, 'working', 'current-task');
    await assert(postDelete.success && postDelete.data === null, 'Deleted memory record no longer exists');

    const semanticOwner = await bundle.users.create({
      id: 'semantic-owner',
      email: 'semantic-owner@example.com',
      passwordHash: 'hash-semantic',
      fullName: 'Semantic Owner',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await assert(semanticOwner.id === 'semantic-owner', 'Semantic workspaces were created with a valid owner');

    const semanticWorkspaceA = await bundle.workspaces.create({
      id: 'ws-sem-a',
      slug: 'semantic-alpha',
      name: 'Semantic Alpha',
      ownerId: semanticOwner.id,
      isIsolated: true,
      settings: { region: 'us-east' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const semanticWorkspaceB = await bundle.workspaces.create({
      id: 'ws-sem-b',
      slug: 'semantic-beta',
      name: 'Semantic Beta',
      ownerId: semanticOwner.id,
      isIsolated: true,
      settings: { region: 'eu-west' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await assert(semanticWorkspaceA.id === 'ws-sem-a', 'Semantic workspace A created');
    await assert(semanticWorkspaceB.id === 'ws-sem-b', 'Semantic workspace B created');

    const semanticA = await bundle.knowledge.create({
      id: 'sem-node-a',
      workspaceId: semanticWorkspaceA.id,
      title: 'Semantic Node A',
      content: 'Vector anchor aligned to the query axis.',
      embedding: [1, 0, 0],
      tags: ['semantic', 'vector'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const semanticB = await bundle.knowledge.create({
      id: 'sem-node-b',
      workspaceId: semanticWorkspaceA.id,
      title: 'Semantic Node B',
      content: 'Nearby vector with a slight drift along the x-axis.',
      embedding: [0.9, 0.1, 0],
      tags: ['semantic', 'similar'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const semanticC = await bundle.knowledge.create({
      id: 'sem-node-c',
      workspaceId: semanticWorkspaceA.id,
      title: 'Semantic Node C',
      content: 'Orthogonal vector that should fall below threshold.',
      embedding: [0, 1, 0],
      tags: ['semantic', 'orthogonal'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const semanticD = await bundle.knowledge.create({
      id: 'sem-node-d',
      workspaceId: semanticWorkspaceB.id,
      title: 'Semantic Node D',
      content: 'Cross-workspace vector used to validate isolation.',
      embedding: [1, 0, 0],
      tags: ['semantic', 'isolation'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await assert(semanticA.id === 'sem-node-a' && semanticB.id === 'sem-node-b', 'Semantic nodes inserted for similarity search');
    await assert(semanticD.workspaceId === semanticWorkspaceB.id, 'Cross-workspace semantic node seeded for isolation check');

    const semanticResults = await bundle.knowledge.searchBySemanticSimilarity(semanticWorkspaceA.id, [1, 0, 0], 0.8, 10);
    await assert(semanticResults.length === 2, 'Semantic search returned only the relevant near matches');
    await assert(semanticResults[0].node.id === 'sem-node-a' && semanticResults[0].similarity === 1, 'Exact match ranked first with similarity 1.0');
    await assert(semanticResults[1].node.id === 'sem-node-b' && semanticResults[1].similarity > 0.98, 'Near match stayed above the similarity threshold');
    await assert(semanticResults.every((result) => result.node.workspaceId === semanticWorkspaceA.id), 'Semantic search enforced workspace isolation');
    await assert(semanticResults.every((result) => result.node.id !== 'sem-node-d'), 'Cross-workspace node was excluded from semantic results');

    await assertThrows(
      () => bundle.knowledge.searchBySemanticSimilarity(semanticWorkspaceA.id, [], 0.8, 10),
      'queryEmbedding',
    );
    await assertThrows(
      () => bundle.knowledge.searchBySemanticSimilarity(semanticWorkspaceA.id, [1, 0, 0], 2, 10),
      'minSimilarity',
    );
    await assertThrows(
      () => bundle.knowledge.searchBySemanticSimilarity(semanticWorkspaceA.id, [1, 0, 0], 0.8, 0),
      'limit',
    );

    console.log('=== ALL POSTGRES VERIFICATION TESTS PASSED ===');
  } finally {
    await pool.end();
  }
}

runVerification().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
