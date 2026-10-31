# Brightloop

Brightloop is a React subscription management app. Firebase Authentication handles sign-in, Firestore stores profiles and business records, and the Express API uses Firebase Admin to verify identities and assign trusted role claims. PostgreSQL remains the server's account/session registry and stores one-use staff invitation token hashes; it is not the dashboard business-data store.

## Configure the existing Firebase project

The client already points to Firebase project `brightloop-fcc62`. No second Firebase app or project is created by this repository.

1. In Firebase Console for `brightloop-fcc62`, enable **Authentication → Sign-in method → Email/Password** and configure the authorized domains.
2. Create or enable the project's **Cloud Firestore** database.
3. Configure Firebase Admin credentials for the API with Application Default Credentials or `GOOGLE_APPLICATION_CREDENTIALS` pointing to a service-account JSON file stored outside this repository. Never commit service-account credentials.
4. Copy `server/.env.example` to `server/.env`. Set `DATABASE_URL`, a private random `JWT_SECRET` of at least 32 characters, and `FIREBASE_PROJECT_ID=brightloop-fcc62`. Firebase Authentication owns account passwords; the API does not store an Admin password.
5. From `server`, install dependencies and initialize the PostgreSQL account/session schema:

   ```powershell
   npm install
   npm run db:setup
   ```

6. Set `ADMIN_EMAIL=amarthyavr@gmail.com` in `server/.env`, create and verify that account in Firebase Authentication, and set its password there to the account password you provided. Then provision the Admin role:

   ```powershell
   npm run firebase:provision-admin
   ```

   This command checks for the configured email in Firebase Authentication and, when verified, assigns its trusted Admin role without changing its password. If it does not exist, create and verify it in Firebase Console, set the password there, and rerun the command. Firebase Admin credentials are required for provisioning.

7. Start the API from `server` with `npm run dev`.
8. From `client`, run `npm install` and `npm run dev`, then open `http://localhost:5173`.

## Firestore deployment

The repository includes `firestore.rules`, `firestore.indexes.json`, and the scheduled `billDueSubscriptions` Cloud Function. After selecting the existing project and reviewing the rules, index, and daily billing schedule, deploy them with Firebase CLI:

```powershell
firebase deploy --only functions,firestore:rules,firestore:indexes --project brightloop-fcc62
```

The rules and scheduled function are prepared locally; they have not been deployed from this workspace. Scheduled billing runs daily at 03:15 Asia/Kolkata, processes subscriptions whose next billing date is due, and uses deterministic invoice IDs plus Firestore transactions to prevent duplicate billing. Firebase scheduled functions require the Blaze plan and Cloud Scheduler API. Business records are read and written through the Firebase client SDK except invoice creation, which runs in trusted server code so totals are calculated from Firestore product, plan, tax, and discount records. Firebase custom claims (`admin`, `staff`, `customer`) are assigned only by the server using Firebase Admin. Customer records are scoped by `customerId == Firebase UID`; profile documents use that UID as their document ID.

## Collections

- `users/{uid}` — UID, name, email, role, phone, account status, and timestamps.
- `staffInvitations/{tokenHash}` — invitation email, name, status, inviter, and expiry. The invitation token itself is not stored in Firestore; its hash is held in PostgreSQL.
- `products`, `plans`, `quotations`, `subscriptions`, `invoices`, `payments`, `discounts`, `taxes`, `notifications`, and `settings` — Firestore-backed workspace records. Related customer references use Firebase UIDs; other relationships use stable document IDs.

Firebase rules let customers read only their own profile and customer-linked records. Staff can perform daily operations on quotations, subscriptions, invoices, and payments, and read product, plan, tax, and discount data. Only Admin can manage staff invitations, products, plans, discounts, taxes, settings, and user account roles. Payment creation and invoice balance updates are checked together in a Firestore transaction. Invoice documents use a stable subscription-and-period ID to prevent duplicate billing periods.

## Authentication and roles

- All roles use the same Firebase login page; the account profile and trusted custom claim determine the dashboard.
- Customer signup uses Firebase Email/Password, verifies the email, then creates a `customer` profile through the server on first verified sign-in.
- Admin creates a Worker from Worker Management. The API creates the Firebase account, sets the trusted `staff` role and one-time password-change flag, writes the Firestore profile, and returns the generated temporary password once. Share it securely. The worker verifies the email, signs in, and must change the temporary password before Firestore access is allowed. The legacy one-use invitation flow remains available for already-issued invitations.
- After Firebase auth state changes, the app exchanges an ID token with the API, refreshes claims, loads the Firestore profile, and verifies that role and email agree before showing a dashboard. Missing or inconsistent profiles fail closed.
- Customers see their subscriptions, invoices, payments, and editable contact profile. Staff see customer, daily operations, notifications, profile, and password pages. Admin sees the complete administration workspace.
- Password reset and email verification use Firebase Authentication. SMTP is optional for staff invitation email; without SMTP, the API logs the invitation URL.

## Business operations and limits

Admin management for products, plans, customer profiles, quotations, subscriptions, invoices, discounts, payments, taxes, reports, and settings is connected to Firestore. Staff operational views and customer-owned billing views are also connected. Customer accounts are created by Firebase signup, not by adding an unlinked profile record in the Admin UI.

Admin and Staff can generate invoices manually through `POST /api/billing/invoices/generate`; the scheduled function calls the same validated billing logic for recurring invoices. Direct client invoice creation is denied by Firestore rules. No payment gateway is integrated; staff record offline payments.

## Run checks

From `client`, run `npm run build`. From `server`, run `npm test`. End-to-end Firebase checks require the existing Firebase project, Firestore enabled, configured Firebase Admin credentials, and a configured PostgreSQL database. No Firebase rules or live account changes are deployed automatically by these commands.
