'use strict';

const userRepo = require('../repositories/userRepository');
const inviteRepo = require('../repositories/inviteCodeRepository');
const { isValidTimezone, resolveTimezone } = require('../utils/timezone');
const { withTransaction } = require('../config/db');
const config = require('../config/index');
const logger = require('../utils/logger');

/**
 * RegistrationService — orchestrates the multi-step registration flow.
 * Session state shape stored in grammy session (persisted to bot_sessions):
 * {
 *   step: 'confirm_name' | 'choose_timezone' | 'tz_manual' | 'choose_time' | 'time_custom' | 'terms',
 *   displayName: string,
 *   timezone: string,
 *   summaryTime: string,
 *   inviteCode?: string,
 * }
 */

/**
 * Begin registration — validate mode and invite code if required.
 * Returns { ok: true } or { ok: false, reason: string }
 */
async function beginRegistration(chatId, inviteCodeInput) {
  const existing = await userRepo.findByChatId(chatId);
  if (existing && existing.status === 'active') {
    return { ok: false, reason: 'already_registered' };
  }
  if (existing && existing.status === 'pending') {
    return { ok: false, reason: 'pending_approval' };
  }

  if (config.registrationMode === 'invite') {
    if (!inviteCodeInput) return { ok: false, reason: 'invite_required' };
    const code = await inviteRepo.findValid(inviteCodeInput);
    if (!code) return { ok: false, reason: 'invalid_code' };
  }

  return { ok: true };
}

/**
 * Validate and save the display name step.
 * @param {Object} session
 * @param {string} input
 * @returns {{ ok: boolean, error?: string }}
 */
function setDisplayName(session, input) {
  const name = input.trim().slice(0, 255);
  if (!name) return { ok: false, error: 'Name cannot be empty.' };
  session.displayName = name;
  session.step = 'choose_timezone';
  return { ok: true };
}

/**
 * Validate and save the timezone step.
 * @param {Object} session
 * @param {string} input
 * @returns {{ ok: boolean, error?: string }}
 */
function setTimezone(session, input) {
  const tz = resolveTimezone(input);
  if (!tz) {
    return {
      ok: false,
      error: `❌ Could not recognise timezone "<b>${input}</b>".\nPlease enter a valid IANA timezone (e.g. "Asia/Bangkok", "Europe/London") or pick from the list above.`,
    };
  }
  session.timezone = tz;
  session.step = 'choose_time';
  return { ok: true };
}

/**
 * Validate and save summary time.
 * @param {Object} session
 * @param {string} input - "HH:MM" format
 * @returns {{ ok: boolean, error?: string }}
 */
function setSummaryTime(session, input) {
  const match = input.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { ok: false, error: 'Please enter time as HH:MM (e.g. 08:00).' };
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) {
    return { ok: false, error: 'Invalid time. Hours 00-23, minutes 00-59.' };
  }
  session.summaryTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  session.step = 'terms';
  return { ok: true };
}

/**
 * Finalize registration — create the user record.
 * Handles invite code marking and approval-mode pending status.
 *
 * @param {number} chatId
 * @param {string} telegramUsername
 * @param {Object} session
 * @returns {Promise<Object>} Created user
 */
async function finalizeRegistration(chatId, telegramUsername, session) {
  const status =
    config.registrationMode === 'approval' ? 'pending' : 'active';

  const user = await withTransaction(async (client) => {
    const created = await userRepo.create({
      chatId,
      telegramUsername,
      displayName: session.displayName,
      status,
      timezone: session.timezone || 'Asia/Phnom_Penh',
      summaryTime: session.summaryTime || '08:00:00',
      termsAcceptedAt: new Date(),
      registeredAt: status === 'active' ? new Date() : null,
    });

    // Mark invite code as used (if invite mode)
    if (config.registrationMode === 'invite' && session.inviteCode) {
      await inviteRepo.markUsed(session.inviteCode);
    }

    return created;
  });

  logger.info(
    { chatId, userId: user.id, status },
    'New user registered'
  );

  return user;
}

module.exports = {
  beginRegistration,
  setDisplayName,
  setTimezone,
  setSummaryTime,
  finalizeRegistration,
};
