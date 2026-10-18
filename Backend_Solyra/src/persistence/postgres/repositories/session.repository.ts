import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuthSession } from '@solyra/shared';

export interface ISessionRepository {
  createSession(data: {
    id?: string;
    userId: string;
    workspaceId: string;
    tokenHash: string;
    userAgent?: string;
    ipAddress?: string;
    expiresAt: Date | string;
  }): Promise<AuthSession>;
  findSessionById(sessionId: string): Promise<AuthSession | null>;
  findSessionByTokenHash(tokenHash: string): Promise<AuthSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  revokeAllUserSessions(userId: string): Promise<void>;
}

export class SessionRepository implements ISessionRepository {
  constructor(private readonly pool: Pool) {}

  private mapRow(row: any): AuthSession {
    return {
      id: row.id,
      userId: row.user_id,
      workspaceId: row.workspace_id,
      tokenHash: row.token_hash,
      ipAddress: row.ip_address ?? undefined,
      userAgent: row.user_agent ?? undefined,
      expiresAt: new Date(row.expires_at),
      createdAt: new Date(row.created_at),
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
      revocationReason: row.revocation_reason ?? null,
    } satisfies AuthSession;
  }

  async createSession(data: {
    id?: string;
    userId: string;
    workspaceId: string;
    tokenHash: string;
    userAgent?: string;
    ipAddress?: string;
    expiresAt: Date | string;
  }): Promise<AuthSession> {
    const id = data.id ?? randomUUID();
    const expiresAt = data.expiresAt instanceof Date ? data.expiresAt : new Date(data.expiresAt);
    const res = await this.pool.query(
      `
        INSERT INTO sessions (id, user_id, workspace_id, token_hash, expires_at, created_at, revoked_at, revocation_reason)
        VALUES ($1, $2, $3, $4, $5, NOW(), NULL, NULL)
        RETURNING *
      `,
      [id, data.userId, data.workspaceId, data.tokenHash, expiresAt]
    );

    return this.mapRow(res.rows[0]);
  }

  async findSessionById(sessionId: string): Promise<AuthSession | null> {
    const res = await this.pool.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    if (res.rows.length === 0) {
      return null;
    }
    return this.mapRow(res.rows[0]);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<AuthSession | null> {
    const res = await this.pool.query('SELECT * FROM sessions WHERE token_hash = $1', [tokenHash]);
    if (res.rows.length === 0) {
      return null;
    }
    return this.mapRow(res.rows[0]);
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE sessions SET revoked_at = NOW(), revocation_reason = $1 WHERE id = $2`,
      ['user_logout', sessionId]
    );
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE sessions SET revoked_at = NOW(), revocation_reason = $1 WHERE user_id = $2 AND revoked_at IS NULL`,
      ['bulk_revoke', userId]
    );
  }
}
