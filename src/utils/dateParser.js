'use strict';

const chrono = require('chrono-node');
const { DateTime } = require('luxon');

/**
 * Parse a natural-language date string relative to a user's timezone.
 *
 * @param {string} input  - e.g. "tomorrow 5pm", "next monday", "2024-12-25"
 * @param {string} timezone - IANA timezone string, e.g. "Asia/Bangkok"
 * @returns {Date|null}  UTC Date object, or null if parsing fails
 */
function parseDate(input, timezone = 'UTC') {
  if (!input || !input.trim()) return null;

  // Use the user's "now" and minute offset in their timezone as chrono reference
  const nowInTz = DateTime.now().setZone(timezone);
  const ref = {
    instant: nowInTz.toJSDate(),
    timezone: nowInTz.offset,
  };

  const parsed = chrono.parseDate(input.trim(), ref, {
    forwardDate: true,
  });

  return parsed || null;
}

/**
 * Format a UTC timestamp for display in the user's timezone.
 *
 * @param {Date|string} timestamp - UTC timestamp
 * @param {string} timezone - IANA timezone
 * @returns {string} Human-readable date/time string
 */
function formatDateTime(timestamp, timezone = 'UTC') {
  if (!timestamp) return 'No due date';
  return DateTime.fromJSDate(new Date(timestamp))
    .setZone(timezone)
    .toFormat('EEE, MMM d yyyy HH:mm');
}

/**
 * Format a timestamp as a relative string (e.g. "in 2 hours", "yesterday").
 *
 * @param {Date|string} timestamp
 * @param {string} timezone
 * @returns {string}
 */
function formatRelative(timestamp, timezone = 'UTC') {
  if (!timestamp) return '';
  return DateTime.fromJSDate(new Date(timestamp))
    .setZone(timezone)
    .toRelative();
}

/**
 * Check if a timestamp falls within today (in the user's timezone).
 *
 * @param {Date|string} timestamp
 * @param {string} timezone
 * @returns {boolean}
 */
function isToday(timestamp, timezone = 'UTC') {
  if (!timestamp) return false;
  const dt = DateTime.fromJSDate(new Date(timestamp)).setZone(timezone);
  const now = DateTime.now().setZone(timezone);
  return dt.hasSame(now, 'day');
}

/**
 * Check if a timestamp falls within this week (Mon–Sun in user's timezone).
 *
 * @param {Date|string} timestamp
 * @param {string} timezone
 * @returns {boolean}
 */
function isThisWeek(timestamp, timezone = 'UTC') {
  if (!timestamp) return false;
  const dt = DateTime.fromJSDate(new Date(timestamp)).setZone(timezone);
  const now = DateTime.now().setZone(timezone);
  return dt >= now.startOf('week') && dt <= now.endOf('week');
}

/**
 * Get start and end of today in UTC for a given timezone.
 *
 * @param {string} timezone
 * @returns {{ start: Date, end: Date }}
 */
function getTodayRange(timezone = 'UTC') {
  const now = DateTime.now().setZone(timezone);
  return {
    start: now.startOf('day').toUTC().toJSDate(),
    end: now.endOf('day').toUTC().toJSDate(),
  };
}

/**
 * Get start and end of this week in UTC for a given timezone.
 *
 * @param {string} timezone
 * @returns {{ start: Date, end: Date }}
 */
function getWeekRange(timezone = 'UTC') {
  const now = DateTime.now().setZone(timezone);
  return {
    start: now.startOf('week').toUTC().toJSDate(),
    end: now.endOf('week').toUTC().toJSDate(),
  };
}

/**
 * Extract natural language date from full text and return the date and cleaned text.
 * e.g. "Buy milk tomorrow at 5pm" -> { date: Date, cleanText: "Buy milk" }
 *
 * @param {string} text
 * @param {string} timezone
 * @returns {{ date: Date|null, cleanText: string }}
 */
function extractDateFromText(text, timezone = 'UTC') {
  if (!text || !text.trim()) return { date: null, cleanText: text || '' };

  const nowInTz = DateTime.now().setZone(timezone);
  const ref = {
    instant: nowInTz.toJSDate(),
    timezone: nowInTz.offset,
  };
  const results = chrono.parse(text, ref, { forwardDate: true });

  if (!results.length) {
    return { date: null, cleanText: text.trim() };
  }

  const result = results[0];
  const date = result.start.date();
  const before = text.substring(0, result.index);
  const after = text.substring(result.index + result.text.length);
  const cleanText = (before + ' ' + after).replace(/\s+/g, ' ').trim();

  return { date, cleanText };
}

module.exports = {
  parseDate,
  extractDateFromText,
  formatDateTime,
  formatRelative,
  isToday,
  isThisWeek,
  getTodayRange,
  getWeekRange,
};
