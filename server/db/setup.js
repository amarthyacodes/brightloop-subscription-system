const fs = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function setupDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Set it in server/.env before running npm run db:setup.');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    await client.query('BEGIN');
    const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
    const seed = await fs.readFile(path.join(__dirname, 'seed.sql'), 'utf8');
    await client.query(schema);
    await client.query(seed);
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.ADMIN_EMAIL.trim())) {
        throw new Error('ADMIN_EMAIL must be a valid email address.');
      }
      if (
        adminPassword.length < 8 ||
        Buffer.byteLength(adminPassword, 'utf8') > 72 ||
        /change.?me|replace/i.test(adminPassword) ||
        !/[A-Z]/.test(adminPassword) ||
        !/[a-z]/.test(adminPassword) ||
        !/[^A-Za-z0-9]/.test(adminPassword)
      ) {
        throw new Error('ADMIN_PASSWORD must be at least 8 characters and include uppercase, lowercase, and a symbol.');
      }
      const name = process.env.ADMIN_NAME || 'Brightloop Admin';
      await client.query(
        "UPDATE users SET name = $1, email = lower(trim($2)), password_hash = crypt($3, gen_salt('bf', 12)), is_active = TRUE, updated_at = NOW() WHERE email = 'admin@brightloop.example' AND role = 'admin' AND email <> lower(trim($2)) AND NOT EXISTS (SELECT 1 FROM users WHERE email = lower(trim($2)))",
        [name, process.env.ADMIN_EMAIL, adminPassword]
      );
      const admin = await client.query(
        "INSERT INTO users (name, email, password_hash, role) VALUES ($1, lower(trim($2)), crypt($3, gen_salt('bf', 12)), 'admin') ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, is_active = TRUE, updated_at = NOW() WHERE users.role = 'admin' RETURNING id",
        [name, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD]
      );
      if (!admin.rowCount) throw new Error('ADMIN_EMAIL already belongs to a non-admin account. Choose a different address.');
      await client.query('DELETE FROM user_sessions WHERE user_id = $1', [admin.rows[0].id]);
    } else {
      throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required to create the initial admin account.');
    }
    await client.query('COMMIT');
    console.log('Database schema and seed data are ready.');
    console.log(`Admin account is ready for ${process.env.ADMIN_EMAIL}.`);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The connection may not have reached the transaction.
    }
    console.error('Database setup failed:', error.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

setupDatabase();
