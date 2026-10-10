import { Pool, type PoolConfig } from 'pg';

export interface SolyraPoolOptions {
  connectionString?: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  ssl?: boolean | { rejectUnauthorized: boolean };
}

export function createPostgresPool(options?: SolyraPoolOptions): Pool {
  const connectionString =
    options?.connectionString ??
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/solyra_db';

  const sslEnabled = options?.ssl ?? process.env.DATABASE_SSL === 'true';

  const config: PoolConfig = {
    connectionString,
    max: options?.max ?? 20,
    idleTimeoutMillis: options?.idleTimeoutMillis ?? 30000,
    connectionTimeoutMillis: options?.connectionTimeoutMillis ?? 5000,
  };

  if (sslEnabled) {
    config.ssl = typeof sslEnabled === 'object' ? sslEnabled : { rejectUnauthorized: false };
  }

  const pool = new Pool(config);

  pool.on('error', (error: Error) => {
    console.error('[PostgreSQL Pool] Unexpected error on idle client:', error.message);
  });

  return pool;
}

export async function checkPostgresHealth(pool: Pool): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();

  try {
    const client = await pool.connect();

    try {
      await client.query('SELECT 1');
      return { healthy: true, latencyMs: Date.now() - start };
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    const err = error as Error;
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: err?.message ?? 'Database connection probe failed',
    };
  }
}
