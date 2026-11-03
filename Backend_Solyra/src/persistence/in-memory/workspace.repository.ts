import { randomUUID } from 'node:crypto';
import type { Workspace, WorkspaceMembership, RepositoryResult } from '@solyra/shared';

type TenantWorkspace = Workspace & { tenantId?: string };
type TenantWorkspaceMembership = WorkspaceMembership & {
  tenantId?: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
  };
};

export class InMemoryWorkspaceRepository {
  private workspaces = new Map<string, TenantWorkspace>();
  private slugIndex = new Map<string, string>();
  private memberships = new Map<string, TenantWorkspaceMembership[]>();
  private organizationRepository?: { listWorkspaces: (organizationId: string) => Promise<string[]> };

  constructor(organizationRepository?: { listWorkspaces: (organizationId: string) => Promise<string[]> }) {
    this.organizationRepository = organizationRepository;
  }

  private normalizeRole(role: string | undefined, fallback = 'member'): WorkspaceMembership['role'] {
    const normalized = (role ?? fallback).trim().toLowerCase();
    if (!['owner', 'admin', 'member', 'viewer'].includes(normalized)) {
      throw new Error(`Workspace role '${normalized}' is invalid. Allowed roles: owner, admin, member, viewer.`);
    }
    return normalized as WorkspaceMembership['role'];
  }

  private buildUserRecord(userId: string): TenantWorkspaceMembership['user'] {
    return {
      id: userId,
      email: `${userId}@example.com`,
      fullName: 'Test User',
    };
  }

  private cloneMembership(member: TenantWorkspaceMembership): TenantWorkspaceMembership {
    return {
      ...member,
      joinedAt: new Date(member.joinedAt),
      user: member.user ? { ...member.user } : undefined,
    };
  }

  async create(workspace: TenantWorkspace): Promise<RepositoryResult<TenantWorkspace>> {
    if (this.workspaces.has(workspace.id)) {
      return { success: false, error: `Workspace with ID '${workspace.id}' already exists.` };
    }

    const slugKey = `${workspace.tenantId ?? 'tenant'}:::${workspace.slug.toLowerCase()}`;
    if (this.slugIndex.has(slugKey)) {
      return { success: false, error: `Workspace with slug '${workspace.slug}' already exists in tenant '${workspace.tenantId ?? 'tenant'}'.` };
    }

    const cloned = structuredClone(workspace);
    this.workspaces.set(cloned.id, cloned);
    this.slugIndex.set(slugKey, cloned.id);
    this.memberships.set(cloned.id, []);
    return { success: true, data: structuredClone(cloned) };
  }

  async findById(id: string): Promise<Workspace | null>;
  async findById(tenantId: string, id: string): Promise<RepositoryResult<TenantWorkspace | null>>;
  async findById(tenantIdOrId: string, maybeId?: string): Promise<Workspace | null | RepositoryResult<TenantWorkspace | null>> {
    if (maybeId) {
      const workspace = this.workspaces.get(maybeId);
      if (!workspace || workspace.tenantId !== tenantIdOrId) {
        return { success: true, data: null };
      }
      return { success: true, data: structuredClone(workspace) };
    }

    const workspace = this.workspaces.get(tenantIdOrId);
    return workspace ? structuredClone(workspace) : null;
  }

  async findBySlug(slug: string): Promise<Workspace | null>;
  async findBySlug(tenantId: string, slug: string): Promise<RepositoryResult<TenantWorkspace | null>>;
  async findBySlug(tenantIdOrSlug: string, maybeSlug?: string): Promise<Workspace | null | RepositoryResult<TenantWorkspace | null>> {
    if (maybeSlug) {
      const slugKey = `${tenantIdOrSlug}:::${maybeSlug.toLowerCase()}`;
      const workspaceId = this.slugIndex.get(slugKey);
      if (!workspaceId) {
        return { success: true, data: null };
      }

      const workspace = this.workspaces.get(workspaceId);
      if (!workspace || workspace.tenantId !== tenantIdOrSlug) {
        return { success: true, data: null };
      }

      return { success: true, data: structuredClone(workspace) };
    }

    for (const workspace of this.workspaces.values()) {
      if (workspace.slug.toLowerCase() === tenantIdOrSlug.toLowerCase()) {
        return structuredClone(workspace);
      }
    }
    return null;
  }

