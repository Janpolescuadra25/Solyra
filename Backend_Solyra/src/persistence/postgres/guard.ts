export interface PostgresGuardOptions {
  nodeEnv?: string;
  testDbUrl?: string;
}

export function validatePostgresTestSafety(options: PostgresGuardOptions = {}): { targetDbName: string } {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const testDbUrl = options.testDbUrl ?? process.env.SOLYRA_TEST_DB_URL;

  if (nodeEnv !== 'test') {
    throw new Error(`SAFETY ABORT: PostgreSQL test operations require NODE_ENV='test'. Current: '${nodeEnv ?? 'undefined'}'`);
  }

  if (!testDbUrl || testDbUrl.trim() === '') {
    throw new Error("SAFETY ABORT: PostgreSQL test operations require explicit SOLYRA_TEST_DB_URL environment variable.");
  }

  let parsedDbName = '';
  try {
    const url = new URL(testDbUrl);
    parsedDbName = url.pathname.replace(/^\/+/, '').trim().toLowerCase();
  } catch {
    throw new Error('SAFETY ABORT: Invalid SOLYRA_TEST_DB_URL format.');
  }

  if (!parsedDbName || parsedDbName === 'solyra_db') {
    throw new Error(`SAFETY ABORT: Refusing to run tests against application database '${parsedDbName || 'solyra_db'}'. Test database must be an isolated database.`);
  }

  return { targetDbName: parsedDbName };
}

export async function assertConnectedToTestDatabase(
  client: { query: (sql: string) => Promise<{ rows: Array<{ current_database?: string }> }> },
  expectedDbName: string,
): Promise<void> {
  const res = await client.query('SELECT current_database()');
  const currentDb = res.rows[0]?.current_database?.toLowerCase().trim();

  if (!currentDb || currentDb !== expectedDbName || currentDb === 'solyra_db') {
    throw new Error(`SAFETY ABORT: Connected database '${currentDb}' does not match expected test database '${expectedDbName}' or is application database.`);
  }
}
