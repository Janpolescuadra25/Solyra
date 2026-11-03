# Solyra Product Roadmap

## Current Phase: Step 18 - Workspace Collaboration & Access Policies

### Step 18: Workspace Collaboration & Access Policies
- **Status:** [ACTIVE] (Phase 2 Frontend UI in progress)
- **Description:** Extend the workspace control model with advanced sharing policies, role review workflows, and invite lifecycle enforcement beyond the initial management surface.
- **Milestone Mapping:** Completes the multi-user access foundation and establishes the security bridge into the next governance and collaboration milestones.
- **Core Objectives:**
  - Fine-grained permission policy matrix (Workspace Owner vs Admin vs Member vs Viewer)
  - Cross-workspace resource isolation and tenant scoping guards
  - Workspace member management UI: role promotion/demotion and member removal
  - Comprehensive audit logging for workspace membership and access changes
- **Phase 1 (Backend) - [COMPLETED]:** Verified baseline commit `436a49a1230cd18b2ec7edd7fce1964a060e5f5e`.
  - Role update route `PUT /api/workspaces/:workspaceId/members/:userId/role` enforced owner/admin policy guardrails and audit logging.
  - Repository parity completed for Postgres and in-memory workspace member implementations.
  - Verification gate passed with 120/120 backend tests green and zero backend failures.
- **Phase 2 (Frontend UI) - [ACTIVE]:** Member-management tab, client API integration, and access guardrails for self-role changes, self-removal, admin owner protection, and sole-owner demotion prevention.
- **Prerequisites:** Step 17 completed and verified (baseline commit `8d647376e8c932e479af81b3d92cc3ae81ffead9`)
- **Target Subsystems:** `Backend_Solyra/src/routes/`, `Backend_Solyra/src/services/`, `Frontend_Solyra/src/components/workspace/`

---

## ARCHIVED: Completed Historical Milestones

### Step 17: Workspace Invitations & Access Control [COMPLETED]
- **Status:** [COMPLETED] (Verified 2026-11-03)
- **Git Commit Baseline:** `8d647376e8c932e479af81b3d92cc3ae81ffead9`
- **Phase 1 (Backend)**:
  - Database schema: `workspace_invitations` table with SHA-256 token hashing.
  - Dual repositories: `PostgresWorkspaceInvitationRepository` and `InMemoryWorkspaceInvitationRepository`.
  - REST API routes: `POST /api/workspaces/:workspaceId/invitations`, `GET /api/workspaces/:workspaceId/invitations`, `DELETE /api/workspaces/:workspaceId/invitations/:invitationId`, `POST /api/workspaces/invitations/accept/:token`.
  - RBAC authorization guards and 114/114 passing unit & integration tests.
- **Phase 2 (Frontend UI)**:
  - Component: `Frontend_Solyra/src/components/workspace/WorkspaceInvitationsTab.tsx`.
  - Subsystem Doc: `Frontend_Solyra/src/components/workspace/README_WORKSPACE_INVITATIONS_UI.md`.
  - Public acceptance portal: `InvitationAcceptancePage` mounted at `/invitations/accept/:token` in `App.tsx`.
  - Client API: `createWorkspaceInvitation`, `listWorkspaceInvitations`, `revokeWorkspaceInvitation`, `acceptWorkspaceInvitation` in `client.ts`.
  - Organization integration: Wired into `OrganizationDetailPage` in `Frontend_Solyra/src/routes/OrganizationRoutes.tsx`.
- **Documentation**: Detailed architecture archived in `Docs/implementations/step17_complete_workspace_invitations.md`.

### Milestone: Layout Separation & Database Connection Resilience
- **Commit:** 6be2d4f0fae320c15f0dfe035eec2da4b7fbaccd
- **Scope Completed:**
  1. Created Frontend_Solyra/src/components/layout/PublicLayout.tsx providing a dedicated, unauthenticated header with navigation links (Sign In, Get Started) and responsive mobile menu.
  2. Restructured Frontend_Solyra/src/App.tsx routes into clean public (PublicLayout) and authenticated (AuthGuard + ShellLayout) branches, eliminating duplicate navbar rendering on the landing page while preserving top-level standalone /chat workspace access.
  3. Enhanced Backend_Solyra/src/persistence/postgres/pool.ts to parse individual PGHOST, PGPORT, PGUSER, PGPASSWORD, and PGDATABASE environment variables with special-character password safety and SSL preservation.
  4. Enhanced /auth/login and /auth/signup in Backend_Solyra/src/index.ts with PostgreSQL connection error detection returning structured 503 Service Unavailable (DATABASE_UNAVAILABLE).
  5. Implemented transactional database initializer Backend_Solyra/src/persistence/postgres/init-db.ts and registered "db:init" in Backend_Solyra/package.json.
  6. Updated Backend_Solyra/.env.example with standard PostgreSQL environment variables.
- **Step 16 Phase 1:** Organization Workspace Creation REST APIs and UI [COMPLETED]
- **Step 16 Phase 2:** Organization Workspace Scoping and Isolation Guards [COMPLETED]
- **Step 16 Phase 3:** Organization Workspace Member Permissions & Role Inheritance [COMPLETED] (108 tests passing)
- **Step 15 Phase 1:** Backend Organization Workspace Linking REST APIs
- **Step 15 Phase 2:** Frontend Organization Workspace UI & Tab Navigation (commit `a6aa8f3`)
- **Step 14 Phase 1:** Organization Schema & Persistence Layer (commit `e8c7a3f`)
- **Step 14 Phase 2:** Organization Route Handlers & RBAC Middleware
- **Step 14 Phase 3:** Frontend Organization Management UI
- **P0 Authentication & Schema Repairs:** Sessions schema DDL, AuthContext contract, AuthGuard loading guard, proxy port alignment (commit `a89587d`)
