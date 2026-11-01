import 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthSession, Organization, OrganizationRole, SessionTokenPayload } from '@solyra/shared';

import type { PostgresPersistenceBundle } from '../persistence/postgres/index.js';
import { hashToken, verifySessionToken } from './utils.js';

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';
export const WORKSPACE_ROLE_ORDER: Record<WorkspaceRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

export interface EffectiveWorkspaceRoleResolution {
  role: WorkspaceRole | null;
  source: 'direct_owner' | 'workspace_member' | 'org_inherited' | 'none';
  inheritedFrom?: {
    organizationId: string;
    orgRole: OrganizationRole;
  };
}

declare module 'node:http' {
  interface IncomingMessage {
    user?: SessionTokenPayload & { sessionId?: string };
    session?: AuthSession & {
      organizationId?: string | null;
      orgRole?: OrganizationRole | null;
      workspaceRole?: WorkspaceRole | null;
    };
    effectiveWorkspaceRole?: EffectiveWorkspaceRoleResolution | null;
  }
}

export function getResolvedJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET environment variable must be configured in production.');
    }
    return 'solyra-dev-jwt-secret-do-not-use-in-production-change-me';
  }
  return secret;
}

export class RateLimiter {
  private readonly buckets = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number = 15 * 60 * 1000,
    private readonly maxRequests: number = 10
  ) {}

  check(key: string): { allowed: boolean; remaining: number; retryAfterSeconds?: number } {
    const now = Date.now();

    for (const [bucketKey, bucket] of this.buckets.entries()) {
      const active = bucket.filter((timestamp) => now - timestamp < this.windowMs);
      if (active.length === 0) {
        this.buckets.delete(bucketKey);
      } else {
        this.buckets.set(bucketKey, active);
      }
    }

    const entries = this.buckets.get(key) ?? [];
    const recent = entries.filter((timestamp) => now - timestamp < this.windowMs);
    if (recent.length >= this.maxRequests) {
      const oldest = recent[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    const nextEntries = recent.length === 0 ? [] : recent;
    nextEntries.push(now);
    this.buckets.set(key, nextEntries);

    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - nextEntries.length),
    };
  }
}

function sendJsonError(res: ServerResponse, statusCode: number, message: string): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, error: message }));
}

function resolveWorkspaceIdFromRequest(req: IncomingMessage): string | null {
  const workspaceHeader = req.headers['x-workspace-id'];
  const explicitHeader = Array.isArray(workspaceHeader) ? workspaceHeader[0] : workspaceHeader;
  if (explicitHeader && explicitHeader.trim()) {
    return explicitHeader.trim();
  }

  if (!req.url) {
    return null;
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts[0] === 'api' && pathParts[1] === 'workspaces' && pathParts[2]) {
      return pathParts[2];
    }
  } catch {
    // Ignore malformed URLs and fall through to no workspace context.
  }

  return null;
}

export async function getEffectiveWorkspaceRole(
  bundle: PostgresPersistenceBundle,
  workspaceId: string,
  userId: string,
): Promise<EffectiveWorkspaceRoleResolution> {
  if (!bundle.workspaces || typeof bundle.workspaces.findById !== 'function') {
    return { role: null, source: 'none' };
  }

  const workspace = await bundle.workspaces.findById(workspaceId);
  if (!workspace) {
    return { role: null, source: 'none' };
  }

  if (workspace.ownerId === userId) {
    return { role: 'owner', source: 'direct_owner' };
  }

  if (bundle.workspaces && typeof bundle.workspaces.getMember === 'function') {
    const directMember = await bundle.workspaces.getMember(workspaceId, userId);
    if (directMember) {
      return { role: directMember.role as WorkspaceRole, source: 'workspace_member' };
    }
  }

  if (workspace.isIsolated) {
    return { role: null, source: 'none' };
  }

  if (bundle.organizations && typeof bundle.organizations.getOrganizationByWorkspaceId === 'function') {
    const organization = await bundle.organizations.getOrganizationByWorkspaceId(workspaceId);
    if (organization && typeof bundle.organizations.getMember === 'function') {
      const orgMember = await bundle.organizations.getMember(organization.id, userId);
      if (orgMember) {
        const inheritedRole: WorkspaceRole = orgMember.role === 'owner' ? 'owner' : orgMember.role === 'admin' ? 'admin' : 'member';
        return {
          role: inheritedRole,
          source: 'org_inherited',
          inheritedFrom: {
            organizationId: organization.id,
            orgRole: orgMember.role,
          },
        };
      }
    }
  }

  return { role: null, source: 'none' };
}

