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
    await client.query('COMMIT');
    console.log('Database schema and seed data are ready.');
    console.log('Demo admin: admin@brightloop.example / Admin123!');
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
