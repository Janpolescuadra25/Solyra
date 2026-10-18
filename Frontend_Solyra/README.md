# Frontend Solyra (Web Application)

Client application for the Solyra Autonomous Enterprise System.

## Architecture
- **Framework:** React 18, Vite, TypeScript
- **Styling:** TailwindCSS
- **Routing:** React Router v6 with Auth Guards and Tier-based Navigation (Guest, Member, Owner)
- **Layout:** Header-based navigation shell with dynamic tier badge and user profile display
- **API Client:** Axios with bearer token injection and 401 interceptors
- **Authentication:** Integrated `/auth/*` endpoints with interactive forms, client-side validation, error handling, and resumable onboarding wizard.

## Status
- **Step 4: Frontend Application Foundation & Routing:** DONE (Commit `1d5151bd6caa752cbbb43ee45e55994a893aa4a4`)
- **Step 5: User Authentication & Resumable Onboarding UI:** DONE
