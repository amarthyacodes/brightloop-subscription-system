# Brightloop subscription system

## Run the API

Requirements: Node.js and PostgreSQL.

1. Create a PostgreSQL database named `brightloop` (or update `DATABASE_URL`).
2. In `server`, copy `.env.example` to `.env` and set `DATABASE_URL` and a private, random `JWT_SECRET`.
3. From `server`, run:

   ```powershell
   npm install
   npm run db:setup
   npm run dev
   ```

   The API listens at `http://localhost:3000`. The setup script creates the schema and a demo administrator: `admin@brightloop.example` / `Admin123!`.

Password reset emails use SMTP when `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` are all set in `server/.env`. Otherwise the reset link appears in the server console. `APP_BASE_URL` sets the link destination.

## API examples (PowerShell)

Run these from PowerShell. `$base` is the API URL. To inspect responses, use `Invoke-RestMethod`; the login response contains the bearer token used below.

```powershell
$base = 'http://localhost:3000'

# Signup (creates a customer)
Invoke-RestMethod -Method Post "$base/api/auth/signup" -ContentType 'application/json' -Body (@{name='Jamie Customer'; email='jamie@example.com'; password='StrongPass!9'} | ConvertTo-Json)

# Login (replace with an account and password that exist)
$login = Invoke-RestMethod -Method Post "$base/api/auth/login" -ContentType 'application/json' -Body (@{email='admin@brightloop.example'; password='Admin123!'} | ConvertTo-Json)
$token = $login.token

# Current logged-in user
Invoke-RestMethod -Method Get "$base/api/auth/me" -Headers @{Authorization="Bearer $token"}

# Request reset link (same response for registered and unknown addresses)
Invoke-RestMethod -Method Post "$base/api/auth/forgot-password" -ContentType 'application/json' -Body (@{email='jamie@example.com'} | ConvertTo-Json)

# Reset password: paste the token from the email or server console
$resetToken = 'PASTE_RESET_TOKEN_HERE'
Invoke-RestMethod -Method Post "$base/api/auth/reset-password" -ContentType 'application/json' -Body (@{token=$resetToken; password='NewStrong!9'} | ConvertTo-Json)

# Create staff (admin token required)
Invoke-RestMethod -Method Post "$base/api/users/staff" -Headers @{Authorization="Bearer $token"} -ContentType 'application/json' -Body (@{name='Taylor Staff'; email='taylor@example.com'; password='StrongPass!9'} | ConvertTo-Json)
```

Signup and staff creation return `409` for a duplicate email. Passwords must be longer than 8 characters and contain uppercase, lowercase, and special characters. The reset link token expires after one hour and can be used once.
