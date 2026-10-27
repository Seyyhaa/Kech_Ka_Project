'use strict';

const logger = require('../utils/logger');

/**
 * Centralized error handler for grammy.
 * Catches all unhandled errors inside bot handlers, logs them,
 * and sends a friendly message to the user instead of crashing.
 *
 * Usage: bot.catch(errorHandler)
 */
async function errorHandler(err) {
  const ctx = err.ctx;
  const error = err.error;

  // Log with structured context — never crash the process
  logger.error(
    {
      err: error,
      updateId: ctx?.update?.update_id,
      chatId: ctx?.chat?.id,
      userId: ctx?.from?.id,
      updateType: ctx?.updateType,
    },
    'Unhandled bot error'
  );

  // Send user-friendly error if we have a context
  if (ctx) {
    try {
      const message =
        error?.message?.includes('not found') ||
        error?.message?.includes('cannot be empty')
          ? `❌ ${error.message}`
          : '⚠️ Something went wrong. Please try again or use /help.';

      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({ text: '⚠️ An error occurred', show_alert: true });
      }
      await ctx.reply(message, { parse_mode: 'HTML' });
    } catch (replyErr) {
      logger.error({ err: replyErr }, 'Could not send error reply to user');
    }
  }
}

/**
 * Express error handler middleware.
 * Must be registered AFTER routes with 4 parameters.
 */
// eslint-disable-next-line no-unused-vars
function expressErrorHandler(err, req, res, next) {
  logger.error({ err, path: req.path, method: req.method }, 'Express error');
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { errorHandler, expressErrorHandler };
