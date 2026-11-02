# Step 17 Phase 1 — Workspace Invitation System

## Summary
Step 17 Phase 1 introduces the workspace invitation lifecycle for Solyra workspaces: invite creation, token hashing, 7-day expiry, acceptance, revocation, and owner/admin-only management APIs.

## Architecture
The subsystem is split across the same persistence model already used by Solyra:
- `workspace_invitations` table in PostgreSQL
- `WorkspaceInvitationRepository` for Postgres and in-memory persistence
- Workspace route handlers mounted inside the existing `handleWorkspaceRoutes` flow
- Email outbox + audit event integration guarded behind null checks

## Persistence Model
Each invitation record maintains:
- workspace scope
- invitee email address
- assigned workspace role
- SHA-256 token hash
- inviter identity
- lifecycle status
- expiry timestamp
- accepted timestamp

This allows enforcement of the invitation lifecycle without exposing the raw token after creation.

## API Routes
- `POST /api/workspaces/invitations/accept/:token` — redeem an invitation for the authenticated user
- `POST /api/workspaces/:workspaceId/invitations` — create a pending invite and queue a delivery record
- `GET /api/workspaces/:workspaceId/invitations` — list invitations for a workspace
- `DELETE /api/workspaces/:workspaceId/invitations/:invitationId` — revoke a pending invite

## Security Properties
- Tokens are stored only as SHA-256 digests (`token_hash`)
- Invitation acceptance requires an authenticated session
- Route shadowing is prevented by mounting the `/api/workspaces/invitations/accept/:token` URL ahead of the `/:workspaceId` route resolution
- Only workspace owners/admins can create, list, or revoke invitations
- Duplicate pending invites for the same workspace/email pair are rejected

## Validation
The implementation is validated by:
- backend TypeScript compile gate: passed
- full backend suite: 114 tests passed, 0 failed
- frontend production build: passed

## Status
DONE — Step 17 Phase 1 workspace invitation system is implemented and verified.
