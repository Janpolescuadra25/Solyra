# Auth Core Layer
✅ **STATUS: DONE** (completed in commit `1c0855081cd2029ab3ca2d156a2e0f0fae6af066`)

## COMPLETED MILESTONES
- [x] **Step 1: Foundation, Shared Contracts & Schema Hardening** (commit `1270b849c1c97512ac76706b08cb452351e3de5c`)
  - Password hashing utilities (`bcryptjs`), secure token generation, and token hashing.
  - PostgreSQL schema for `sessions`, `tokens`, `email_outbox`, and `audit_events`.
- [x] **Step 2: Core Authentication & Session Backend** (commit `1c0855081cd2029ab3ca2d156a2e0f0fae6af066`)
  - Repositories: `SessionRepository`, `EmailOutboxRepository`, `AuditEventRepository`.
  - Services & Middleware: `AuthService` (transactional signup/login/logout/verification), `authenticateRequest` middleware, in-memory sliding-window `RateLimiter`.
  - Security Hardening: `SafeUserDto` sanitization (stripping `passwordHash` on `/auth/me`), fail-closed JWT secret in production, atomic verification transactions with row locking, inactive user blocking (HTTP 403), and stale rate-limit bucket pruning.
  - Test Suite: All 23 backend tests passing cleanly.
- [x] **Step 3: Account Security, Recovery & Onboarding Backend**
  - Password reset flows use `PASSWORD_RESET` token rows locked with `FOR UPDATE`, neutral success responses, and secure password complexity checks.
  - Failed login attempts increment in repository state, trigger a 15-minute lockout after 5 failures, and reset cleanly after successful authentication.
  - Guest accounts are blocked from onboarding mutations and password-recovery requests while remaining safe for authenticated session flows.
  - Onboarding state transitions validate the `pending | in_progress | completed` enum before persisting state.
  - Rate-limited `/auth/forgot-password`, `/auth/reset-password`, `/auth/onboarding`, and `/auth/onboarding` access routes are mounted in the HTTP entrypoint.

## Architecture Overview
This module contains the backend authentication stack for Solyra, covering persistence repositories, atomic signup transactions, JWT session validation, and protected request handling.

## Security Controls
- Sanitized user DTOs: `AuthService.getMe()` returns only a safe public contract (`id`, `email`, `fullName`, `isActive`, `avatarUrl`, `createdAt`, `updatedAt`), omitting any password material.
- Atomic email verification: `verifyEmail()` now opens a transaction, locks the verification token row with `FOR UPDATE`, rejects stale/consumed tokens, and records the `EMAIL_VERIFIED` audit event inside the same transaction.
- Fail-closed JWT config: `JWT_SECRET` is required in production; missing secrets throw a hard error instead of silently falling back.
- Account status enforcement: `authenticateRequest()` rejects suspended or inactive users with `403` before session access is granted.
- Password reset enforcement: `resetPassword()` validates password complexity, locks the reset token row with `FOR UPDATE`, revokes active sessions on success, and resets failed login counters before returning success.
- Locked account policy: `login()` blocks user access when the account is locked and triggers a 15-minute lockout after 5 consecutive invalid attempts.
- Guest restrictions: guest users are blocked from password recovery and onboarding updates, while normal signed-in users remain unaffected.
- Bounded rate limiter: stale request buckets are evicted aggressively to prevent unbounded memory growth under high churn.

## Components
- `Backend_Solyra/src/auth/utils.ts`: Password hashing, SHA-256 token hashing, secure token generation, and JWT signing/verification.
- `Backend_Solyra/src/auth/service.ts`: `AuthService` coordinating signup, login, logout, email verification, password reset, onboarding state transitions, current-user retrieval, and public DTO sanitization.
- `Backend_Solyra/src/auth/middleware.ts`: Bearer-token validation, fail-closed secret resolution, user status checks, and bounded sliding-window rate limiting.
- `Backend_Solyra/src/index.ts`: Auth route mounting, CORS protection, rate-limited `/auth/forgot-password`, `/auth/reset-password`, `/auth/onboarding`, and safe sanitized `/auth/me` JSON responses.

## Session Lifecycle & Security
- Passwords are hashed with `bcryptjs` using a salted 10-round configuration.
- Session tokens are signed with JWT and stored as SHA-256 hashes in the `sessions` table.
- Verification and reset flows use secure random token generation and hashed token lookups.
- Requests are protected by `authenticateRequest(...)`, which verifies bearer tokens, session validity, account activity, and revocation state.

## Audit Events Tracked
- `USER_SIGNUP`
- `USER_LOGIN`
- `USER_LOGIN_FAILED`
- `USER_LOGOUT`
- `EMAIL_VERIFIED`

## Verification
- Backend typecheck passes with the project TypeScript configuration.
- Backend test suite passes with the hardened security regressions included.
