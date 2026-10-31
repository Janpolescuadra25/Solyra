# Organization Management Frontend

**Status: DONE — completed 2026-10-31**

This frontend layer provides the signed-in user's organization context and management views. It connects the organization REST API from Step 14 Phase 2 to the application shell and authentication context.

## Components

- `OrganizationSwitcher.tsx` is mounted in `ShellLayout` and lets a user select the active organization or open the management page. The selection is stored in `sessionStorage` and dismissed when the user clicks outside the menu.
- `OrganizationRoutes.tsx` provides `OrganizationsListPage` for listing and creating organizations and `OrganizationDetailPage` for viewing members and managing roles.
- `AuthContext.tsx` owns `organizations`, `currentOrganization`, `userOrgRole`, loading state, and organization switching/refresh actions.
- `api/client.ts` adds typed organization helpers and injects `X-Organization-ID` from the active session context on requests.

## Roles and session rules

The shared roles are `owner`, `admin`, and `member`. Member management controls are shown to owners and admins, while the backend remains the authoritative RBAC enforcement point. `activeOrganizationId` is cleared during logout so a subsequent user cannot inherit another user's organization context.

## Verification

- Phase 3 commit: `e17b910e3c208f71d728c8a94b4e5e0629db5089`
- Frontend production build passed.
- Backend regression suite passed: 98/98 tests.
