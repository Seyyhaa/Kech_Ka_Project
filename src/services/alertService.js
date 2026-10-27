'use strict';

const { Api } = require('grammy');
const config = require('../config/index');
const logger = require('../utils/logger');
const { escapeHtml } = require('../utils/formatters');
const { formatDateTime } = require('../utils/dateParser');

let alertApi = null;
if (config.alertBotToken) {
  alertApi = new Api(config.alertBotToken);
}

/**
 * Send an alert via the dedicated secondary alert bot when a new user registers.
 *
 * @param {Object} user - The created user record from database
 */
async function sendNewUserAlert(user) {
  if (!config.alertBotToken || !config.alertChatId) {
    logger.debug('ALERT_BOT_TOKEN or ALERT_CHAT_ID not configured; skipping registration alert');
    return;
  }

  try {
    if (!alertApi) {
      alertApi = new Api(config.alertBotToken);
    }

    const statusBadge = user.status === 'active' ? '🟢 Active' : '⏳ Pending Approval';
    const tz = user.timezone || 'Asia/Phnom_Penh';
    const registeredTime = formatDateTime(new Date(), tz);
    const summaryTime = (user.summary_time || '08:00:00').slice(0, 5);

    const message = [
      '🚨 <b>New User Registration Alert</b>',
      '',
      `👤 <b>Name:</b> ${escapeHtml(user.display_name || 'N/A')}`,
      `🆔 <b>User ID:</b> <code>${user.id}</code>`,
      `💬 <b>Chat ID:</b> <code>${user.chat_id}</code>`,
      `📛 <b>Username:</b> ${user.telegram_username ? '@' + escapeHtml(user.telegram_username) : '<i>None</i>'}`,
      `🌍 <b>Timezone:</b> <code>${escapeHtml(tz)}</code>`,
      `⏰ <b>Daily Briefing:</b> <code>${summaryTime}</code>`,
      `📊 <b>Status:</b> ${statusBadge}`,
      `📅 <b>Registered At:</b> <i>${registeredTime}</i>`,
    ].join('\n');

    await alertApi.sendMessage(config.alertChatId, message, {
      parse_mode: 'HTML',
    });

    logger.info({ userId: user.id, chatId: user.chat_id }, 'New user alert sent via alert bot');
  } catch (err) {
    logger.error({ err, userId: user.id }, 'Failed to send new user alert via alert bot');
  }
}

module.exports = { sendNewUserAlert };
