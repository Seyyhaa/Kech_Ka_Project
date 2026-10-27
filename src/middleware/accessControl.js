'use strict';

const userRepo = require('../repositories/userRepository');
const { buildWelcomeKeyboard, buildReactivateKeyboard } = require('../bot/keyboards');
const { escapeHtml } = require('../utils/formatters');
const config = require('../config/index');

/**
 * Access control middleware for grammy.
 *
 * This runs on EVERY update before any command handler.
 * - Always allows /start, /register, /help
 * - Looks up the user by chat_id in the database
 * - Active users: attaches user object to ctx.user and proceeds
 * - Unregistered / pending / rejected / blocked users:
 *   sends a friendly error and short-circuits the update
 */

// Commands that are always accessible
const PUBLIC_COMMANDS = new Set([
  '/start',
  '/register',
  '/help',
  '/exampleusage',
  '/examples',
  '/feedback',
]);

// Callback queries that are always accessible (registration flow)
const PUBLIC_CALLBACKS = new Set([
  'reg:start',
  'reg:keep_name',
  'reg:change_name',
  'reg:agree',
  'reg:reactivate',
  'reg:reset',
]);

/**
 * Determine if the text starts with a public command.
 * @param {string} text
 * @returns {boolean}
 */
function isPublicCommand(text) {
  if (!text) return false;
  const cmd = text.split(' ')[0].split('@')[0].toLowerCase();
  return PUBLIC_COMMANDS.has(cmd);
}

/**
 * grammy middleware factory.
 * Usage: bot.use(createAccessControl())
 *
 * @returns {Function} grammy middleware
 */
function createAccessControl() {
  return async (ctx, next) => {
    const chatId = ctx.chat?.id || ctx.from?.id;
    if (!chatId) return next(); // System updates (e.g. my_chat_member) — pass through

    // Look up the user first so ctx.user is available for public commands as well
    const user = await userRepo.findByChatId(chatId);
    if (user && (user.status === 'active' || user.role === 'admin')) {
      ctx.user = user;
    }

    // Always allow public commands
    if (ctx.message?.text && isPublicCommand(ctx.message.text)) {
      return next();
    }

    // Always allow public callback queries (registration buttons)
    if (ctx.callbackQuery?.data) {
      const data = ctx.callbackQuery.data;
      // Allow all reg: callbacks and admin: callbacks (admin checks own auth inside handler)
      if (
        data.startsWith('reg:') ||
        PUBLIC_CALLBACKS.has(data) ||
        data.startsWith('admin:') // admin handlers do role check internally
      ) {
        return next();
      }
    }

    // Allow in-progress registration wizard and feedback text inputs
    const ALLOWED_INPUT_STEPS = new Set([
      'confirm_name',
      'enter_name',
      'choose_timezone',
      'tz_manual',
      'choose_time',
      'time_custom',
      'terms',
      'awaiting_feedback',
    ]);
    if (ctx.session?.step && ALLOWED_INPUT_STEPS.has(ctx.session.step)) {
      return next();
    }

    if (!user) {
      await sendAccessDenied(ctx, 'unregistered');
      return;
    }

    if (user.status === 'unregistered') {
      await sendAccessDenied(ctx, 'deactivated', user);
      return;
    }

    if (user.status === 'pending') {
      await sendAccessDenied(ctx, 'pending');
      return;
    }

    if (user.status === 'rejected') {
      await sendAccessDenied(ctx, 'rejected');
      return;
    }

    if (user.status === 'blocked') {
      await sendAccessDenied(ctx, 'blocked');
      return;
    }

    // User is active — attach to context for handlers to use
    ctx.user = user;
    return next();
  };
}

/**
 * Send the appropriate "access denied" message.
 */
async function sendAccessDenied(ctx, reason, user = null) {
  if (reason === 'deactivated') {
    const text =
      `👋 <b>Welcome back, ${escapeHtml(user?.display_name || 'Friend')}!</b>\n\n` +
      'Your account is currently deactivated, but your tasks and tags are safely preserved.\n\n' +
      'Would you like to reactivate your account or start fresh?';
    const replyOptions = {
      parse_mode: 'HTML',
      reply_markup: buildReactivateKeyboard(),
    };
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery();
      await ctx.reply(text, replyOptions);
    } else {
      await ctx.reply(text, replyOptions);
    }
    return;
  }

  const messages = {
    unregistered:
      '👋 <b>Welcome!</b>\n\nYou need to register before you can use this bot.\nPress the button below to get started!',
    pending:
      '⏳ <b>Registration Pending</b>\n\nYour registration is awaiting admin approval. You\'ll be notified once approved!',
    rejected:
      '❌ <b>Registration Rejected</b>\n\nYour registration was not approved. Contact the bot admin for more information.',
    blocked:
      '🚫 <b>Account Blocked</b>\n\nYour account has been blocked. Contact the bot admin if you think this is an error.',
  };

  const text = messages[reason] || messages.unregistered;
  const replyOptions = { parse_mode: 'HTML' };

  if (reason === 'unregistered') {
    replyOptions.reply_markup = buildWelcomeKeyboard();
  }

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
    await ctx.reply(text, replyOptions);
  } else {
    await ctx.reply(text, replyOptions);
  }
}

module.exports = { createAccessControl };
