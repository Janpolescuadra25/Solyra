import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  AddMemberInput,
  CreateOrganizationInput,
  IOrganizationRepository,
  LinkWorkspaceInput,
  Organization,
  OrganizationMember,
  OrganizationRole,
  OrganizationWorkspace,
} from '@solyra/shared';
import { isValidOrganizationSlug } from '@solyra/shared';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PostgresOrganizationRepository implements IOrganizationRepository {
  constructor(private readonly pool: Pool) {}

  private isValidUuid(value: string): boolean {
    return UUID_RE.test(value);
  }

  private validateSlug(slug: string): void {
    if (!isValidOrganizationSlug(slug)) {
      throw new Error(`Organization slug '${slug}' is invalid. Use 3-48 lowercase letters, numbers, and hyphen-separated words.`);
    }
  }

  private validateUuid(value: string, label: string): void {
    if (!this.isValidUuid(value)) {
      throw new Error(`${label} '${value}' is not a valid UUID.`);
    }
  }

  private mapOrgRow(row: any): Organization {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      ownerId: row.owner_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapMemberRow(row: any): OrganizationMember {
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.role,
      joinedAt: new Date(row.joined_at),
    };
  }

  private mapWorkspaceRow(row: any): OrganizationWorkspace {
    return {
      id: row.id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      assignedAt: new Date(row.assigned_at),
    };
  }

  async create(data: CreateOrganizationInput): Promise<Organization> {
    this.validateSlug(data.slug);
    this.validateUuid(data.ownerId, 'ownerId');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const orgResult = await client.query(
        `INSERT INTO organizations (name, slug, owner_id) VALUES ($1, $2, $3) RETURNING *`,
        [data.name, data.slug.toLowerCase(), data.ownerId],
      );
      const org = this.mapOrgRow(orgResult.rows[0]);

      await client.query(
        `INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [org.id, data.ownerId],
      );

      await client.query('COMMIT');
      return org;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<Organization | null> {
    const res = await this.pool.query('SELECT * FROM organizations WHERE id = $1', [id]);
    if (res.rows.length === 0) {
      return null;
    }
    return this.mapOrgRow(res.rows[0]);
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    const res = await this.pool.query('SELECT * FROM organizations WHERE slug = $1', [slug.toLowerCase()]);
    if (res.rows.length === 0) {
      return null;
    }
    return this.mapOrgRow(res.rows[0]);
  }

  async listByUser(userId: string): Promise<Organization[]> {
    const res = await this.pool.query(
      `SELECT o.* FROM organizations o
       INNER JOIN organization_members om ON om.organization_id = o.id
       WHERE om.user_id = $1
       ORDER BY o.created_at ASC`,
      [userId],
    );
    return res.rows.map((row: any) => this.mapOrgRow(row));
  }

  async addMember(data: AddMemberInput): Promise<OrganizationMember> {
    this.validateUuid(data.organizationId, 'organizationId');
    this.validateUuid(data.userId, 'userId');

    const res = await this.pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, user_id)
       DO UPDATE SET role = EXCLUDED.role
       RETURNING *`,
      [data.organizationId, data.userId, data.role],
    );

    return this.mapMemberRow(res.rows[0]);
  }

  async getMember(organizationId: string, userId: string): Promise<OrganizationMember | null> {
    const res = await this.pool.query(
      `SELECT * FROM organization_members WHERE organization_id = $1 AND user_id = $2 LIMIT 1`,
      [organizationId, userId],
    );
    if (res.rows.length === 0) {
      return null;
    }
    return this.mapMemberRow(res.rows[0]);
  }

  async listMembers(organizationId: string): Promise<OrganizationMember[]> {
    const res = await this.pool.query(
      `SELECT * FROM organization_members WHERE organization_id = $1 ORDER BY joined_at ASC`,
      [organizationId],
    );
    return res.rows.map((row: any) => this.mapMemberRow(row));
  }

  async removeMember(organizationId: string, userId: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async updateMemberRole(organizationId: string, userId: string, role: OrganizationRole): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE organization_members SET role = $3 WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, userId, role],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async linkWorkspace(data: LinkWorkspaceInput): Promise<OrganizationWorkspace> {
    this.validateUuid(data.organizationId, 'organizationId');

    const res = await this.pool.query(
      `INSERT INTO organization_workspaces (organization_id, workspace_id)
       VALUES ($1, $2)
       ON CONFLICT (organization_id, workspace_id)
       DO NOTHING
       RETURNING *`,
      [data.organizationId, data.workspaceId],
    );

    if (res.rows.length === 0) {
      const existing = await this.pool.query(
        `SELECT * FROM organization_workspaces WHERE organization_id = $1 AND workspace_id = $2 LIMIT 1`,
        [data.organizationId, data.workspaceId],
      );
      return this.mapWorkspaceRow(existing.rows[0]);
    }

    return this.mapWorkspaceRow(res.rows[0]);
  }

  async unlinkWorkspace(organizationId: string, workspaceId: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM organization_workspaces WHERE organization_id = $1 AND workspace_id = $2`,
      [organizationId, workspaceId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async listWorkspaces(organizationId: string): Promise<string[]> {
    const res = await this.pool.query(
      `SELECT workspace_id FROM organization_workspaces WHERE organization_id = $1 ORDER BY assigned_at ASC`,
      [organizationId],
    );
    return res.rows.map((row: any) => row.workspace_id);
  }

  async getOrganizationByWorkspaceId(workspaceId: string): Promise<Organization | null> {
    const res = await this.pool.query(
      `SELECT o.*
       FROM organizations o
       INNER JOIN organization_workspaces ow ON ow.organization_id = o.id
       WHERE ow.workspace_id = $1
       LIMIT 1`,
      [workspaceId],
    );
    if (res.rows.length === 0) {
      return null;
    }
    return this.mapOrgRow(res.rows[0]);
  }

  async getWorkspaceOrganization(workspaceId: string): Promise<Organization | null> {
    return this.getOrganizationByWorkspaceId(workspaceId);
  }
}
