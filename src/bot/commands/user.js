'use strict';

const userRepo = require('../../repositories/userRepository');
const { formatProfile } = require('../../utils/formatters');
const {
  buildTimezoneKeyboard,
  buildSummaryTimeKeyboard,
  buildConfirmUnregisterKeyboard,
} = require('../keyboards');
const taskRepo = require('../../repositories/taskRepository');
const logger = require('../../utils/logger');

/**
 * Register user profile and settings handlers.
 * @param {import('grammy').Bot} bot
 */
function registerUserHandlers(bot) {
  // ── /profile ─────────────────────────────────────────────────────────────
  bot.command('profile', async (ctx) => {
    const stats = await taskRepo.getStats(
      ctx.user.id,
      new Date(0), // Beginning of time
      new Date()
    );
    const formattedStats = {
      pending: parseInt(stats.pendingAll, 10) || 0,
      done: parseInt(stats.doneAll, 10) || 0,
    };
    await ctx.reply(formatProfile(ctx.user, formattedStats), {
      parse_mode: 'HTML',
    });
  });

  // ── /settings ────────────────────────────────────────────────────────────
  bot.command('settings', async (ctx) => {
    const { InlineKeyboard } = require('grammy');
    const kb = new InlineKeyboard()
      .text('✏️ Change Name', 'settings:name')
      .row()
      .text('🌍 Change Timezone', 'settings:timezone')
      .row()
      .text('⏰ Change Summary Time', 'settings:time');

    await ctx.reply(
      '⚙️ <b>Settings</b>\n\nWhat would you like to update?',
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  // Settings: change name
  bot.callbackQuery('settings:name', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'settings:name';
    await ctx.reply('✏️ Enter your new display name:', { parse_mode: 'HTML' });
  });

  // Settings: change timezone
  bot.callbackQuery('settings:timezone', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'settings:timezone';
    await ctx.reply(
      '🌍 Select your timezone or type a city / IANA zone:',
      { parse_mode: 'HTML', reply_markup: buildTimezoneKeyboard() }
    );
  });

  // Settings: change summary time
  bot.callbackQuery('settings:time', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'settings:time';
    await ctx.reply(
      '⏰ Select your daily summary time:',
      { parse_mode: 'HTML', reply_markup: buildSummaryTimeKeyboard() }
    );
  });

  // ── /feedback ────────────────────────────────────────────────────────────
  bot.command('feedback', async (ctx) => {
    const feedbackText = ctx.message.text.replace(/^\/feedback\s*/i, '').trim();

    if (!feedbackText) {
      ctx.session.step = 'awaiting_feedback';
      await ctx.reply(
        '💬 <b>Send Feedback & Suggestions</b>\n\n' +
          'We\'d love to hear your thoughts, feature requests, or bug reports!\n\n' +
          '👉 <b>Type or reply with your message below:</b>\n' +
          '<i>(You can also use: <code>/feedback &lt;your message&gt;</code>)</i>',
        { parse_mode: 'HTML' }
      );
      return;
    }

    await handleFeedbackSubmission(ctx, feedbackText);
  });

  // Text handler for settings and feedback flows
  bot.on('message:text', async (ctx, next) => {
    const step = ctx.session?.step;

    if (step === 'awaiting_feedback') {
      if (ctx.message.text.startsWith('/')) return next();
      await handleFeedbackSubmission(ctx, ctx.message.text.trim());
      return;
    }

    if (!step || !step.startsWith('settings:')) return next();
    if (ctx.message.text.startsWith('/')) return next();

    if (step === 'settings:name') {
      const name = ctx.message.text.trim().slice(0, 255);
      if (!name) { await ctx.reply('❌ Name cannot be empty.'); return; }
      await userRepo.updateByChatId(ctx.user.chat_id, { displayName: name });
      ctx.session.step = null;
      await ctx.reply(`✅ Display name updated to <b>${name}</b>!`, { parse_mode: 'HTML' });
      return;
    }

    if (step === 'settings:timezone') {
      const { resolveTimezone } = require('../../utils/timezone');
      const tz = resolveTimezone(ctx.message.text);
      if (!tz) { await ctx.reply('❌ Invalid timezone. Try "Asia/Bangkok" or "London".'); return; }
      await userRepo.updateByChatId(ctx.user.chat_id, { timezone: tz });
      ctx.session.step = null;
      await ctx.reply(`✅ Timezone updated to <code>${tz}</code>!`, { parse_mode: 'HTML' });
      return;
    }

    if (step === 'settings:time') {
      const match = ctx.message.text.trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!match) { await ctx.reply('❌ Please enter time as HH:MM (e.g. 08:00).'); return; }
      const timeStr = `${String(parseInt(match[1])).padStart(2,'0')}:${match[2]}:00`;
      await userRepo.updateByChatId(ctx.user.chat_id, { summaryTime: timeStr });
      ctx.session.step = null;
      await ctx.reply(`✅ Daily summary time updated to <code>${timeStr.slice(0,5)}</code>!`, { parse_mode: 'HTML' });
      return;
    }

    return next();
  });

  // Timezone callback for settings flow
  bot.callbackQuery(/^reg:tz:(.+)$/, async (ctx, next) => {
    if (ctx.session?.step !== 'settings:timezone') return next();
    await ctx.answerCallbackQuery();
    const tzValue = ctx.match[1];
    if (tzValue === 'manual') {
      await ctx.reply('⌨️ Type your city or IANA timezone:');
      return;
    }
    await userRepo.updateByChatId(ctx.user.chat_id, { timezone: tzValue });
    ctx.session.step = null;
    await ctx.editMessageText(`✅ Timezone updated to <code>${tzValue}</code>!`, { parse_mode: 'HTML' });
  });

  // Summary time callback for settings flow
  bot.callbackQuery(/^reg:time:(.+)$/, async (ctx, next) => {
    if (ctx.session?.step !== 'settings:time') return next();
    await ctx.answerCallbackQuery();
    const timeValue = ctx.match[1];
    if (timeValue === 'custom') {
      await ctx.reply('⌨️ Enter time in HH:MM format:');
      return;
    }
    const timeStr = `${timeValue}:00`;
    await userRepo.updateByChatId(ctx.user.chat_id, { summaryTime: timeStr });
    ctx.session.step = null;
    await ctx.editMessageText(
      `✅ Daily summary time updated to <code>${timeValue}</code>!`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /unregister ───────────────────────────────────────────────────────────
  bot.command('unregister', async (ctx) => {
    await ctx.reply(
      '⚠️ <b>Delete Account</b>\n\n' +
        'This will permanently delete:\n' +
        '• Your profile and settings\n' +
        '• All your tasks and reminders\n' +
        '• All your tags\n\n' +
        '❗ <b>This action cannot be undone.</b>',
      { parse_mode: 'HTML', reply_markup: buildConfirmUnregisterKeyboard() }
    );
  });

  bot.callbackQuery('unreg:confirm', async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.user.chat_id;
    await userRepo.deleteByChatId(chatId);
    ctx.session = {};
    await ctx.editMessageText(
      '✅ <b>Account Deleted</b>\n\n' +
        'All your data has been removed. Thank you for using Task Manager Bot!\n\n' +
        'You can register again anytime with /start.',
      { parse_mode: 'HTML' }
    );
    logger.info({ chatId }, 'User unregistered');
  });

  bot.callbackQuery('unreg:cancel', async (ctx) => {
    await ctx.answerCallbackQuery('Cancelled');
    await ctx.editMessageText('❌ Account deletion cancelled. Your data is safe!');
  });
}

/**
 * Deliver user feedback to the group alert chat via alertService.
 *
 * @param {import('grammy').Context} ctx
 * @param {string} feedbackText
 */
async function handleFeedbackSubmission(ctx, feedbackText) {
  if (ctx.session) {
    ctx.session.step = null;
  }

  if (!feedbackText) {
    await ctx.reply('❌ Feedback message cannot be empty.');
    return;
  }

  // Ensure name and username are determined
  const senderName =
    ctx.user?.display_name ||
    [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') ||
    'Anonymous';
  const username = ctx.user?.telegram_username || ctx.from?.username || null;
  const chatId = ctx.chat?.id || ctx.from?.id;
  const timezone = ctx.user?.timezone || 'Asia/Phnom_Penh';

  const { sendFeedbackAlert } = require('../../services/alertService');
  await sendFeedbackAlert({
    name: senderName,
    username,
    chatId,
    feedbackText,
    timezone,
  });

  await ctx.reply(
    `✅ <b>Thank you for your feedback, ${senderName}!</b>\n\n` +
      'Your feedback has been delivered directly to our team. We really appreciate your input! 🙏',
    { parse_mode: 'HTML' }
  );
}

module.exports = { registerUserHandlers };