  async listByOrganization(organizationId: string): Promise<Workspace[]> {
    const linkedIds = this.organizationRepository ? await this.organizationRepository.listWorkspaces(organizationId) : [];
    const linkedSet = new Set(linkedIds);

    return Array.from(this.workspaces.values())
      .filter((workspace) => workspace.tenantId === organizationId || linkedSet.has(workspace.id))
      .map(({ tenantId: _tenantId, ...workspace }) => workspace as Workspace);
  }

  async addMember(member: WorkspaceMembership | string, userId?: string, role = 'member'): Promise<WorkspaceMembership> {
    const normalizedMember: TenantWorkspaceMembership = typeof member === 'string'
      ? {
          id: randomUUID(),
          workspaceId: member,
          userId: userId ?? '',
          role: this.normalizeRole(role),
          joinedAt: new Date(),
          user: this.buildUserRecord(userId ?? ''),
        }
      : {
          ...member,
          role: this.normalizeRole(member.role),
          joinedAt: member.joinedAt ?? new Date(),
          user: (member as any).user ?? this.buildUserRecord(member.userId),
        };

    const members = this.memberships.get(normalizedMember.workspaceId) ?? [];
    const existing = members.find((entry) => entry.userId === normalizedMember.userId);
    if (existing) {
      existing.role = normalizedMember.role;
      existing.user = normalizedMember.user ?? this.buildUserRecord(normalizedMember.userId);
      this.memberships.set(normalizedMember.workspaceId, members);
      return this.cloneMembership(existing);
    }

    members.push(this.cloneMembership(normalizedMember));
    this.memberships.set(normalizedMember.workspaceId, members);
    return this.cloneMembership(members[members.length - 1]);
  }

  getMember(workspaceId: string, userId: string): WorkspaceMembership | null {
    const list = this.memberships.get(workspaceId) ?? [];
    const member = list.find((entry) => entry.userId === userId);
    return member ? this.cloneMembership(member) : null;
  }

  removeMember(workspaceId: string, userId: string): boolean {
    const list = this.memberships.get(workspaceId) ?? [];
    const target = list.find((entry) => entry.userId === userId);
    if (!target) {
      return false;
    }

    const ownerCount = list.filter((entry) => entry.role === 'owner').length;
    if (target.role === 'owner' && ownerCount <= 1) {
      return false;
    }

    const next = list.filter((entry) => entry.userId !== userId);
    this.memberships.set(workspaceId, next);
    return true;
  }

  listMembers(workspaceId: string): WorkspaceMembership[] {
    const list = this.memberships.get(workspaceId) ?? [];
    return list.map((entry) => this.cloneMembership(entry));
  }

  updateMemberRole(workspaceId: string, userId: string, newRole: string): WorkspaceMembership {
    const normalizedRole = this.normalizeRole(newRole);
    const list = this.memberships.get(workspaceId) ?? [];
    const member = list.find((entry) => entry.userId === userId);
    if (!member) {
      throw new Error('Member not found in workspace');
    }

    const ownerCount = list.filter((entry) => entry.role === 'owner').length;
    if (member.role === 'owner' && normalizedRole !== 'owner' && ownerCount <= 1) {
      throw new Error('Cannot demote the sole workspace owner');
    }

    member.role = normalizedRole;
    member.user = member.user ?? this.buildUserRecord(userId);
    return this.cloneMembership(member);
  }

  async getMembers(tenantId: string, workspaceId: string): Promise<RepositoryResult<TenantWorkspaceMembership[]>> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace || workspace.tenantId !== tenantId) {
      return { success: false, error: `Workspace '${workspaceId}' not found in tenant '${tenantId}'.` };
    }

    const list = this.memberships.get(workspaceId) ?? [];
    return { success: true, data: list.map((member) => this.cloneMembership(member)) };
  }
}
