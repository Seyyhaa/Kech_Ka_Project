'use strict';

const express = require('express');
const { createWebhookGuard } = require('../middleware/webhookGuard');
const config = require('../config/index');
const logger = require('../utils/logger');

/**
 * Create the webhook router.
 * @param {import('grammy').Bot} bot
 * @returns {express.Router}
 */
function createWebhookRouter(bot) {
  const router = express.Router();

  /**
   * POST /webhook
   *
   * Receives Telegram updates (verified by webhookGuard),
   * then passes the raw body to grammy's handleUpdate.
   * Always responds 200 to Telegram immediately (Telegram retries on non-2xx).
   */
  router.post(
    '/webhook',
    createWebhookGuard(config.webhookSecret),
    async (req, res) => {
      // Acknowledge immediately — grammy handles the update asynchronously
      res.sendStatus(200);

      try {
        if (!bot.isInited()) {
          await bot.init();
        }
        await bot.handleUpdate(req.body);
      } catch (err) {
        // bot.catch already handles errors inside handlers;
        // this catches any grammy-internal errors
        logger.error({ err, updateId: req.body?.update_id }, 'Unhandled update error');
      }
    }
  );

  return router;
}

module.exports = { createWebhookRouter };
