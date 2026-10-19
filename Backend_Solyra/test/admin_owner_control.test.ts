import assert from 'node:assert/strict';
import test from 'node:test';

import { AuditEventRepository } from '../src/persistence/postgres/repositories/audit-event.repository.js';
import { SessionRepository } from '../src/persistence/postgres/repositories/session.repository.js';

test('AuditEventRepository.listRecentEvents returns the newest audit events in a bounded result set', async () => {
  const rows = [
    {
      id: 'audit-2',
      event_type: 'ADMIN_ACTION',
      user_id: 'user-2',
      workspace_id: 'workspace-2',
      details: { action: 'role_updated' },
      ip_address: '203.0.113.9',
      user_agent: 'agent-b',
      created_at: '2026-10-20T12:00:00.000Z',
    },
    {
      id: 'audit-1',
      event_type: 'SESSION_REVOKED',
      user_id: 'user-1',
      workspace_id: 'workspace-1',
      details: { action: 'revoke_session' },
      ip_address: '203.0.113.8',
      user_agent: 'agent-a',
      created_at: '2026-10-19T12:00:00.000Z',
    },
  ];

  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const repository = new AuditEventRepository({
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return { rows };
    },
  } as any);

  const events = await repository.listRecentEvents(2);

  assert.equal(events.length, 2);
  assert.equal(events[0].eventType, 'ADMIN_ACTION');
  assert.equal(events[0].ipAddress, '203.0.113.9');
  assert.equal(calls[0].params[0], 2);
});

test('SessionRepository.listActiveSessions and revokeSession preserve audit-friendly defaults', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const repository = new SessionRepository({
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT')) {
        return {
          rows: [
            {
              id: 'session-1',
              user_id: 'user-1',
              token_hash: 'hash-1',
              expires_at: '2026-10-20T14:00:00.000Z',
              created_at: '2026-10-19T13:00:00.000Z',
              revoked_at: null,
            },
          ],
        };
      }
      return { rowCount: 1 };
    },
  } as any);

  const activeSessions = await repository.listActiveSessions(25);
  assert.equal(activeSessions.length, 1);
  assert.equal(activeSessions[0].id, 'session-1');
  assert.equal(activeSessions[0].userId, 'user-1');

  await repository.revokeSession('session-1');
  await repository.revokeSession('session-2', 'owner_revocation');

  assert.equal(calls[1].params[0], 'session-1');
  assert.equal(calls[1].params[1], 'user_logout');
  assert.equal(calls[2].params[0], 'session-2');
  assert.equal(calls[2].params[1], 'owner_revocation');
});
