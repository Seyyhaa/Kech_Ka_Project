'use strict';

const { pool } = require('../config/db');

/**
 * InviteCodeRepository — CRUD for the invite_codes table.
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Generate a unique invite code.
 * @param {number} createdByChatId
 * @param {Object} opts - { maxUses, expiresAt }
 * @returns {Promise<Object>}
 */
async function create(createdByChatId, { maxUses = 1, expiresAt = null } = {}) {
  const code = uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase();
  const { rows } = await pool.query(
    `INSERT INTO invite_codes (code, created_by, max_uses, expires_at, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING *`,
    [code, createdByChatId, maxUses, expiresAt]
  );
  return rows[0];
}

/**
 * Find a valid (not exhausted, not expired) invite code.
 * @param {string} code
 * @returns {Promise<Object|null>}
 */
async function findValid(code) {
  const { rows } = await pool.query(
    `SELECT * FROM invite_codes
     WHERE code = $1
       AND used_count < max_uses
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [code.toUpperCase()]
  );
  return rows[0] || null;
}

/**
 * Increment the used_count for an invite code.
 * @param {string} code
 */
async function markUsed(code) {
  await pool.query(
    'UPDATE invite_codes SET used_count = used_count + 1 WHERE code = $1',
    [code.toUpperCase()]
  );
}

module.exports = { create, findValid, markUsed };
