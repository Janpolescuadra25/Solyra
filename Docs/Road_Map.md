# Solyra Product Roadmap

## Current Phase: Step 19 - Governance & Compliance Logging (Audit Trail Subsystem) [ACTIVE]

## Step 18: Workspace Collaboration & Access Policies [COMPLETED]
- **Status:** [COMPLETED]
- **Description:** Extend the workspace control model with advanced sharing policies, role review workflows, and invite lifecycle enforcement beyond the initial management surface.
- **Milestone Mapping:** Completes the multi-user access foundation and establishes the security bridge into the next governance and collaboration milestones.
- **Phase 1: Backend Workspace Membership & Role Policy Engine [COMPLETED]** (Baseline Commit: `436a49a` / merged prior to `2a522731c1afd467141437fec992974b1ebe9b70`)
  - Method parity implemented across `IWorkspaceRepository`, `InMemoryWorkspaceRepository`, and `PostgresWorkspaceRepository` (`getMember`, `removeMember`, `listMembers`, `updateMemberRole`).
  - Added endpoint `PUT /api/workspaces/:workspaceId/members/:userId/role` with sole-owner demotion protection, self-role modification blocks, and admin restrictions against owner roles.
  - Integrated audit event logging (`workspace.member.role_updated`).
  - Added dedicated test suite `workspace-members.test.ts` (120/120 passing backend tests).
  - Documented backend architecture in `Backend_Solyra/src/persistence/README_WORKSPACE_MEMBERS_BACKEND.md`.
- **Phase 2: Frontend Workspace Member Management UI & API Client [COMPLETED]** (Baseline Commit: `2a522731c1afd467141437fec992974b1ebe9b70`)
  - Added typed client API functions in `Frontend_Solyra/src/api/client.ts` (`listWorkspaceMembers`, `updateWorkspaceMemberRole`, `removeWorkspaceMember`) with comprehensive error handling.
  - Updated `OrganizationRoutes.tsx` with workspace role resolution and prop pass-through (`currentUserId={user?.id}`, `workspaceUserRole={workspaceUserRole}`).
  - Implemented accessible sub-tabs ("Current Members" and "Pending Invitations") in `WorkspaceInvitationsTab.tsx` with full ARIA accessibility (`role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`).
  - Implemented member table with role selector dropdowns, security guards, member removal confirmation dialogs, and loading state disables.
  - Preserved 100% of preexisting invitation workflows.
  - Documented UI architecture in `Frontend_Solyra/src/components/workspace/README_WORKSPACE_MEMBERS_UI.md`.
- **Prerequisites:** Step 17 completed and verified (baseline commit `8d647376e8c932e479af81b3d92cc3ae81ffead9`)
- **Target Subsystems:** `Backend_Solyra/src/routes/`, `Backend_Solyra/src/services/`, `Frontend_Solyra/src/components/workspace/`

## Step 19: Governance & Compliance Logging (Audit Trail Subsystem) [COMPLETED]
- **Scope**: Extend the existing audit logging subsystem to support persistent workspace compliance querying, log retention management, recursive PII privacy controls, and dedicated administration audit log viewer UI.
- **Status:** [COMPLETED]
- **Current Phase:** Phase 2: Frontend Audit Log Viewer UI [COMPLETED]

### Phase 1: Backend Audit Schema Repair, In-Memory Parity, Recursive PII Redaction & Query Engine [COMPLETED]
- **Status:** [COMPLETED]
- **Baseline Commit:** `4ade4de41cb6ae6a02d62d525e50ea5967d25152`
- **Deliverables Completed:**
  - Corrected `audit_events.workspace_id` to `VARCHAR(64)` and `audit_events.organization_id` to `UUID REFERENCES organizations(id) ON DELETE CASCADE`.
  - Added composite indexes (`(workspace_id, created_at DESC)`, `(organization_id, created_at DESC)`).
  - Created schema rollback script `Backend_Solyra/src/persistence/postgres/step19_phase1_audit_rollback.sql`.
  - Implemented recursive `redactPii()` sanitizing sensitive keys across arbitrary object nesting depths.
  - Implemented `queryEvents()` supporting multi-criteria filtering and pagination.
  - Created `InMemoryAuditEventRepository` achieving 100% dual-tier persistence parity with bundle wiring.
  - Created `Backend_Solyra/src/persistence/README_AUDIT_LOGGING_BACKEND.md`.
  - Enriched event emissions in `Backend_Solyra/src/index.ts` with target metadata and organization context.
  - Preserved backward compatibility across all legacy test suites including `Backend_Solyra/test/step8_acceptance_matrix.test.ts`.
  - Added comprehensive test suite `Backend_Solyra/test/audit-events.test.ts` (127/127 backend tests passing).

### Phase 2: Frontend Audit Log Viewer UI [COMPLETED]
- **Status:** [COMPLETED]
- **Description:** Implement dedicated administration audit log viewer UI with filtering (workspace, organization, user, action, date range), paginated event table, safe PII redaction display, and compliance export controls.
- **Baseline Commit:** `7ac6a06a7ffbf0412bea8ab0697cd53cff5707a2`
- **Deliverables Completed:**
  - Implemented `GET /api/organizations/:orgId/audit-logs` in `Backend_Solyra/src/index.ts` with input validation, path normalization, and `requireOrgRole(['owner', 'admin'])`.
  - Added route tests in `Backend_Solyra/test/organization_routes.test.ts` (128/128 backend tests passing).
  - Added `getOrganizationAuditLogs()` API client method in `Frontend_Solyra/src/api/client.ts`.
  - Built component suite in `Frontend_Solyra/src/components/organization/` (`AuditLogViewer`, `AuditLogFilters`, `AuditLogTable`, `AuditExportButton`).
  - Integrated "Audit Logs" tab into `Frontend_Solyra/src/routes/OrganizationRoutes.tsx` with `canManage` RBAC guard.
  - Implemented compliance export controls for both CSV and JSON download.
  - Created subsystem documentation `Frontend_Solyra/src/components/organization/README_AUDIT_LOG_UI.md`.

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
