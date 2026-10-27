'use strict';

require('dotenv').config();

/**
 * Central configuration — reads from process.env and validates required values.
 * All other modules import from here; env vars are never accessed directly elsewhere.
 */

function requireEnv(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

const config = {
  // ── Server ────────────────────────────────────────────────────────────────
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // ── Telegram Bot ──────────────────────────────────────────────────────────
  botToken: requireEnv('BOT_TOKEN'),
  usePolling: process.env.USE_POLLING === 'true',
  webhookUrl: process.env.USE_POLLING === 'true' ? (process.env.WEBHOOK_URL || '') : requireEnv('WEBHOOK_URL'),
  webhookSecret: process.env.USE_POLLING === 'true' ? (process.env.WEBHOOK_SECRET || '') : requireEnv('WEBHOOK_SECRET'),

  // ── Database ──────────────────────────────────────────────────────────────
  databaseUrl: requireEnv('DATABASE_URL'),

  // ── Registration ──────────────────────────────────────────────────────────
  registrationMode: process.env.REGISTRATION_MODE || 'open', // open | invite | approval

  // ── Admins ────────────────────────────────────────────────────────────────
  adminChatIds: (process.env.ADMIN_CHAT_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map(Number),

  // ── Separate Alert Bot (optional) ──────────────────────────────────────────
  alertBotToken: process.env.ALERT_BOT_TOKEN || null,
  alertChatId: process.env.ALERT_CHAT_ID ? process.env.ALERT_CHAT_ID.trim() : null,

  // ── Logging ───────────────────────────────────────────────────────────────
  logLevel: process.env.LOG_LEVEL || 'info',

  // ── Pagination ────────────────────────────────────────────────────────────
  pageSize: 5,
};

module.exports = config;
