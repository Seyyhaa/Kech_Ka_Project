'use strict';

const taskRepo = require('../repositories/taskRepository');
const reminderRepo = require('../repositories/reminderRepository');
const { parseDate, extractDateFromText, getWeekRange } = require('../utils/dateParser');
const logger = require('../utils/logger');

/**
 * TaskService — business logic for task management.
 * All methods receive userId (from the authenticated user) to ensure data isolation.
 */

/**
 * Parse the /add command input.
 * Supports BOTH natural language and structured pipe formats:
 * - Natural:   "Buy groceries tomorrow 5pm !high #shopping"
 * - Pipe:      "Buy groceries | tomorrow 5pm | high | #shopping"
 * - Shortcuts: !p1 / !high, !p2 / !med, !p3 / !low, @daily, @weekly
 *
 * @param {string} input
 * @param {string} timezone
 * @returns {{ title: string, dueAt: Date|null, priority: string, tags: string[], recurrence: string|null }}
 */
function parseAddInput(input, timezone) {
  let title = '';
  let dueAt = null;
  let priority = 'medium';
  let recurrence = null;

  // Extract hashtags from the full input
  const tagMatches = input.match(/#([\p{L}\p{N}_]+)/gu) || [];
  const tags = tagMatches.map((t) => t.slice(1).toLowerCase());

  // Check recurrence keywords
  const fullLower = input.toLowerCase();
  if (fullLower.includes('@daily') || fullLower.includes('every day') || fullLower.includes('recur:daily')) {
    recurrence = 'daily';
  } else if (fullLower.includes('@weekly') || fullLower.includes('every week') || fullLower.includes('recur:weekly')) {
    recurrence = 'weekly';
  } else if (fullLower.includes('@monthly') || fullLower.includes('every month') || fullLower.includes('recur:monthly')) {
    recurrence = 'monthly';
  }

  // 1. Structured Pipe Format: "Title | Due Date | Priority | Tags"
  if (input.includes('|')) {
    const parts = input.split('|').map((p) => p.trim());
    title = parts[0];

    if (parts[1]) {
      const parsed = parseDate(parts[1], timezone);
      if (parsed) dueAt = parsed;
    }

    if (parts[2]) {
      const p = parts[2].toLowerCase().trim();
      if (['low', 'medium', 'high'].includes(p)) priority = p;
    }
  } else {
    // 2. Natural Language Format: "Buy milk tomorrow 3pm !high #shopping"
    let workingText = input;

    // Extract priority token: !p1 / !high / !urgent, !p2 / !med, !p3 / !low
    const priorityMatch = workingText.match(/(?:^|\s)!(p1|p2|p3|high|med|medium|low|urgent)(?=\s|$)/i);
    if (priorityMatch) {
      const p = priorityMatch[1].toLowerCase();
      if (['p1', 'high', 'urgent'].includes(p)) priority = 'high';
      else if (['p2', 'med', 'medium'].includes(p)) priority = 'medium';
      else if (['p3', 'low'].includes(p)) priority = 'low';

      workingText = workingText.replace(/(?:^|\s)!(p1|p2|p3|high|med|medium|low|urgent)(?=\s|$)/gi, ' ');
    }

    // Strip recurrence markers from title
    workingText = workingText
      .replace(/@daily|@weekly|@monthly/gi, '')
      .replace(/\b(every day|every week|every month)\b/gi, '');

    // Strip hashtags from title
    workingText = workingText.replace(/#([\p{L}\p{N}_]+)/gu, '');

    // Extract date from sentence using chrono-node NLP
    const extracted = extractDateFromText(workingText, timezone);
    if (extracted.date) {
      dueAt = extracted.date;
      title = extracted.cleanText;
    } else {
      title = workingText.trim();
    }
  }

  // Clean up whitespace and ensure title is not empty
  title = title.replace(/\s+/g, ' ').trim();
  if (!title) {
    title = input.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return { title, dueAt, priority, tags, recurrence };
}

/**
 * Add a new task for a user.
 *
 * @param {number} userId
 * @param {string} input
 * @param {string} timezone
 * @returns {Promise<Object>} Created task
 */
async function addTask(userId, input, timezone) {
  if (!input || !input.trim()) {
    throw new Error('Task title cannot be empty.');
  }

  const { title, dueAt, priority, tags, recurrence } = parseAddInput(input, timezone);

  const task = await taskRepo.create({ userId, title, priority, dueAt, recurrence });

  if (tags.length) {
    await taskRepo.saveTags(task.id, userId, tags);
  }

  logger.info({ userId, taskId: task.id }, 'Task created');
  return { ...task, tags };
}

/**
 * List tasks with pagination.
 */
async function listTasks(userId, { page = 1, pageSize = 5, tagFilter = null } = {}) {
  return taskRepo.listByUser(userId, { page, pageSize, tagFilter });
}

/**
 * List tasks due today.
 */
async function listToday(userId, timezone) {
  const { getTodayRange } = require('../utils/dateParser');
  const { start, end } = getTodayRange(timezone);
  return taskRepo.listTodayByUser(userId, start, end);
}

/**
 * List tasks due this week.
 */
async function listWeek(userId, timezone) {
  const { start, end } = getWeekRange(timezone);
  return taskRepo.listWeekByUser(userId, start, end);
}

/**
 * Mark a task as done.
 */
async function completeTask(userId, taskId) {
  const task = await taskRepo.markDone(taskId, userId);
  if (!task) throw new Error(`Task #${taskId} not found or already deleted.`);

  // Cancel any pending reminders
  await reminderRepo.deleteByTaskId(taskId);

  // Handle recurring tasks — create the next occurrence
  if (task.recurrence) {
    await createNextOccurrence(task, userId);
  }

  logger.info({ userId, taskId }, 'Task marked done');
  return task;
}

/**
 * Create the next occurrence of a recurring task.
 * @param {Object} task
 * @param {number} userId
 */
async function createNextOccurrence(task, userId) {
  const { DateTime } = require('luxon');
  let nextDue = task.due_at ? new Date(task.due_at) : new Date();
  const dt = DateTime.fromJSDate(nextDue);

  if (task.recurrence === 'daily') {
    nextDue = dt.plus({ days: 1 }).toJSDate();
  } else if (task.recurrence === 'weekly') {
    nextDue = dt.plus({ weeks: 1 }).toJSDate();
  } else if (task.recurrence === 'monthly') {
    nextDue = dt.plus({ months: 1 }).toJSDate();
  }

  await taskRepo.create({
    userId,
    title: task.title,
    priority: task.priority,
    dueAt: nextDue,
    recurrence: task.recurrence,
  });
}

/**
 * Edit a task's title (and optionally more fields).
 */
async function editTask(userId, taskId, newTitle) {
  if (!newTitle || !newTitle.trim()) throw new Error('New title cannot be empty.');
  const task = await taskRepo.update(taskId, userId, { title: newTitle.trim() });
  if (!task) throw new Error(`Task #${taskId} not found.`);
  logger.info({ userId, taskId }, 'Task edited');
  return task;
}

/**
 * Delete a task (soft-delete).
 */
async function deleteTask(userId, taskId) {
  const task = await taskRepo.softDelete(taskId, userId);
  if (!task) throw new Error(`Task #${taskId} not found.`);
  await reminderRepo.deleteByTaskId(taskId);
  logger.info({ userId, taskId }, 'Task deleted');
  return task;
}

/**
 * Set a reminder for a task.
 */
async function setReminder(userId, taskId, timeInput, timezone) {
  const task = await taskRepo.findByIdAndUserId(taskId, userId);
  if (!task) throw new Error(`Task #${taskId} not found.`);

  const remindAt = parseDate(timeInput, timezone);
  if (!remindAt) throw new Error(`Could not parse time: "${timeInput}"`);
  if (remindAt < new Date()) throw new Error('Reminder time must be in the future.');

  const reminder = await reminderRepo.create(taskId, remindAt);
  logger.info({ userId, taskId, reminderId: reminder.id }, 'Reminder set');
  return { task, reminder };
}

/**
 * Get weekly stats for a user.
 */
async function getStats(userId, timezone) {
  const { start, end } = getWeekRange(timezone);
  const stats = await taskRepo.getStats(userId, start, end);
  return {
    totalThisWeek: parseInt(stats.totalThisWeek, 10),
    doneThisWeek: parseInt(stats.doneThisWeek, 10),
    pendingThisWeek: parseInt(stats.pendingThisWeek, 10),
    totalAll: parseInt(stats.totalAll, 10),
    doneAll: parseInt(stats.doneAll, 10),
    pendingAll: parseInt(stats.pendingAll, 10) || 0,
  };
}

module.exports = {
  addTask,
  listTasks,
  listToday,
  listWeek,
  completeTask,
  editTask,
  deleteTask,
  setReminder,
  getStats,
  parseAddInput,
};
