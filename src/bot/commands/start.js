'use strict';

const registrationService = require('../../services/registrationService');
const {
  buildWelcomeKeyboard,
  buildConfirmNameKeyboard,
  buildTimezoneKeyboard,
  buildSummaryTimeKeyboard,
  buildTermsKeyboard,
  buildApprovalKeyboard,
} = require('../keyboards');
const config = require('../../config/index');
const logger = require('../../utils/logger');

const HELP_TEXT = `
📋 <b>Task Manager Bot — Commands</b>

<b>Tasks:</b>
/add &lt;task&gt; — Add a new task
  <i>e.g.</i> /add Buy milk | tomorrow 5pm | high #shopping
/list — View your pending tasks
/list #tag — Filter by tag
/today — Tasks due today
/week — Tasks due this week
/done &lt;id&gt; — Mark task as complete
/edit &lt;id&gt; &lt;new text&gt; — Edit a task title
/delete &lt;id&gt; — Delete a task
/remind &lt;id&gt; &lt;time&gt; — Set a reminder

<b>Account:</b>
/profile — View your profile
/settings — Update preferences
/stats — Weekly completion stats
/unregister — Delete your account

<b>Help:</b>
/start — Main menu
/help — Show this message
`.trim();

/**
 * Register all start/help/registration command handlers onto a grammy Bot instance.
 * @param {import('grammy').Bot} bot
 */
