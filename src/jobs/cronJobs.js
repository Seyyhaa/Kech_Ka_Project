'use strict';

const cron = require('node-cron');
const { pool, withTransaction } = require('../config/db');
const reminderRepo = require('../repositories/reminderRepository');
const userRepo = require('../repositories/userRepository');
const taskRepo = require('../repositories/taskRepository');
const { getTodayRange } = require('../utils/dateParser');
const { formatTask } = require('../utils/formatters');
const { DateTime } = require('luxon');
const logger = require('../utils/logger');

let bot; // Injected after bot is created

/**
 * Inject the bot instance so jobs can call ctx.api.sendMessage.
 * @param {import('grammy').Bot} botInstance
 */
function setBot(botInstance) {
  bot = botInstance;
}

/**
 * REMINDER JOB — runs every minute.
 *
 * Finds all unsent reminders whose remind_at <= NOW(),
 * locks them with FOR UPDATE SKIP LOCKED (safe for multi-process),
 * sends the Telegram message, and marks them sent.
 *
 * If Telegram returns 403 (user blocked bot), the user is marked 'blocked'.
 */
function startReminderJob() {
  cron.schedule('* * * * *', async () => {
    try {
      await withTransaction(async (client) => {
        const reminders = await reminderRepo.getDueAndLock(client);
        if (!reminders.length) return;

        logger.info({ count: reminders.length }, 'Processing due reminders');

        for (const reminder of reminders) {
          try {
            await bot.api.sendMessage(
              reminder.chat_id,
              `⏰ <b>Reminder!</b>\n\n📌 <i>${reminder.task_title}</i>\n\n<b>Task #${reminder.task_id}</b> is due now.`,
              { parse_mode: 'HTML' }
            );
            await reminderRepo.markSent(reminder.id, client);
          } catch (err) {
            if (err?.error_code === 403) {
              // User blocked the bot — mark as blocked so we stop retrying
              logger.warn(
                { chatId: reminder.chat_id },
                'User blocked the bot — marking as blocked'
              );
              await userRepo.updateByChatId(reminder.chat_id, { status: 'blocked' });
              await reminderRepo.markSent(reminder.id, client); // Don't retry
            } else {
              logger.error(
                { err, reminderId: reminder.id },
                'Failed to send reminder'
              );
              // Don't mark as sent — will be retried next minute
            }
          }
        }
      });
    } catch (err) {
      logger.error({ err }, 'Reminder job error');
    }
  });

  logger.info('Reminder cron job started (every minute)');
}

/**
 * DAILY SUMMARY JOB — runs every minute.
 *
 * For each active user, checks if the current minute (in their timezone)
 * matches their configured summary_time. If so, sends them today's tasks.
 *
 * This approach avoids complex cron-per-user scheduling while staying accurate
 * to within ±1 minute of the user's chosen time.
 */
function startDailySummaryJob() {
  cron.schedule('* * * * *', async () => {
    try {
      const users = await userRepo.getActiveSummaryUsers();
      const nowUtc = DateTime.utc();

      for (const user of users) {
        const nowInTz = nowUtc.setZone(user.timezone);
        const currentHHMM = nowInTz.toFormat('HH:mm');
        // summary_time is stored as "HH:MM:SS"
        const userSummaryTime = (user.summary_time || '08:00:00').slice(0, 5);

        if (currentHHMM !== userSummaryTime) continue;

        try {
          await sendDailySummary(user);
        } catch (err) {
          if (err?.error_code === 403) {
            await userRepo.updateByChatId(user.chat_id, { status: 'blocked' });
            logger.warn({ chatId: user.chat_id }, 'User blocked the bot during daily summary');
          } else {
            logger.error({ err, chatId: user.chat_id }, 'Failed to send daily summary');
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Daily summary job error');
    }
  });

  logger.info('Daily summary cron job started (every minute)');
}

/**
 * Send the daily task summary to a user.
 * @param {Object} user
 */
async function sendDailySummary(user) {
  const { start, end } = getTodayRange(user.timezone);
  const tasks = await taskRepo.listTodayByUser(user.id, start, end);

  // Also fetch overdue tasks (due before today, still pending)
  const { rows: overdueTasks } = await pool.query(
    `SELECT t.*, COALESCE(json_agg(tg.name) FILTER (WHERE tg.name IS NOT NULL), '[]') AS tags
     FROM tasks t
     LEFT JOIN task_tags tt ON tt.task_id = t.id
     LEFT JOIN tags tg ON tg.id = tt.tag_id
     WHERE t.user_id = $1 AND t.status = 'pending' AND t.due_at < $2
     GROUP BY t.id
     ORDER BY t.due_at ASC
     LIMIT 5`,
    [user.id, start]
  );

  let message = `☀️ <b>Good morning, ${user.display_name}!</b>\n\n`;

  if (overdueTasks.length) {
    message += `⚠️ <b>Overdue Tasks (${overdueTasks.length}):</b>\n`;
    message += overdueTasks.map((t) => formatTask(t, user.timezone)).join('\n') + '\n\n';
  }

  if (tasks.length) {
    message += `📅 <b>Today\'s Tasks (${tasks.length}):</b>\n`;
    message += tasks.map((t) => formatTask(t, user.timezone)).join('\n');
  } else if (!overdueTasks.length) {
    message += '🎉 <b>No tasks today!</b> Enjoy your free time or add tasks with /add.';
  }

  message += '\n\n💡 <i>Tip: Use /list to see all tasks, /done &lt;id&gt; to complete one.</i>';

  await bot.api.sendMessage(user.chat_id, message, { parse_mode: 'HTML' });
  logger.info({ chatId: user.chat_id, taskCount: tasks.length }, 'Daily summary sent');
}

module.exports = { setBot, startReminderJob, startDailySummaryJob };
