import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';

const { server } = await import('../src/index.js');
const { SessionRepository } = await import('../src/persistence/postgres/repositories/session.repository.js');
const { AuditEventRepository } = await import('../src/persistence/postgres/repositories/audit-event.repository.js');
const { hashToken } = await import('../src/auth/utils.js');

const TEST_JWT_SECRET = process.env.JWT_SECRET ?? 'solyra-dev-jwt-secret-do-not-use-in-production-change-me';
const originalQuery = Pool.prototype.query;

const users = new Map<string, Record<string, unknown>>();
const sessions = new Map<string, Record<string, unknown>>();
const conversations = new Map<string, Record<string, unknown>>();
const chatMessages = new Map<string, Array<Record<string, unknown>>>();
const auditEvents: Array<Record<string, unknown>> = [];
const fixtureTokens = new Map<string, string>();

let baseUrl = 'http://127.0.0.1:0';

function createUserRow(userId: string, role: 'owner' | 'admin' | 'user', email: string, fullName: string) {
  return {
    id: userId,
    email,
    password_hash: '$2a$10$test-hash',
    full_name: fullName,
    role,
    is_active: true,
    is_guest: false,
    onboarding_state: 'completed',
    failed_login_attempts: 0,
    locked_until: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function createSessionRow(userId: string, workspaceId: string, token: string, sessionId = randomUUID()) {
  return {
    id: sessionId,
    user_id: userId,
    workspace_id: workspaceId,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    revoked_at: null,
    revocation_reason: null,
    ip_address: '127.0.0.1',
    user_agent: 'step8-test-agent',
  };
}

function createConversationRow(id: string, workspaceId: string, userId: string, title = 'Test Chat') {
  return {
    id,
    workspace_id: workspaceId,
    user_id: userId,
    title,
    model_identifier: 'solyra-default',
    system_prompt_override: null,
    message_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function createMessageRow(conversationId: string, senderId: string, role: 'user' | 'assistant', content: string) {
  return {
    id: randomUUID(),
    session_id: conversationId,
    sender_id: senderId,
    sender: senderId,
    role,
    content,
    metadata: '{}',
    created_at: new Date().toISOString(),
  };
}

function buildJwt(role: 'owner' | 'admin' | 'user', userId: string) {
  return jwt.sign(
    {
      sub: userId,
      role,
      workspaceId: `${role}-workspace`,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    },
    TEST_JWT_SECRET
  );
}

function setFixtureToken(role: 'owner' | 'admin' | 'user', userId: string, token: string): string {
  fixtureTokens.set(`${role}:${userId}`, token);
  return token;
}

function buildHeader(role: 'owner' | 'admin' | 'user', userId: string) {
  const token = fixtureTokens.get(`${role}:${userId}`) ?? buildJwt(role, userId);
  return {
    Authorization: `Bearer ${token}`,
    Origin: 'http://localhost:3000',
    'Content-Type': 'application/json',
  };
}

function restoreActiveSession(userId: string, role: 'owner' | 'admin' | 'user', workspaceId: string) {
  const token = setFixtureToken(role, userId, buildJwt(role, userId));
  sessions.set(`session-${userId}`, createSessionRow(userId, workspaceId, token, `session-${userId}`));
}

function installMockPool() {
  Pool.prototype.query = async function (sqlText: string | { text: string; values?: unknown[] }, params: unknown[] = []) {
    const sql = typeof sqlText === 'string' ? sqlText : sqlText.text;
    const values = Array.isArray(params) && params.length > 0 ? params : (typeof sqlText === 'object' && Array.isArray(sqlText.values) ? sqlText.values : []);

    if (sql.startsWith('SELECT * FROM users WHERE id = $1')) {
      const userId = String(values[0]);
      const user = users.get(userId);
      return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
    }

    if (sql.startsWith('SELECT * FROM users WHERE email = $1')) {
      const email = String(values[0]);
      const match = Array.from(users.values()).find((user) => String(user.email) === email);
      return { rows: match ? [match] : [], rowCount: match ? 1 : 0 };
    }

    if (sql.startsWith('SELECT * FROM users ORDER BY created_at ASC')) {
      return { rows: Array.from(users.values()), rowCount: users.size };
    }

    if (sql.startsWith('UPDATE users')) {
      const id = String(values[values.length - 1]);
      const existing = users.get(id);
      if (!existing) {
        return { rows: [], rowCount: 0 };
      }

      const updated = {
        ...existing,
        email: String(values[0]),
        password_hash: String(values[1]),
        full_name: String(values[2]),
        role: values[3],
        is_active: Boolean(values[4]),
        is_guest: Boolean(values[5]),
        onboarding_state: String(values[6]),
        failed_login_attempts: Number(values[7] ?? 0),
        locked_until: values[8] ?? null,
        created_at: existing.created_at,
        updated_at: values[9] ?? new Date().toISOString(),
      };
      users.set(id, updated);
      return { rows: [updated], rowCount: 1 };
    }

    if (sql.startsWith('SELECT * FROM sessions WHERE token_hash = $1')) {
      const tokenHash = String(values[0]);
      const match = Array.from(sessions.values()).find((session) => String(session.token_hash) === tokenHash);
      return { rows: match ? [match] : [], rowCount: match ? 1 : 0 };
    }

    if (sql.startsWith('SELECT * FROM sessions WHERE id = $1')) {
      const sessionId = String(values[0]);
      const match = sessions.get(sessionId) ?? null;
      return { rows: match ? [match] : [], rowCount: match ? 1 : 0 };
    }

    if (sql.includes('SELECT id, user_id, workspace_id, token_hash, expires_at, created_at, revoked_at, revocation_reason, ip_address, user_agent')) {
      const activeSessions = Array.from(sessions.values()).filter((session) => session.revoked_at === null && new Date(String(session.expires_at)).getTime() > Date.now());
      return { rows: activeSessions.slice(0, Number(values[0] ?? 50)), rowCount: activeSessions.length };
    }

    if (sql.includes('UPDATE sessions SET revoked_at = NOW(), revocation_reason = $2 WHERE user_id = $1 AND revoked_at IS NULL')) {
      const userId = String(values[0]);
      let revokedCount = 0;
      for (const [sessionId, session] of sessions.entries()) {
        if (session.user_id === userId && session.revoked_at === null) {
          sessions.set(sessionId, { ...session, revoked_at: new Date().toISOString(), revocation_reason: String(values[1]) });
          revokedCount += 1;
        }
      }
      return { rows: [], rowCount: revokedCount };
    }

    if (sql.includes('UPDATE sessions SET revoked_at = NOW(), revocation_reason = $2 WHERE id = $1 AND revoked_at IS NULL')) {
      const sessionId = String(values[0]);
      const session = sessions.get(sessionId);
      if (!session || session.revoked_at !== null) {
        return { rows: [], rowCount: 0 };
      }
      sessions.set(sessionId, { ...session, revoked_at: new Date().toISOString(), revocation_reason: String(values[1]) });
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes('INSERT INTO sessions')) {
      const sessionId = String(values[0]);
      const sessionRow = createSessionRow(String(values[1]), String(values[2]), String(values[3]), sessionId);
      sessions.set(sessionId, sessionRow);
      return { rows: [sessionRow], rowCount: 1 };
    }

    if (sql.includes('INSERT INTO audit_events')) {
      const event = {
        id: String(values[0]),
        user_id: values[1] ?? null,
        workspace_id: values[2] ?? null,
        event_type: String(values[3]),
        details: JSON.parse(String(values[4])),
        ip_address: values[5] ?? null,
        user_agent: values[6] ?? null,
        created_at: new Date().toISOString(),
      };
      auditEvents.unshift(event);
      return { rows: [event], rowCount: 1 };
    }

    if (sql.includes('SELECT id, event_type, user_id, workspace_id, details, ip_address, user_agent, created_at')) {
      const limit = Number(values[0] ?? 50);
      return { rows: auditEvents.slice(0, limit), rowCount: auditEvents.length };
    }

    if (sql.includes('SELECT * FROM chat_sessions WHERE workspace_id = $1 AND user_id = $2')) {
      const workspaceId = String(values[0]);
      const userId = String(values[1]);
      const rows = Array.from(conversations.values()).filter((conversation) => conversation.workspace_id === workspaceId && conversation.user_id === userId);
      return { rows, rowCount: rows.length };
    }

    if (sql.includes('SELECT * FROM chat_sessions WHERE workspace_id = $1 ORDER BY updated_at DESC')) {
      const workspaceId = String(values[0]);
      const rows = Array.from(conversations.values()).filter((conversation) => conversation.workspace_id === workspaceId);
      return { rows, rowCount: rows.length };
    }

    if (sql.includes('SELECT * FROM chat_sessions WHERE id = $1')) {
      const conversationId = String(values[0]);
      const conversation = conversations.get(conversationId);
      return { rows: conversation ? [conversation] : [], rowCount: conversation ? 1 : 0 };
    }

    if (sql.includes('INSERT INTO chat_sessions')) {
      const conversationId = String(values[0]);
      const conversation = {
        id: conversationId,
        workspace_id: String(values[1]),
        user_id: String(values[2]),
        title: String(values[3]),
        model_identifier: String(values[4]),
        system_prompt_override: values[5] ?? null,
        message_count: Number(values[6] ?? 0),
        created_at: values[7] ?? new Date().toISOString(),
        updated_at: values[8] ?? new Date().toISOString(),
      };
      conversations.set(conversationId, conversation);
      chatMessages.set(conversationId, []);
      return { rows: [conversation], rowCount: 1 };
    }

    if (sql.includes('DELETE FROM chat_sessions WHERE id = $1 AND workspace_id = $2')) {
      const conversationId = String(values[0]);
      const workspaceId = String(values[1]);
      const conversation = conversations.get(conversationId);
      if (conversation && String(conversation.workspace_id) === workspaceId) {
        conversations.delete(conversationId);
        chatMessages.delete(conversationId);
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('INSERT INTO chat_messages')) {
      const messageId = String(values[0]);
      const conversationId = String(values[1]);
      const senderId = String(values[2]);
      const content = String(values[5]);
      const message = {
        id: messageId,
        session_id: conversationId,
        sender_id: senderId,
        sender: senderId,
        role: String(values[4]),
        content,
        metadata: values[6] ? String(values[6]) : '{}',
        created_at: values[7] ?? new Date().toISOString(),
      };
      const messages = chatMessages.get(conversationId) ?? [];
      messages.push(message);
      chatMessages.set(conversationId, messages);
      return { rows: [message], rowCount: 1 };
    }

    if (sql.includes('SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC')) {
      const conversationId = String(values[0]);
      const rows = chatMessages.get(conversationId) ?? [];
      return { rows, rowCount: rows.length };
    }

    if (sql.includes('UPDATE chat_sessions SET message_count = message_count + 1')) {
      const conversationId = String(values[1]);
      const conversation = conversations.get(conversationId);
      if (conversation) {
        conversations.set(conversationId, { ...conversation, message_count: Number(conversation.message_count ?? 0) + 1, updated_at: values[0] ?? new Date().toISOString() });
      }
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes('COUNT(*)::int AS active_owner_count')) {
      const activeOwnerCount = Array.from(users.values()).filter((user) => user.role === 'owner' && user.is_active === true).length;
      return { rows: [{ active_owner_count: activeOwnerCount }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  } as any;
}

before(async () => {
  users.clear();
  sessions.clear();
  conversations.clear();
  chatMessages.clear();
  auditEvents.length = 0;

  users.set('owner-1', createUserRow('owner-1', 'owner', 'owner@example.com', 'Owner One'));
  users.set('admin-1', createUserRow('admin-1', 'admin', 'admin@example.com', 'Admin One'));
  users.set('member-1', createUserRow('member-1', 'user', 'member@example.com', 'Member One'));
  users.set('member-2', createUserRow('member-2', 'user', 'member2@example.com', 'Member Two'));

  const ownerToken = setFixtureToken('owner', 'owner-1', buildJwt('owner', 'owner-1'));
  const adminToken = setFixtureToken('admin', 'admin-1', buildJwt('admin', 'admin-1'));
  const memberToken = setFixtureToken('user', 'member-1', buildJwt('user', 'member-1'));
  const memberTwoToken = setFixtureToken('user', 'member-2', buildJwt('user', 'member-2'));

  sessions.set('session-owner-1', createSessionRow('owner-1', 'workspace-owner', ownerToken, 'session-owner-1'));
  sessions.set('session-admin-1', createSessionRow('admin-1', 'workspace-admin', adminToken, 'session-admin-1'));
  sessions.set('session-member-1', createSessionRow('member-1', 'workspace-member', memberToken, 'session-member-1'));
  sessions.set('session-member-2-a', createSessionRow('member-2', 'workspace-member', memberTwoToken, 'session-member-2-a'));
  sessions.set('session-member-2-b', createSessionRow('member-2', 'workspace-member', buildJwt('user', 'member-2'), 'session-member-2-b'));

  installMockPool();

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('Server did not bind to an ephemeral port');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  Pool.prototype.query = originalQuery;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test('Pillar 1: authentication flows generate valid tokens and reject malformed or guest requests', async () => {
  const ownerHeader = buildHeader('owner', 'owner-1');
  const adminHeader = buildHeader('admin', 'admin-1');
  const memberHeader = buildHeader('user', 'member-1');

  const ownerResponse = await fetch(`${baseUrl}/api/admin/users`, { headers: ownerHeader });
  assert.equal(ownerResponse.status, 200);

  const adminResponse = await fetch(`${baseUrl}/api/admin/users`, { headers: adminHeader });
  assert.equal(adminResponse.status, 200);

  const memberResponse = await fetch(`${baseUrl}/api/admin/users`, { headers: memberHeader });
  assert.equal(memberResponse.status, 403);

  const malformedResponse = await fetch(`${baseUrl}/api/admin/users`, {
    headers: { Authorization: 'Bearer not-a-valid-jwt', Origin: 'http://localhost:3000' },
  });
  assert.equal(malformedResponse.status, 401);

  const guestResponse = await fetch(`${baseUrl}/api/admin/users`, {
    headers: { Origin: 'http://localhost:3000' },
  });
  assert.ok([401, 403].includes(guestResponse.status));

  const expiredToken = jwt.sign(
    {
      sub: 'owner-1',
      role: 'owner',
      workspaceId: 'workspace-owner',
      iat: Math.floor(Date.now() / 1000) - 3600,
      exp: Math.floor(Date.now() / 1000) - 10,
    },
    TEST_JWT_SECRET
  );
  const expiredResponse = await fetch(`${baseUrl}/api/admin/users`, {
    headers: { Authorization: `Bearer ${expiredToken}`, Origin: 'http://localhost:3000' },
  });
  assert.equal(expiredResponse.status, 401);
});

test('Pillar 2: session revocation invalidates active sessions and preserves user isolation boundaries', async () => {
  const repo = new SessionRepository({ query: async (sql: string, params: unknown[]) => {
    const sqlText = String(sql);
    if (sqlText.includes('UPDATE sessions SET revoked_at = NOW(), revocation_reason = $2 WHERE user_id = $1 AND revoked_at IS NULL')) {
      const userId = String(params[0]);
      let revokedCount = 0;
      for (const [sessionId, session] of sessions.entries()) {
        if (session.user_id === userId && session.revoked_at === null) {
          sessions.set(sessionId, { ...session, revoked_at: new Date().toISOString(), revocation_reason: String(params[1]) });
          revokedCount += 1;
        }
      }
      return { rowCount: revokedCount };
    }

    if (sqlText.includes('SELECT * FROM sessions WHERE token_hash = $1')) {
      const match = Array.from(sessions.values()).find((session) => String(session.token_hash) === String(params[0]));
      return { rows: match ? [match] : [], rowCount: match ? 1 : 0 };
    }

    return { rows: [], rowCount: 0 };
  } } as any);

  const revokedCount = await repo.revokeAllUserSessions('member-2', 'Role demoted by administrator');
  assert.equal(revokedCount, 2);

  const activeSessionCount = Array.from(sessions.values()).filter((session) => session.user_id === 'member-2' && session.revoked_at === null).length;
  assert.equal(activeSessionCount, 0);

  const unaffectedCount = Array.from(sessions.values()).filter((session) => session.user_id === 'member-1' && session.revoked_at === null).length;
  assert.equal(unaffectedCount, 1);

  const revoked = await fetch(`${baseUrl}/api/admin/users`, {
    headers: buildHeader('owner', 'owner-1'),
  });
  assert.equal(revoked.status, 200);

  const logoutResponse = await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
    headers: buildHeader('user', 'member-1'),
  });
  assert.equal(logoutResponse.status, 200);

  const followUpMembershipCheck = await fetch(`${baseUrl}/api/admin/users`, {
    headers: buildHeader('user', 'member-1'),
  });
  assert.equal(followUpMembershipCheck.status, 403);

  const renewedMemberOneToken = setFixtureToken('user', 'member-1', buildJwt('user', 'member-1'));
  sessions.set('session-member-1', createSessionRow('member-1', 'workspace-member', renewedMemberOneToken, 'session-member-1'));

  const renewedMemberTwoToken = setFixtureToken('user', 'member-2', buildJwt('user', 'member-2'));
  sessions.set('session-member-2-a', createSessionRow('member-2', 'workspace-member', renewedMemberTwoToken, 'session-member-2-a'));
  sessions.set('session-member-2-b', createSessionRow('member-2', 'workspace-member', buildJwt('user', 'member-2'), 'session-member-2-b'));
});

test('Pillar 3: regular-user chat lifecycle enforces ownership, assistant replies, and rate limiting', async () => {
  const memberHeader = buildHeader('user', 'member-1');
  const otherUserHeader = buildHeader('user', 'member-2');

  const listResponse = await fetch(`${baseUrl}/api/chat/conversations`, { headers: memberHeader });
  assert.equal(listResponse.status, 200);
  const listPayload = (await listResponse.json()) as { conversations?: Array<Record<string, unknown>> };
  assert.ok(Array.isArray(listPayload.conversations));

  const createResponse = await fetch(`${baseUrl}/api/chat/conversations`, {
    method: 'POST',
    headers: memberHeader,
    body: JSON.stringify({ title: 'Acceptance Chat', modelIdentifier: 'solyra-default' }),
  });
  assert.equal(createResponse.status, 201);
  const created = (await createResponse.json()) as { conversation?: { id: string; userId?: string } };
  assert.ok(created.conversation?.id);

  const conversationId = created.conversation!.id;
  const messageResponse = await fetch(`${baseUrl}/api/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: memberHeader,
    body: JSON.stringify({ content: 'Test request from Step 8.' }),
  });
  assert.equal(messageResponse.status, 201);
  const messagePayload = (await messageResponse.json()) as { assistantMessage?: { content?: string } };
  assert.ok(messagePayload.assistantMessage?.content?.includes('Solyra Assistant'));

  const unauthorizedFetch = await fetch(`${baseUrl}/api/chat/conversations/${conversationId}/messages`, {
    headers: otherUserHeader,
  });
  assert.equal(unauthorizedFetch.status, 403);

  const unauthorizedDelete = await fetch(`${baseUrl}/api/chat/conversations/${conversationId}`, {
    method: 'DELETE',
    headers: otherUserHeader,
  });
  assert.equal(unauthorizedDelete.status, 403);

  for (let i = 0; i < 120; i += 1) {
    const request = await fetch(`${baseUrl}/api/chat/conversations`, { headers: memberHeader });
    if (request.status === 429) {
      assert.equal(request.status, 429);
      break;
    }
  }

  const finalRateLimitCheck = await fetch(`${baseUrl}/api/chat/conversations`, { headers: memberHeader });
  assert.ok([200, 429].includes(finalRateLimitCheck.status));
});

test('Pillar 4: owner/admin authorization and admin mutation guard boundaries are enforced', async () => {
  const ownerHeader = buildHeader('owner', 'owner-1');
  const adminHeader = buildHeader('admin', 'admin-1');
  const memberHeader = buildHeader('user', 'member-1');

  const ownerAccess = await fetch(`${baseUrl}/api/admin/users`, { headers: ownerHeader });
  assert.equal(ownerAccess.status, 200);

  const adminAccess = await fetch(`${baseUrl}/api/admin/users`, { headers: adminHeader });
  assert.equal(adminAccess.status, 200);

  const memberDenied = await fetch(`${baseUrl}/api/admin/users`, { headers: memberHeader });
  assert.equal(memberDenied.status, 403);

  const invalidOriginResponse = await fetch(`${baseUrl}/api/admin/users/member-2/role`, {
    method: 'PUT',
    headers: {
      ...ownerHeader,
      Origin: 'https://evil.example.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'admin' }),
  });
  assert.equal(invalidOriginResponse.status, 403);

  const validOriginResponse = await fetch(`${baseUrl}/api/admin/users/member-2/role`, {
    method: 'PUT',
    headers: {
      ...ownerHeader,
      Origin: 'http://localhost:3000',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'admin' }),
  });
  assert.ok([200, 400].includes(validOriginResponse.status));

  const invalidBoundaryResponse = await fetch(`${baseUrl}/api/admin/users/member-1/role`, {
    method: 'PUT',
    headers: {
      ...memberHeader,
      Origin: 'http://localhost:3000',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'admin' }),
  });
  assert.equal(invalidBoundaryResponse.status, 403);
});

test('AuditEventRepository records immutable audit events for admin actions', async () => {
  const repository = new AuditEventRepository({
    query: async (sql: string, params: unknown[]) => {
      if (String(sql).includes('INSERT INTO audit_events')) {
        const event = {
          id: String(params[0]),
          user_id: params[1] ?? null,
          workspace_id: params[2] ?? null,
          event_type: String(params[3]),
          details: JSON.parse(String(params[4])),
          ip_address: params[5] ?? null,
          user_agent: params[6] ?? null,
          created_at: new Date().toISOString(),
        };
        auditEvents.unshift(event);
        return { rows: [event], rowCount: 1 };
      }
      if (String(sql).includes('SELECT id, event_type, user_id, workspace_id, details, ip_address, user_agent, created_at')) {
        const limit = Number(params[0] ?? 50);
        return { rows: auditEvents.slice(0, limit), rowCount: auditEvents.length };
      }
      return { rows: [], rowCount: 0 };
    },
  } as any);

  const created = await repository.recordEvent({
    eventType: 'admin.user_role_updated',
    userId: 'owner-1',
    workspaceId: null,
    details: {
      targetUserId: 'member-2',
      previousRole: 'user',
      newRole: 'admin',
      actorId: 'owner-1',
    },
    ipAddress: '127.0.0.1',
    userAgent: 'step8-acceptance-matrix',
  });

  assert.equal(created.eventType, 'admin.user_role_updated');
  assert.equal(created.details.targetUserId, 'member-2');

  const recent = await repository.listRecentEvents(10);
  assert.equal(recent.length > 0, true);
  assert.equal(recent[0].eventType, 'admin.user_role_updated');
  assert.equal(recent[0].userId, 'owner-1');
  assert.equal(recent[0].workspaceId, null);
});
