'use strict';

const logger = require('../utils/logger');

/**
 * Webhook secret token validator middleware.
 * Telegram sends the secret in the X-Telegram-Bot-Api-Secret-Token header
 * on every webhook update. We reject anything that doesn't match.
 *
 * This prevents anyone who discovers our webhook URL from spoofing updates.
 *
 * @param {string} secret - The expected secret token
 * @returns {import('express').RequestHandler}
 */
function createWebhookGuard(secret) {
  return (req, res, next) => {
    const token = req.headers['x-telegram-bot-api-secret-token'];
    if (!token || token !== secret) {
      logger.warn(
        { ip: req.ip, providedToken: token ? '[present but wrong]' : '[missing]' },
        'Webhook secret mismatch — rejecting update'
      );
      return res.sendStatus(401);
    }
    next();
  };
}

module.exports = { createWebhookGuard };
