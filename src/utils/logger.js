'use strict';

const pino = require('pino');
const { logLevel, isProduction } = require('../config/index');

/**
 * Centralized logger using pino.
 * - Production: structured JSON output (fast, pipe to log aggregators)
 * - Development: pino-pretty for human-readable, coloured logs
 *
 * IMPORTANT: never log the BOT_TOKEN — pino's redact option strips it.
 */
const logger = pino({
  level: logLevel,
  redact: {
    paths: ['BOT_TOKEN', 'botToken', '*.botToken', 'headers.authorization'],
    censor: '[REDACTED]',
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }),
});

module.exports = logger;
