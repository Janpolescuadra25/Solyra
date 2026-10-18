import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

import type { SessionTokenPayload, UserRole } from '@solyra/shared';
import type { PostgresPersistenceBundle } from '../persistence/postgres/index.js';
import {
  comparePassword,
  generateSecureToken,
  hashPassword,
  hashToken,
  signSessionToken,
} from './utils.js';

const DEFAULT_JWT_SECRET = 'solyra-dev-jwt-secret-do-not-use-in-production-change-me';
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

type AuthSessionSummary = {
  id: string;
  userId: string;
  workspaceId: string;
  expiresAt: Date;
};

type SessionTokenWithSessionId = SessionTokenPayload & { sessionId?: string };

export class AuthService {
  constructor(
    private readonly bundle: PostgresPersistenceBundle,
    private readonly pool: Pool
  ) {}

  private getJwtSecret(): string {
    return process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
  }

  private buildAuthError(message: string, statusCode = 401): Error & { statusCode: number } {
    const error = new Error(message) as Error & { statusCode: number };
    error.statusCode = statusCode;
    return error;
  }

  async signup(data: {
    email: string;
    password: string;
    fullName: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ user: { id: string; email: string; fullName: string }; workspaceId: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const normalizedEmail = data.email.trim().toLowerCase();
      const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
      if ((existingUser.rowCount ?? 0) > 0) {
        await client.query('ROLLBACK');
        throw this.buildAuthError('An account with this email already exists.', 409);
      }

      const userId = randomUUID();
      const passwordHash = await hashPassword(data.password);
      const fullName = data.fullName.trim();

      await client.query(
        `
          INSERT INTO users (id, email, password_hash, full_name, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
        `,
        [userId, normalizedEmail, passwordHash, fullName]
      );

      const workspaceId = randomUUID();
      const workspaceSlug = `${fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'}-${workspaceId.slice(0, 8)}`;
      const workspaceName = `${fullName}'s Workspace`;

      await client.query(
        `
          INSERT INTO workspaces (id, slug, name, owner_id, is_isolated, settings, created_at, updated_at)
          VALUES ($1, $2, $3, $4, FALSE, '{}'::jsonb, NOW(), NOW())
        `,
        [workspaceId, workspaceSlug, workspaceName, userId]
      );

      const verificationToken = generateSecureToken();
      const verificationHash = hashToken(verificationToken);
      const expiresAt = new Date(Date.now() + DEFAULT_EMAIL_VERIFICATION_TTL_MS);

      await client.query(
        `
          INSERT INTO tokens (id, user_id, token_hash, token_type, created_at, expires_at, consumed_at)
          VALUES ($1, $2, $3, $4, NOW(), $5, NULL)
        `,
        [randomUUID(), userId, verificationHash, 'EMAIL_VERIFICATION', expiresAt]
      );

      await client.query(
        `
          INSERT INTO email_outbox (id, user_id, recipient, template, payload, status, error, created_at, sent_at)
          VALUES ($1, $2, $3, $4, $5, 'PENDING', NULL, NOW(), NULL)
        `,
        [
          randomUUID(),
          userId,
          normalizedEmail,
          'email_verification',
          JSON.stringify({
            subject: 'Verify your email',
            fullName,
            verificationToken,
          }),
        ]
      );

      await client.query(
        `
          INSERT INTO audit_events (id, user_id, workspace_id, event_type, details, ip_address, user_agent, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `,
        [
          randomUUID(),
          userId,
          workspaceId,
          'USER_SIGNUP',
          JSON.stringify({
            email: normalizedEmail,
            fullName,
            workspaceId,
          }),
          data.ipAddress ?? null,
          data.userAgent ?? null,
        ]
      );

      await client.query('COMMIT');
      return {
        user: {
          id: userId,
          email: normalizedEmail,
          fullName,
        },
        workspaceId,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async login(data: {
    email: string;
    password: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ token: string; session: AuthSessionSummary }> {
    const normalizedEmail = data.email.trim().toLowerCase();
    const user = await this.bundle.users.findByEmail(normalizedEmail);
    if (!user || !user.isActive) {
      await this.bundle.audit.recordEvent({
        eventType: 'USER_LOGIN_FAILED',
        details: { email: normalizedEmail },
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      });
      throw this.buildAuthError('Invalid email or password', 401);
    }

    const passwordIsValid = user.passwordHash ? await comparePassword(data.password, user.passwordHash) : false;
    if (!passwordIsValid) {
      await this.bundle.audit.recordEvent({
        eventType: 'USER_LOGIN_FAILED',
        userId: user.id,
        details: { email: normalizedEmail },
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      });
      throw this.buildAuthError('Invalid email or password', 401);
    }

    const workspaces = await this.bundle.workspaces.listByOwner(user.id);
    const primaryWorkspace = workspaces[0];
    if (!primaryWorkspace) {
      throw this.buildAuthError('No workspace is available for this user.', 500);
    }

    const sessionId = randomUUID();
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload: Record<string, unknown> = {
      sub: user.id,
      workspaceId: primaryWorkspace.id,
      role: 'member' as UserRole,
      iat: issuedAt,
      exp: issuedAt + 7 * 24 * 60 * 60,
      sessionId,
    };

    const token = signSessionToken(payload, this.getJwtSecret());
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_MS);

    const session = await this.bundle.sessions.createSession({
      id: sessionId,
      userId: user.id,
      workspaceId: primaryWorkspace.id,
      tokenHash,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      expiresAt,
    });

    await this.bundle.audit.recordEvent({
      eventType: 'USER_LOGIN',
      userId: user.id,
      workspaceId: primaryWorkspace.id,
      details: {
        email: normalizedEmail,
        sessionId,
      },
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });

    return {
      token,
      session: {
        id: session.id,
        userId: session.userId,
        workspaceId: session.workspaceId,
        expiresAt: session.expiresAt,
      },
    };
  }

  async logout(
    sessionId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const session = await this.bundle.sessions.findSessionById(sessionId);
    await this.bundle.sessions.revokeSession(sessionId);
    await this.bundle.audit.recordEvent({
      eventType: 'USER_LOGOUT',
      userId,
      workspaceId: session?.workspaceId,
      details: { sessionId },
      ipAddress,
      userAgent,
    });
  }

  async verifyEmail(token: string): Promise<{ success: true; userId: string }> {
    const tokenHash = hashToken(token);
    const result = await this.pool.query(
      `
        SELECT * FROM tokens
        WHERE token_hash = $1
          AND token_type = 'EMAIL_VERIFICATION'
          AND consumed_at IS NULL
          AND expires_at > NOW()
      `,
      [tokenHash]
    );

    if ((result.rowCount ?? 0) === 0) {
      throw this.buildAuthError('Verification token is invalid or expired.', 401);
    }

    const tokenRecord = result.rows[0];
    await this.pool.query('UPDATE tokens SET consumed_at = NOW() WHERE id = $1', [tokenRecord.id]);
    await this.pool.query('UPDATE users SET is_active = TRUE, updated_at = NOW() WHERE id = $1', [tokenRecord.user_id]);
    await this.bundle.audit.recordEvent({
      eventType: 'EMAIL_VERIFIED',
      userId: tokenRecord.user_id,
      details: { tokenType: 'EMAIL_VERIFICATION' },
    });

    return { success: true, userId: tokenRecord.user_id };
  }

  async getMe(
    userId: string
  ): Promise<{
    user: Awaited<ReturnType<PostgresPersistenceBundle['users']['findById']>>;
    workspaces: Awaited<ReturnType<PostgresPersistenceBundle['workspaces']['listByOwner']>>;
  }> {
    const user = await this.bundle.users.findById(userId);
    if (!user) {
      throw this.buildAuthError('User not found.', 404);
    }

    const workspaces = await this.bundle.workspaces.listByOwner(userId);
    return { user, workspaces };
  }
}
