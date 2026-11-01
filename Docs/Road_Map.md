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
- **Step 16 Phase 1:** Organization Workspace Creation REST APIs and UI [COMPLETED]
- **Step 16 Phase 2:** Organization Workspace Scoping and Isolation Guards [COMPLETED]
- **Step 16 Phase 3:** Organization Workspace Member Permissions & Role Inheritance [COMPLETED] (108 tests passing)
- **Step 15 Phase 1:** Backend Organization Workspace Linking REST APIs
- **Step 15 Phase 2:** Frontend Organization Workspace UI & Tab Navigation (commit `a6aa8f3`)
- **Step 14 Phase 1:** Organization Schema & Persistence Layer (commit `e8c7a3f`)
- **Step 14 Phase 2:** Organization Route Handlers & RBAC Middleware
- **Step 14 Phase 3:** Frontend Organization Management UI
- **P0 Authentication & Schema Repairs:** Sessions schema DDL, AuthContext contract, AuthGuard loading guard, proxy port alignment (commit `a89587d`)
