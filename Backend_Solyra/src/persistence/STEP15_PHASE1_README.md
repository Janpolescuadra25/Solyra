# Step 15 Phase 1: Organization Workspace Linking REST APIs & Isolation

## Overview
Step 15 Phase 1 adds the missing organization-scoped workspace queries and the role-gated REST routes needed to link and unlink workspaces from an organization while preserving the Step 14 repository model.

The underlying `organization_workspaces` table and the `linkWorkspace`, `unlinkWorkspace`, and `listWorkspaces` repository methods were already implemented in Step 14 and remain unchanged. This phase fills the missing workspaces-side query and route layer.

## Delivered Components

### 1. Workspace Repository Query Extension
- `IWorkspaceRepository.listByOrganization(organizationId: string): Promise<Workspace[]>`
- Implemented in `PostgresWorkspaceRepository.listByOrganization`
- Implemented in the in-memory workspace repository for tests and isolation checks

### 2. REST Endpoints
- `GET /api/organizations/:orgId/workspaces`
  - Allowed roles: `owner`, `admin`, `member`
  - Returns the linked workspace records for the organization
- `POST /api/organizations/:orgId/workspaces`
  - Allowed roles: `owner`, `admin`
  - Body: `{ "workspaceId": "<UUID>" }`
  - Validates org existence, workspace existence, UUID format, duplicate linking, and cross-organization conflicts
  - Enforces per-IP rate limiting for mutation requests
- `DELETE /api/organizations/:orgId/workspaces/:workspaceId`
  - Allowed roles: `owner`, `admin`
  - Validates the link exists before unlinking
  - Enforces rate limiting and UUID validation

### 3. Safety & Isolation Rules
- Organization-scoped list queries remain limited by organization membership and role checks
- Duplicate links are rejected with `409 Conflict`
- Cross-organization workspace attachment attempts are rejected with `409 Conflict`
- Missing org or workspace resources return `404 Not Found`
- Invalid UUID payloads return `400 Bad Request`

## Verification
The Step 15 regression suite in `Backend_Solyra/test/organization_workspaces.test.ts` is run through the Node native test runner with `tsx --test` and verifies org workspace listing, duplicate prevention, and admin/owner gating.
