# Frontend_Solyra (@solyra/frontend)

## ✅ STATUS: DONE (Step 4: Frontend Application Foundation & Routing)

This frontend foundation establishes the React Router v6 shell, TailwindCSS v3 styling layer, 3-tier session model, and unified Axios client required by the Solyra guest-first user experience.

### Architecture
- React 19 + TypeScript + Vite app shell
- TailwindCSS v3 with PostCSS and Autoprefixer
- Route hierarchy for public, member, and owner/admin flows
- Auth context with `guest`, `member`, and `owner` tiers
- Session tokens stored in `sessionStorage` for safer browser session isolation
- Axios API client with Authorization header injection and automatic 401 cleanup

### Route Hierarchy
- Public / Guest: `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`
- Protected Member: `/dashboard`, `/settings`, `/onboarding`
- Protected Owner/Admin: `/owner`

### Security Model
- Tokens are kept in `sessionStorage` and cleared on sign out or 401 responses.
- Protected routes are enforced through `AuthGuard` and `OwnerGuard` wrappers.
- Guest-first landing flows remain available without forced registration.

### Step 5 Connection Point
Step 5 UI work will hook actual authentication and chat actions into this foundation by connecting the verified `/auth/*` endpoints and conversation workspace components to the existing router and session state.
