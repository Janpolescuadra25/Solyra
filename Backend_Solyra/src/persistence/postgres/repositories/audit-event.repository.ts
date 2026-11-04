import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface AuditEvent {
  id: string;
  user_id: string;
  userId?: string | null;
  workspace_id?: string | null;
  workspaceId?: string | null;
  organization_id?: string | null;
  organizationId?: string | null;
  action: string;
  eventType?: string;
  target_type?: string | null;
  targetType?: string | null;
  target_id?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  details?: Record<string, unknown>;
  ip_address?: string | null;
  ipAddress?: string | null;
  user_agent?: string | null;
  userAgent?: string | null;
  created_at: Date;
  createdAt?: Date;
}

export interface RecordAuditEventParams {
  id?: string;
  user_id?: string | null;
  userId?: string | null;
  workspace_id?: string | null;
  workspaceId?: string | null;
  organization_id?: string | null;
  organizationId?: string | null;
  action?: string;
  eventType?: string;
  target_type?: string | null;
  targetType?: string | null;
  target_id?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  details?: Record<string, unknown>;
  ip_address?: string | null;
  ipAddress?: string | null;
  user_agent?: string | null;
  userAgent?: string | null;
  created_at?: Date;
  createdAt?: Date;
}

export interface AuditEventQueryFilters {
  user_id?: string;
  userId?: string;
  workspace_id?: string;
  workspaceId?: string;
  organization_id?: string;
  organizationId?: string;
  action?: string;
  eventType?: string;
  target_type?: string;
  targetType?: string;
  target_id?: string;
  targetId?: string;
  start_date?: Date;
  end_date?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditEventQueryResult {
  events: AuditEvent[];
  total: number;
  limit: number;
  offset: number;
}

export const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'authorization',
  'apikey',
  'refreshtoken',
  'accesstoken',
  'credential',
  'cookie',
  'privatekey',
  'cvv',
  'ssn',
]);

