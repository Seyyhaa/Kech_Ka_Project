'use strict';

const { pool, withTransaction } = require('../config/db');

/**
 * TaskRepository — all SQL operations scoped strictly to a user_id.
 * Every query that touches tasks MUST include user_id in the WHERE clause.
 */

/**
 * Create a new task.
 * @param {Object} data
 * @param {import('pg').PoolClient} [client] - Pass in for transactions
 * @returns {Promise<Object>}
 */
async function create(data, client = pool) {
  const { userId, title, priority = 'medium', dueAt = null, recurrence = null } = data;

  const { rows } = await client.query(
    `INSERT INTO tasks (user_id, title, priority, due_at, recurrence, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())
     RETURNING *`,
    [userId, title, priority, dueAt, recurrence]
  );
  return rows[0];
}

/**
 * Find a task by id, scoped to a user.
 * @param {number} taskId
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
async function findByIdAndUserId(taskId, userId) {
  const { rows } = await pool.query(
    `SELECT t.*, COALESCE(
       json_agg(tg.name) FILTER (WHERE tg.name IS NOT NULL), '[]'
     ) AS tags
     FROM tasks t
     LEFT JOIN task_tags tt ON tt.task_id = t.id
     LEFT JOIN tags tg ON tg.id = tt.tag_id
     WHERE t.id = $1 AND t.user_id = $2 AND t.status != 'deleted'
     GROUP BY t.id`,
    [taskId, userId]
  );
  return rows[0] || null;
}

/**
 * List tasks for a user with pagination and optional tag filter.
 * @param {number} userId
 * @param {Object} opts
 * @returns {Promise<{ rows: Object[], total: number }>}
 */
async function listByUser(userId, { page = 1, pageSize = 5, tagFilter = null, status = 'pending' } = {}) {
  const offset = (page - 1) * pageSize;
  const statusFilter = status === 'all' ? `t.status != 'deleted'` : `t.status = '${status}'`;

  // 1. Data Query
  const queryParams = [userId, pageSize, offset];
  let whereExtra = '';

  if (tagFilter) {
    whereExtra = ` AND t.id IN (
      SELECT tt2.task_id FROM task_tags tt2
      JOIN tags tg2 ON tg2.id = tt2.tag_id
      WHERE tg2.user_id = $1 AND tg2.name = $4
    )`;
    queryParams.push(tagFilter.replace('#', ''));
  }

  // 2. Count Query (uses separate parameter array)
  const countParams = [userId];
  let countWhereExtra = '';
  if (tagFilter) {
    countWhereExtra = ` AND t.id IN (
      SELECT tt2.task_id FROM task_tags tt2
      JOIN tags tg2 ON tg2.id = tt2.tag_id
      WHERE tg2.user_id = $1 AND tg2.name = $2
    )`;
    countParams.push(tagFilter.replace('#', ''));
  }

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT t.*, COALESCE(
         json_agg(tg.name) FILTER (WHERE tg.name IS NOT NULL), '[]'
       ) AS tags
       FROM tasks t
       LEFT JOIN task_tags tt ON tt.task_id = t.id
       LEFT JOIN tags tg ON tg.id = tt.tag_id
       WHERE t.user_id = $1 AND ${statusFilter}${whereExtra}
       GROUP BY t.id
       ORDER BY t.due_at ASC NULLS LAST, t.created_at DESC
       LIMIT $2 OFFSET $3`,
      queryParams
    ),
    pool.query(
      `SELECT COUNT(DISTINCT t.id) AS total
       FROM tasks t
       WHERE t.user_id = $1 AND ${statusFilter}${countWhereExtra}`,
      countParams
    ),
  ]);

  return { rows, total: parseInt(countRows[0]?.total || 0, 10) };
}

/**
 * List tasks due today, scoped to a user.
 * @param {number} userId
 * @param {Date} startOfDay
 * @param {Date} endOfDay
 */
async function listTodayByUser(userId, startOfDay, endOfDay) {
  const { rows } = await pool.query(
    `SELECT t.*, COALESCE(
       json_agg(tg.name) FILTER (WHERE tg.name IS NOT NULL), '[]'
     ) AS tags
     FROM tasks t
     LEFT JOIN task_tags tt ON tt.task_id = t.id
     LEFT JOIN tags tg ON tg.id = tt.tag_id
     WHERE t.user_id = $1
       AND t.status = 'pending'
       AND t.due_at >= $2 AND t.due_at <= $3
     GROUP BY t.id
     ORDER BY t.due_at ASC`,
    [userId, startOfDay, endOfDay]
  );
  return rows;
}

/**
 * List tasks due this week, scoped to a user.
 */
async function listWeekByUser(userId, startOfWeek, endOfWeek) {
  const { rows } = await pool.query(
    `SELECT t.*, COALESCE(
       json_agg(tg.name) FILTER (WHERE tg.name IS NOT NULL), '[]'
     ) AS tags
     FROM tasks t
     LEFT JOIN task_tags tt ON tt.task_id = t.id
     LEFT JOIN tags tg ON tg.id = tt.tag_id
     WHERE t.user_id = $1
       AND t.status = 'pending'
       AND t.due_at >= $2 AND t.due_at <= $3
     GROUP BY t.id
     ORDER BY t.due_at ASC`,
    [userId, startOfWeek, endOfWeek]
  );
  return rows;
}

/**
 * Mark a task as done (scoped to user).
 * @param {number} taskId
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
async function markDone(taskId, userId) {
  const { rows } = await pool.query(
    `UPDATE tasks
     SET status = 'done', completed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status != 'deleted'
     RETURNING *`,
    [taskId, userId]
  );
  return rows[0] || null;
}

/**
 * Update task title (and optionally due_at, priority).
 * @param {number} taskId
 * @param {number} userId
 * @param {Object} updates
 * @returns {Promise<Object|null>}
 */
async function update(taskId, userId, updates) {
  const fieldMap = {
    title: 'title',
    priority: 'priority',
    dueAt: 'due_at',
    status: 'status',
    recurrence: 'recurrence',
  };
  const setParts = [];
  const values = [];
  let idx = 1;

  for (const [key, val] of Object.entries(updates)) {
    const col = fieldMap[key];
    if (col) {
      setParts.push(`${col} = $${idx}`);
      values.push(val);
      idx++;
    }
  }

  if (!setParts.length) return findByIdAndUserId(taskId, userId);
  setParts.push('updated_at = NOW()');
  values.push(taskId, userId);

  const { rows } = await pool.query(
    `UPDATE tasks SET ${setParts.join(', ')}
     WHERE id = $${idx} AND user_id = $${idx + 1} AND status != 'deleted'
     RETURNING *`,
    values
  );
  return rows[0] || null;
}

/**
 * Soft-delete a task (sets status = 'deleted').
 * @param {number} taskId
 * @param {number} userId
 */
async function softDelete(taskId, userId) {
  const { rows } = await pool.query(
    `UPDATE tasks SET status = 'deleted', updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [taskId, userId]
  );
  return rows[0] || null;
}