export async function requireWorkspaceRole(
  req: IncomingMessage,
  res: ServerResponse,
  bundle: PostgresPersistenceBundle,
  allowedRoles: WorkspaceRole[],
  targetWorkspaceId?: string,
): Promise<boolean> {
  if (!req.session) {
    const authenticated = await authenticateRequest(req, res, bundle);
    if (!authenticated || !req.session) {
      return false;
    }
  }

  const workspaceId = targetWorkspaceId ?? resolveWorkspaceIdFromRequest(req) ?? req.session?.workspaceId ?? undefined;
  if (!workspaceId) {
    sendJsonError(res, 400, 'Workspace context required');
    return false;
  }

  const userId = req.session?.userId;
  if (!userId) {
    sendJsonError(res, 401, 'Session user context is required');
    return false;
  }

  const effectiveRole = await getEffectiveWorkspaceRole(bundle, workspaceId, userId);
  if (!effectiveRole.role) {
    sendJsonError(res, 403, 'Forbidden: insufficient workspace permissions');
    return false;
  }

  const minimumRoleRank = Math.min(...allowedRoles.map((role) => WORKSPACE_ROLE_ORDER[role]));
  const actualRoleRank = WORKSPACE_ROLE_ORDER[effectiveRole.role];
  if (actualRoleRank < minimumRoleRank) {
    sendJsonError(res, 403, 'Forbidden: insufficient workspace permissions');
    return false;
  }

  req.session.workspaceId = workspaceId;
  req.session.workspaceRole = effectiveRole.role;
  req.effectiveWorkspaceRole = effectiveRole;
  return true;
}

export async function authenticateRequest(
  req: IncomingMessage,
  res: ServerResponse,
  bundle: PostgresPersistenceBundle
): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    sendJsonError(res, 401, 'Authorization header required');
    return false;
  }

  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!headerValue.startsWith('Bearer ')) {
    sendJsonError(res, 401, 'Authorization header must use Bearer scheme');
    return false;
  }

  const token = headerValue.slice('Bearer '.length).trim();
  if (!token) {
    sendJsonError(res, 401, 'Authorization token is required');
    return false;
  }

  const jwtSecret = getResolvedJwtSecret();
  const payload = verifySessionToken<SessionTokenPayload & { sessionId?: string }>(token, jwtSecret);
  if (!payload) {
    sendJsonError(res, 401, 'Invalid or expired session token');
    return false;
  }

  const tokenHash = hashToken(token);
  const session = await bundle.sessions.findSessionByTokenHash(tokenHash);
  if (!session) {
    sendJsonError(res, 401, 'Session not found or has been invalidated');
    return false;
  }

  if (session.revokedAt != null) {
    sendJsonError(res, 401, 'Session has been revoked');
    return false;
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    sendJsonError(res, 401, 'Session has expired');
    return false;
  }

  const user = await bundle.users.findById(session.userId);
  if (!user || !user.isActive) {
    sendJsonError(res, 403, 'Account is suspended or deactivated');
    return false;
  }

  let org: Organization | null = null;
  let orgRole: OrganizationRole | null = null;
  const workspaceId = resolveWorkspaceIdFromRequest(req) ?? session.workspaceId ?? null;

  if (bundle.organizations && session.organizationId && typeof bundle.organizations.findById === 'function') {
    org = await bundle.organizations.findById(session.organizationId);
    if (org && typeof bundle.organizations.getMember === 'function') {
      const member = await bundle.organizations.getMember(org.id, session.userId);
      orgRole = member ? member.role : null;
    }
  } else if (bundle.organizations && session.workspaceId && typeof bundle.organizations.getWorkspaceOrganization === 'function') {
    org = await bundle.organizations.getWorkspaceOrganization(session.workspaceId);
    if (org && typeof bundle.organizations.getMember === 'function') {
      const member = await bundle.organizations.getMember(org.id, session.userId);
      orgRole = member ? member.role : null;
    }
  }

  req.user = payload;
  req.session = {
    ...session,
    workspaceId: workspaceId ?? null,
    organizationId: org ? org.id : (session.organizationId ?? null),
    orgRole: orgRole ?? null,
    workspaceRole: workspaceId ? (await getEffectiveWorkspaceRole(bundle, workspaceId, session.userId)).role : null,
  };

  req.effectiveWorkspaceRole = workspaceId ? await getEffectiveWorkspaceRole(bundle, workspaceId, session.userId) : null;
  return true;
}

export async function requireOrgRole(
  req: IncomingMessage & {
    session?: AuthSession & {
      organizationId?: string | null;
      orgRole?: OrganizationRole | null;
    };
  },
  res: ServerResponse,
  bundle: PostgresPersistenceBundle,
  allowedRoles: OrganizationRole[],
  targetOrgId?: string,
): Promise<boolean> {
  if (!req.session) {
    const authenticated = await authenticateRequest(req, res, bundle);
    if (!authenticated || !req.session) {
      return false;
    }
  }

  const orgId = targetOrgId ?? req.session?.organizationId ?? undefined;
  if (!orgId) {
    sendJsonError(res, 400, 'Organization context required');
    return false;
  }

  const userId = req.session?.userId;
  if (!userId) {
    sendJsonError(res, 401, 'Session user context is required');
    return false;
  }

  const member = await bundle.organizations.getMember(orgId, userId);
  if (!member) {
    sendJsonError(res, 403, 'Forbidden: user is not a member of this organization');
    return false;
  }

  if (!allowedRoles.includes(member.role)) {
    sendJsonError(res, 403, 'Forbidden: insufficient organization permissions');
    return false;
  }

  req.session.organizationId = orgId;
  req.session.orgRole = member.role;
  return true;
}

export { sendJsonError };
