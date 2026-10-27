'use strict';

const { pool } = require('../config/db');

/**
 * UserRepository — raw SQL queries for the users table.
 * All queries are parameterized; never interpolate user input into SQL.
 */

/**
 * Find a user record by Telegram chat_id.
 * @param {number} chatId
 * @returns {Promise<Object|null>}
 */
async function findByChatId(chatId) {
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE chat_id = $1 LIMIT 1',
    [chatId]
  );
  return rows[0] || null;
}

/**
 * Find a user record by internal id.
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
async function findById(id) {
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE id = $1 LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

/**
 * Create a new user record.
 * @param {Object} data
 * @returns {Promise<Object>} Created user
 */
async function create(data) {
  const {
    chatId,
    telegramUsername,
    displayName,
    status,
    role = 'user',
    timezone,
    summaryTime,
    termsAcceptedAt,
    registeredAt,
  } = data;

  const { rows } = await pool.query(
    `INSERT INTO users
       (chat_id, telegram_username, display_name, status, role,
        timezone, summary_time, terms_accepted_at, registered_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
     ON CONFLICT (chat_id) DO UPDATE
       SET telegram_username = EXCLUDED.telegram_username,
           display_name = EXCLUDED.display_name,
           status = EXCLUDED.status,
           timezone = EXCLUDED.timezone,
           summary_time = EXCLUDED.summary_time,
           terms_accepted_at = EXCLUDED.terms_accepted_at,
           registered_at = COALESCE(users.registered_at, EXCLUDED.registered_at),
           updated_at = NOW()
     RETURNING *`,
    [
      chatId,
      telegramUsername,
      displayName,
      status,
      role,
      timezone,
      summaryTime,
      termsAcceptedAt,
      registeredAt,
    ]
  );
  return rows[0];
}

/**
 * Update user fields by chat_id.
 * Only the fields provided in `updates` are changed.
 * @param {number} chatId
 * @param {Object} updates - e.g. { displayName, timezone, summaryTime, status }
 * @returns {Promise<Object>}
 */
async function updateByChatId(chatId, updates) {
  const allowed = [
    'display_name',
    'telegram_username',
    'status',
    'timezone',
    'summary_time',
    'terms_accepted_at',
    'registered_at',
    'role',
  ];

  // Map camelCase to snake_case
  const fieldMap = {
    displayName: 'display_name',
    telegramUsername: 'telegram_username',
    status: 'status',
    timezone: 'timezone',
    summaryTime: 'summary_time',
    termsAcceptedAt: 'terms_accepted_at',
    registeredAt: 'registered_at',
    role: 'role',
  };

  const setParts = [];
  const values = [];
  let idx = 1;

  for (const [key, val] of Object.entries(updates)) {
    const col = fieldMap[key];
    if (col && allowed.includes(col)) {
      setParts.push(`${col} = $${idx}`);
      values.push(val);
      idx++;
    }
  }

  if (!setParts.length) return findByChatId(chatId);

  setParts.push(`updated_at = NOW()`);
  values.push(chatId);

  const { rows } = await pool.query(
    `UPDATE users SET ${setParts.join(', ')} WHERE chat_id = $${idx} RETURNING *`,
    values
  );
  return rows[0];
}

/**
 * Soft delete a user by setting status to 'unregistered' and canceling unsent reminders.
 * Keeps user record, tasks, and tags intact so they can be reactivated on /start.
 *
 * @param {number} chatId
 */
async function softDeleteByChatId(chatId) {
  // 1. Mark user status as unregistered
  const { rows } = await pool.query(
    `UPDATE users SET status = 'unregistered', updated_at = NOW() WHERE chat_id = $1 RETURNING id`,
    [chatId]
  );
  const userId = rows[0]?.id;

  // 2. Cancel future unsent reminders for this user
  if (userId) {
    await pool.query(
      `DELETE FROM reminders r
       USING tasks t
       WHERE r.task_id = t.id AND t.user_id = $1 AND r.sent = FALSE`,
      [userId]
    );
  }

  // 3. Clear active session state
  await pool.query('DELETE FROM bot_sessions WHERE key = $1', [String(chatId)]);
}

/**
 * Reactivate an unregistered/deactivated user.
 *
 * @param {number} chatId
 * @returns {Promise<Object>} Reactivated user record
 */
async function reactivateByChatId(chatId) {
  const { rows } = await pool.query(
    `UPDATE users SET status = 'active', updated_at = NOW() WHERE chat_id = $1 RETURNING *`,
    [chatId]
  );
  return rows[0];
}

/**
 * Permanently delete a user and all cascaded data (tasks, reminders, tags, sessions).
 * @param {number} chatId
 */
async function deleteByChatId(chatId) {
  await pool.query('DELETE FROM users WHERE chat_id = $1', [chatId]);
  // Session cleanup
  await pool.query('DELETE FROM bot_sessions WHERE key = $1', [String(chatId)]);
}

/**
 * Paginated list of all users for admin view.
 * @param {number} page
 * @param {number} pageSize
 * @returns {Promise<{ rows: Object[], total: number }>}
 */
async function listAll(page, pageSize) {
  const offset = (page - 1) * pageSize;
  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT id, chat_id, telegram_username, display_name, status, role, created_at
       FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    ),
    pool.query('SELECT COUNT(*) AS total FROM users'),
  ]);
  return { rows, total: parseInt(countRows[0].total, 10) };
}

/**
 * Get aggregate stats for admin.
 */
async function getAdminStats() {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)                                       AS "totalUsers",
      COUNT(*) FILTER (WHERE status = 'active')      AS "activeUsers",
      COUNT(*) FILTER (WHERE status = 'pending')     AS "pendingUsers",
      COUNT(*) FILTER (WHERE status = 'blocked')     AS "blockedUsers"
    FROM users
  `);
  return rows[0];
}

/**
 * Fetch all active users with their timezone and summary_time.
 * Used by the daily summary cron job.
 */
async function getActiveSummaryUsers() {
  const { rows } = await pool.query(
    `SELECT id, chat_id, display_name, timezone, summary_time
     FROM users WHERE status = 'active'`
  );
  return rows;
}

module.exports = {
  findByChatId,
  findById,
  create,
  updateByChatId,
  softDeleteByChatId,
  reactivateByChatId,
  deleteByChatId,
  listAll,
  getAdminStats,
  getActiveSummaryUsers,
};
