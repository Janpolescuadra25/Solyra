import { Pool } from 'pg';
import type { Workspace, WorkspaceMembership } from '@solyra/shared';

export interface IWorkspaceRepository {
  findById(id: string): Promise<Workspace | null>;
  findBySlug(slug: string): Promise<Workspace | null>;
  create(workspace: Workspace): Promise<Workspace>;
  update(id: string, updates: Partial<Workspace>): Promise<Workspace | null>;
  delete(id: string): Promise<boolean>;
  listByOwner(ownerId: string): Promise<Workspace[]>;
  addMember(member: WorkspaceMembership): Promise<WorkspaceMembership>;
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

  async addMember(member: WorkspaceMembership): Promise<WorkspaceMembership> {
    const now = new Date();
    const query = `
      INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (workspace_id, user_id)
      DO UPDATE SET role = EXCLUDED.role
      RETURNING *;
    `;
    const res = await this.pool.query(query, [member.id, member.workspaceId, member.userId, member.role, member.joinedAt ?? now]);
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
