import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

import type { SessionTokenPayload, User, UserRole } from '@solyra/shared';
import type { PostgresPersistenceBundle } from '../persistence/postgres/index.js';
import {
  comparePassword,
  generateSecureToken,
  hashPassword,
  hashToken,
  signSessionToken,
} from './utils.js';

const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export interface SafeUserDto {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  isGuest: boolean;
  onboardingState: 'pending' | 'in_progress' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

type AuthSessionSummary = {
  id: string;
  userId: string;
  workspaceId: string;
  expiresAt: Date;
};

type SessionTokenWithSessionId = SessionTokenPayload & { sessionId?: string };

export function getResolvedJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET environment variable must be configured in production.');
    }
    return 'solyra-dev-jwt-secret-do-not-use-in-production-change-me';
  }
  return secret;
}

export class AuthService {
  constructor(
    private readonly bundle: PostgresPersistenceBundle,
    private readonly pool: Pool
  ) {}

  private getJwtSecret(): string {
    return getResolvedJwtSecret();
  }

  private mapUserToSafeDto(user: User): SafeUserDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role ?? 'user',
      isActive: user.isActive,
      isGuest: user.isGuest,
      onboardingState: user.onboardingState,
      createdAt: user.createdAt ? new Date(user.createdAt) : new Date(),
      updatedAt: user.updatedAt ? new Date(user.updatedAt) : new Date(),
    };
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

      const createdUser = await this.bundle.users.create({
        id: userId,
        email: normalizedEmail,
        passwordHash,
        fullName,
        role: 'user',
        isActive: true,
        isGuest: false,
        onboardingState: 'pending',
        failedLoginAttempts: 0,
        lockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const workspaceId = randomUUID();
      const workspaceSlug = `${fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'}-${workspaceId.slice(0, 8)}`;
      const workspaceName = `${fullName}'s Workspace`;

      await client.query(
        `
          INSERT INTO workspaces (id, slug, name, owner_id, is_isolated, settings, created_at, updated_at)
          VALUES ($1, $2, $3, $4, FALSE, '{}'::jsonb, NOW(), NOW())
        `,
        [workspaceId, workspaceSlug, workspaceName, createdUser.id]
      );

      const verificationToken = generateSecureToken();
      const verificationHash = hashToken(verificationToken);
      const expiresAt = new Date(Date.now() + DEFAULT_EMAIL_VERIFICATION_TTL_MS);

      await client.query(
        `
          INSERT INTO tokens (id, user_id, token_hash, token_type, created_at, expires_at, consumed_at)
          VALUES ($1, $2, $3, $4, NOW(), $5, NULL)
        `,
        [randomUUID(), createdUser.id, verificationHash, 'EMAIL_VERIFICATION', expiresAt]
      );

      await client.query(
        `
          INSERT INTO email_outbox (id, user_id, recipient, template, payload, status, error, created_at, sent_at)
          VALUES ($1, $2, $3, $4, $5, 'PENDING', NULL, NOW(), NULL)
        `,
        [
          randomUUID(),
          createdUser.id,
          normalizedEmail,
          'email_verification',
          JSON.stringify({
            subject: 'Verify your email',
            fullName,
            verificationToken,
          }),
        ]
      );

      await this.bundle.audit.recordEvent({
        eventType: 'USER_SIGNUP',
        userId: createdUser.id,
        workspaceId,
        details: {
          email: normalizedEmail,
          fullName,
          workspaceId,
        },
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      });

      await client.query('COMMIT');
      return {
        user: {
          id: createdUser.id,
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

    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      await this.bundle.audit.recordEvent({
        eventType: 'LOGIN_BLOCKED_ACCOUNT_LOCKED',
        userId: user.id,
        details: {
          email: normalizedEmail,
          lockedUntil: user.lockedUntil,
        },
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      });
      throw this.buildAuthError('Account is temporarily locked due to multiple failed login attempts. Please try again later.', 403);
    }

    const passwordIsValid = user.passwordHash ? await comparePassword(data.password, user.passwordHash) : false;
    if (!passwordIsValid) {
      const attempts = await this.bundle.users.incrementFailedLoginAttempts(user.id);
      if (attempts >= 5) {
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        await this.bundle.users.lockUserAccount(user.id, lockUntil);
        await this.bundle.audit.recordEvent({
          eventType: 'ACCOUNT_LOCKED',
          userId: user.id,
          details: {
            email: normalizedEmail,
            attempts,
            lockedUntil: lockUntil.toISOString(),
          },
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        });
      }

      await this.bundle.audit.recordEvent({
        eventType: 'USER_LOGIN_FAILED',
        userId: user.id,
        details: { email: normalizedEmail, attempts: user.failedLoginAttempts + 1 },
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      });
      throw this.buildAuthError('Invalid email or password', 401);
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.bundle.users.resetFailedLoginAttempts(user.id);
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
      role: user.role as UserRole,
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
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tokenHash = hashToken(token);
      const result = await client.query(
        `
          SELECT id, user_id, expires_at, consumed_at, token_type
          FROM tokens
          WHERE token_hash = $1
            AND token_type = 'EMAIL_VERIFICATION'
          FOR UPDATE
        `,
        [tokenHash]
      );

      const tokenRecord = result.rows[0];
      if (!tokenRecord || tokenRecord.consumed_at != null || new Date(tokenRecord.expires_at).getTime() < Date.now()) {
        await client.query('ROLLBACK');
        throw this.buildAuthError('Invalid or expired verification token.', 400);
      }

      await client.query('UPDATE tokens SET consumed_at = NOW() WHERE id = $1', [tokenRecord.id]);
      await client.query('UPDATE users SET is_active = TRUE, updated_at = NOW() WHERE id = $1', [tokenRecord.user_id]);
      await client.query(
        `
          INSERT INTO audit_events (id, user_id, workspace_id, event_type, details, ip_address, user_agent, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `,
        [
          randomUUID(),
          tokenRecord.user_id,
          null,
          'EMAIL_VERIFIED',
          JSON.stringify({ tokenType: 'EMAIL_VERIFICATION' }),
          null,
          null,
        ]
      );

      await client.query('COMMIT');
      return { success: true, userId: tokenRecord.user_id };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async forgotPassword(
    email: string,
    metadata: { ipAddress?: string; userAgent?: string } = {}
  ): Promise<{ success: true; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const neutralResponse = {
      success: true,
      message: 'If that email is registered, recovery instructions have been sent.',
    } satisfies { success: true; message: string };

    const user = await this.bundle.users.findByEmail(normalizedEmail);
    if (!user) {
      return neutralResponse;
    }

    if (user.isGuest) {
      return neutralResponse;
    }

    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.bundle.pool.query(
      `
        INSERT INTO tokens (id, user_id, token_hash, token_type, created_at, expires_at, consumed_at)
        VALUES ($1, $2, $3, $4, NOW(), $5, NULL)
      `,
      [randomUUID(), user.id, tokenHash, 'PASSWORD_RESET', expiresAt]
    );

    if (this.bundle.emailOutbox && typeof this.bundle.emailOutbox.queueEmail === 'function') {
      await this.bundle.emailOutbox.queueEmail({
        userId: user.id,
        recipientEmail: user.email,
        subject: 'Reset your password',
        template: 'PASSWORD_RESET',
        payload: {
          recipientName: user.fullName,
          token: rawToken,
        },
      });
    }

    await this.bundle.audit.recordEvent({
      eventType: 'PASSWORD_RESET_REQUESTED',
      userId: user.id,
      details: {
        email: normalizedEmail,
        expiresAt: expiresAt.toISOString(),
      },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return neutralResponse;
  }

  async resetPassword(
    token: string,
    newPassword: string,
    metadata: { ipAddress?: string; userAgent?: string } = {}
  ): Promise<{ success: true; message: string }> {
    const isComplex =
      newPassword.length >= 8 &&
      /[A-Z]/.test(newPassword) &&
      /[a-z]/.test(newPassword) &&
      /[0-9]/.test(newPassword);

    if (!isComplex) {
      throw this.buildAuthError(
        'Password must be at least 8 characters long and contain uppercase, lowercase, and numeric characters',
        400
      );
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const tokenHash = hashToken(token);
      const tokenResult = await client.query(
        `
          SELECT *
          FROM tokens
          WHERE token_hash = $1
            AND token_type = 'PASSWORD_RESET'
            AND consumed_at IS NULL
            AND expires_at > NOW()
          FOR UPDATE
        `,
        [tokenHash]
      );

      const tokenRecord = tokenResult.rows[0];
      if (!tokenRecord) {
        await client.query('ROLLBACK');
        throw this.buildAuthError('Invalid or expired password reset token', 400);
      }

      const passwordHash = await hashPassword(newPassword);
      await client.query('UPDATE tokens SET consumed_at = NOW() WHERE id = $1', [tokenRecord.id]);
      await this.bundle.users.updatePassword(tokenRecord.user_id, passwordHash);
      await this.bundle.users.resetFailedLoginAttempts(tokenRecord.user_id);
      await this.bundle.sessions.revokeAllUserSessions(tokenRecord.user_id);

      await this.bundle.audit.recordEvent({
        eventType: 'PASSWORD_RESET_COMPLETED',
        userId: tokenRecord.user_id,
        details: {
          tokenType: 'PASSWORD_RESET',
          email: tokenRecord.user_id,
        },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });

      await client.query('COMMIT');
      return {
        success: true,
        message: 'Password has been reset successfully. Please log in with your new password.',
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async getOnboardingState(userId: string): Promise<{ onboardingState: 'pending' | 'in_progress' | 'completed' }> {
    const user = await this.bundle.users.findById(userId);
    if (!user) {
      throw this.buildAuthError('User not found.', 404);
    }

    if (user.isGuest) {
      throw this.buildAuthError('Guest accounts cannot perform onboarding operations', 403);
    }

    return { onboardingState: user.onboardingState };
  }

  async updateOnboardingState(
    userId: string,
    state: string,
    metadata: { ipAddress?: string; userAgent?: string } = {}
  ): Promise<SafeUserDto> {
    if (!['pending', 'in_progress', 'completed'].includes(state)) {
      throw this.buildAuthError('Invalid onboarding state', 400);
    }

    const user = await this.bundle.users.findById(userId);
    if (!user) {
      throw this.buildAuthError('User not found.', 404);
    }

    if (user.isGuest) {
      throw this.buildAuthError('Guest accounts cannot perform onboarding operations', 403);
    }

    const updatedUser = await this.bundle.users.updateOnboardingState(userId, state as 'pending' | 'in_progress' | 'completed');
    if (!updatedUser) {
      throw this.buildAuthError('Unable to update onboarding state.', 500);
    }

    await this.bundle.audit.recordEvent({
      eventType: 'ONBOARDING_STATE_UPDATED',
      userId,
      details: {
        previousState: user.onboardingState,
        updatedState: state,
      },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.mapUserToSafeDto(updatedUser);
  }

  async getMe(
    userId: string
  ): Promise<{
    user: SafeUserDto;
    workspaces: Awaited<ReturnType<PostgresPersistenceBundle['workspaces']['listByOwner']>>;
  }> {
    const user = await this.bundle.users.findById(userId);
    if (!user) {
      throw this.buildAuthError('User not found.', 404);
    }

    const workspaces = await this.bundle.workspaces.listByOwner(userId);
    return { user: this.mapUserToSafeDto(user), workspaces };
  }
}