function registerStartHandlers(bot) {
  // ── /start ──────────────────────────────────────────────────────────────
  bot.command('start', async (ctx) => {
    // If ctx.user is set, they're already registered (set by accessControl middleware)
    if (ctx.user) {
      await ctx.reply(
        `👋 Welcome back, <b>${ctx.user.display_name}</b>!\n\n${HELP_TEXT}`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    await ctx.reply(
      '👋 <b>Welcome to Task Manager Bot!</b>\n\n' +
        'I help you manage your tasks, set reminders, and stay organized — all inside Telegram.\n\n' +
        'Press <b>Register Now</b> to get started! It only takes a minute.',
      { parse_mode: 'HTML', reply_markup: buildWelcomeKeyboard() }
    );
  });

  // ── /help ────────────────────────────────────────────────────────────────
  bot.command('help', async (ctx) => {
    await ctx.reply(HELP_TEXT, { parse_mode: 'HTML' });
  });

  // ── /register <optional_code> ────────────────────────────────────────────
  bot.command('register', async (ctx) => {
    if (ctx.user) {
      await ctx.reply(
        '✅ You are already registered! Use /help to see available commands.',
        { parse_mode: 'HTML' }
      );
      return;
    }
    await startRegistrationFlow(ctx);
  });

  // ── Inline button: "Register Now" on the welcome screen ─────────────────
  bot.callbackQuery('reg:start', async (ctx) => {
    await ctx.answerCallbackQuery();
    await startRegistrationFlow(ctx);
  });

  // ── Step: Keep / Change name ─────────────────────────────────────────────
  bot.callbackQuery('reg:keep_name', async (ctx) => {
    await ctx.answerCallbackQuery();
    const session = ctx.session;
    session.step = 'choose_timezone';
    await ctx.editMessageText(
      `✅ Great, we'll call you <b>${session.displayName}</b>!\n\n` +
        '🌍 <b>Step 2: Choose your timezone</b>\n\n' +
        'Pick from the list below or type your city name / IANA zone:',
      { parse_mode: 'HTML', reply_markup: buildTimezoneKeyboard() }
    );
  });

  bot.callbackQuery('reg:change_name', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'enter_name';
    await ctx.editMessageText(
      '✏️ Please type your preferred display name:',
      { parse_mode: 'HTML' }
    );
  });

  // ── Step: Timezone selected from button ──────────────────────────────────
  bot.callbackQuery(/^reg:tz:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tzValue = ctx.match[1];

    if (tzValue === 'manual') {
      ctx.session.step = 'tz_manual';
      await ctx.editMessageText(
        '⌨️ Type your city name or IANA timezone (e.g. "Asia/Bangkok", "London"):',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const { setTimezone } = require('../../services/registrationService');
    const result = setTimezone(ctx.session, tzValue);
    if (!result.ok) {
      await ctx.answerCallbackQuery({ text: result.error, show_alert: true });
      return;
    }
    await ctx.editMessageText(
      `✅ Timezone set to <code>${ctx.session.timezone}</code>!\n\n` +
        '⏰ <b>Step 3: Daily summary time</b>\n\n' +
        'When should I send you your daily task summary?',
      { parse_mode: 'HTML', reply_markup: buildSummaryTimeKeyboard() }
    );
  });

  // ── Step: Summary time from button ───────────────────────────────────────
  bot.callbackQuery(/^reg:time:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const timeValue = ctx.match[1];

    if (timeValue === 'custom') {
      ctx.session.step = 'time_custom';
      await ctx.editMessageText(
        '⌨️ Enter your preferred summary time in <b>HH:MM</b> format (e.g. 07:30):',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const { setSummaryTime } = require('../../services/registrationService');
    const result = setSummaryTime(ctx.session, timeValue);
    if (!result.ok) {
      await ctx.answerCallbackQuery({ text: result.error, show_alert: true });
      return;
    }
    await showTermsStep(ctx);
  });

  // ── Step: Accept terms ───────────────────────────────────────────────────
  bot.callbackQuery('reg:agree', async (ctx) => {
    await ctx.answerCallbackQuery();
    await finalizeUserRegistration(ctx);
  });

  // ── Text message handler for registration flow steps ─────────────────────
  bot.on('message:text', async (ctx, next) => {
    const session = ctx.session;

    // Only intercept if we're in a registration step
    if (!session?.step) return next();

    const step = session.step;
    const text = ctx.message.text;

    // Ignore command messages during flow
    if (text.startsWith('/')) return next();

    if (step === 'enter_name') {
      const { setDisplayName } = require('../../services/registrationService');
      const result = setDisplayName(session, text);
      if (!result.ok) {
        await ctx.reply(`❌ ${result.error}`, { parse_mode: 'HTML' });
        return;
      }
      await ctx.reply(
        `✅ Name set to <b>${session.displayName}</b>!\n\n` +
          '🌍 <b>Step 2: Choose your timezone</b>',
        { parse_mode: 'HTML', reply_markup: buildTimezoneKeyboard() }
      );
      return;
    }

    if (step === 'tz_manual') {
      const { setTimezone } = require('../../services/registrationService');
      const result = setTimezone(session, text);
      if (!result.ok) {
        await ctx.reply(result.error, { parse_mode: 'HTML' });
        return;
      }
      await ctx.reply(
        `✅ Timezone set to <code>${session.timezone}</code>!\n\n` +
          '⏰ <b>Step 3: Daily summary time</b>',
        { parse_mode: 'HTML', reply_markup: buildSummaryTimeKeyboard() }
      );
      return;
    }

    if (step === 'time_custom') {
      const { setSummaryTime } = require('../../services/registrationService');
      const result = setSummaryTime(session, text);
      if (!result.ok) {
        await ctx.reply(`❌ ${result.error}`, { parse_mode: 'HTML' });
        return;
      }
      await showTermsStep(ctx);
      return;
    }

    return next();
  });
}

/**
 * Kick off the registration flow for a new user.
 */
async function startRegistrationFlow(ctx) {
  const chatId = ctx.chat.id;
  const firstName = ctx.from?.first_name || 'Friend';
  const inviteCode = ctx.message?.text?.split(' ')[1] || null;

  const { beginRegistration } = require('../../services/registrationService');
  const check = await beginRegistration(chatId, inviteCode);

  if (!check.ok) {
    const messages = {
      already_registered: '✅ You are already registered! Use /help.',
      pending_approval: '⏳ Your registration is pending admin approval.',
      invite_required: '🔒 This bot requires an invite code.\nUsage: /register <code>',
      invalid_code: '❌ Invalid or expired invite code.',
    };
    await ctx.reply(messages[check.reason] || '❌ Registration unavailable.', {
      parse_mode: 'HTML',
    });
    return;
  }

  // Initialize session
  ctx.session.step = 'confirm_name';
  ctx.session.displayName = firstName;
  ctx.session.inviteCode = inviteCode;

  await ctx.reply(
    `👋 <b>Welcome, ${firstName}!</b>\n\n` +
      '📝 <b>Step 1 of 4: Your display name</b>\n\n' +
      `Your Telegram name is <b>${firstName}</b>.\n` +
      'Would you like to keep this name or change it?',
    { parse_mode: 'HTML', reply_markup: buildConfirmNameKeyboard() }
  );
}

/**
 * Show the terms & privacy step.
 */
async function showTermsStep(ctx) {
  ctx.session.step = 'terms';
  await ctx.reply(
    '📄 <b>Step 4 of 4: Terms & Privacy</b>\n\n' +
      '• Your data (name, tasks, timezone) is stored securely.\n' +
      '• Tasks and reminders are private — only you can see them.\n' +
      '• You can delete your account at any time with /unregister.\n\n' +
      'By pressing <b>I Agree</b>, you consent to storing this data to provide the service.',
    { parse_mode: 'HTML', reply_markup: buildTermsKeyboard() }
  );
}

/**
 * Create the user record and show success message.
 */
async function finalizeUserRegistration(ctx) {
  const chatId = ctx.chat.id;
  const telegramUsername = ctx.from?.username || null;
  const session = ctx.session;

  const { finalizeRegistration } = require('../../services/registrationService');
  const user = await finalizeRegistration(chatId, telegramUsername, session);

  // Clear session state
  ctx.session.step = null;

  if (user.status === 'pending') {
    await ctx.reply(
      '⏳ <b>Registration Submitted!</b>\n\n' +
        'Your registration is pending admin approval.\n' +
        'You\'ll receive a notification once reviewed. Thank you for your patience!',
      { parse_mode: 'HTML' }
    );

    // Notify all admins
    await notifyAdminsForApproval(ctx, user);
    return;
  }

  // Active user — show quick-start guide
  const quickStart =
    '🎉 <b>Registration Complete!</b>\n\n' +
    `Welcome, <b>${user.display_name}</b>! Here\'s how to get started:\n\n` +
    '📌 <b>Add your first task:</b>\n' +
    '  /add Buy groceries | tomorrow | high\n\n' +
    '📋 <b>View your tasks:</b>\n' +
    '  /list\n\n' +
    '✅ <b>Complete a task:</b>\n' +
    '  /done 1\n\n' +
    '⏰ <b>Set a reminder:</b>\n' +
    '  /remind 1 in 2 hours\n\n' +
    'Type /help anytime to see all commands. Happy organizing! 🚀';

  await ctx.reply(quickStart, { parse_mode: 'HTML' });
}

/**
 * Notify admins of a new pending registration (approval mode).
 */
async function notifyAdminsForApproval(ctx, user) {
  for (const adminId of config.adminChatIds) {
    try {
      await ctx.api.sendMessage(
        adminId,
        `🔔 <b>New Registration Request</b>\n\n` +
          `👤 Name: <b>${user.display_name}</b>\n` +
          `🆔 Chat ID: <code>${user.chat_id}</code>\n` +
          `📛 Username: ${user.telegram_username ? '@' + user.telegram_username : 'N/A'}\n\n` +
          `Approve or reject this registration:`,
        {
          parse_mode: 'HTML',
          reply_markup: buildApprovalKeyboard(user.chat_id),
        }
      );
    } catch (err) {
      logger.error({ err, adminId }, 'Could not notify admin of new registration');
    }
  }
}

module.exports = { registerStartHandlers, HELP_TEXT };
