import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { Workspace, WorkspaceMembership } from '@solyra/shared';

export const VALID_WORKSPACE_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type WorkspaceRole = (typeof VALID_WORKSPACE_ROLES)[number];

export interface IWorkspaceRepository {
  findById(id: string): Promise<Workspace | null>;
  findBySlug(slug: string): Promise<Workspace | null>;
  create(workspace: Workspace): Promise<Workspace>;
  update(id: string, updates: Partial<Workspace>): Promise<Workspace | null>;
  delete(id: string): Promise<boolean>;
  listByOwner(ownerId: string): Promise<Workspace[]>;
  listByOrganization(organizationId: string): Promise<Workspace[]>;
  addMember(member: WorkspaceMembership | string, userId?: string, role?: string): Promise<WorkspaceMembership>;
  getMember(workspaceId: string, userId: string): Promise<WorkspaceMembership | null>;
  removeMember(workspaceId: string, userId: string): Promise<boolean>;
  listMembers(workspaceId: string): Promise<WorkspaceMembership[]>;
}

export class PostgresWorkspaceRepository implements IWorkspaceRepository {
  constructor(private readonly pool: Pool) {}

  private mapWorkspace(row: any): Workspace {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      ownerId: row.owner_id,
      isIsolated: Boolean(row.is_isolated),
      settings: row.settings ?? {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapMember(row: any): WorkspaceMembership {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      role: row.role,
      joinedAt: new Date(row.joined_at),
    };
  }

  private normalizeRole(role: string | undefined, fallback = 'member'): WorkspaceRole {
    const normalized = (role ?? fallback).trim().toLowerCase();
    if (!VALID_WORKSPACE_ROLES.includes(normalized as WorkspaceRole)) {
      throw new Error(`Workspace role '${normalized}' is invalid. Allowed roles: owner, admin, member, viewer.`);
    }
    return normalized as WorkspaceRole;
  }

  async findById(id: string): Promise<Workspace | null> {
    const res = await this.pool.query('SELECT * FROM workspaces WHERE id = $1', [id]);
    return res.rows.length > 0 ? this.mapWorkspace(res.rows[0]) : null;
  }

  async findBySlug(slug: string): Promise<Workspace | null> {
    const res = await this.pool.query('SELECT * FROM workspaces WHERE slug = $1', [slug]);
    return res.rows.length > 0 ? this.mapWorkspace(res.rows[0]) : null;
  }

  async create(workspace: Workspace): Promise<Workspace> {
    const now = new Date();
    const query = `
      INSERT INTO workspaces (id, slug, name, owner_id, is_isolated, settings, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const values = [
      workspace.id,
      workspace.slug,
      workspace.name,
      workspace.ownerId,
      workspace.isIsolated ?? false,
      JSON.stringify(workspace.settings ?? {}),
      workspace.createdAt ?? now,
      workspace.updatedAt ?? now,
    ];

    const res = await this.pool.query(query, values);
    return this.mapWorkspace(res.rows[0]);
  }

  async update(id: string, updates: Partial<Workspace>): Promise<Workspace | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const merged: Workspace = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    const query = `
      UPDATE workspaces
      SET slug = $1,
          name = $2,
          owner_id = $3,
          is_isolated = $4,
          settings = $5,
          updated_at = $6
      WHERE id = $7
      RETURNING *;
    `;
    const values = [
      merged.slug,
      merged.name,
      merged.ownerId,
      merged.isIsolated,
      JSON.stringify(merged.settings ?? {}),
      merged.updatedAt,
      id,
    ];

    const res = await this.pool.query(query, values);
    return res.rows.length > 0 ? this.mapWorkspace(res.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM workspaces WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async listByOwner(ownerId: string): Promise<Workspace[]> {
    const res = await this.pool.query('SELECT * FROM workspaces WHERE owner_id = $1 ORDER BY created_at ASC', [ownerId]);
    return res.rows.map((row) => this.mapWorkspace(row));
  }

  async listByOrganization(organizationId: string): Promise<Workspace[]> {
    const query = `
      SELECT w.*
      FROM workspaces w
      INNER JOIN organization_workspaces ow ON w.id = ow.workspace_id
      WHERE ow.organization_id = $1
      ORDER BY ow.assigned_at ASC
    `;
    const result = await this.pool.query(query, [organizationId]);
    return result.rows.map((row) => this.mapWorkspace(row));
  }

  async addMember(member: WorkspaceMembership | string, userId?: string, role = 'member'): Promise<WorkspaceMembership> {
    const now = new Date();
    const normalizedMember = typeof member === 'string'
      ? {
          id: randomUUID(),
          workspaceId: member,
          userId: userId ?? '',
          role: this.normalizeRole(role),
          joinedAt: now,
        }
      : {
          ...member,
          role: this.normalizeRole(member.role),
          joinedAt: member.joinedAt ?? now,
        };

    const query = `
      INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (workspace_id, user_id)
      DO UPDATE SET role = EXCLUDED.role
      RETURNING *;
    `;
    const res = await this.pool.query(query, [
      normalizedMember.id,
      normalizedMember.workspaceId,
      normalizedMember.userId,
      normalizedMember.role,
      normalizedMember.joinedAt,
    ]);
    return this.mapMember(res.rows[0]);
  }

  async getMember(workspaceId: string, userId: string): Promise<WorkspaceMembership | null> {
    const res = await this.pool.query(
      'SELECT * FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 LIMIT 1',
      [workspaceId, userId],
    );
    if (res.rows.length === 0) {
      return null;
    }
    return this.mapMember(res.rows[0]);
  }

  async removeMember(workspaceId: string, userId: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, userId]);
    return (res.rowCount ?? 0) > 0;
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMembership[]> {
    const res = await this.pool.query('SELECT * FROM workspace_members WHERE workspace_id = $1 ORDER BY joined_at ASC', [workspaceId]);
    return res.rows.map((row) => this.mapMember(row));
  }
}
