# Frontend Layout Architecture

## Overview
The Solyra frontend utilizes a separated layout model to decouple unauthenticated public marketing/landing pages from authenticated enterprise application pages.

## Layout Components

### 1. PublicLayout (src/components/layout/PublicLayout.tsx)
- **Target Audience:** Unauthenticated visitors.
- **Used by Routes:** /, /login, /signup, /contact, /pricing, /docs.
- **Key Features:**
  - Independent marketing navigation header with Solyra brand logo and quick access to Sign In and Get Started.
  - Responsive mobile drawer menu for navigation on compact viewports.
  - Renders child routes via <Outlet />.
  - Does NOT show application-level workspace switcher, user profile dropdowns, or authenticated controls.

### 2. ShellLayout (src/components/layout/ShellLayout.tsx)
- **Target Audience:** Authenticated workspace users.
- **Used by Routes:** Nested under <Route element={<AuthGuard><ShellLayout /></AuthGuard>}>.
- **Key Features:**
  - Comprehensive enterprise application header and workspace navigation bar.
  - Active workspace context switcher, notifications panel, user menu, settings, and administration links.
  - Direct links to /chat, /dashboard, /profile, /settings, and workspace subroutes.

### 3. Standalone Route: /chat
- The chat interface is rendered as a focused, standalone top-level route wrapped in <AuthGuard>:
  `	sx
  <Route
    path="/chat"
    element={
      <AuthGuard>
        <ChatWorkspacePage />
      </AuthGuard>
    }
  />
  `
  This allows the AI agent workspace to utilize full viewport dimensions while maintaining authentication enforcement.