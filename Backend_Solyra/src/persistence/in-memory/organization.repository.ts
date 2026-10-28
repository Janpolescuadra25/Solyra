import { randomUUID } from 'node:crypto';
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

export class InMemoryOrganizationRepository implements IOrganizationRepository {
  private organizations = new Map<string, Organization>();
  private slugIndex = new Map<string, string>();
  private members = new Map<string, OrganizationMember[]>();
  private workspaceLinks = new Map<string, OrganizationWorkspace[]>();

  private isValidUuid(value: string): boolean {
    return UUID_RE.test(value);
  }

  private requireValidSlug(slug: string): void {
    if (!isValidOrganizationSlug(slug)) {
      throw new Error(`Organization slug '${slug}' is invalid. Use lowercase letters, numbers, and hyphens only.`);
    }
  }

  private requireValidUuid(value: string, label: string): void {
    if (!this.isValidUuid(value)) {
      throw new Error(`${label} '${value}' is not a valid UUID.`);
    }
  }

  private cloneOrganization(org: Organization): Organization {
    return {
      ...org,
      createdAt: new Date(org.createdAt),
      updatedAt: new Date(org.updatedAt),
    };
  }

  private cloneMember(member: OrganizationMember): OrganizationMember {
    return {
      ...member,
      joinedAt: new Date(member.joinedAt),
    };
  }

  private cloneWorkspace(link: OrganizationWorkspace): OrganizationWorkspace {
    return {
      ...link,
      assignedAt: new Date(link.assignedAt),
    };
  }

  async create(data: CreateOrganizationInput): Promise<Organization> {
    this.requireValidSlug(data.slug);
    this.requireValidUuid(data.ownerId, 'ownerId');

    if (this.slugIndex.has(data.slug.toLowerCase())) {
      throw new Error(`Organization slug '${data.slug}' already exists.`);
    }

    const id = randomUUID();
    const now = new Date();
    const organization: Organization = {
      id,
      name: data.name,
      slug: data.slug.toLowerCase(),
      ownerId: data.ownerId,
      createdAt: now,
      updatedAt: now,
    };

    this.organizations.set(id, organization);
    this.slugIndex.set(organization.slug.toLowerCase(), id);
    this.members.set(id, [{
      id: randomUUID(),
      organizationId: id,
      userId: data.ownerId,
      role: 'owner',
      joinedAt: now,
    }]);

    return this.cloneOrganization(organization);
  }

  async findById(id: string): Promise<Organization | null> {
    const org = this.organizations.get(id);
    return org ? this.cloneOrganization(org) : null;
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    const slugKey = slug.toLowerCase();
    const orgId = this.slugIndex.get(slugKey);
    if (!orgId) {
      return null;
    }
    const org = this.organizations.get(orgId);
    return org ? this.cloneOrganization(org) : null;
  }

  async listByUser(userId: string): Promise<Organization[]> {
    const result: Organization[] = [];
    for (const organization of this.organizations.values()) {
      const members = this.members.get(organization.id) ?? [];
      if (members.some((member) => member.userId === userId)) {
        result.push(this.cloneOrganization(organization));
      }
    }
    return result;
  }

  async addMember(data: AddMemberInput): Promise<OrganizationMember> {
    this.requireValidUuid(data.organizationId, 'organizationId');
    this.requireValidUuid(data.userId, 'userId');

    const org = this.organizations.get(data.organizationId);
    if (!org) {
      throw new Error(`Organization '${data.organizationId}' was not found.`);
    }

    const list = this.members.get(data.organizationId) ?? [];
    const existing = list.find((member) => member.userId === data.userId);
    if (existing) {
      existing.role = data.role;
      return this.cloneMember(existing);
    }

    const member: OrganizationMember = {
      id: randomUUID(),
      organizationId: data.organizationId,
      userId: data.userId,
      role: data.role,
      joinedAt: new Date(),
    };

    list.push(member);
    this.members.set(data.organizationId, list);
    return this.cloneMember(member);
  }

  async getMember(organizationId: string, userId: string): Promise<OrganizationMember | null> {
    const list = this.members.get(organizationId) ?? [];
    const member = list.find((entry) => entry.userId === userId);
    return member ? this.cloneMember(member) : null;
  }

  async listMembers(organizationId: string): Promise<OrganizationMember[]> {
    const list = this.members.get(organizationId) ?? [];
    return list.map((member) => this.cloneMember(member));
  }

  async removeMember(organizationId: string, userId: string): Promise<boolean> {
    const list = this.members.get(organizationId) ?? [];
    const next = list.filter((member) => member.userId !== userId);
    if (next.length === list.length) {
      return false;
    }
    this.members.set(organizationId, next);
    return true;
  }

  async updateMemberRole(organizationId: string, userId: string, role: OrganizationRole): Promise<boolean> {
    const list = this.members.get(organizationId) ?? [];
    const member = list.find((entry) => entry.userId === userId);
    if (!member) {
      return false;
    }
    member.role = role;
    return true;
  }

  async linkWorkspace(data: LinkWorkspaceInput): Promise<OrganizationWorkspace> {
    this.requireValidUuid(data.organizationId, 'organizationId');

    const org = this.organizations.get(data.organizationId);
    if (!org) {
      throw new Error(`Organization '${data.organizationId}' was not found.`);
    }

    const list = this.workspaceLinks.get(data.organizationId) ?? [];
    const existing = list.find((entry) => entry.workspaceId === data.workspaceId);
    if (existing) {
      return this.cloneWorkspace(existing);
    }

    const link: OrganizationWorkspace = {
      id: randomUUID(),
      organizationId: data.organizationId,
      workspaceId: data.workspaceId,
      assignedAt: new Date(),
    };

    list.push(link);
    this.workspaceLinks.set(data.organizationId, list);
    return this.cloneWorkspace(link);
  }

  async unlinkWorkspace(organizationId: string, workspaceId: string): Promise<boolean> {
    const list = this.workspaceLinks.get(organizationId) ?? [];
    const next = list.filter((entry) => entry.workspaceId !== workspaceId);
    if (next.length === list.length) {
      return false;
    }
    this.workspaceLinks.set(organizationId, next);
    return true;
  }

  async listWorkspaces(organizationId: string): Promise<string[]> {
    const list = this.workspaceLinks.get(organizationId) ?? [];
    return list.map((entry) => entry.workspaceId);
  }

  async getWorkspaceOrganization(workspaceId: string): Promise<Organization | null> {
    for (const [organizationId, links] of this.workspaceLinks.entries()) {
      if (links.some((entry) => entry.workspaceId === workspaceId)) {
        const org = this.organizations.get(organizationId);
        return org ? this.cloneOrganization(org) : null;
      }
    }
    return null;
  }
}
