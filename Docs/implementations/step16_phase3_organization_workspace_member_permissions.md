# Step 16 Phase 3: Organization Workspace Member Permissions & Role Inheritance

## Overview
Step 16 Phase 3 implements granular role-based access control (RBAC) and hierarchical role resolution for Solyra workspaces. It establishes a fail-closed permission model combining direct workspace ownership, explicit workspace memberships, and organization-level role inheritance while strictly respecting workspace isolation boundaries.

- **Status:** COMPLETED / VERIFIED (Commit pending)
- **Primary Modules:** `Backend_Solyra/src/auth/middleware.ts`, `Backend_Solyra/src/index.ts`, `Backend_Solyra/src/persistence/postgres/schema.sql`
- **Test Suite:** `Backend_Solyra/test/organization_workspaces.test.ts` (108/108 passing)

---

## 1. Role Precedence Hierarchy
When a user accesses workspace-scoped resources, `getEffectiveWorkspaceRole()` resolves permissions using strict fail-closed precedence:

1. **Direct Workspace Owner:** If `workspace.ownerId === userId`, returns role `'owner'` (`source: 'direct_owner'`).
2. **Explicit Workspace Member:** If present in `workspace_members`, returns assigned role (`'admin'`, `'member'`, `'viewer'`) (`source: 'workspace_member'`).
3. **Organization Role Inheritance:**
   - Evaluated ONLY if workspace is linked to an organization via `organization_workspaces` AND `workspace.isIsolated === false`.
   - Org Owner / Org Admin $\rightarrow$ inherits `'admin'` (`source: 'org_inherited'`).
   - Org Regular Member $\rightarrow$ inherits `'viewer'` (`source: 'org_inherited'`).
4. **No Access / Fail-Closed Default:** If isolated (`isIsolated === true`), unlinked, or user has no association, returns `role: null` (`source: 'none'`).

---

## 2. Database Schema Enforcement
`Backend_Solyra/src/persistence/postgres/schema.sql`:
- Added role `CHECK` constraint: `CHECK (role IN ('owner', 'admin', 'member', 'viewer'))`.
- Added unique constraint: `UNIQUE (workspace_id, user_id)`.
- Enforced `ON DELETE CASCADE` foreign keys referencing `workspaces(id)` and `users(id)` for referential integrity.

---

## 3. Middleware & Authentication Flow
- **`requireWorkspaceRole(req, res, bundle, allowedRoles, workspaceId)`:**
  Guards workspace endpoints; verifies caller session and compares effective role against `allowedRoles`. Returns 403 `FORBIDDEN_WORKSPACE_ROLE` on insufficient permissions.
- **`authenticateRequest` Integration:**
  Automatically resolves and attaches `req.effectiveWorkspaceRole` when a `workspaceId` context is present in route parameters or headers.

---

## 4. REST API Endpoints
All endpoints mounted under `handleWorkspaceRoutes`:
- `GET /api/workspaces/:workspaceId/role` — Returns user's effective role and origin metadata.
- `GET /api/workspaces/:workspaceId/members` — Lists all workspace members (requires `member` or higher).
- `POST /api/workspaces/:workspaceId/members` — Adds a member with role validation (requires `admin` or higher).
- `DELETE /api/workspaces/:workspaceId/members/:userId` — Removes a member (requires `admin` or higher; blocks removing direct owner).

---

## 5. Verification & Testing
Validated with:
- `npm run typecheck --prefix Backend_Solyra` (0 errors)
- `npm test --prefix Backend_Solyra` (108 passed, 0 failed)
- `npm run build --prefix Frontend_Solyra` (clean production build)
