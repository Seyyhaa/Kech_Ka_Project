'use strict';

const { Pool } = require('pg');
const config = require('./index');
const logger = require('../utils/logger');

const isSslNeeded =
  config.isProduction ||
  (config.databaseUrl &&
    (config.databaseUrl.includes('sslmode=require') ||
      config.databaseUrl.includes('neon.tech') ||
      config.databaseUrl.includes('supabase')));

/**
 * Singleton pg.Pool — shared across all repositories.
 * Max pool size tuned for typical single-process deployment;
 * adjust via DATABASE_POOL_SIZE env var for high-traffic scenarios.
 */
const pool = new Pool({
  connectionString: config.databaseUrl,
  max: parseInt(process.env.DATABASE_POOL_SIZE || '10', 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: isSslNeeded ? { rejectUnauthorized: false } : false,
  // Enforce UTC at the session level so all timestamps are stored/read in UTC
  options: '-c timezone=UTC',
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected idle pg client error');
});

pool.on('connect', () => {
  logger.debug('New pg client connected');
});

/**
 * Ping the database — used by the /health endpoint.
 * @returns {Promise<boolean>}
 */
async function checkDatabaseHealth() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    return true;
  } finally {
    client.release();
  }
}

/**
 * Run a function inside a serializable transaction.
 * The callback receives a pg.PoolClient; don't release it manually.
 *
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Gracefully shut down the pool (called on SIGTERM).
 */
async function closePool() {
  logger.info('Closing pg pool...');
  await pool.end();
  logger.info('pg pool closed');
}

module.exports = { pool, checkDatabaseHealth, withTransaction, closePool };
