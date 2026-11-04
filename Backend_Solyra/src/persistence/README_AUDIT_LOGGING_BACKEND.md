# Audit Logging Backend

## Overview

The backend audit subsystem records append-only security and governance events for workspaces, organizations, members, and invitations. It is intentionally designed as a fail-closed, reviewable event log: records are created through `recordEvent()` and never updated or deleted through repository APIs.

The design targets two goals simultaneously:

- Compliance-ready traceability across tenant, workspace, and organization boundaries.
- Safe storage of sensitive metadata without exposing credentials, tokens, cookies, or authorization headers.

## Schema Contract

The authoritative table is defined in `src/persistence/postgres/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS audit_events (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    workspace_id VARCHAR(64) REFERENCES workspaces(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    action VARCHAR(128) NOT NULL,
    target_type VARCHAR(64),
    target_id VARCHAR(64),
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

The index set includes scoped queries by user, workspace, organization, action, and time buckets:

- `idx_audit_events_user_id`
- `idx_audit_events_workspace_id`
- `idx_audit_events_organization_id`
- `idx_audit_events_action`
- `idx_audit_events_created_at`
- `idx_audit_events_ws_created`
- `idx_audit_events_org_created`

## Repository Contract

The repository interface is exported from `src/persistence/postgres/repositories/audit-event.repository.ts` and includes:

- `recordEvent(params)`
- `findEventsByUserId(userId, limit)`
- `findEventsByWorkspaceId(workspaceId, limit)`
- `listRecentEvents(limit)`
- `queryEvents(filters)`

The `queryEvents()` method supports the following filters:

- `user_id` / `userId`
- `workspace_id` / `workspaceId`
- `organization_id` / `organizationId`
- `action` / `eventType`
- `target_type` / `targetType`
- `target_id` / `targetId`
- `start_date`
- `end_date`
- `limit`
- `offset`

The return contract is `AuditEventQueryResult` with:

- `events`
- `total`
- `limit`
- `offset`

## Dual-Tier Persistence Parity

The system provides both storage backends:

- Postgres implementation: `AuditEventRepository`
- In-memory implementation: `InMemoryAuditEventRepository`

Both implement the same `IAuditEventRepository` contract and normalize event payloads to the same shape. This keeps tests and service code deterministic while allowing in-memory workflows for local validation and failure isolation.

## PII Redaction Policy

Sensitive metadata is scrubbed before insertion into the event store. The rule is recursive and key-based, scanning nested objects at arbitrary depth. The redaction set includes:

- `password`
- `token`
- `secret`
- `authorization`
- `apikey`
- `refreshtoken`
- `accesstoken`
- `credential`
- `cookie`
- `privatekey`
- `cvv`
- `ssn`

Example:

```ts
const payload = {
  outer: {
    middle: {
      password: 'secret123',
      token: 'abc123',
    },
  },
};

const redacted = redactPii(payload);
// => { outer: { middle: { password: '[REDACTED]', token: '[REDACTED]' } } }
```

This is enforced by `redactPii()` in the shared repository module.

## Immutability & Operational Safety

Audit records are append-only. There are no repository methods that mutate or delete existing rows. Each emitted record is returned as a frozen object, preventing downstream logic from altering the source-of-truth log entry after creation.

## Rollback & Recovery

The recovery script is located at:

- `src/persistence/postgres/step19_phase1_audit_rollback.sql`

It removes the Step 19 indexes and drops the Step 19 audit metadata columns so the table can be restored to the Step 18 definition when necessary. In production, a full table recreation remains the safest option if historical data must be preserved or if the audit table has already been populated.

## Route Integration Notes

The main route layer (`src/index.ts`) emits workspace and organization audit entries with the following metadata where applicable:

- `organization_id`
- `target_type`
- `target_id`
- `workspace_id`
- `user_id`
- `ip_address`
- `user_agent`

Examples include:

- `workspace.member.role_updated`
- `workspace.invitation.created`
- `workspace.member.removed`
- `organization.created`
- `organization.member_added`
- `organization.member_role_updated`
