import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryAuditEventRepository } from '../src/persistence/in-memory/audit-event.repository.js';
import { createInMemoryBundle } from '../src/persistence/in-memory/index.js';
import { createPostgresBundle } from '../src/persistence/postgres/index.js';
import { AuditEventRepository, redactPii } from '../src/persistence/postgres/repositories/audit-event.repository.js';

test('InMemoryAuditEventRepository records and retrieves audit events', async () => {
  const repository = new InMemoryAuditEventRepository();

  const created = await repository.recordEvent({
    user_id: 'user-1',
    workspace_id: 'ws-1',
    organization_id: '7d4f6c8b-2bb3-4c62-8f5b-8b3d160e4ff9',
    action: 'workspace.member.role_updated',
    target_type: 'workspace_member',
    target_id: 'member-1',
    metadata: { role: 'admin' },
  });

  assert.equal(created.action, 'workspace.member.role_updated');
  assert.equal(created.eventType, 'workspace.member.role_updated');
  assert.equal(created.workspace_id, 'ws-1');
  assert.equal(created.organization_id, '7d4f6c8b-2bb3-4c62-8f5b-8b3d160e4ff9');

  const recent = await repository.listRecentEvents(10);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].metadata?.role, 'admin');
});

test('audit repository preserves backwards-compatible defaults when metadata is omitted', async () => {
  const repository = new InMemoryAuditEventRepository();
  const created = await repository.recordEvent({
    user_id: 'user-2',
    action: 'user.login',
  });

  assert.equal(created.user_id, 'user-2');
  assert.deepEqual(created.metadata ?? {}, {});
  assert.equal(created.action, 'user.login');
  assert.equal(created.eventType, 'user.login');
});

test('redactPii scrubs nested PII at multiple depths', () => {
  const payload = {
    email: 'alice@example.com',
    outer: {
      middle: {
        password: 'super-secret',
        token: 'abc123',
        refreshToken: 'refresh-42',
      },
    },
    session: {
      cookie: 'session=abc',
      headers: {
        authorization: 'Bearer hidden',
      },
    },
  };

  const redacted = redactPii(payload) as Record<string, unknown>;

  assert.equal((redacted.outer as any).middle.password, '[REDACTED]');
  assert.equal((redacted.outer as any).middle.token, '[REDACTED]');
  assert.equal((redacted.outer as any).middle.refreshToken, '[REDACTED]');
  assert.equal((redacted.session as any).cookie, '[REDACTED]');
  assert.equal((redacted.session as any).headers.authorization, '[REDACTED]');
  assert.equal(redacted.email, 'alice@example.com');
});

test('queryEvents filters by workspace, organization, action, target, and date range', async () => {
  const repository = new InMemoryAuditEventRepository();
  const baseDate = new Date('2026-11-03T12:00:00.000Z');

  await repository.recordEvent({
    id: 'audit-1',
    user_id: 'user-1',
    workspace_id: 'ws-1',
    organization_id: 'org-1',
    action: 'workspace.member.role_updated',
    target_type: 'workspace_member',
    target_id: 'member-1',
    created_at: new Date(baseDate.getTime() - 60_000),
    metadata: { previousRole: 'member', newRole: 'admin' },
  });

  await repository.recordEvent({
    id: 'audit-2',
    user_id: 'user-2',
    workspace_id: 'ws-2',
    organization_id: 'org-1',
    action: 'workspace.invitation.created',
    target_type: 'workspace_invitation',
    target_id: 'inv-1',
    created_at: new Date(baseDate.getTime() + 60_000),
    metadata: { email: 'alice@example.com' },
  });

  const filtered = await repository.queryEvents({
    user_id: 'user-1',
    workspace_id: 'ws-1',
    organization_id: 'org-1',
    action: 'workspace.member.role_updated',
    target_type: 'workspace_member',
    target_id: 'member-1',
    start_date: new Date(baseDate.getTime() - 120_000),
    end_date: new Date(baseDate.getTime() + 120_000),
  });

  assert.equal(filtered.total, 1);
  assert.equal(filtered.events[0].id, 'audit-1');
  assert.equal(filtered.events.length, 1);
});

test('queryEvents supports pagination and total counts', async () => {
  const repository = new InMemoryAuditEventRepository();

  for (let index = 0; index < 5; index += 1) {
    await repository.recordEvent({
      id: `audit-${index}`,
      user_id: `user-${index}`,
      action: 'audit.page_view',
      metadata: { index },
    });
  }

  const result = await repository.queryEvents({ action: 'audit.page_view', limit: 2, offset: 2 });

  assert.equal(result.total, 5);
  assert.equal(result.limit, 2);
  assert.equal(result.offset, 2);
  assert.equal(result.events.length, 2);
});

test('bundle audit repositories are wired for in-memory and postgres parity', async () => {
  const memoryBundle = createInMemoryBundle();
  const postgresBundle = createPostgresBundle({ query: async () => ({ rows: [] }) } as any);

  assert.equal(typeof memoryBundle.audit.recordEvent, 'function');
  assert.equal(typeof memoryBundle.audit.queryEvents, 'function');
  assert.equal(typeof postgresBundle.audit.recordEvent, 'function');
  assert.equal(typeof postgresBundle.audit.queryEvents, 'function');
  assert.ok(postgresBundle.audit instanceof AuditEventRepository);
});

test('audit events are immutable after creation', async () => {
  const repository = new InMemoryAuditEventRepository();
  const created = await repository.recordEvent({
    user_id: 'user-3',
    action: 'workspace.member.removed',
    metadata: { userId: 'member-9' },
  });

  assert.equal(Object.isFrozen(created), true);
  assert.throws(() => {
    (created as any).action = 'mutated';
  }, /Cannot assign/);
});
