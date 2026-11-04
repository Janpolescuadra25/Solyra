# Solyra Product Roadmap

Current Active Phase: Step 20: Log Retention & Compliance Automation

## Current Phase: Step 20 — Log Retention & Compliance Automation [ACTIVE]
**Phase Goal:** Implement log retention policies, automated cleanup and purging of expired audit events, compliance hold mechanisms, and retention configuration endpoints for organizations.
**Dependencies:** Step 19 (Governance & Compliance Logging / Audit Trail Subsystem) - COMPLETED & ARCHIVED (Baseline Commit: `405942e7ec03a1d2ef7d399ecd367327267f2cf5`).
**Key Deliverables:**
- Database schema extension: `retention_expires_at TIMESTAMPTZ` and `archive_state VARCHAR(32)` on `audit_events`; `retention_default_days INT DEFAULT 365` on `organizations`.
- Migration rollback script: `step20_phase1_retention_rollback.sql`.
- Persistence layer extension: Audit event retention methods (`setRetention()`, `purgeExpired()`, `applyComplianceHold()`) in `IAuditEventRepository` and dual implementations (`PostgresAuditEventRepository` and `InMemoryAuditEventRepository`).
- Automated retention worker: Extension of `Backend_Solyra/src/persistence/retention-cleaner.ts` to evaluate expired audit logs according to organization retention rules and compliance hold flags.
- Phase 1: Backend schema migration, repository retention methods, and automated retention cleaner service.
- Phase 2: Retention policy management API endpoints and administrative configuration UI.

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

### Step 19: Governance & Compliance Logging (Audit Trail Subsystem) [COMPLETED]
- **Baseline Commit**: `405942e7ec03a1d2ef7d399ecd367327267f2cf5`
- **Status**: 100% Complete & Verified (November 2026)
- **Phase 1 Deliverables**:
  * Corrected database schema: `workspace_id VARCHAR(64)` and `organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE`.
  * Added composite indexes: `(workspace_id, created_at DESC)` and `(organization_id, created_at DESC)`.
  * Implemented recursive PII scrubber (`redactPii()`) stripping sensitive tokens across nested metadata.
  * Built multi-criteria query engine (`queryEvents()`) supporting date ranges, actors, actions, workspaces, and pagination.
  * Implemented `InMemoryAuditEventRepository` with dual parity and wired into in-memory bundle.
  * Created rollback script `step19_phase1_audit_rollback.sql` and backend documentation `README_AUDIT_LOGGING_BACKEND.md`.
- **Phase 2 Deliverables**:
  * Backend route `GET /api/organizations/:orgId/audit-logs` in `Backend_Solyra/src/index.ts` with query normalization and `requireOrgRole(['owner', 'admin'])`.
  * 128 passing backend test suites in `Backend_Solyra/test/organization_routes.test.ts`.
  * Frontend API client method `getOrganizationAuditLogs()` in `Frontend_Solyra/src/api/client.ts`.
  * Frontend component suite in `Frontend_Solyra/src/components/organization/`: `AuditLogViewer.tsx`, `AuditLogFilters.tsx`, `AuditLogTable.tsx`, and `AuditExportButton.tsx` (supporting both CSV and JSON exports).
  * Tab integration in `Frontend_Solyra/src/routes/OrganizationRoutes.tsx` guarded by `canManage`.
  * Frontend documentation `Frontend_Solyra/src/components/organization/README_AUDIT_LOG_UI.md`.

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
