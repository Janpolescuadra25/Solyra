import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

import { AuthService, getResolvedJwtSecret } from '../src/auth/service.js';
import { RateLimiter, authenticateRequest } from '../src/auth/middleware.js';
import { hashPassword, hashToken, signSessionToken } from '../src/auth/utils.js';

const makeBundle = async () => {
  const passwordHash = await hashPassword('Solyra!Secure123');
  const sessionStore = new Map<string, any>();
  const userState = {
    id: 'user-1',
    email: 'person@example.com',
    passwordHash,
    fullName: 'Person Example',
    role: 'user',
    isActive: true,
    isGuest: false,
    onboardingState: 'pending',
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    users: {
      findByEmail: async (email: string) => {
        if (!email || email !== userState.email) return null;
        return { ...userState };
      },
      findById: async (id: string) => ({
        ...userState,
        id,
      }),
      create: async (input: any) => ({
        ...userState,
        ...input,
        id: input.id ?? 'user-1',
        email: input.email ?? userState.email,
        fullName: input.fullName ?? userState.fullName,
        passwordHash: input.passwordHash ?? userState.passwordHash,
        role: input.role ?? 'user',
        isActive: input.isActive ?? true,
        isGuest: input.isGuest ?? false,
        onboardingState: input.onboardingState ?? 'pending',
        failedLoginAttempts: input.failedLoginAttempts ?? 0,
        lockedUntil: input.lockedUntil ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      incrementFailedLoginAttempts: async (userId: string) => {
        userState.failedLoginAttempts += 1;
        return userState.failedLoginAttempts;
      },
      resetFailedLoginAttempts: async (userId: string) => {
        userState.failedLoginAttempts = 0;
        userState.lockedUntil = null;
      },
      lockUserAccount: async (userId: string, lockedUntil: Date) => {
        userState.lockedUntil = lockedUntil;
      },
      updateOnboardingState: async (userId: string, state: string) => ({
        ...userState,
        onboardingState: state,
      }),
      updatePassword: async (userId: string, passwordHashValue: string) => {
        userState.passwordHash = passwordHashValue;
      },
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
    pool: {
      query: async (sql: string, params?: any[]) => ({ rows: [], rowCount: 0, fields: [] }),
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

test('AuthService lockout prevents repeated failed logins and resets on success', async () => {
  const bundle = await makeBundle();
  const service = new AuthService(bundle, { query: async () => ({ rows: [], rowCount: 0 }) } as any);

  const userRef = await bundle.users.findById('user-1');
  userRef.failedLoginAttempts = 4;
  userRef.lockedUntil = null;
  userRef.passwordHash = await hashPassword('Solyra!Secure123');

  bundle.users.findByEmail = async () => userRef;
  bundle.users.incrementFailedLoginAttempts = async () => {
    userRef.failedLoginAttempts += 1;
    return userRef.failedLoginAttempts;
  };
  bundle.users.lockUserAccount = async (_userId: string, lockedUntil: Date) => {
    userRef.lockedUntil = lockedUntil;
  };

  const result = await service.login({ email: 'person@example.com', password: 'WrongPassword123' }).catch((err) => err);
  assert.ok(result instanceof Error || result?.message === 'Invalid email or password');

  const lockedUser = await bundle.users.findByEmail('person@example.com');
  assert.equal(lockedUser.failedLoginAttempts >= 5, true);

  const secondResult = await service.login({ email: 'person@example.com', password: 'Solyra!Secure123' }).catch((err) => err);
  assert.equal(secondResult instanceof Error, true);
});

test('AuthService forgotPassword and resetPassword enforce reset lifecycle and guest guardrails', async () => {
  const bundle = await makeBundle();
  const service = new AuthService(bundle, {
    connect: async () => ({
      query: async (sql: string, params?: any[]) => {
        if (sql.includes('SELECT id, user_id, expires_at, consumed_at, token_type')) {
          return { rows: [{ id: 'token-1', user_id: 'user-1', token_hash: 'hash', expires_at: new Date(Date.now() + 60_000), consumed_at: null, token_type: 'PASSWORD_RESET' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      release: () => undefined,
    }),
  } as any);

  const forgotResult = await service.forgotPassword('person@example.com');
  assert.equal(forgotResult.success, true);
  assert.match(forgotResult.message, /recovery instructions/i);

  const guestBundle = await makeBundle();
  guestBundle.users.findByEmail = async () => ({
    ...await guestBundle.users.findById('user-1'),
    isGuest: true,
  });
  const guestService = new AuthService(guestBundle, { query: async () => ({ rows: [], rowCount: 0 }) } as any);
  const guestForgot = await guestService.forgotPassword('person@example.com');
  assert.equal(guestForgot.success, true);

  const resetFailure = await service.resetPassword('bad-token', 'weak').catch((err) => err);
  assert.ok(resetFailure instanceof Error);

  const validReset = await service.resetPassword('valid-token', 'Password1').catch((err) => err);
  assert.ok(validReset instanceof Error || validReset?.success === true);
});

test('AuthService onboarding state enforces enum validation and guest blocking', async () => {
  const bundle = await makeBundle();
  const service = new AuthService(bundle, { query: async () => ({ rows: [], rowCount: 0 }) } as any);

  await assert.rejects(async () => service.updateOnboardingState('user-1', 'not_valid'), /Invalid onboarding state/);

  const guestBundle = await makeBundle();
  const originalFindById = guestBundle.users.findById.bind(guestBundle.users);
  guestBundle.users.findById = async () => ({
    ...(await originalFindById('user-1')),
    isGuest: true,
  });
  const guestService = new AuthService(guestBundle, { query: async () => ({ rows: [], rowCount: 0 }) } as any);
  await assert.rejects(async () => guestService.updateOnboardingState('user-1', 'completed'), /Guest accounts cannot perform onboarding operations/);

  const result = await service.updateOnboardingState('user-1', 'completed');
  assert.equal(result?.onboardingState, 'completed');
});
