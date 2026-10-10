import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

import { createPostgresPool, checkPostgresHealth } from './pool.js';
import { createPostgresPersistence } from './index.js';

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
    DROP TABLE IF EXISTS knowledge_nodes CASCADE;
    DROP TABLE IF EXISTS chat_messages CASCADE;
    DROP TABLE IF EXISTS chat_sessions CASCADE;
    DROP TABLE IF EXISTS workspace_members CASCADE;
    DROP TABLE IF EXISTS workspaces CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
  `;

  await pool.query(dropSql);
  await pool.query(await loadSql('./init_db.sql'));
  await pool.query(await loadSql('./schema.sql'));
}

async function runVerification(): Promise<void> {
  console.log('=== Solyra PostgreSQL Persistence Verification ===');

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
    const result = await bundle.checkHealth();
    await assert(result.healthy, `PostgreSQL health check passed in ${result.latencyMs}ms`);

    const tenantA = 'tenant-a';
    const tenantB = 'tenant-b';

    const alphaUser = await bundle.users.create({
      id: 'user-alpha-1',
      email: 'alpha@example.com',
      passwordHash: 'hashed-alpha',
      fullName: 'Alpha User',
      avatarUrl: 'https://example.test/avatar-alpha.png',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await assert(alphaUser.id === 'user-alpha-1', 'User record created successfully');

    const workspaceA = await bundle.workspaces.create({
      id: 'workspace-alpha',
      slug: 'alpha-workspace',
      name: 'Alpha Workspace',
      ownerId: alphaUser.id,
      isIsolated: true,
      settings: { theme: 'dark', region: 'us-east' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await assert(workspaceA.id === 'workspace-alpha', 'Workspace created successfully');

    const workspaceB = await bundle.workspaces.create({
      id: 'workspace-beta',
      slug: 'beta-workspace',
      name: 'Beta Workspace',
      ownerId: alphaUser.id,
      isIsolated: true,
      settings: { theme: 'light', region: 'eu-west' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await assert(workspaceB.id === 'workspace-beta', 'Second workspace created successfully');

    const member = await bundle.workspaces.addMember({
      id: 'member-alpha',
      workspaceId: workspaceA.id,
      userId: alphaUser.id,
      role: 'owner',
      joinedAt: new Date(),
    });
    await assert(member.workspaceId === workspaceA.id, 'Workspace membership inserted successfully');

    const conversation = await bundle.chat.createConversation({
      id: 'conversation-alpha',
      workspaceId: workspaceA.id,
      userId: alphaUser.id,
      title: 'Alpha system briefing',
      modelIdentifier: 'gpt-4o',
      systemPromptOverride: 'Be concise and adopt the tenant context.',
      messageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await assert(conversation.id === 'conversation-alpha', 'Chat session created successfully');

    const message = await bundle.chat.appendMessage({
      id: 'message-alpha-1',
      conversationId: conversation.id,
      senderId: alphaUser.id,
      role: 'user',
      content: 'Need a tenant-scoped memory record.',
      metadata: { channel: 'user.query' },
      createdAt: new Date(),
    });
    await assert(message.content.includes('tenant-scoped'), 'Chat message appended successfully');

    const conversationMessages = await bundle.chat.getMessages(conversation.id);
    await assert(conversationMessages.length === 1, 'Chat history query retrieved message count');

    const node = await bundle.knowledge.create({
      id: 'node-alpha-1',
      workspaceId: workspaceA.id,
      title: 'Alpha knowledge',
      content: 'Internal notes for alpha workspace only',
      embedding: [0.12, 0.17, 0.3],
      tags: ['tenant-a', 'internal'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await assert(node.workspaceId === workspaceA.id, 'Knowledge node created successfully');

    const workspaceAKnowledge = await bundle.knowledge.listByWorkspace(workspaceA.id);
    const workspaceBKnowledge = await bundle.knowledge.listByWorkspace(workspaceB.id);
    await assert(workspaceAKnowledge.length === 1, 'Knowledge node visible in authorized workspace');
    await assert(workspaceBKnowledge.length === 0, 'Tenant isolation enforced for knowledge nodes');

    const deleted = await bundle.users.delete(alphaUser.id);
    await assert(deleted === true, 'User deletion returned success');

    const workspaceAfterDelete = await bundle.workspaces.findById(workspaceA.id);
    await assert(workspaceAfterDelete === null, 'Cascade deletion removed workspace after user deletion');

    console.log('=== ALL POSTGRESQL VERIFICATION TESTS PASSED ===');
  } finally {
    await pool.end();
  }
}

runVerification().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
