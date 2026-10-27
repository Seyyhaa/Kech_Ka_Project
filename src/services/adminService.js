'use strict';

const userRepo = require('../repositories/userRepository');
const taskRepo = require('../repositories/taskRepository');
const inviteRepo = require('../repositories/inviteCodeRepository');
const config = require('../config/index');
const logger = require('../utils/logger');

/**
 * AdminService — manages admin operations.
 * All methods check that the caller is in ADMIN_CHAT_IDS.
 */

/**
 * Check if a chat_id belongs to an admin.
 * @param {number} chatId
 * @returns {boolean}
 */
function isAdmin(chatId) {
  return config.adminChatIds.includes(Number(chatId));
}

/**
 * Paginated user list for /admin_users.
 */
async function listUsers(page = 1, pageSize = 5) {
  return userRepo.listAll(page, pageSize);
}

/**
 * Approve a pending user.
 * @param {number} targetChatId
 * @returns {Promise<Object|null>}
 */
async function approveUser(targetChatId) {
  const user = await userRepo.updateByChatId(targetChatId, {
    status: 'active',
    registeredAt: new Date(),
  });
  if (!user) return null;
  logger.info({ targetChatId }, 'Admin approved user');
  return user;
}

/**
 * Reject a pending user.
 * @param {number} targetChatId
 * @returns {Promise<Object|null>}
 */
async function rejectUser(targetChatId) {
  const user = await userRepo.updateByChatId(targetChatId, { status: 'rejected' });
  if (!user) return null;
  logger.info({ targetChatId }, 'Admin rejected user');
  return user;
}

/**
 * Block an active user.
 */
async function blockUser(targetChatId) {
  const user = await userRepo.updateByChatId(targetChatId, { status: 'blocked' });
  logger.info({ targetChatId }, 'Admin blocked user');
  return user;
}

/**
 * Unblock a user.
 */
async function unblockUser(targetChatId) {
  const user = await userRepo.updateByChatId(targetChatId, { status: 'active' });
  logger.info({ targetChatId }, 'Admin unblocked user');
  return user;
}

/**
 * Generate an invite code.
 * @param {number} adminChatId
 */
async function generateInviteCode(adminChatId) {
  const code = await inviteRepo.create(adminChatId, { maxUses: 1 });
  logger.info({ adminChatId, code: code.code }, 'Invite code generated');
  return code;
}

/**
 * Get aggregated stats.
 */
async function getStats() {
  const [userStats, taskStats] = await Promise.all([
    userRepo.getAdminStats(),
    taskRepo.getAdminTaskStats(),
  ]);
  return {
    totalUsers: parseInt(userStats.totalUsers, 10),
    activeUsers: parseInt(userStats.activeUsers, 10),
    pendingUsers: parseInt(userStats.pendingUsers, 10),
    blockedUsers: parseInt(userStats.blockedUsers, 10),
    totalTasks: parseInt(taskStats.totalTasks, 10),
    completedTasks: parseInt(taskStats.completedTasks, 10),
  };
}

module.exports = {
  isAdmin,
  listUsers,
  approveUser,
  rejectUser,
  blockUser,
  unblockUser,
  generateInviteCode,
  getStats,
};
