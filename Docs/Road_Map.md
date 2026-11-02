# Solyra Product Roadmap

## Current Phase
### Step 17: Workspace Invitations & Access Management
#### Phase 1: Workspace Invitation System [ACTIVE NEXT]
- **Status:** NOT STARTED
- **Description:** Implement token-based email invitation system for workspace members, pending invitation tracking, expiration handling, and acceptance flows building on Step 16 Phase 3 member RBAC.
- **Requirements:**
  - Database schema for `workspace_invitations` with token hash, expiration, and role assignment
  - REST endpoints for creating, revoking, and accepting workspace invitations
  - Integration with email outbox and audit logging tables
  - Authorization guards allowing workspace owners and admins to issue invitations

## ARCHIVED: Completed Historical Milestones

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
