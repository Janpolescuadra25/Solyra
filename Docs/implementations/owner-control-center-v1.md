# Owner Control Center v1

## Overview

The Owner Control Center is a privilege-scoped operations dashboard for the owner/admin tier of Solyra. It provides read-only telemetry, lifecycle controls for active brain packages, user administration, active-session inspection, and immutable audit review without exposing unsafe operational paths to non-owners.

The control plane is intentionally narrow: it reuses existing authenticated session middleware, adds additional owner-only route checks, and enforces CSRF / origin validation on all state-mutating requests.

## Core principles

- Fail closed: unauthenticated or unauthorized requests are rejected before any mutation is accepted.
- Preserve the last active owner: demotion or deactivation is blocked when it would leave the platform without an active owner.
- Bound admin operations: mutation routes are rate-limited and require a valid admin request header or trusted origin.
- Audit as a first-class control: all role, status, session, and brain lifecycle actions emit audit records.

## Routes and contracts

### Telemetry

- `GET /thalamus/stats` — owner/admin only
- `GET /council/stats` — owner/admin only
- `GET /brain/stats` — owner/admin only
- `GET /brain/history` — owner/admin only

### User administration

- `GET /api/admin/users` — returns user summary rows
- `PUT /api/admin/users/:id/role` — accepts `{ role: 'owner' | 'admin' | 'user' }`
- `PUT /api/admin/users/:id/status` — accepts `{ status: 'active' | 'suspended' | 'deactivated' }`

### Session management

- `GET /api/admin/sessions/active` — active, non-revoked sessions only
- `DELETE /api/admin/sessions/:id` — revokes a single session with reason `owner_revocation`
- `DELETE /api/admin/users/:id/sessions` — revokes all active sessions for a user with reason `owner_bulk_revocation`

### Audit stream

- `GET /api/admin/audit/recent?limit=50` — returns recent audit rows in descending `created_at` order

### Brain lifecycle controls

- `POST /brain/load` — validates and loads a new brain package manifest
- `POST /brain/unload` — deactivates the active package
- `POST /brain/rollback` — restores the last-good package from the rollback history

## Security rules

### Authentication

All owner-scoped routes are protected by the runtime `requireOwnerAuth` guard. In production and development this resolves the current session from the Bearer token, verifies the user is active, and ensures the role is `owner` or `admin`.

### CSRF / origin controls

Mutation requests that hit `/api/admin/*` or `/brain/*` must include at least one of:

- `x-requested-with: XMLHttpRequest`
- `x-solyra-admin: true`
- an allowed origin matching `FRONTEND_URL`, `http://localhost:5173`, or `http://localhost:3000`

### Rate limiting

State-changing admin actions are tracked in an in-memory map keyed by remote address and endpoint. The system allows 60 requests per minute per key before returning a 429 response.

## Data dictionary

### User summary row

- `id`: user UUID
- `email`: normalized email address
- `name`: display name
- `role`: `owner`, `admin`, or `user`
- `status`: `active`, `suspended`, or `deactivated`
- `createdAt`: user creation timestamp

### Session summary row

- `id`: session UUID
- `userId`: owning user UUID
- `workspaceId`: associated workspace ID
- `expiresAt`: expiration timestamp
- `createdAt`: creation timestamp
- `ipAddress`: request source address when available
- `userAgent`: client user-agent when available

### Audit record

- `id`: event UUID
- `eventType`: the event classification
- `userId`: actor or affected user
- `workspaceId`: workspace context, if any
- `details`: JSON payload with action metadata
- `ipAddress`: associated client address
- `userAgent`: associated user-agent
- `createdAt`: event time

## Operational runbooks

### Emergency session revocation

1. Authenticate as an owner/admin through the control center.
2. Navigate to the Active Sessions panel and select the offending session.
3. Trigger the revoke action.
4. Confirm the session is removed from `GET /api/admin/sessions/active` and the event is logged in the audit stream.

### Brain package rollback

1. Use `GET /brain/history` to confirm the last known good package and version.
2. Initiate `POST /brain/rollback` from the brain package panel.
3. Confirm the active package is restored and the audit event `brain.package_rollback` is emitted.

## Implementation notes

The dashboard uses the existing API client and sets the `x-solyra-admin` header to allow frontend-to-backend admin requests without disrupting the general session flow. It remains intentionally lightweight and uses safe empty/error states for partial service outages.
