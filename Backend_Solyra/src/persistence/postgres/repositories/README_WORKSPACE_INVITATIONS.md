# Workspace Invitations Repository

## Status
Step 17 Phase 1 is complete and the workspace invitation subsystem is enabled for persistence and API layers.

## Schema
The `workspace_invitations` table stores per-workspace member invites and enforces lifecycle state checks:

```sql
CREATE TABLE IF NOT EXISTS workspace_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ
);
```

Indexes:
- `idx_workspace_invitations_workspace_id`
- `idx_workspace_invitations_token_hash`
- `idx_workspace_invitations_email_workspace`

## Lifecycle
Invitation states are intentionally simple and fail-closed:
- `pending`: active invite that can still be accepted
- `accepted`: invitation has been redeemed and the user was added to the workspace
- `revoked`: admin/owner explicitly canceled the invitation
- `expired`: invite exceeded its expiration window and is no longer valid

## Token Security
The system never stores the raw invitation token in the database. Instead it hashes the token with SHA-256 via `hashToken(token)` and stores the resulting hex digest in `token_hash`.

The raw token is only returned to the inviter at creation time and is included only in the outbox payload for the email delivery system.

## Authorization and API Contracts
- `POST /api/workspaces/:workspaceId/invitations` - requires workspace owner/admin permissions
- `GET /api/workspaces/:workspaceId/invitations` - requires workspace owner/admin permissions
- `DELETE /api/workspaces/:workspaceId/invitations/:invitationId` - requires workspace owner/admin permissions
- `POST /api/workspaces/invitations/accept/:token` - accepts invitation for the currently authenticated user

## Repository Behavior
The repository layer exposes:
- create
- findById
- findByTokenHash
- findByWorkspaceAndEmail
- listByWorkspace
- updateStatus
- revoke

This supports both PostgreSQL and in-memory bundles without weakening the persistence contract or the fail-closed authorization model.
