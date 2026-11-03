# Workspace Members UI Subsystem

**Status**: DONE (Step 18 Phase 2 Verified, Baseline Commit: 2a522731c1afd467141437fec992974b1ebe9b70)**

The workspace member management experience is now surfaced directly from the organization workspace view. It complements the backend membership policy engine by exposing role updates and removal actions in a safe, role-aware, accessible interface.

## Purpose
The workspace members UI gives administrators and owners a dedicated management surface for the current workspace. It includes list, update, and removal flows while preserving the existing invitation workflow under the adjacent "Pending Invitations" tab.

## Component Architecture
- `WorkspaceInvitationsTab`: unified workspace access management tab, including both member management and invite lifecycle controls.
- `OrganizationRoutes.tsx`: resolves the currently selected workspace and passes the current user ID and current workspace role into the UI.
- `src/api/client.ts`: exported client methods for listing members, updating a role, and removing a workspace member.

## Contracts Consumed
The component relies on the following frontend API methods:
- `listWorkspaceMembers(workspaceId)`
- `updateWorkspaceMemberRole(workspaceId, userId, newRole)`
- `removeWorkspaceMember(workspaceId, userId)`

## Guardrails Enforced in the UI
- Prevent self-role modification.
- Prevent self-removal.
- Prevent admins from modifying owner roles.
- Prevent demotion or removal of the lone workspace owner.
- Use loading states and error banners for all mutating actions.
- Provide accessible tab navigation and keyboard support for screen-reader users.

## Accessibility and UX
- Tab switcher uses `role="tablist"`, `role="tab"`, and `role="tabpanel"` semantics.
- Keyboard arrow navigation moves between the members and invitations tabs.
- Role selectors, removal buttons, and alerts are tied to clear user feedback and status messaging.

## Scope Verified
- Member listing and role change API integration.
- Workspace-authored member guardrails in the UI.
- Invitation workflow retention under the “Pending Invitations” tab.
- Frontend production build and backend verification gates remain green.

