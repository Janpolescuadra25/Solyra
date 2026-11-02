import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { getPgPool } from './pool.js';

async function initDb() {
  if (process.env.NODE_ENV === 'production' && !process.env.FORCE_DB_INIT) {
    console.error('[DB Init] Aborted: Cannot run database initialization in production without FORCE_DB_INIT=true.');
    process.exit(1);
  }

  const schemaPath = path.resolve(fileURLToPath(new URL('./schema.sql', import.meta.url)));
  if (!fs.existsSync(schemaPath)) {
    console.error(`[DB Init] Schema file not found at: ${schemaPath}`);
    process.exit(1);
  }

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const pool = getPgPool();
  const client = await pool.connect();

  try {
    console.log('[DB Init] Starting database schema initialization...');
    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('COMMIT');
    console.log('[DB Init] Database schema initialized successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DB Init] Initialization failed, transaction rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  initDb().catch((err) => {
    console.error('[DB Init] Unexpected error during initialization:', err);
    process.exit(1);
  });
}
