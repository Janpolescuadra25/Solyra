import { randomUUID } from 'node:crypto';

import {
  redactPii,
  type AuditEvent,
  type AuditEventQueryFilters,
  type AuditEventQueryResult,
  type IAuditEventRepository,
  type RecordAuditEventParams,
} from '../postgres/repositories/audit-event.repository.js';

export class InMemoryAuditEventRepository implements IAuditEventRepository {
  private readonly events: AuditEvent[] = [];

  private static normalizeText(value: string | null | undefined, fallback: string): string {
    const cleaned = (value ?? fallback).trim();
    return cleaned || fallback;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  }

  private sanitizeMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> {
    return (redactPii(value ?? {}) as Record<string, unknown>) ?? {};
  }

  private createEvent(params: RecordAuditEventParams): AuditEvent {
    const userId = InMemoryAuditEventRepository.normalizeText(
      params.user_id ?? params.userId ?? 'system',
      'system',
    );
    const action = InMemoryAuditEventRepository.normalizeText(
      params.action ?? params.eventType ?? 'system_action',
      'system_action',
    );
    const createdAt = params.created_at ?? params.createdAt ?? new Date();
    const metadata = this.sanitizeMetadata(params.metadata ?? params.details ?? {});

    const event: AuditEvent = {
      id: params.id ?? randomUUID(),
      user_id: userId,
      userId,
      workspace_id: params.workspace_id ?? params.workspaceId ?? null,
      workspaceId: params.workspace_id ?? params.workspaceId ?? null,
      organization_id: params.organization_id ?? params.organizationId ?? null,
      organizationId: params.organization_id ?? params.organizationId ?? null,
      action,
      eventType: action,
      target_type: params.target_type ?? params.targetType ?? null,
      targetType: params.target_type ?? params.targetType ?? null,
      target_id: params.target_id ?? params.targetId ?? null,
      targetId: params.target_id ?? params.targetId ?? null,
      metadata,
      details: metadata,
      ip_address: params.ip_address ?? params.ipAddress ?? null,
      ipAddress: params.ip_address ?? params.ipAddress ?? null,
      user_agent: params.user_agent ?? params.userAgent ?? null,
      userAgent: params.user_agent ?? params.userAgent ?? null,
      created_at: createdAt,
      createdAt,
    };

    return Object.freeze({ ...event }) as AuditEvent;
  }

  async recordEvent(event: RecordAuditEventParams): Promise<AuditEvent> {
    const auditEvent = this.createEvent(event);
    this.events.push(auditEvent);
    return auditEvent;
  }

  async findEventsByUserId(userId: string, limit = 25): Promise<AuditEvent[]> {
    const result = this.queryEvents({ user_id: userId, limit });
    return (await result).events;
  }

  async findEventsByWorkspaceId(workspaceId: string, limit = 25): Promise<AuditEvent[]> {
    const result = this.queryEvents({ workspace_id: workspaceId, limit });
    return (await result).events;
  }

  async listRecentEvents(limit = 50): Promise<AuditEvent[]> {
    const safeLimit = Math.min(Math.max(1, Number(limit) || 25), 200);
    return [...this.events]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, safeLimit)
      .map((event) => Object.freeze({ ...event }) as AuditEvent);
  }

  async queryEvents(filters: AuditEventQueryFilters): Promise<AuditEventQueryResult> {
    const safeLimit = Math.min(Math.max(1, Number(filters.limit ?? 25) || 25), 200);
    const safeOffset = Math.max(0, Number(filters.offset ?? 0) || 0);

    const filtered = [...this.events].filter((event) => {
      if (filters.user_id && event.user_id !== filters.user_id && event.userId !== filters.user_id) {
        return false;
      }
      if (filters.workspace_id && event.workspace_id !== filters.workspace_id && event.workspaceId !== filters.workspace_id) {
        return false;
      }
      if (filters.organization_id && event.organization_id !== filters.organization_id && event.organizationId !== filters.organization_id) {
        return false;
      }
      if (filters.action && event.action !== filters.action && event.eventType !== filters.action) {
        return false;
      }
      if (filters.target_type && event.target_type !== filters.target_type && event.targetType !== filters.target_type) {
        return false;
      }
      if (filters.target_id && event.target_id !== filters.target_id && event.targetId !== filters.target_id) {
        return false;
      }
      if (filters.start_date && new Date(event.created_at) < new Date(filters.start_date)) {
        return false;
      }
      if (filters.end_date && new Date(event.created_at) > new Date(filters.end_date)) {
        return false;
      }
      return true;
    });

    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const total = filtered.length;
    const events = filtered.slice(safeOffset, safeOffset + safeLimit).map((event) => Object.freeze({ ...event }) as AuditEvent);

    return {
      events,
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }
}
