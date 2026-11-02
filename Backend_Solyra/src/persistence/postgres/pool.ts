import { Pool, type PoolConfig } from 'pg';

export interface PostgresPoolConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  ssl?: boolean | { rejectUnauthorized?: boolean };
}

export type SolyraPoolOptions = PostgresPoolConfig;

let sharedPool: Pool | null = null;

export function getPoolConfig(config?: PostgresPoolConfig): PoolConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const sslConfig = config?.ssl ?? (isProduction ? { rejectUnauthorized: false } : undefined);
  const connectionString = config?.connectionString ?? process.env.DATABASE_URL;

  if (connectionString) {
    return {
      connectionString,
      max: config?.max ?? 10,
      idleTimeoutMillis: config?.idleTimeoutMillis ?? 30000,
      connectionTimeoutMillis: config?.connectionTimeoutMillis ?? 5000,
      ssl: sslConfig,
    };
  }

  return {
    host: config?.host ?? process.env.PGHOST ?? 'localhost',
    port: config?.port ?? (Number(process.env.PGPORT) || 5432),
    user: config?.user ?? process.env.PGUSER ?? 'postgres',
    password: config?.password ?? process.env.PGPASSWORD ?? '',
    database: config?.database ?? process.env.PGDATABASE ?? 'Solyra_db',
    max: config?.max ?? 10,
    idleTimeoutMillis: config?.idleTimeoutMillis ?? 30000,
    connectionTimeoutMillis: config?.connectionTimeoutMillis ?? 5000,
    ssl: sslConfig,
  };
}

export function createPostgresPool(config?: PostgresPoolConfig): Pool {
  return new Pool(getPoolConfig(config));
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
