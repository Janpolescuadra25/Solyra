# Audit Log UI

**Status: DONE**

This subsystem surfaces immutable organization audit history to owners and admins through a read-only, role-guarded view. The screen is intentionally narrow in scope: it exposes audit metadata for security reviews without allowing mutation of historical records.

## Components

- `AuditLogViewer.tsx` owns the fetch cycle, role gating, filter state, and pagination controls.
- `AuditLogFilters.tsx` provides the filter form for action, workspace, actor, target, and date-range narrowing.
- `AuditLogTable.tsx` renders the returned event rows in a safe, read-only table with redaction-safe metadata summaries.
- `AuditExportButton.tsx` exports the current page as CSV for offline review and compliance workflows.

## API contract

The frontend calls:

- `GET /api/organizations/:orgId/audit-logs`

Supported query params include:

- `action`
- `workspaceId`
- `userId`
- `targetType`
- `targetId`
- `startDate`
- `endDate`
- `limit`
- `offset`

The backend returns a paginated result with:

- `success`
- `auditLogs`
- `total`
- `limit`
- `offset`

## Guardrails

- Only organization owners and admins can access the page.
- Sensitive values are redacted before persistence and before display, so tokens, passwords, credentials, and cookies are never exposed in the UI.
- Audit entries are append-only; the UI only reads and exports records, never mutates them.

## Verification

- Backend route checks: RBAC enforcement and filtered queries are covered in the repository test suite.
- Frontend build validation remains the final integration gate.
