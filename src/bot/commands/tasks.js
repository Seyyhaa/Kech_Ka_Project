'use strict';

const taskService = require('../../services/taskService');
const {
  buildDashboardKeyboard,
  buildTaskActionsKeyboard,
  buildPaginationKeyboard,
  buildConfirmDeleteKeyboard,
} = require('../keyboards');
const { formatTask, formatTaskList } = require('../../utils/formatters');
const config = require('../../config/index');
const logger = require('../../utils/logger');

/**
 * Register all task command handlers.
 * @param {import('grammy').Bot} bot
 */
function registerTaskHandlers(bot) {
  // ── /add <task> ──────────────────────────────────────────────────────────
  bot.command('add', async (ctx) => {
    const input = ctx.message.text.replace(/^\/add\s*/i, '').trim();
    if (!input) {
      ctx.session.step = 'awaiting_task_input';
      await ctx.reply(
        '✍️ <b>What would you like to add?</b>\n\n' +
          'Just reply with your task naturally. For example:\n' +
          '• <code>Buy groceries tomorrow 5pm #home !high</code>\n' +
          '• <code>Meeting with team next Monday 9am #work</code>\n' +
          '• <code>Water the plants @daily</code>\n' +
          '• <code>Call doctor</code>\n\n' +
          '<i>(No need to use | symbols!)</i>',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const task = await taskService.addTask(ctx.user.id, input, ctx.user.timezone);

    await ctx.reply(
      `✅ <b>Task added!</b>\n\n${formatTask(task, ctx.user.timezone)}`,
      { parse_mode: 'HTML', reply_markup: buildTaskActionsKeyboard(task.id) }
    );
  });

  // ── /list [#tag] ─────────────────────────────────────────────────────────
  bot.command('list', async (ctx) => {
    const args = ctx.message.text.replace(/^\/list\s*/i, '').trim();
    const tagFilter = args.startsWith('#') ? args.slice(1) : null;
    await sendTaskList(ctx, 1, tagFilter);
  });

  // ── /today ───────────────────────────────────────────────────────────────
  bot.command('today', async (ctx) => {
    const tasks = await taskService.listToday(ctx.user.id, ctx.user.timezone);
    if (!tasks.length) {
      await ctx.reply(
        '📭 <b>No tasks due today!</b>\n\nEnjoy your free time or add something with /add.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const text =
      `📅 <b>Today\'s Tasks</b> (${tasks.length})\n\n` +
      tasks.map((t) => formatTask(t, ctx.user.timezone)).join('\n\n');

    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // ── /week ────────────────────────────────────────────────────────────────
  bot.command('week', async (ctx) => {
    const tasks = await taskService.listWeek(ctx.user.id, ctx.user.timezone);
    if (!tasks.length) {
      await ctx.reply(
        '📭 <b>No tasks this week!</b>\n\nAdd some with /add.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const text =
      `🗓️ <b>This Week\'s Tasks</b> (${tasks.length})\n\n` +
      tasks.map((t) => formatTask(t, ctx.user.timezone)).join('\n\n');

    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // ── /done <id> ───────────────────────────────────────────────────────────
  bot.command('done', async (ctx) => {
    const idStr = ctx.message.text.replace(/^\/done\s*/i, '').trim();
    const taskId = parseInt(idStr, 10);
    if (!taskId) {
      await ctx.reply('❌ Usage: /done &lt;task_id&gt;', { parse_mode: 'HTML' });
      return;
    }

    const task = await taskService.completeTask(ctx.user.id, taskId);
    await ctx.reply(
      `✅ Task <b>#${task.id}</b> marked as done!\n<i>${task.title}</i>`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /edit <id> <new text> ────────────────────────────────────────────────
  bot.command('edit', async (ctx) => {
    const args = ctx.message.text.replace(/^\/edit\s*/i, '').trim();
    const match = args.match(/^(\d+)\s+(.+)$/s);
    if (!match) {
      await ctx.reply(
        '❌ Usage: /edit &lt;task_id&gt; &lt;new title&gt;\n' +
          'Example: /edit 3 Buy oat milk instead',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const taskId = parseInt(match[1], 10);
    const newTitle = match[2].trim();
    const task = await taskService.editTask(ctx.user.id, taskId, newTitle);
    await ctx.reply(
      `✏️ Task <b>#${task.id}</b> updated!\n<i>${task.title}</i>`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /delete <id> ─────────────────────────────────────────────────────────
  bot.command('delete', async (ctx) => {
    const idStr = ctx.message.text.replace(/^\/delete\s*/i, '').trim();
    const taskId = parseInt(idStr, 10);
    if (!taskId) {
      await ctx.reply('❌ Usage: /delete &lt;task_id&gt;', { parse_mode: 'HTML' });
      return;
    }

    // Show confirmation first
    await ctx.reply(
      `⚠️ Are you sure you want to delete task <b>#${taskId}</b>?\nThis cannot be undone.`,
      { parse_mode: 'HTML', reply_markup: buildConfirmDeleteKeyboard(taskId) }
    );
  });

  // ── /remind <id> <time> ──────────────────────────────────────────────────
  bot.command('remind', async (ctx) => {
    const args = ctx.message.text.replace(/^\/remind\s*/i, '').trim();
    const match = args.match(/^(\d+)\s+(.+)$/);
    if (!match) {
      await ctx.reply(
        '❌ Usage: /remind &lt;task_id&gt; &lt;time&gt;\n' +
          'Example: /remind 3 tomorrow 9am',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const taskId = parseInt(match[1], 10);
    const timeInput = match[2].trim();
    const { task, reminder } = await taskService.setReminder(
      ctx.user.id,
      taskId,
      timeInput,
      ctx.user.timezone
    );

    const { formatDateTime } = require('../../utils/dateParser');
    await ctx.reply(
      `⏰ <b>Reminder set!</b>\n\n` +
        `📌 Task: <i>${task.title}</i>\n` +
        `🕐 Remind at: <b>${formatDateTime(reminder.remind_at, ctx.user.timezone)}</b>`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /stats ───────────────────────────────────────────────────────────────
  bot.command('stats', async (ctx) => {
    const stats = await taskService.getStats(ctx.user.id, ctx.user.timezone);
    const { formatWeeklyStats } = require('../../utils/formatters');
    await ctx.reply(formatWeeklyStats(stats), { parse_mode: 'HTML' });
  });

  // ── Callback: Paginate /list ─────────────────────────────────────────────
  bot.callbackQuery(/^list:page:(\d+)(?::(.+))?$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const page = parseInt(ctx.match[1], 10);
    const tag = ctx.match[2] || null;
    await sendTaskList(ctx, page, tag, true);
  });

  // ── Dashboard: 1-Tap Done (Updates list in-place with no spam) ─────────────
  bot.callbackQuery(/^dash:done:(\d+):(\d+)(?::(.+))?$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1], 10);
    const page = parseInt(ctx.match[2], 10) || 1;
    const tag = ctx.match[3] || null;

    try {
      const task = await taskService.completeTask(ctx.user.id, taskId);
      await ctx.answerCallbackQuery({ text: `🎉 Completed #${task.id} ${task.title}` });
    } catch (err) {
      await ctx.answerCallbackQuery({ text: `⚠️ ${err.message}` });
    }

    await sendTaskList(ctx, page, tag, true);
  });

  // ── Dashboard: 1-Tap Delete ───────────────────────────────────────────────
  bot.callbackQuery(/^dash:del:(\d+):(\d+)(?::(.+))?$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1], 10);
    const page = parseInt(ctx.match[2], 10) || 1;
    const tag = ctx.match[3] || null;

    try {
      await taskService.deleteTask(ctx.user.id, taskId);
      await ctx.answerCallbackQuery({ text: `🗑️ Deleted task #${taskId}` });
    } catch (err) {
      await ctx.answerCallbackQuery({ text: `⚠️ ${err.message}` });
    }

    await sendTaskList(ctx, page, tag, true);
  });

  // ── Dashboard: Refresh ───────────────────────────────────────────────────
  bot.callbackQuery(/^dash:refresh:(\d+)(?::(.+))?$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: '🔄 Updated!' });
    const page = parseInt(ctx.match[1], 10) || 1;
    const tag = ctx.match[2] || null;
    await sendTaskList(ctx, page, tag, true);
  });

  // ── Dashboard: Add Task Button ────────────────────────────────────────────
  bot.callbackQuery('dash:add', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'awaiting_task_input';
    await ctx.reply(
      '✍️ <b>What would you like to add?</b>\n\n' +
        'Just reply with your task, for example:\n' +
        '• <code>Finish project tomorrow 3pm #study !high</code>\n' +
        '• <code>Buy groceries today 5pm</code>',
      { parse_mode: 'HTML' }
    );
  });

  // ── Dashboard: Noop ───────────────────────────────────────────────────────
  bot.callbackQuery('dash:noop', async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  // ── Callback: Mark Done (inline button in /list) ─────────────────────────
  bot.callbackQuery(/^task:done:(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1], 10);
    await ctx.answerCallbackQuery();
    const task = await taskService.completeTask(ctx.user.id, taskId);
    await ctx.editMessageText(
      `✅ Task <b>#${task.id}</b> marked as done!\n<i>${task.title}</i>`,
      { parse_mode: 'HTML' }
    );
  });

  // ── Callback: Edit task (inline button prompts for new text) ─────────────
  bot.callbackQuery(/^task:edit:(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1], 10);
    await ctx.answerCallbackQuery();
    ctx.session.editingTaskId = taskId;
    ctx.session.step = 'editing_task';
    await ctx.reply(
      `✏️ Send me the new title for task <b>#${taskId}</b>:`,
      { parse_mode: 'HTML' }
    );
  });

  // ── Callback: Delete task (show confirmation) ─────────────────────────────
  bot.callbackQuery(/^task:delete:(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1], 10);
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `⚠️ Delete task <b>#${taskId}</b>? This cannot be undone.`,
      { parse_mode: 'HTML', reply_markup: buildConfirmDeleteKeyboard(taskId) }
    );
  });

  // ── Callback: Confirm delete ─────────────────────────────────────────────
  bot.callbackQuery(/^task:delete_confirm:(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1], 10);
    await ctx.answerCallbackQuery();
    await taskService.deleteTask(ctx.user.id, taskId);
    await ctx.editMessageText(
      `🗑️ Task <b>#${taskId}</b> has been deleted.`,
      { parse_mode: 'HTML' }
    );
  });

  // ── Callback: Cancel delete ───────────────────────────────────────────────
  bot.callbackQuery(/^task:delete_cancel:\d+$/, async (ctx) => {
    await ctx.answerCallbackQuery('Cancelled');
    await ctx.editMessageText('❌ Deletion cancelled.');
  });

  // ── Text handler: add task reply & inline editing flow ───────────────────
  bot.on('message:text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();

    // 1. Reply to /add prompt
    if (ctx.session?.step === 'awaiting_task_input') {
      const input = ctx.message.text.trim();
      ctx.session.step = null;

      try {
        const task = await taskService.addTask(ctx.user.id, input, ctx.user.timezone);
        await ctx.reply(
          `✅ <b>Task added!</b>\n\n${formatTask(task, ctx.user.timezone)}`,
          { parse_mode: 'HTML', reply_markup: buildTaskActionsKeyboard(task.id) }
        );
      } catch (err) {
        await ctx.reply(`❌ Failed to add task: ${err.message}`);
      }
      return;
    }

    // 2. Inline editing flow
    if (ctx.session?.step === 'editing_task') {
      const taskId = ctx.session.editingTaskId;
      const newTitle = ctx.message.text.trim();

      ctx.session.step = null;
      ctx.session.editingTaskId = null;

      const task = await taskService.editTask(ctx.user.id, taskId, newTitle);
      await ctx.reply(
        `✏️ Task <b>#${task.id}</b> updated to:\n<i>${task.title}</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    return next();
  });
}

/**
 * Send a paginated task list.
 * @param {Object} ctx
 * @param {number} page
 * @param {string|null} tagFilter
 * @param {boolean} [editMessage]
 */
async function sendTaskList(ctx, page, tagFilter = null, editMessage = false) {
  const { rows, total } = await taskService.listTasks(ctx.user.id, {
    page,
    pageSize: config.pageSize,
    tagFilter,
  });

  const text = formatTaskList(rows, total, page, config.pageSize, ctx.user.timezone);
  const totalPages = Math.max(1, Math.ceil(total / config.pageSize));
  const kb = buildDashboardKeyboard(rows, page, totalPages, tagFilter || '');
  const opts = { parse_mode: 'HTML', reply_markup: kb };

  if (editMessage) {
    try {
      await ctx.editMessageText(text, opts);
    } catch (err) {
      // Ignore if user tapped refresh and nothing changed
      if (!err.message?.includes('message is not modified')) {
        throw err;
      }
    }
  } else {
    // Single, clean dashboard message with 1-tap buttons right underneath!
    await ctx.reply(text, opts);
  }
}

module.exports = { registerTaskHandlers };
