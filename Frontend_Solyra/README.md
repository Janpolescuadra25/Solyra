# Frontend_Solyra (@solyra/frontend)

## ✅ STATUS: DONE (Step 5: User Authentication & Resumable Onboarding UI)

This frontend pass delivers the guest-first auth flow and persistent onboarding experience required by the Solyra member experience: route-level session guards, sign-in/signup/reset forms, email verification handling, and a resumable onboarding wizard that saves its state in session storage.

### Architecture
- React 19 + TypeScript + Vite app shell
- TailwindCSS v3 styling layer for the Solyra dark dashboard and auth UI
- React Router v6 with public, protected member, and owner/admin flows
- Auth context with `guest`, `member`, and `owner` tiers
- Session token storage in `sessionStorage` for session-scoped authentication
- Axios client with Bearer token injection and automatic 401 cleanup

### Route Hierarchy
- Public / Guest: `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`
- Protected Member: `/chat`, `/app`, `/dashboard`, `/profile`, `/settings`, `/onboarding`
- Protected Owner/Admin: `/admin` and legacy `/owner` redirect

### Auth & Onboarding Experience
- Login, signup, forgot-password, reset-password, and verify-email flows are wired to the verified `/auth/*` backend endpoints.
- Loading, validation, and inline error states are visible across every auth form.
- The onboarding wizard persists draft state in `sessionStorage`, allowing users to resume from their prior step.
- Protected routes enforce member or owner access through `AuthGuard` and `OwnerGuard` wrappers.

### Security Model
- Tokens are kept in `sessionStorage` and removed on sign-out or 401 responses.
- The app never forces a user into a member-only flow without explicit session authentication.
- Guest-first landing remains available before sign-in, while the chat workspace is protected behind `AuthGuard` and workspace-scoped backend ownership checks.

### Conversational Workspace (`/chat`)
- Multi-session conversation management with creation, listing, switching, and deletion of conversation threads.
- Authenticated workspace isolation: each request is verified against the active session workspace and the current user ownership state.
- Message turn lifecycle: user turn, assistant acknowledgment, optimistic UI updates, and loading/error handling for message delivery.
- Model selection controls enable switching between `solyra-default`, `solyra-reasoning`, and `solyra-fast` within the active chat session.
- Backend endpoints include `GET /api/chat/conversations`, `POST /api/chat/conversations`, `GET /api/chat/conversations/:id/messages`, `POST /api/chat/conversations/:id/messages`, and `DELETE /api/chat/conversations/:id`.
