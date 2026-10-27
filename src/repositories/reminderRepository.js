'use strict';

const { pool } = require('../config/db');

/**
 * ReminderRepository — queries for the reminders table.
 */

/**
 * Create a reminder for a task.
 * @param {number} taskId
 * @param {Date} remindAt  - UTC datetime
 * @returns {Promise<Object>}
 */
async function create(taskId, remindAt) {
  const { rows } = await pool.query(
    `INSERT INTO reminders (task_id, remind_at, sent, created_at)
     VALUES ($1, $2, FALSE, NOW())
     RETURNING *`,
    [taskId, remindAt]
  );
  return rows[0];
}

/**
 * Find all due (unsent) reminders, locking them to prevent double-delivery.
 * Uses FOR UPDATE SKIP LOCKED so multiple cron workers don't collide.
 * @param {import('pg').PoolClient} client - Must be inside a transaction
 * @returns {Promise<Object[]>}
 */
async function getDueAndLock(client) {
  const { rows } = await client.query(
    `SELECT r.*, t.title AS task_title, t.user_id,
            u.chat_id, u.display_name, u.timezone
     FROM reminders r
     JOIN tasks t   ON t.id = r.task_id   AND t.status != 'deleted'
     JOIN users u   ON u.id = t.user_id   AND u.status = 'active'
     WHERE r.remind_at <= NOW() AND r.sent = FALSE
     FOR UPDATE OF r SKIP LOCKED`
  );
  return rows;
}

/**
 * Mark a reminder as sent.
 * @param {number} reminderId
 * @param {import('pg').PoolClient} client
 */
async function markSent(reminderId, client) {
  await client.query(
    'UPDATE reminders SET sent = TRUE WHERE id = $1',
    [reminderId]
  );
}

/**
 * Delete all future reminders for a task (e.g., when task is deleted/done).
 * @param {number} taskId
 */
async function deleteByTaskId(taskId) {
  await pool.query(
    'DELETE FROM reminders WHERE task_id = $1 AND sent = FALSE',
    [taskId]
  );
}

module.exports = { create, getDueAndLock, markSent, deleteByTaskId };
