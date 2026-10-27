#!/usr/bin/env node
/**
 * Database migration runner.
 * Reads all .sql files from src/db/migrations/ in alphabetical order
 * and applies any that haven't been run yet (tracked in schema_migrations table).
 *
 * Usage: npm run migrate
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const dbUrl = process.env.DATABASE_URL || '';
const isSsl =
  process.env.NODE_ENV === 'production' ||
  dbUrl.includes('sslmode=require') ||
  dbUrl.includes('neon.tech') ||
  dbUrl.includes('supabase');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: isSsl ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const client = await pool.connect();
  try {
    // Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, 'src', 'db', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let applied = 0;
    for (const file of files) {
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1', [file]
      );
      if (rows.length) {
        console.log(`  ⏭  Already applied: ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  ✅ Applied: ${file}`);
      applied++;
    }

    if (applied === 0) {
      console.log('\n✅ Database is already up to date.');
    } else {
      console.log(`\n✅ Applied ${applied} migration(s).`);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
