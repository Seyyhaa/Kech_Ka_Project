'use strict';

const adminService = require('../../services/adminService');
const userRepo = require('../../repositories/userRepository');
const {
  buildAdminUsersPaginationKeyboard,
  buildApprovalKeyboard,
} = require('../keyboards');
const { formatAdminStats } = require('../../utils/formatters');
const config = require('../../config/index');
const logger = require('../../utils/logger');

/**
 * Admin middleware — rejects non-admin callers before any admin handler.
 */
function adminOnly(ctx, next) {
  const chatId = ctx.chat?.id || ctx.from?.id;
  if (!adminService.isAdmin(chatId)) {
    return ctx.reply('🚫 You do not have permission to use this command.');
  }
  return next();
}

/**
 * Register all admin command handlers.
 * @param {import('grammy').Bot} bot
 */
function registerAdminHandlers(bot) {
  // ── /admin_users [page] ───────────────────────────────────────────────────
  bot.command('admin_users', adminOnly, async (ctx) => {
    const page = parseInt(ctx.message.text.split(' ')[1] || '1', 10);
    await sendUserList(ctx, page);
  });

  // Paginate users via inline buttons
  bot.callbackQuery(/^admin:users:(\d+)$/, adminOnly, async (ctx) => {
    await ctx.answerCallbackQuery();
    const page = parseInt(ctx.match[1], 10);
    await sendUserList(ctx, page, true);
  });

  // ── /admin_approve <chat_id> ──────────────────────────────────────────────
  bot.command('admin_approve', adminOnly, async (ctx) => {
    const targetId = parseInt(ctx.message.text.split(' ')[1] || '0', 10);
    if (!targetId) {
      await ctx.reply('Usage: /admin_approve <chat_id>');
      return;
    }
    await approveUser(ctx, targetId);
  });

  // Approve via inline button (from notification message)
  bot.callbackQuery(/^admin:approve:(\d+)$/, adminOnly, async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetId = parseInt(ctx.match[1], 10);
    await approveUser(ctx, targetId, true);
  });

  // ── /admin_reject <chat_id> ───────────────────────────────────────────────
  bot.callbackQuery(/^admin:reject:(\d+)$/, adminOnly, async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetId = parseInt(ctx.match[1], 10);
    const user = await adminService.rejectUser(targetId);
    if (!user) {
      await ctx.editMessageText('❌ User not found.');
      return;
    }
    await ctx.editMessageText(
      `❌ Registration for <b>${user.display_name}</b> (<code>${targetId}</code>) rejected.`,
      { parse_mode: 'HTML' }
    );
    // Notify the user
    try {
      await ctx.api.sendMessage(
        targetId,
        '❌ <b>Registration Rejected</b>\n\nYour registration request was not approved. Please contact the bot admin for more information.',
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      logger.warn({ err, targetId }, 'Could not notify rejected user');
    }
  });

  // ── /admin_block <chat_id> ────────────────────────────────────────────────
  bot.command('admin_block', adminOnly, async (ctx) => {
    const targetId = parseInt(ctx.message.text.split(' ')[1] || '0', 10);
    if (!targetId) { await ctx.reply('Usage: /admin_block <chat_id>'); return; }
    const user = await adminService.blockUser(targetId);
    await ctx.reply(
      user
        ? `🚫 User <b>${user.display_name}</b> (<code>${targetId}</code>) blocked.`
        : '❌ User not found.',
      { parse_mode: 'HTML' }
    );
  });

  // ── /admin_unblock <chat_id> ──────────────────────────────────────────────
  bot.command('admin_unblock', adminOnly, async (ctx) => {
    const targetId = parseInt(ctx.message.text.split(' ')[1] || '0', 10);
    if (!targetId) { await ctx.reply('Usage: /admin_unblock <chat_id>'); return; }
    const user = await adminService.unblockUser(targetId);
    await ctx.reply(
      user
        ? `✅ User <b>${user.display_name}</b> (<code>${targetId}</code>) unblocked.`
        : '❌ User not found.',
      { parse_mode: 'HTML' }
    );
  });

  // ── /admin_invite ─────────────────────────────────────────────────────────
  bot.command('admin_invite', adminOnly, async (ctx) => {
    const adminChatId = ctx.chat.id;
    const code = await adminService.generateInviteCode(adminChatId);
    await ctx.reply(
      `🎟️ <b>New Invite Code Generated</b>\n\n` +
        `Code: <code>${code.code}</code>\n` +
        `Max uses: ${code.max_uses}\n` +
        `Expires: ${code.expires_at ? new Date(code.expires_at).toDateString() : 'Never'}\n\n` +
        `Share this link:\n` +
        `<code>/register ${code.code}</code>`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /admin_stats ──────────────────────────────────────────────────────────
  bot.command('admin_stats', adminOnly, async (ctx) => {
    const stats = await adminService.getStats();
    await ctx.reply(formatAdminStats(stats), { parse_mode: 'HTML' });
  });
}

/**
 * Send paginated user list.
 */
async function sendUserList(ctx, page, editMessage = false) {
  const { rows, total } = await adminService.listUsers(page, config.pageSize);
  const totalPages = Math.ceil(total / config.pageSize);

  if (!rows.length) {
    const msg = '👥 No users found.';
    editMessage ? await ctx.editMessageText(msg) : await ctx.reply(msg);
    return;
  }

  const statusEmoji = { active: '✅', pending: '⏳', rejected: '❌', blocked: '🚫' };
  const userLines = rows.map((u) =>
    `${statusEmoji[u.status] || '❓'} <b>${u.display_name}</b> ` +
    `(<code>${u.chat_id}</code>) — ${u.role} — ${u.status}`
  );

  const text =
    `👥 <b>Users</b> (${total} total, page ${page}/${totalPages})\n\n` +
    userLines.join('\n');

  const kb = buildAdminUsersPaginationKeyboard(page, totalPages);
  const opts = { parse_mode: 'HTML', reply_markup: kb };

  editMessage
    ? await ctx.editMessageText(text, opts)
    : await ctx.reply(text, opts);
}

/**
 * Approve a user and notify them.
 */
async function approveUser(ctx, targetId, editMessage = false) {
  const user = await adminService.approveUser(targetId);
  if (!user) {
    const msg = '❌ User not found.';
    editMessage ? await ctx.editMessageText(msg) : await ctx.reply(msg);
    return;
  }

  const text = `✅ User <b>${user.display_name}</b> (<code>${targetId}</code>) approved!`;
  editMessage
    ? await ctx.editMessageText(text, { parse_mode: 'HTML' })
    : await ctx.reply(text, { parse_mode: 'HTML' });

  // Notify the user
  try {
    await ctx.api.sendMessage(
      targetId,
      '🎉 <b>Registration Approved!</b>\n\nWelcome! You now have full access to the bot.\nType /help to see all available commands.',
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    logger.warn({ err, targetId }, 'Could not notify approved user');
  }
}

module.exports = { registerAdminHandlers };
