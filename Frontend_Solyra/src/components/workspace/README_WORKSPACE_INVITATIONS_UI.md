# Workspace Invitations UI Subsystem
**STATUS: DONE (verified 2026-11-03)**

The workspace invitation system is fully integrated in both the authenticated organization dashboard and the public invitation acceptance flow. Owners and administrators can issue, copy, and revoke workspace access links from the organization detail page, while recipients can accept those links via `/invitations/accept/:token`.

## Purpose
The workspace invitation UI gives owners and administrators a single place to send and manage access links for a workspace. It matches the backend invitation lifecycle introduced in Step 17 Phase 1 and surfaces the invite flow in a clean, role-aware management experience.

## Component Architecture
- `WorkspaceInvitationsTab`: main workspace invitation manager
- Role-aware controls: visible only to `owner` and `admin` users
- Public acceptance route: `/invitations/accept/:token`
- Organization dashboard integration: `OrganizationDetailPage` includes the `Invitations` tab and selects the active workspace before rendering the manager

## Contracts Consumed
The component calls the frontend API client methods in `src/api/client.ts`:
- `createWorkspaceInvitation(workspaceId, data)`
- `listWorkspaceInvitations(workspaceId)`
- `revokeWorkspaceInvitation(workspaceId, invitationId)`
- `acceptWorkspaceInvitation(token)`

## UX Flow
1. Owner/admin opens the `Invitations` tab in an organization workspace.
2. The form validates the invitee email and role before submission.
3. Server returns a generated token and direct invite URL.
4. The UI copies the URL to the clipboard and refreshes the invitation list.
5. Recipients can accept the invitation from the public acceptance page.

## Security Considerations
- Tokens are never stored in the browser longer than needed for the direct link flow.
- Clipboard actions are gated behind browser permission checks.
- Role-based visibility prevents non-managers from issuing or revoking access.
- Errors are surfaced clearly without exposing implementation details.
- Both the public acceptance route and the organization dashboard tab were verified in the frontend production build.
