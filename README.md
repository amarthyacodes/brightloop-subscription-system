# Brightloop

Brightloop is a subscription management application with a React client, an Express API, and PostgreSQL. Email/password sign-in and customer registration use Firebase Authentication. The API verifies Firebase ID tokens, maps identities to Brightloop accounts, and continues to enforce roles through HTTP-only session cookies. Roles are assigned by the API and are never chosen in the client.

## Requirements

- Node.js 20.19+ (Vite 8 requirement)
- PostgreSQL with the `pgcrypto` extension available

## Configure and start

1. Create a PostgreSQL database (the default name is `brightloop`).
2. In the Firebase console for `brightloop-fcc62`, enable **Authentication → Sign-in method → Email/Password** and add the client’s deployed domain to **Authorized domains**. The web app configuration is in `client/src/firebase.js` and can be overridden with `VITE_FIREBASE_*` variables.
3. Copy `server/.env.example` to `server/.env`. Set `DATABASE_URL`, a private random `JWT_SECRET` with at least 32 characters, and a unique strong `ADMIN_PASSWORD`. Set `ADMIN_EMAIL` and optionally `ADMIN_NAME` for the initial administrator. Configure Firebase Admin credentials using `GOOGLE_APPLICATION_CREDENTIALS` pointing to a service account JSON file outside the repository, or use Application Default Credentials. Never commit credentials or `server/.env`.
4. In `server`, run `npm install` and `npm run db:setup`. This applies the schema, creates or updates the configured admin credentials, and seeds the subscription catalog. Existing user and subscription data are retained.
5. Start the API in `server` with `npm run dev`.
6. In `client`, run `npm install` and `npm run dev`, then open `http://localhost:5173`.

The Vite development server proxies `/api` to `http://localhost:3000`. For deployment, configure the web server to serve the client SPA and proxy `/api` to the API. Set `CLIENT_ORIGIN` to the exact client origin and `COOKIE_SECURE=true` when using HTTPS.

## Authentication flows

- Sign in at `/login` with a verified Firebase email/password account. The API verifies the Firebase token, resolves the account role, and redirects to the matching dashboard.
- Customers register at `/signup`. Firebase sends an email verification link; after verification and sign-in, the API creates the Brightloop account with the `customer` role. Verified Firebase emails matching existing Brightloop users keep their existing API-assigned role.
- Only an authenticated admin can create staff invitations in **Staff management**. The invitation is tied to the email, expires after seven days, and can be used once at `/signup/staff?token=...`. The link is emailed when SMTP is configured; otherwise it is shown to the admin and logged by the API.
- Admins can activate or deactivate staff. Deactivated accounts cannot sign in, and their existing sessions are rejected.
- Password reset is available at `/forgot-password` and is delivered by Firebase Authentication.
- Sign out revokes the current server session. Session cookies are HTTP-only, SameSite Strict, and Secure in production. “Remember me” selects a 30-day session; otherwise the session lifetime uses `JWT_EXPIRES_IN` (default `8h`).

New passwords entered in Brightloop require at least eight characters with uppercase, lowercase, and a special character. Firebase manages customer credentials. Invitation tokens are stored as SHA-256 hashes.

## API

- `POST /api/auth/signup` — create a customer account
- `POST /api/auth/signup/staff` — complete an email-matched staff invitation
- `POST /api/auth/firebase-session` exchanges a verified Firebase ID token for a Brightloop session
- `POST /api/auth/login` (legacy), `POST /api/auth/logout`, `GET /api/auth/me`
- `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- Admin only: `GET /api/users/staff`, `POST /api/users/staff/invitations`, `PATCH /api/users/staff/:id/status`
- `GET /api/health`

Role checks and active-account checks run on the API for protected data. Client route guards improve navigation but are not treated as a security boundary.

## Configuration

See `server/.env.example` for database, admin, session, client origin, and optional SMTP settings. Generate a real JWT secret locally, for example with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`, and replace all example values before use.
