import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

import { AuthService } from '../src/auth/service.js';
import { RateLimiter, authenticateRequest } from '../src/auth/middleware.js';
import { hashPassword, hashToken, signSessionToken } from '../src/auth/utils.js';

const makeBundle = async () => {
  const passwordHash = await hashPassword('Solyra!Secure123');
  const sessionStore = new Map<string, any>();
  return {
    users: {
      findByEmail: async () => ({
        id: 'user-1',
        email: 'person@example.com',
        fullName: 'Person Example',
        passwordHash,
        isActive: true,
      }),
      findById: async () => ({
        id: 'user-1',
        email: 'person@example.com',
        fullName: 'Person Example',
        isActive: true,
      }),
    },
    workspaces: {
      listByOwner: async () => [{ id: 'workspace-1', ownerId: 'user-1' }],
    },
    sessions: {
      createSession: async (record: any) => {
        sessionStore.set(record.id, record);
        return { ...record, createdAt: new Date(), revokedAt: null, revocationReason: null };
      },
      findSessionById: async (sessionId: string) => sessionStore.get(sessionId) ?? null,
      findSessionByTokenHash: async (tokenHash: string) => {
        const match = [...sessionStore.values()].find((session) => session.tokenHash === tokenHash);
        return match ?? null;
      },
      revokeSession: async (sessionId: string) => {
        const session = sessionStore.get(sessionId);
        if (session) {
          session.revokedAt = new Date();
          session.revocationReason = 'user_logout';
        }
      },
      revokeAllUserSessions: async () => undefined,
    },
    audit: {
      recordEvent: async (event: any) => ({ id: randomUUID(), ...event, createdAt: new Date() }),
    },
  } as any;
};

test('RateLimiter allows traffic up to the configured limit and blocks overflow', () => {
  const limiter = new RateLimiter(60_000, 2);

  assert.deepEqual(limiter.check('client-1'), { allowed: true, remaining: 1 });
  assert.deepEqual(limiter.check('client-1'), { allowed: true, remaining: 0 });
  assert.equal(limiter.check('client-1').allowed, false);
  assert.equal(limiter.check('client-1').retryAfterSeconds !== undefined, true);
});

test('authenticateRequest rejects missing or invalid bearer tokens and accepts a valid signed session', async () => {
  const bundle = await makeBundle();
  const sessionId = randomUUID();
  const workspaceId = 'workspace-1';
  const token = signSessionToken({ sub: 'user-1', workspaceId, role: 'member', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }, 'solyra-dev-jwt-secret-do-not-use-in-production-change-me');
  const session = {
    id: sessionId,
    userId: 'user-1',
    workspaceId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    revokedAt: null,
    revocationReason: null,
  };
  bundle.sessions.findSessionByTokenHash = async () => session;

  const missingRes = { writeHead: () => undefined, end: () => undefined } as any;
  const missingReq = { headers: {} } as any;
  assert.equal(await authenticateRequest(missingReq, missingRes, bundle), false);

  const malformedReq = { headers: { authorization: 'Token abc' } } as any;
  assert.equal(await authenticateRequest(malformedReq, missingRes, bundle), false);

  const validReq = { headers: { authorization: `Bearer ${token}` } } as any;
  const validRes = { writeHead: () => undefined, end: () => undefined } as any;
  assert.equal(await authenticateRequest(validReq, validRes, bundle), true);
  assert.equal(validReq.user?.sub, 'user-1');
  assert.equal(validReq.session?.id, sessionId);
});

test('AuthService.login signs a valid JWT and creates a session for valid credentials', async () => {
  const bundle = await makeBundle();
  const pool = {
    query: async (sql: string) => {
      if (sql.includes('SELECT id FROM users')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    },
  } as any;

  const service = new AuthService(bundle, pool);
  const result = await service.login({ email: 'person@example.com', password: 'Solyra!Secure123' });

  assert.equal(typeof result.token, 'string');
  assert.equal(result.session.userId, 'user-1');
  assert.equal(result.session.workspaceId, 'workspace-1');
  assert.ok(result.session.expiresAt instanceof Date);
});
