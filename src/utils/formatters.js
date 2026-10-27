'use strict';

/**
 * Message formatters — convert database objects to Telegram-friendly text.
 * Using HTML parse mode throughout (safer than MarkdownV2 for user input).
 */

const { formatDateTime, formatRelative } = require('./dateParser');

// Priority emoji map
const PRIORITY_EMOJI = {
  low: '🟢',
  medium: '🟡',
  high: '🔴',
};

// Status emoji map
const STATUS_EMOJI = {
  pending: '⏳',
  in_progress: '🔄',
  done: '✅',
  deleted: '🗑️',
};

// Recurrence labels
const RECURRENCE_LABEL = {
  daily: '🔁 Daily',
  weekly: '🔁 Weekly',
  monthly: '🔁 Monthly',
};

/**
 * Escape HTML special characters in user-supplied text.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format a single task for display.
 *
 * @param {Object} task
 * @param {string} timezone
 * @returns {string} HTML-formatted task entry
 */
function formatTask(task, timezone = 'UTC') {
  const priority = PRIORITY_EMOJI[task.priority] || '🟡';
  const status = STATUS_EMOJI[task.status] || '⏳';
  const due = task.due_at
    ? `\n   📅 <i>${formatDateTime(task.due_at, timezone)}</i> (${formatRelative(task.due_at, timezone)})`
    : '';
  const tags =
    task.tags && task.tags.length
      ? `\n   🏷️ ${task.tags.map((t) => `#${escapeHtml(t)}`).join(' ')}`
      : '';
  const recurrence = task.recurrence
    ? `\n   ${RECURRENCE_LABEL[task.recurrence]}`
    : '';

  return (
    `${status} ${priority} <b>#${task.id}</b> ${escapeHtml(task.title)}` +
    due +
    tags +
    recurrence
  );
}

/**
 * Format a paginated task list.
 *
 * @param {Object[]} tasks
 * @param {number} total
 * @param {number} page
 * @param {number} pageSize
 * @param {string} timezone
 * @returns {string}
 */
function formatTaskList(tasks, total, page, pageSize, timezone = 'UTC') {
  if (!tasks.length) {
    return (
      '🎉 <b>All caught up!</b>\n\n' +
      'You have no pending tasks right now.\n' +
      'Tap <b>➕ Add Task</b> below or type <code>/add</code> to create one!'
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const header = `📋 <b>Task Dashboard</b> (${total} pending • Page ${page}/${totalPages})\n`;
  const body = tasks.map((t) => formatTask(t, timezone)).join('\n\n');
  const footer = '\n\n💡 <i>Tap a button below to complete (✅) or delete (🗑️)</i>';
  return header + '\n' + body + footer;
}

/**
 * Format user profile.
 *
 * @param {Object} user
 * @param {Object} stats - { pending, done }
 * @returns {string}
 */
function formatProfile(user, stats) {
  return (
    `👤 <b>Your Profile</b>\n\n` +
    `📛 Name: <b>${escapeHtml(user.display_name)}</b>\n` +
    `🌍 Timezone: <code>${user.timezone}</code>\n` +
    `⏰ Daily summary: <code>${user.summary_time}</code>\n` +
    `📅 Registered: <i>${new Date(user.registered_at).toDateString()}</i>\n` +
    `🔖 Status: <b>${user.status}</b>\n\n` +
    `📊 <b>Task Stats</b>\n` +
    `  ⏳ Pending: ${stats.pending}\n` +
    `  ✅ Completed: ${stats.done}`
  );
}

/**
 * Format admin stats.
 *
 * @param {Object} stats
 * @returns {string}
 */
function formatAdminStats(stats) {
  return (
    `📊 <b>Bot Statistics</b>\n\n` +
    `👥 Total users: <b>${stats.totalUsers}</b>\n` +
    `✅ Active users: <b>${stats.activeUsers}</b>\n` +
    `⏳ Pending approval: <b>${stats.pendingUsers}</b>\n` +
    `🚫 Blocked users: <b>${stats.blockedUsers}</b>\n\n` +
    `📋 Total tasks: <b>${stats.totalTasks}</b>\n` +
    `✔️ Completed tasks: <b>${stats.completedTasks}</b>`
  );
}

/**
 * Format the weekly stats for a user.
 */
function formatWeeklyStats(stats) {
  const completionRate =
    stats.totalThisWeek > 0
      ? Math.round((stats.doneThisWeek / stats.totalThisWeek) * 100)
      : 0;

  return (
    `📊 <b>Your Week in Review</b>\n\n` +
    `📋 Tasks this week: <b>${stats.totalThisWeek}</b>\n` +
    `✅ Completed: <b>${stats.doneThisWeek}</b>\n` +
    `⏳ Pending: <b>${stats.pendingThisWeek}</b>\n` +
    `🔥 Completion rate: <b>${completionRate}%</b>\n\n` +
    `📦 All time:\n` +
    `  Total: <b>${stats.totalAll}</b> | Done: <b>${stats.doneAll}</b>`
  );
}

module.exports = {
  escapeHtml,
  formatTask,
  formatTaskList,
  formatProfile,
  formatAdminStats,
  formatWeeklyStats,
  PRIORITY_EMOJI,
  STATUS_EMOJI,
};
