import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

import { AuthService, getResolvedJwtSecret } from '../src/auth/service.js';
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
      findById: async (id: string) => ({
        id,
        email: 'person@example.com',
        fullName: 'Person Example',
        passwordHash,
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

test('RateLimiter evicts expired IP buckets to prevent unbounded memory growth', () => {
  const limiter = new RateLimiter(50, 2);
  limiter.check('ip-1');
  limiter.check('ip-1');
  limiter.check('ip-2');

  const map = (limiter as any).buckets;
  assert.equal(map.size, 2);

  return new Promise((resolve) => setTimeout(() => {
    limiter.check('ip-3');
    assert.equal((limiter as any).buckets.size <= 2, true);
    resolve();
  }, 120));
});

test('AuthService.getMe sanitizes the user payload and strips passwordHash', async () => {
  const bundle = await makeBundle();
  const service = new AuthService(bundle, { connect: async () => ({ query: async () => ({ rows: [] }), release: () => undefined }) } as any);
  const result = await service.getMe('user-1');

  assert.equal(result.user.passwordHash, undefined);
  assert.equal(Object.keys(result.user).includes('passwordHash'), false);
  assert.equal(result.user.email, 'person@example.com');
  assert.equal(result.user.fullName, 'Person Example');
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

  const inactiveBundle = await makeBundle();
  inactiveBundle.users.findById = async () => ({ id: 'user-1', email: 'person@example.com', fullName: 'Person Example', isActive: false });
  inactiveBundle.sessions.findSessionByTokenHash = async () => session;
  const inactiveReq = { headers: { authorization: `Bearer ${token}` } } as any;
  const inactiveRes = { writeHead: () => undefined, end: (payload?: string) => payload } as any;
  assert.equal(await authenticateRequest(inactiveReq, inactiveRes, inactiveBundle), false);
});

test('AuthService.verifyEmail rejects expired or already-consumed tokens atomically', async () => {
  const bundle = await makeBundle();
  const consumedToken = hashToken('consumed-token');
  const pool = {
    connect: async () => ({
      query: async (sql: string, params?: any[]) => {
        if (sql.includes('BEGIN')) {
          return { rows: [] };
        }
        if (sql.includes('SELECT id, user_id, expires_at, consumed_at, token_type')) {
          return { rows: [{ id: 'token-1', user_id: 'user-1', expires_at: new Date(Date.now() + 60_000), consumed_at: new Date(), token_type: 'EMAIL_VERIFICATION' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      release: () => undefined,
    }),
  } as any;

  const service = new AuthService(bundle, pool);
  await assert.rejects(async () => service.verifyEmail('consumed-token'), /Invalid or expired verification token/);
});

test('getResolvedJwtSecret fails closed in production when JWT_SECRET is missing', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousJwtSecret = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  process.env.NODE_ENV = 'production';

  try {
    assert.throws(() => getResolvedJwtSecret(), /JWT_SECRET environment variable must be configured in production/);
  } finally {
    if (previousJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousJwtSecret;
    }
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
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
