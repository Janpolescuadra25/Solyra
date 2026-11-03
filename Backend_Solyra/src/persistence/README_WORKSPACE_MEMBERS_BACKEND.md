# Workspace Members Backend

STATUS: DONE (Step 18 Phase 1 Verified)

## Overview
The workspace member policy engine enforces fail-closed membership, role inheritance, and demotion guardrails for workspace access. It is the authorization layer that decides whether a user may view, invite, remove, or modify workspace membership state.

## Role hierarchy
The effective workspace role order is:

owner > admin > member > viewer

This ordering is enforced by the policy guardrails in the workspace routes and the membership repository methods.

## Repository contract
The workspace repository contract includes the following member-management methods:

```ts
addMember(member: WorkspaceMembership | string, userId?: string, role?: string): Promise<WorkspaceMembership>
getMember(workspaceId: string, userId: string): Promise<WorkspaceMembership | null>
removeMember(workspaceId: string, userId: string): Promise<boolean>
listMembers(workspaceId: string): Promise<WorkspaceMembership[]>
updateMemberRole(workspaceId: string, userId: string, newRole: string): Promise<WorkspaceMembership>
```

Every role update normalizes the incoming role to lowercase and validates it against the allowed list:

- owner
- admin
- member
- viewer

## Route specification
### GET /api/workspaces/:workspaceId/members
Returns the membership list for the workspace and requires at least member access.

### POST /api/workspaces/:workspaceId/members
Adds a member to the workspace. This route restricts assignment to admin-level and higher privileges and rejects invalid role values.

### DELETE /api/workspaces/:workspaceId/members/:userId
Removes a member from a workspace. The route denies removal of the sole owner and prevents owner deletion attempts.

### PUT /api/workspaces/:workspaceId/members/:userId/role
Updates the role for an existing workspace member.

Policy guardrails:
- self-role changes are rejected
- admins cannot modify owner roles
- the last remaining owner cannot be demoted
- invalid role strings return a 400 response
- successful changes emit a role-updated audit event

## Audit event
The role update event follows this structure:

```json
{
  "eventType": "workspace.member.role_updated",
  "userId": "<actor-user-id>",
  "workspaceId": "<workspace-id>",
  "details": {
    "targetUserId": "<target-user-id>",
    "previousRole": "member",
    "newRole": "admin"
  }
}
```

## Safety guarantees
- fail closed when the workspace member target is not found
- prevent demotion of the last owner
- prevent unauthorized privilege escalation
- preserve consistent role precedence across workspace ownership, membership, and org inheritance

## Verification status
This module is marked DONE and verified for Step 18 Phase 1.
