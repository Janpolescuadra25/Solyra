import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuditEvent } from '@solyra/shared';

export interface IAuditEventRepository {
  recordEvent(event: {
    id?: string;
    eventType: string;
    userId?: string;
    workspaceId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditEvent>;
  findEventsByUserId(userId: string, limit?: number): Promise<AuditEvent[]>;
  findEventsByWorkspaceId(workspaceId: string, limit?: number): Promise<AuditEvent[]>;
  listRecentEvents(limit?: number): Promise<AuditEvent[]>;
}

export class AuditEventRepository implements IAuditEventRepository {
  constructor(private readonly pool: Pool) {}

  private mapRow(row: any): AuditEvent {
    return {
      id: row.id,
      userId: row.user_id ?? null,
      workspaceId: row.workspace_id ?? null,
      eventType: row.event_type,
      details: row.details ?? {},
      ipAddress: row.ip_address ?? null,
      userAgent: row.user_agent ?? null,
      createdAt: new Date(row.created_at),
    };
  }

  async recordEvent(event: {
    id?: string;
    eventType: string;
    userId?: string;
    workspaceId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditEvent> {
    const id = event.id ?? randomUUID();
    const res = await this.pool.query(
      `
        INSERT INTO audit_events (id, user_id, workspace_id, event_type, details, ip_address, user_agent, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *
      `,
      [
        id,
        event.userId ?? null,
        event.workspaceId ?? null,
        event.eventType,
        JSON.stringify(event.details ?? {}),
        event.ipAddress ?? null,
        event.userAgent ?? null,
      ]
    );

    return this.mapRow(res.rows[0]);
  }

  async findEventsByUserId(userId: string, limit = 25): Promise<AuditEvent[]> {
    const res = await this.pool.query(
      `SELECT * FROM audit_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return res.rows.map((row: any) => this.mapRow(row));
  }

  async findEventsByWorkspaceId(workspaceId: string, limit = 25): Promise<AuditEvent[]> {
    const res = await this.pool.query(
      `SELECT * FROM audit_events WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [workspaceId, limit]
    );
    return res.rows.map((row: any) => this.mapRow(row));
  }

  async listRecentEvents(limit = 50): Promise<AuditEvent[]> {
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const res = await this.pool.query(
      `
        SELECT id, event_type, user_id, workspace_id, details, ip_address, user_agent, created_at
        FROM audit_events
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [safeLimit]
    );
    return res.rows.map((row: any) => this.mapRow(row));
  }
}
