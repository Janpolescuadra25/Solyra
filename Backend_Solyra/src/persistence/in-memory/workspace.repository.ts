import type { Workspace, WorkspaceMembership, RepositoryResult } from '@solyra/shared';

type TenantWorkspace = Workspace & { tenantId: string };
type TenantWorkspaceMembership = WorkspaceMembership & { tenantId: string };

export class InMemoryWorkspaceRepository {
  private workspaces = new Map<string, TenantWorkspace>();
  private slugIndex = new Map<string, string>();
  private memberships = new Map<string, TenantWorkspaceMembership[]>();

  async create(workspace: TenantWorkspace): Promise<RepositoryResult<TenantWorkspace>> {
    if (this.workspaces.has(workspace.id)) {
      return { success: false, error: `Workspace with ID '${workspace.id}' already exists.` };
    }

    const slugKey = `${workspace.tenantId}:::${workspace.slug.toLowerCase()}`;
    if (this.slugIndex.has(slugKey)) {
      return { success: false, error: `Workspace with slug '${workspace.slug}' already exists in tenant '${workspace.tenantId}'.` };
    }

    const cloned = structuredClone(workspace);
    this.workspaces.set(cloned.id, cloned);
    this.slugIndex.set(slugKey, cloned.id);
    this.memberships.set(cloned.id, []);
    return { success: true, data: structuredClone(cloned) };
  }

  async findById(tenantId: string, id: string): Promise<RepositoryResult<TenantWorkspace | null>> {
    const workspace = this.workspaces.get(id);
    if (!workspace || workspace.tenantId !== tenantId) {
      return { success: true, data: null };
    }
    return { success: true, data: structuredClone(workspace) };
  }

  async findBySlug(tenantId: string, slug: string): Promise<RepositoryResult<TenantWorkspace | null>> {
    const slugKey = `${tenantId}:::${slug.toLowerCase()}`;
    const workspaceId = this.slugIndex.get(slugKey);
    if (!workspaceId) {
      return { success: true, data: null };
    }

    const workspace = this.workspaces.get(workspaceId);
    if (!workspace || workspace.tenantId !== tenantId) {
      return { success: true, data: null };
    }

    return { success: true, data: structuredClone(workspace) };
  }

  async addMember(membership: TenantWorkspaceMembership): Promise<RepositoryResult<void>> {
    const workspace = this.workspaces.get(membership.workspaceId);
    if (!workspace || workspace.tenantId !== membership.tenantId) {
      return { success: false, error: `Workspace '${membership.workspaceId}' not found in tenant '${membership.tenantId}'.` };
    }

    const members = this.memberships.get(membership.workspaceId) ?? [];
    const exists = members.some((entry) => entry.userId === membership.userId);
    if (exists) {
      return { success: false, error: `User '${membership.userId}' is already a member of workspace '${membership.workspaceId}'.` };
    }

    members.push(structuredClone(membership));
    this.memberships.set(membership.workspaceId, members);
    return { success: true };
  }

  async getMembers(tenantId: string, workspaceId: string): Promise<RepositoryResult<TenantWorkspaceMembership[]>> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace || workspace.tenantId !== tenantId) {
      return { success: false, error: `Workspace '${workspaceId}' not found in tenant '${tenantId}'.` };
    }

    const list = this.memberships.get(workspaceId) ?? [];
    return { success: true, data: structuredClone(list) };
  }
}
