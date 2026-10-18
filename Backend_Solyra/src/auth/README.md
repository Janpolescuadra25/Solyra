# Auth Core Layer (Step 2 Completed)
✅ **STATUS: DONE** — Step 2 core authentication and session backend implemented for the Full-Stack Application Layer.

## Architecture Overview
This module contains the backend authentication stack for Solyra, covering persistence repositories, atomic signup transactions, JWT session validation, and HTTP route protection.

## Components
- `Backend_Solyra/src/auth/utils.ts`: Password hashing, SHA-256 token hashing, secure token generation, and JWT signing/verification.
- `Backend_Solyra/src/auth/service.ts`: `AuthService` coordinating signup, login, logout, email verification, and current-user retrieval.
- `Backend_Solyra/src/auth/middleware.ts`: Bearer-token validation, rate limiting, and custom `req.user` / `req.session` augmentation.
- `Backend_Solyra/src/persistence/postgres/repositories/session.repository.ts`: Session persistence using the verified UUID-backed schema.
- `Backend_Solyra/src/persistence/postgres/repositories/email-outbox.repository.ts`: Transactional email queue and status tracking.
- `Backend_Solyra/src/persistence/postgres/repositories/audit-event.repository.ts`: Structured audit trail persistence.
- `Backend_Solyra/src/index.ts`: Auth route mounting, CORS, rate limiting, and unified JSON response handling.

## Session Lifecycle & Security
- Passwords are hashed with `bcryptjs` using a salted 10-round configuration.
- Session tokens are signed with JWT and stored as SHA-256 hashes in the `sessions` table.
- Verification and reset flows use secure random token generation and hashed token lookups.
- Requests can be protected by `authenticateRequest(...)`, which verifies bearer tokens and enforces live, non-revoked, non-expired session state.
- Sliding-window in-memory rate limiting is enforced for signup and login endpoints.

## Audit Events Tracked
- `USER_SIGNUP`
- `USER_LOGIN`
- `USER_LOGIN_FAILED`
- `USER_LOGOUT`
- `EMAIL_VERIFIED`

## Verification
- Backend typecheck passes with the project TypeScript configuration.
- Backend test suite passes after adding the Step 2 auth coverage.
