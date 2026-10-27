'use strict';

const express = require('express');
const { checkDatabaseHealth } = require('../config/db');

const router = express.Router();

/**
 * GET /health
 *
 * Returns { status: 'ok' } with a 200 if everything is healthy,
 * or { status: 'error', details: '...' } with a 503 if the DB is down.
 *
 * Used by load balancers, uptime monitors, and deployment health checks.
 */
router.get('/health', async (req, res) => {
  try {
    await checkDatabaseHealth();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      database: 'connected',
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      details: err.message,
    });
  }
});

module.exports = router;
