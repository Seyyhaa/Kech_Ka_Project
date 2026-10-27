'use strict';

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config/index');
const logger = require('./utils/logger');
const healthRouter = require('./routes/health');
const { createWebhookRouter } = require('./routes/webhook');
const { expressErrorHandler } = require('./middleware/errorHandler');
const { createBot, registerWebhook, registerBotCommands } = require('./bot/index');
const { setBot, startReminderJob, startDailySummaryJob } = require('./jobs/cronJobs');
const { closePool } = require('./config/db');

/**
 * Build and configure the Express application.
 * Separated from the startup logic so it can be tested independently.
 *
 * @param {import('grammy').Bot} bot
 * @returns {express.Application}
 */
function buildApp(bot) {
  const app = express();

  // ── Security Headers ───────────────────────────────────────────────────────
  app.use(helmet());

  // ── Body Parser ────────────────────────────────────────────────────────────
  // Must come BEFORE rate limiting so we can parse the body
  app.use(express.json({ limit: '1mb' }));

  // ── Global Rate Limiter ────────────────────────────────────────────────────
  // Protects against abuse of any endpoint. The webhook guard provides
  // bot-level protection; this protects the HTTP server itself.
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });
  app.use(limiter);

  // Per-IP stricter limiter for the webhook specifically
  // (Telegram's IPs are well-known and whitelisted server-side via the secret)
  const webhookLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 120, // Telegram sends one update per request; 120/min is very generous
    standardHeaders: true,
    legacyHeaders: false,
  });

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.use(healthRouter);
  app.use(webhookLimiter, createWebhookRouter(bot));

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // ── Centralized Error Handler ──────────────────────────────────────────────
  app.use(expressErrorHandler);

  return app;
}

/**
 * Start the application:
 * 1. Create the bot
 * 2. Register the webhook with Telegram
 * 3. Build the Express app
 * 4. Start the HTTP server
 * 5. Start background cron jobs
 * 6. Register graceful shutdown
 */
async function start() {
  logger.info({ env: config.nodeEnv, port: config.port }, 'Starting Task Manager Bot...');

  // ── Bot ────────────────────────────────────────────────────────────────────
  const bot = createBot();

  // Initialize bot info with Telegram (required by grammY when handling updates via webhook)
  await bot.init();
  logger.info({ botUsername: bot.botInfo.username }, `🤖 Bot @${bot.botInfo.username} initialized`);

  // Register commands with Telegram for autocomplete popup menu
  await registerBotCommands(bot);

  if (config.usePolling) {
    logger.info('🔄 Polling mode enabled: removing any existing webhook and starting bot...');
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    bot.start({
      allowed_updates: ['message', 'callback_query', 'my_chat_member'],
      onStart: (botInfo) => {
        logger.info(`🤖 Bot @${botInfo.username} started in LONG POLLING mode (no ngrok required!)`);
      },
    });
  } else {
    // Register webhook URL with Telegram
    await registerWebhook(bot);
  }

  // Inject bot into cron jobs
  setBot(bot);

  // ── Express App ────────────────────────────────────────────────────────────
  const app = buildApp(bot);

  // ── HTTP Server ────────────────────────────────────────────────────────────
  const server = app.listen(config.port, () => {
    logger.info(`🚀 Server listening on port ${config.port}`);
    if (config.usePolling) {
      logger.info(`📡 Mode: LONG POLLING (listening directly for Telegram updates)`);
    } else {
      logger.info(`📡 Webhook endpoint: POST /webhook`);
    }
    logger.info(`❤️  Health check: GET /health`);
  });

  // ── Background Jobs ────────────────────────────────────────────────────────
  startReminderJob();
  startDailySummaryJob();

  // ── Graceful Shutdown ──────────────────────────────────────────────────────
  async function shutdown(signal) {
    logger.info({ signal }, 'Received shutdown signal');

    if (config.usePolling) {
      await bot.stop();
    }

    server.close(async () => {
      logger.info('HTTP server closed');
      await closePool();
      logger.info('Shutdown complete');
      process.exit(0);
    });

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Catch unhandled promise rejections to prevent crashes
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — shutting down');
    process.exit(1);
  });
}

// ── Entry Point ──────────────────────────────────────────────────────────────
start().catch((err) => {
  logger.fatal({ err }, 'Failed to start application');
  process.exit(1);
});
