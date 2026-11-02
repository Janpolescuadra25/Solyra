import { randomUUID } from 'node:crypto';

import type {
  CreateInvitationInput,
  IWorkspaceInvitationRepository,
  WorkspaceInvitation,
  WorkspaceInvitationStatus,
} from '../postgres/repositories/workspace-invitation.repository.js';

export class InMemoryWorkspaceInvitationRepository implements IWorkspaceInvitationRepository {
  private invitations = new Map<string, WorkspaceInvitation>();

  async create(input: CreateInvitationInput): Promise<WorkspaceInvitation> {
    const invitation: WorkspaceInvitation = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      email: input.email.toLowerCase().trim(),
      role: input.role,
      tokenHash: input.tokenHash,
      invitedBy: input.invitedBy,
      status: 'pending',
      expiresAt: input.expiresAt,
      createdAt: new Date(),
      acceptedAt: null,
    };

    this.invitations.set(invitation.id, invitation);
    return { ...invitation };
  }

  async findById(id: string): Promise<WorkspaceInvitation | null> {
    const invitation = this.invitations.get(id);
    return invitation ? { ...invitation } : null;
  }

  async findByTokenHash(tokenHash: string): Promise<WorkspaceInvitation | null> {
    for (const invitation of this.invitations.values()) {
      if (invitation.tokenHash === tokenHash) {
        return { ...invitation };
      }
    }

    return null;
  }

  async findByWorkspaceAndEmail(workspaceId: string, email: string): Promise<WorkspaceInvitation | null> {
    const cleanEmail = email.toLowerCase().trim();
    const now = new Date();

    for (const invitation of this.invitations.values()) {
      if (
        invitation.workspaceId === workspaceId &&
        invitation.email === cleanEmail &&
        invitation.status === 'pending' &&
        invitation.expiresAt > now
      ) {
        return { ...invitation };
      }
    }

    return null;
  }

  async listByWorkspace(workspaceId: string, status?: string): Promise<WorkspaceInvitation[]> {
    const results: WorkspaceInvitation[] = [];

    for (const invitation of this.invitations.values()) {
      if (invitation.workspaceId !== workspaceId) {
        continue;
      }

      if (status && invitation.status !== status) {
        continue;
      }

      results.push({ ...invitation });
    }

    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateStatus(id: string, status: WorkspaceInvitationStatus, acceptedAt?: Date): Promise<WorkspaceInvitation | null> {
    const invitation = this.invitations.get(id);
    if (!invitation) {
      return null;
    }

    invitation.status = status;
    invitation.acceptedAt = acceptedAt ?? null;
    return { ...invitation };
  }

  async revoke(id: string): Promise<boolean> {
    const invitation = this.invitations.get(id);
    if (!invitation || invitation.status !== 'pending') {
      return false;
    }

    invitation.status = 'revoked';
    return true;
  }
}
