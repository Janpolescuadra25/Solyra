import type { User, RepositoryResult } from '@solyra/shared';

type TenantUser = User & { tenantId: string };

export class InMemoryUserRepository {
  private users = new Map<string, TenantUser>();
  private emailIndex = new Map<string, string>();

  async create(user: TenantUser): Promise<RepositoryResult<TenantUser>> {
    if (this.users.has(user.id)) {
      return { success: false, error: `User with ID '${user.id}' already exists.` };
    }

    const emailKey = `${user.tenantId}:::${user.email.toLowerCase()}`;
    if (this.emailIndex.has(emailKey)) {
      return { success: false, error: `User with email '${user.email}' already exists in tenant '${user.tenantId}'.` };
    }

    const cloned = structuredClone(user);
    this.users.set(cloned.id, cloned);
    this.emailIndex.set(emailKey, cloned.id);
    return { success: true, data: structuredClone(cloned) };
  }

  async findById(tenantId: string, id: string): Promise<RepositoryResult<TenantUser | null>> {
    const user = this.users.get(id);
    if (!user || user.tenantId !== tenantId) {
      return { success: true, data: null };
    }
    return { success: true, data: structuredClone(user) };
  }

  async findByEmail(tenantId: string, email: string): Promise<RepositoryResult<TenantUser | null>> {
    const emailKey = `${tenantId}:::${email.toLowerCase()}`;
    const userId = this.emailIndex.get(emailKey);
    if (!userId) {
      return { success: true, data: null };
    }

    const user = this.users.get(userId);
    if (!user || user.tenantId !== tenantId) {
      return { success: true, data: null };
    }

    return { success: true, data: structuredClone(user) };
  }

  async update(user: TenantUser): Promise<RepositoryResult<TenantUser>> {
    const existing = this.users.get(user.id);
    if (!existing || existing.tenantId !== user.tenantId) {
      return { success: false, error: `User with ID '${user.id}' not found in tenant '${user.tenantId}'.` };
    }

    const lastEmailKey = `${existing.tenantId}:::${existing.email.toLowerCase()}`;
    const nextEmailKey = `${user.tenantId}:::${user.email.toLowerCase()}`;

    if (lastEmailKey !== nextEmailKey && this.emailIndex.has(nextEmailKey)) {
      return { success: false, error: `User with email '${user.email}' already exists in tenant '${user.tenantId}'.` };
    }

    this.emailIndex.delete(lastEmailKey);
    const cloned = structuredClone(user);
    this.users.set(cloned.id, cloned);
    this.emailIndex.set(nextEmailKey, cloned.id);
    return { success: true, data: structuredClone(cloned) };
  }
}
