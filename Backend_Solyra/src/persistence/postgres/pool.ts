import { Pool, type PoolConfig } from 'pg';

export interface PostgresPoolConfig {
  connectionString?: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  ssl?: boolean | { rejectUnauthorized?: boolean };
}

export type SolyraPoolOptions = PostgresPoolConfig;

let sharedPool: Pool | null = null;

export function createPostgresPool(config?: PostgresPoolConfig): Pool {
  const connectionString = config?.connectionString ?? process.env.DATABASE_URL;
  const isProduction = process.env.NODE_ENV === 'production';
  const sslConfig = config?.ssl ?? (isProduction ? { rejectUnauthorized: false } : undefined);

  const poolConfig: PoolConfig = {
    connectionString,
    max: config?.max ?? 10,
    idleTimeoutMillis: config?.idleTimeoutMillis ?? 30000,
    connectionTimeoutMillis: config?.connectionTimeoutMillis ?? 5000,
    ssl: sslConfig,
  };

  return new Pool(poolConfig);
}

export function getPgPool(config?: PostgresPoolConfig): Pool {
  if (!sharedPool) {
    sharedPool = createPostgresPool(config);
  }
  return sharedPool;
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
  } catch (err) {
    return { healthy: false, latencyMs: Date.now() - start, error: (err as Error).message };
  }
}
