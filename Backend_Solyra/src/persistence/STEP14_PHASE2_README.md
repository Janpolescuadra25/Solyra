# Step 14 Phase 2: Organization Route Handlers & RBAC Middleware

**Commit PIN:** `d36a7f170930f6aa8d464a35464f4f8c2ff6102c`  
**Test Suite Status:** 98/98 tests passing across 8 test suites (0 failures, 0 skipped)  
**Parent Milestone:** Multi-Tenant Organization Management & Access Control

## Overview

Step 14 Phase 2 adds the HTTP routing layer and role-based access control (RBAC) for multi-tenant organizations. The native Node HTTP server exposes organization lifecycle and membership endpoints, while middleware enforces authenticated membership and role hierarchy.

## Components

### `handleOrganizationRoutes`

- **Location:** `Backend_Solyra/src/index.ts`
- **Server mount:** request listener dispatch loop
- **Contract:** returns `true` when an organization route is handled and `false` to allow normal route fallthrough.
- **Persistence:** uses the configured organization repository from the persistence bundle.

### `requireOrgRole`

- **Location:** `Backend_Solyra/src/auth/middleware.ts`
- Establishes or validates the authenticated request context.
- Resolves the organization from the request path/context.
- Loads the caller's organization membership through `bundle.organizations`.
- Enforces `owner > admin > member` and returns `403 Forbidden` when membership or role is insufficient.

## Endpoint Contract

| Method | Route | Minimum access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/v1/organizations` | Authenticated | Create an organization and assign the caller as owner. |
| `GET` | `/api/v1/organizations` | Authenticated | List organizations for the authenticated user. |
| `GET` | `/api/v1/organizations/:id` | Member | Read organization metadata. |
| `GET` | `/api/v1/organizations/by-slug/:slug` | Authenticated | Resolve an organization by unique slug. |
| `GET` | `/api/v1/organizations/:id/members` | Member | List active organization members. |
| `POST` | `/api/v1/organizations/:id/members` | Admin | Add or invite a member with a role. |
| `PUT` | `/api/v1/organizations/:id/members/:userId` | Admin | Change a member role. |
| `DELETE` | `/api/v1/organizations/:id/members/:userId` | Owner | Remove a member. |

## Persistence and Testing

Production requests use the PostgreSQL organization repository wired in the persistence bundle. The in-memory repository mirrors the contract for isolated tests. The route suite is `Backend_Solyra/test/organization_routes.test.ts` and covers creation, membership enumeration, role enforcement, role changes, removal, and test-server startup isolation.

## Verification

The Step 14 Phase 2 baseline was verified with 98 passing tests across 8 suites, with no failures or skipped tests.
