'use strict';

const { pool } = require('../config/db');

/**
 * PostgreSQL session storage adapter for grammy.
 * Stores conversation/session state in the bot_sessions table as JSONB.
 *
 * Compatible with grammy's LazySessionFlavor when used as a custom storage adapter.
 */
const pgSessionStorage = {
  /**
   * @param {string} key  - The session key (chat_id as string)
   * @returns {Promise<Object|undefined>}
   */
  async read(key) {
    const { rows } = await pool.query(
      'SELECT data FROM bot_sessions WHERE key = $1',
      [key]
    );
    return rows[0]?.data ?? undefined;
  },

  /**
   * @param {string} key
   * @param {Object} value
   */
  async write(key, value) {
    await pool.query(
      `INSERT INTO bot_sessions (key, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE
         SET data = $2, updated_at = NOW()`,
      [key, JSON.stringify(value)]
    );
  },

  /**
   * @param {string} key
   */
  async delete(key) {
    await pool.query('DELETE FROM bot_sessions WHERE key = $1', [key]);
  },
};

module.exports = { pgSessionStorage };