export function redactPii(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactPii(item));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
    if (SENSITIVE_KEYS.has(normalizedKey)) {
      result[key] = '[REDACTED]';
      continue;
    }

    if (typeof value === 'object' && value !== null) {
      result[key] = redactPii(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

export interface IAuditEventRepository {
  recordEvent(event: RecordAuditEventParams): Promise<AuditEvent>;
  findEventsByUserId(userId: string, limit?: number): Promise<AuditEvent[]>;
  findEventsByWorkspaceId(workspaceId: string, limit?: number): Promise<AuditEvent[]>;
  listRecentEvents(limit?: number): Promise<AuditEvent[]>;
  queryEvents(filters: AuditEventQueryFilters): Promise<AuditEventQueryResult>;
}

export class AuditEventRepository implements IAuditEventRepository {
  constructor(private readonly pool: Pool) {}

  private static normalizeKey(value: string | null | undefined): string {
    return (value ?? 'system').trim() || 'system';
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  }

  private mapRow(row: any): AuditEvent {
    const metadata = this.asRecord(row.metadata ?? row.details ?? {});
    const createdAt = new Date(row.created_at ?? row.createdAt ?? Date.now());
    const action = String(row.action ?? row.event_type ?? row.eventType ?? 'system_action');
    const userId = row.user_id ?? row.userId ?? 'system';
    const workspaceId = row.workspace_id ?? row.workspaceId ?? null;
    const organizationId = row.organization_id ?? row.organizationId ?? null;
    const targetType = row.target_type ?? row.targetType ?? null;
    const targetId = row.target_id ?? row.targetId ?? null;
    const ipAddress = row.ip_address ?? row.ipAddress ?? null;
    const userAgent = row.user_agent ?? row.userAgent ?? null;

    const redactedMetadata = redactPii(metadata) as Record<string, unknown>;

    return Object.freeze({
      id: row.id,
      user_id: userId,
      userId,
      workspace_id: workspaceId,
      workspaceId,
      organization_id: organizationId,
      organizationId,
      action,
      eventType: action,
      target_type: targetType,
      targetType,
      target_id: targetId,
      targetId,
      metadata: redactedMetadata,
      details: redactedMetadata,
      ip_address: ipAddress,
      ipAddress,
      user_agent: userAgent,
      userAgent,
      created_at: createdAt,
      createdAt,
    }) as AuditEvent;
  }

  private sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> {
    return (redactPii(metadata ?? {}) as Record<string, unknown>) ?? {};
  }

  async recordEvent(event: RecordAuditEventParams): Promise<AuditEvent> {
    const userId = AuditEventRepository.normalizeKey(event.user_id ?? event.userId ?? 'system');
    const workspaceId = event.workspace_id ?? event.workspaceId ?? null;
    const organizationId = event.organization_id ?? event.organizationId ?? null;
    const action = AuditEventRepository.normalizeKey(event.action ?? event.eventType ?? 'system_action');
    const targetType = event.target_type ?? event.targetType ?? null;
    const targetId = event.target_id ?? event.targetId ?? null;
    const metadata = this.sanitizeMetadata(event.metadata ?? event.details ?? {});
    const ipAddress = event.ip_address ?? event.ipAddress ?? null;
    const userAgent = event.user_agent ?? event.userAgent ?? null;
    const createdAt = event.created_at ?? event.createdAt ?? new Date();
    const id = event.id ?? randomUUID();

    const res = await this.pool.query(
      `
        INSERT INTO audit_events (
          id,
          user_id,
          workspace_id,
          action,
          metadata,
          ip_address,
          user_agent,
          created_at,
          organization_id,
          target_type,
          target_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `,
      [
        id,
        userId,
        workspaceId,
        action,
        JSON.stringify(metadata),
        ipAddress,
        userAgent,
        createdAt,
        organizationId,
        targetType,
        targetId,
      ],
    );

    return this.mapRow(res.rows[0]);
  }

  async findEventsByUserId(userId: string, limit = 25): Promise<AuditEvent[]> {
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const res = await this.pool.query(
      `SELECT * FROM audit_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, safeLimit],
    );
    return res.rows.map((row: any) => this.mapRow(row));
  }

  async findEventsByWorkspaceId(workspaceId: string, limit = 25): Promise<AuditEvent[]> {
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const res = await this.pool.query(
      `SELECT * FROM audit_events WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [workspaceId, safeLimit],
    );
    return res.rows.map((row: any) => this.mapRow(row));
  }

  async listRecentEvents(limit = 50): Promise<AuditEvent[]> {
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const res = await this.pool.query(
      `
        SELECT id, user_id, workspace_id, organization_id, action, target_type, target_id, metadata, ip_address, user_agent, created_at
        FROM audit_events
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [safeLimit],
    );
    return res.rows.map((row: any) => this.mapRow(row));
  }

  async queryEvents(filters: AuditEventQueryFilters): Promise<AuditEventQueryResult> {
    const clauses: string[] = [];
    const values: unknown[] = [];

    const normalizedFilters = {
      user_id: filters.user_id ?? filters.userId,
      workspace_id: filters.workspace_id ?? filters.workspaceId,
      organization_id: filters.organization_id ?? filters.organizationId,
      action: filters.action ?? filters.eventType,
      target_type: filters.target_type ?? filters.targetType,
      target_id: filters.target_id ?? filters.targetId,
      start_date: filters.start_date,
      end_date: filters.end_date,
    };

    const pushFilter = (column: string, value: unknown) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      clauses.push(`${column} = $${values.length + 1}`);
      values.push(value);
    };

    const pushDateFilter = (column: string, value: Date | undefined, operator: '>= ' | '<= ') => {
      if (value === undefined || value === null) {
        return;
      }
      clauses.push(`${column} ${operator} $${values.length + 1}`);
      values.push(value);
    };

    pushFilter('user_id', normalizedFilters.user_id);
    pushFilter('workspace_id', normalizedFilters.workspace_id);
    pushFilter('organization_id', normalizedFilters.organization_id);
    pushFilter('action', normalizedFilters.action);
    pushFilter('target_type', normalizedFilters.target_type);
    pushFilter('target_id', normalizedFilters.target_id);
    pushDateFilter('created_at', normalizedFilters.start_date, '>= ');
    pushDateFilter('created_at', normalizedFilters.end_date, '<= ');

    const safeLimit = Math.min(Math.max(1, Number(filters.limit ?? 25) || 25), 200);
    const safeOffset = Math.max(0, Number(filters.offset ?? 0) || 0);

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const query = `
      SELECT *, COUNT(*) OVER() AS total_count
      FROM audit_events
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}
    `;

    const res = await this.pool.query(query, [...values, safeLimit, safeOffset]);
    const rows = res.rows ?? [];
    const total = rows.length > 0 ? Number(rows[0].total_count ?? rows.length) : 0;
    const events = rows.map((row: any) => this.mapRow(row));

    return {
      events,
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }
}
