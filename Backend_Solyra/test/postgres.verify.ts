import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

import { createPostgresPool, checkPostgresHealth, createPostgresPersistence } from '../src/persistence/postgres/index.js';

const databaseName = 'solyra_db';
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/solyra_db';
const adminDatabaseUrl = databaseUrl.replace(/\/solyra_db$/, '/postgres');

async function assert(condition: boolean, message: string): Promise<void> {
  if (!condition) {
    throw new Error(`[FAIL] ${message}`);
  }
  console.log(`[PASS] ${message}`);
}

async function ensureDatabase(): Promise<void> {
  const adminPool = new Pool({
    connectionString: adminDatabaseUrl,
    max: 1,
    idleTimeoutMillis: 1000,
  });

  try {
    const exists = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (exists.rowCount === 0) {
      await adminPool.query(`CREATE DATABASE "${databaseName}"`);
      console.log(`Created PostgreSQL database: ${databaseName}`);
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
  console.log('=== Solyra PostgreSQL Memory Verification ===');

  await ensureDatabase();

  const pool = createPostgresPool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  try {
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

    console.log('=== ALL POSTGRES MEMORY VERIFICATION TESTS PASSED ===');
  } finally {
    await pool.end();
  }
}

runVerification().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