/**
 * Get stats for a user: pending/done counts, this-week breakdown.
 * @param {number} userId
 * @param {Date} weekStart
 * @param {Date} weekEnd
 */
async function getStats(userId, weekStart, weekEnd) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending') AS "pendingAll",
       COUNT(*) FILTER (WHERE status = 'done')    AS "doneAll",
       COUNT(*) AS "totalAll",
       COUNT(*) FILTER (WHERE status = 'pending' AND created_at >= $2 AND created_at <= $3) AS "pendingThisWeek",
       COUNT(*) FILTER (WHERE status = 'done' AND completed_at >= $2 AND completed_at <= $3) AS "doneThisWeek",
       COUNT(*) FILTER (WHERE created_at >= $2 AND created_at <= $3) AS "totalThisWeek"
     FROM tasks
     WHERE user_id = $1 AND status != 'deleted'`,
    [userId, weekStart, weekEnd]
  );
  return rows[0];
}

/**
 * Get total task stats for admin panel.
 */
async function getAdminTaskStats() {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status != 'deleted') AS "totalTasks",
      COUNT(*) FILTER (WHERE status = 'done')     AS "completedTasks"
    FROM tasks
  `);
  return rows[0];
}

/**
 * Ensure or get a tag for a user. Returns the tag id.
 * @param {number} userId
 * @param {string} name
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<number>} tagId
 */
async function upsertTag(userId, name, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO tags (user_id, name) VALUES ($1, $2)
     ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [userId, name.toLowerCase()]
  );
  return rows[0].id;
}

/**
 * Link a tag to a task.
 * @param {number} taskId
 * @param {number} tagId
 * @param {import('pg').PoolClient} [client]
 */
async function linkTag(taskId, tagId, client = pool) {
  await client.query(
    `INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [taskId, tagId]
  );
}

/**
 * Save tags for a task inside a transaction.
 * @param {number} taskId
 * @param {number} userId
 * @param {string[]} tagNames  - Array of tag names without '#'
 */
async function saveTags(taskId, userId, tagNames) {
  if (!tagNames || !tagNames.length) return;
  await withTransaction(async (client) => {
    for (const name of tagNames) {
      const tagId = await upsertTag(userId, name, client);
      await linkTag(taskId, tagId, client);
    }
  });
}

module.exports = {
  create,
  findByIdAndUserId,
  listByUser,
  listTodayByUser,
  listWeekByUser,
  markDone,
  update,
  softDelete,
  getStats,
  getAdminTaskStats,
  saveTags,
};
