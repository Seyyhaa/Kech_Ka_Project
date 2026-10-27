'use strict';

const { Bot, session } = require('grammy');
const config = require('../config/index');
const { pgSessionStorage } = require('./sessionStore');
const { createAccessControl } = require('../middleware/accessControl');
const { errorHandler } = require('../middleware/errorHandler');
const { registerStartHandlers } = require('./commands/start');
const { registerTaskHandlers } = require('./commands/tasks');
const { registerUserHandlers } = require('./commands/user');
const { registerAdminHandlers } = require('./commands/admin');
const logger = require('../utils/logger');

/**
 * Create and configure the grammy Bot instance.
 *
 * Architecture:
 *   session middleware (PostgreSQL-backed)
 *     → accessControl middleware
 *       → command handlers (start, tasks, user, admin)
 *
 * @returns {import('grammy').Bot}
 */
function createBot() {
  const bot = new Bot(config.botToken);

  // ── 1. Session Middleware ──────────────────────────────────────────────────
  // Persists registration flow state across restarts using PostgreSQL.
  // Initial session shape defined here.
  bot.use(
    session({
      storage: pgSessionStorage,
      initial: () => ({
        step: null,          // Current registration/settings step
        displayName: null,
        timezone: null,
        summaryTime: null,
        inviteCode: null,
        editingTaskId: null, // Used by inline edit flow
      }),
      // Use the chat_id as the session key
      getSessionKey: (ctx) =>
        ctx.chat?.id?.toString() ?? ctx.from?.id?.toString(),
    })
  );

  // ── 2. Access Control Middleware ───────────────────────────────────────────
  // Runs on every update; blocks non-registered/pending/blocked users.
  bot.use(createAccessControl());

  // ── 3. Register Command Handlers ───────────────────────────────────────────
  registerStartHandlers(bot);   // /start, /register, /help, registration callbacks
  registerTaskHandlers(bot);    // /add, /list, /done, /edit, /delete, /remind, /stats
  registerUserHandlers(bot);    // /profile, /settings, /unregister
  registerAdminHandlers(bot);   // /admin_* commands

  // ── 4. Global Error Handler ────────────────────────────────────────────────
  bot.catch(errorHandler);

  logger.info('Bot initialized with all handlers registered');
  return bot;
}

/**
 * Register the bot's webhook with Telegram.
 * Called once on startup if not already set.
 *
 * @param {import('grammy').Bot} bot
 */
async function registerWebhook(bot) {
  const webhookUrl = `${config.webhookUrl}/webhook`;
  await bot.api.setWebhook(webhookUrl, {
    secret_token: config.webhookSecret,
    allowed_updates: ['message', 'callback_query', 'my_chat_member'],
    drop_pending_updates: true,
  });
  logger.info({ webhookUrl }, 'Webhook registered with Telegram');
}

/**
 * Register the bot's command list with Telegram so they appear
 * in the autocomplete menu when users type "/".
 *
 * @param {import('grammy').Bot} bot
 */
async function registerBotCommands(bot) {
  try {
    await bot.api.setMyCommands([
      { command: 'start', description: 'Start the bot and onboarding' },
      { command: 'add', description: 'Add a task (e.g. /add Buy milk | tomorrow 2pm)' },
      { command: 'list', description: 'View your tasks and filter by tags' },
      { command: 'today', description: 'View tasks due today' },
      { command: 'week', description: 'View tasks due this week' },
      { command: 'done', description: 'Mark a task as completed' },
      { command: 'edit', description: 'Edit a task title' },
      { command: 'delete', description: 'Delete a task' },
      { command: 'remind', description: 'Set a task reminder' },
      { command: 'stats', description: 'View productivity stats' },
      { command: 'profile', description: 'View your profile and settings' },
      { command: 'settings', description: 'Change name, timezone, or summary time' },
      { command: 'exampleusage', description: 'Show how to use the bot and example workflows' },
      { command: 'help', description: 'Show help and instructions' },
    ]);
    logger.info('Bot command menu registered with Telegram');
  } catch (err) {
    logger.warn({ err }, 'Failed to set Telegram command menu');
  }
}

module.exports = { createBot, registerWebhook, registerBotCommands };
