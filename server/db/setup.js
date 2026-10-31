const fs = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { ADMIN_EMAIL } = require('../config/admin');

async function setupDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Set it in server/.env before running npm run db:setup.');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    await client.query('BEGIN');
    const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);
    // The initial administrator is linked to an existing Firebase Auth account
    // by `npm run firebase:provision-admin`; never seed a shared demo credential.
    await client.query("DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE role = 'admin' AND email <> $1)", [ADMIN_EMAIL]);
    await client.query("UPDATE users SET role = 'customer', updated_at = NOW() WHERE role = 'admin' AND email <> $1", [ADMIN_EMAIL]);
    await client.query('COMMIT');
    console.log('Database schema is ready.');
    console.log('Provision an existing Firebase administrator with npm run firebase:provision-admin.');
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
