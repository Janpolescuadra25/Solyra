import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export type WorkspaceInvitationRole = 'owner' | 'admin' | 'member' | 'viewer';
export type WorkspaceInvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceInvitationRole;
  tokenHash: string;
  invitedBy: string;
  status: WorkspaceInvitationStatus;
  expiresAt: Date;
  createdAt: Date;
  acceptedAt?: Date | null;
}

export interface CreateInvitationInput {
  workspaceId: string;
  email: string;
  role: WorkspaceInvitationRole;
  tokenHash: string;
  invitedBy: string;
  expiresAt: Date;
}

export interface IWorkspaceInvitationRepository {
  create(input: CreateInvitationInput): Promise<WorkspaceInvitation>;
  findById(id: string): Promise<WorkspaceInvitation | null>;
  findByTokenHash(tokenHash: string): Promise<WorkspaceInvitation | null>;
  findByWorkspaceAndEmail(workspaceId: string, email: string): Promise<WorkspaceInvitation | null>;
  listByWorkspace(workspaceId: string, status?: string): Promise<WorkspaceInvitation[]>;
  updateStatus(id: string, status: WorkspaceInvitationStatus, acceptedAt?: Date): Promise<WorkspaceInvitation | null>;
  revoke(id: string): Promise<boolean>;
}

export class PostgresWorkspaceInvitationRepository implements IWorkspaceInvitationRepository {
  constructor(private readonly pool: Pool) {}

  private mapRow(row: any): WorkspaceInvitation {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      email: row.email,
      role: row.role,
      tokenHash: row.token_hash,
      invitedBy: row.invited_by,
      status: row.status,
      expiresAt: new Date(row.expires_at),
      createdAt: new Date(row.created_at),
      acceptedAt: row.accepted_at ? new Date(row.accepted_at) : null,
    };
  }

  async create(input: CreateInvitationInput): Promise<WorkspaceInvitation> {
    const rows = await this.pool.query(
      `
        INSERT INTO workspace_invitations (
          id, workspace_id, email, role, token_hash, invited_by, status, expires_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, NOW())
        RETURNING
          id,
          workspace_id AS "workspaceId",
          email,
          role,
          token_hash AS "tokenHash",
          invited_by AS "invitedBy",
          status,
          expires_at AS "expiresAt",
          created_at AS "createdAt",
          accepted_at AS "acceptedAt"
      `,
      [
        randomUUID(),
        input.workspaceId,
        input.email.toLowerCase().trim(),
        input.role,
        input.tokenHash,
        input.invitedBy,
        input.expiresAt,
      ],
    );

    return rows.rows[0] as WorkspaceInvitation;
  }

  async findById(id: string): Promise<WorkspaceInvitation | null> {
    const rows = await this.pool.query(
      `
        SELECT
          id,
          workspace_id AS "workspaceId",
          email,
          role,
          token_hash AS "tokenHash",
          invited_by AS "invitedBy",
          status,
          expires_at AS "expiresAt",
          created_at AS "createdAt",
          accepted_at AS "acceptedAt"
        FROM workspace_invitations
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    return rows.rows[0] ?? null;
  }

  async findByTokenHash(tokenHash: string): Promise<WorkspaceInvitation | null> {
    const rows = await this.pool.query(
      `
        SELECT
          id,
          workspace_id AS "workspaceId",
          email,
          role,
          token_hash AS "tokenHash",
          invited_by AS "invitedBy",
          status,
          expires_at AS "expiresAt",
          created_at AS "createdAt",
          accepted_at AS "acceptedAt"
        FROM workspace_invitations
        WHERE token_hash = $1
        LIMIT 1
      `,
      [tokenHash],
    );

    return rows.rows[0] ?? null;
  }

  async findByWorkspaceAndEmail(workspaceId: string, email: string): Promise<WorkspaceInvitation | null> {
    const rows = await this.pool.query(
      `
        SELECT
          id,
          workspace_id AS "workspaceId",
          email,
          role,
          token_hash AS "tokenHash",
          invited_by AS "invitedBy",
          status,
          expires_at AS "expiresAt",
          created_at AS "createdAt",
          accepted_at AS "acceptedAt"
        FROM workspace_invitations
        WHERE workspace_id = $1 AND email = $2 AND status = 'pending' AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [workspaceId, email.toLowerCase().trim()],
    );

    return rows.rows[0] ?? null;
  }

  async listByWorkspace(workspaceId: string, status?: string): Promise<WorkspaceInvitation[]> {
    const values: unknown[] = [workspaceId];
    let query = `
      SELECT
        id,
        workspace_id AS "workspaceId",
        email,
        role,
        token_hash AS "tokenHash",
        invited_by AS "invitedBy",
        status,
        expires_at AS "expiresAt",
        created_at AS "createdAt",
        accepted_at AS "acceptedAt"
      FROM workspace_invitations
      WHERE workspace_id = $1
    `;

    if (status) {
      query += ` AND status = $2`;
      values.push(status);
    }

    query += ` ORDER BY created_at DESC`;

    const rows = await this.pool.query(query, values);
    return rows.rows as WorkspaceInvitation[];
  }

  async updateStatus(id: string, status: WorkspaceInvitationStatus, acceptedAt?: Date): Promise<WorkspaceInvitation | null> {
    const rows = await this.pool.query(
      `
        UPDATE workspace_invitations
        SET status = $2, accepted_at = $3
        WHERE id = $1
        RETURNING
          id,
          workspace_id AS "workspaceId",
          email,
          role,
          token_hash AS "tokenHash",
          invited_by AS "invitedBy",
          status,
          expires_at AS "expiresAt",
          created_at AS "createdAt",
          accepted_at AS "acceptedAt"
      `,
      [id, status, acceptedAt ?? null],
    );

    return rows.rows[0] ?? null;
  }

  async revoke(id: string): Promise<boolean> {
    const rows = await this.pool.query(
      `
        UPDATE workspace_invitations
        SET status = 'revoked'
        WHERE id = $1 AND status = 'pending'
        RETURNING id
      `,
      [id],
    );

    return (rows.rowCount ?? 0) > 0;
  }
}
