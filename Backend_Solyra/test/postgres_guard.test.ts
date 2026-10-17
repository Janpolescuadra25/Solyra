import assert from 'node:assert/strict';
import test from 'node:test';

import { assertConnectedToTestDatabase, validatePostgresTestSafety } from '../src/persistence/postgres/guard.js';

test('validatePostgresTestSafety rejects non-test node env', () => {
  assert.throws(
    () => validatePostgresTestSafety({ nodeEnv: 'development', testDbUrl: 'postgresql://user:pass@localhost:5432/solyra_test' }),
    /NODE_ENV='test'/,
  );
});

test('validatePostgresTestSafety rejects empty test DB URL', () => {
  assert.throws(
    () => validatePostgresTestSafety({ nodeEnv: 'test', testDbUrl: '' }),
    /SOLYRA_TEST_DB_URL/,
  );
});

test('validatePostgresTestSafety rejects application database names', () => {
  assert.throws(
    () => validatePostgresTestSafety({ nodeEnv: 'test', testDbUrl: 'postgresql://user:pass@localhost:5432/solyra_db' }),
    /solyra_db/i,
  );
});

test('validatePostgresTestSafety accepts isolated test database', () => {
  const result = validatePostgresTestSafety({
    nodeEnv: 'test',
    testDbUrl: 'postgresql://user:pass@localhost:5432/solyra_test',
  });

  assert.strictEqual(result.targetDbName, 'solyra_test');
});

test('assertConnectedToTestDatabase rejects mismatched or application DB names', async () => {
  const mockClient = {
    query: async () => ({ rows: [{ current_database: 'solyra_db' }] }),
  };

  await assert.rejects(
    () => assertConnectedToTestDatabase(mockClient as any, 'solyra_test'),
    /SAFETY ABORT/,
  );

  const mismatchedClient = {
    query: async () => ({ rows: [{ current_database: 'other_db' }] }),
  };

  await assert.rejects(
    () => assertConnectedToTestDatabase(mismatchedClient as any, 'solyra_test'),
    /SAFETY ABORT/,
  );
});
