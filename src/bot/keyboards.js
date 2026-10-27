'use strict';

/**
 * Inline keyboard builders — centralised so all keyboards are consistent.
 * Returns grammy InlineKeyboard-compatible arrays (array of button rows).
 */

const { InlineKeyboard } = require('grammy');
const { COMMON_TIMEZONES } = require('../utils/timezone');
const config = require('../config/index');

// ─── Registration Keyboards ────────────────────────────────────────────────

/** Welcome / start screen */
function buildWelcomeKeyboard() {
  return new InlineKeyboard().text('📝 Register Now', 'reg:start');
}

/** Confirm-name step */
function buildConfirmNameKeyboard() {
  return new InlineKeyboard()
    .text('✅ Keep my name', 'reg:keep_name')
    .text('✏️ Change name', 'reg:change_name');
}

/** Timezone picker — common zones + manual entry option */
function buildTimezoneKeyboard() {
  const kb = new InlineKeyboard();
  COMMON_TIMEZONES.forEach((tz, idx) => {
    kb.text(tz.label, `reg:tz:${tz.value}`);
    if ((idx + 1) % 2 === 0) kb.row();
  });
  kb.row().text('⌨️ Type a city / IANA zone', 'reg:tz:manual');
  return kb;
}

/** Summary time picker */
function buildSummaryTimeKeyboard() {
  return new InlineKeyboard()
    .text('06:00', 'reg:time:06:00')
    .text('07:00', 'reg:time:07:00')
    .text('08:00', 'reg:time:08:00')
    .row()
    .text('09:00', 'reg:time:09:00')
    .text('12:00', 'reg:time:12:00')
    .text('18:00', 'reg:time:18:00')
    .row()
    .text('⌨️ Custom time (HH:MM)', 'reg:time:custom');
}

/** Terms acceptance */
function buildTermsKeyboard() {
  return new InlineKeyboard().text('✅ I Agree', 'reg:agree');
}

// ─── Task Keyboards ────────────────────────────────────────────────────────

/**
 * Interactive Dashboard keyboard with 1-tap complete buttons for each task.
 * Updates in-place with zero spam.
 *
 * @param {Object[]} tasks
 * @param {number} page
 * @param {number} totalPages
 * @param {string} [tagFilter]
 * @returns {InlineKeyboard}
 */
function buildDashboardKeyboard(tasks, page, totalPages, tagFilter = '') {
  const kb = new InlineKeyboard();
  const tagParam = tagFilter ? `:${tagFilter}` : '';

  // 1-tap button for each task on this page
  for (const task of tasks) {
    const titleSnippet = task.title.length > 22
      ? task.title.slice(0, 20) + '…'
      : task.title;

    kb.text(`✅ #${task.id} ${titleSnippet}`, `dash:done:${task.id}:${page}${tagParam}`)
      .text('🗑️', `dash:del:${task.id}:${page}${tagParam}`)
      .row();
  }

  // Quick Action row
  kb.text('➕ Add Task', 'dash:add')
    .text('🔄 Refresh', `dash:refresh:${page}${tagParam}`);

  // Pagination if multiple pages
  if (totalPages > 1) {
    kb.row();
    if (page > 1) {
      kb.text('⬅️ Prev', `list:page:${page - 1}${tagParam}`);
    }
    kb.text(`${page} / ${totalPages}`, 'dash:noop');
    if (page < totalPages) {
      kb.text('Next ➡️', `list:page:${page + 1}${tagParam}`);
    }
  }

  return kb;
}

/**
 * Per-task action buttons shown in /list.
 * @param {number} taskId
 */
function buildTaskActionsKeyboard(taskId) {
  return new InlineKeyboard()
    .text('✅ Done', `task:done:${taskId}`)
    .text('✏️ Edit', `task:edit:${taskId}`)
    .text('🗑️ Delete', `task:delete:${taskId}`);
}

/**
 * Pagination buttons for task lists.
 * @param {number} page
 * @param {number} totalPages
 * @param {string} [filterTag]
 */
function buildPaginationKeyboard(page, totalPages, filterTag = '') {
  const kb = new InlineKeyboard();
  const tag = filterTag ? `:${filterTag}` : '';
  if (page > 1) kb.text('⬅️ Prev', `list:page:${page - 1}${tag}`);
  if (page < totalPages) kb.text('Next ➡️', `list:page:${page + 1}${tag}`);
  return kb;
}

/** Priority picker for /add */
function buildPriorityKeyboard(taskId) {
  return new InlineKeyboard()
    .text('🟢 Low', `task:priority:${taskId}:low`)
    .text('🟡 Medium', `task:priority:${taskId}:medium`)
    .text('🔴 High', `task:priority:${taskId}:high`);
}

/** Confirm delete */
function buildConfirmDeleteKeyboard(taskId) {
  return new InlineKeyboard()
    .text('🗑️ Yes, Delete', `task:delete_confirm:${taskId}`)
    .text('❌ Cancel', `task:delete_cancel:${taskId}`);
}

/** Confirm unregister options (soft vs hard delete) */
function buildConfirmUnregisterKeyboard() {
  return new InlineKeyboard()
    .text('⏸ Deactivate (Keep My Tasks)', 'unreg:soft')
    .row()
    .text('🗑️ Wipe Everything Permanently', 'unreg:hard')
    .row()
    .text('❌ Cancel', 'unreg:cancel');
}

/** Reactivate deactivated account */
function buildReactivateKeyboard() {
  return new InlineKeyboard()
    .text('🔄 Reactivate Account', 'reg:reactivate')
    .row()
    .text('🗑️ Reset & Start Fresh', 'reg:reset');
}

/** Home dashboard keyboard for registered users */
function buildHomeKeyboard() {
  return new InlineKeyboard()
    .text('📋 View Tasks', 'home:list')
    .text('➕ Add Task', 'dash:add')
    .row()
    .text('📅 Due Today', 'home:today')
    .text('📊 My Stats', 'home:stats')
    .row()
    .text('⚙️ Settings', 'home:settings')
    .text('❓ Help & Guide', 'home:help');
}

// ─── Admin Keyboards ───────────────────────────────────────────────────────

/** Admin approve/reject buttons — used in approval-mode registrations */
function buildApprovalKeyboard(chatId) {
  return new InlineKeyboard()
    .text('✅ Approve', `admin:approve:${chatId}`)
    .text('❌ Reject', `admin:reject:${chatId}`);
}

/** Admin paginate users list */
function buildAdminUsersPaginationKeyboard(page, totalPages) {
  const kb = new InlineKeyboard();
  if (page > 1) kb.text('⬅️ Prev', `admin:users:${page - 1}`);
  if (page < totalPages) kb.text('Next ➡️', `admin:users:${page + 1}`);
  return kb;
}

module.exports = {
  buildWelcomeKeyboard,
  buildConfirmNameKeyboard,
  buildTimezoneKeyboard,
  buildSummaryTimeKeyboard,
  buildTermsKeyboard,
  buildDashboardKeyboard,
  buildTaskActionsKeyboard,
  buildPaginationKeyboard,
  buildPriorityKeyboard,
  buildConfirmDeleteKeyboard,
  buildConfirmUnregisterKeyboard,
  buildReactivateKeyboard,
  buildHomeKeyboard,
  buildApprovalKeyboard,
  buildAdminUsersPaginationKeyboard,
};
