# P0 Authentication and Navigation Repairs
**Status:** DONE  
**Baseline Commit:** a89587d01fe28c7a86ce441048cffcf95936b176  

## Summary of Completed Repairs
1. **AuthGuard Race Condition Fix:**
   - File: `Frontend_Solyra/src/components/guards/AuthGuard.tsx`
   - Updated `AuthGuard` to check `isLoading` before evaluating `isAuthenticated`.
   - Renders a dark-themed spinner while session token verification completes, preventing premature redirect loops to `/login`.

2. **Vite Proxy Port Alignment:**
   - File: `Frontend_Solyra/vite.config.ts`
   - Updated proxy target for `/auth` and `/api` from port `3001` to `4000` to match the backend's default `BACKEND_PORT=4000`.

3. **Authentication Contract Alignment:**
   - File: `Backend_Solyra/src/auth/service.ts`
   - Updated `AuthService.login()` to return `{ token, user: safeUser, session }` rather than omitting the user object.
   - Satisfies `AuthContext.tsx` (`const { user: authedUser, token } = response.data`), ensuring user profile hydration succeeds upon login.

4. **UI Header Deduplication:**
   - File: `Frontend_Solyra/src/App.tsx`
   - Extracted `<Route path="/" element={<LandingPage />} />` outside of `<Route element={<ShellLayout />} >`.
   - Eliminates the double-header bug on the landing page while preserving `ShellLayout` navigation for all other public and protected routes.

5. **Sessions Schema Definition:**
   - File: `Backend_Solyra/src/persistence/postgres/schema.sql`
   - Added DDL for `public.sessions` table with UUID foreign keys, token hashes, and indexes matching `session.repository.ts`.
