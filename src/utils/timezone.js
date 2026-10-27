'use strict';

const { DateTime } = require('luxon');
const chrono = require('chrono-node');

/**
 * Timezone utilities — validate IANA timezone strings.
 */

const COMMON_TIMEZONES = [
  { label: '🇰🇭 UTC+7 Phnom Penh', value: 'Asia/Phnom_Penh' },
  { label: '🌏 UTC+8 Singapore', value: 'Asia/Singapore' },
  { label: '🌏 UTC+9 Tokyo', value: 'Asia/Tokyo' },
  { label: '🌏 UTC+5:30 India', value: 'Asia/Kolkata' },
  { label: '🌍 UTC+0 London', value: 'Europe/London' },
  { label: '🌍 UTC+1 Paris', value: 'Europe/Paris' },
  { label: '🌎 UTC-5 New York', value: 'America/New_York' },
  { label: '🌎 UTC-8 Los Angeles', value: 'America/Los_Angeles' },
  { label: '🌎 UTC-3 São Paulo', value: 'America/Sao_Paulo' },
  { label: '🌏 UTC+10 Sydney', value: 'Australia/Sydney' },
];

/**
 * Validates an IANA timezone string.
 * @param {string} tz
 * @returns {boolean}
 */
function isValidTimezone(tz) {
  try {
    DateTime.now().setZone(tz, { keepLocalTime: false });
    return DateTime.now().setZone(tz).isValid;
  } catch {
    return false;
  }
}

/**
 * Attempt to resolve a city name or partial string to an IANA zone.
 * Falls back to validating the input directly.
 * @param {string} input
 * @returns {string|null}
 */
function resolveTimezone(input) {
  const trimmed = input.trim();
  if (isValidTimezone(trimmed)) return trimmed;

  // Try to match against common timezone list
  const lc = trimmed.toLowerCase();
  const match = COMMON_TIMEZONES.find(
    (tz) =>
      tz.value.toLowerCase().includes(lc) ||
      tz.label.toLowerCase().includes(lc)
  );
  return match ? match.value : null;
}

module.exports = { COMMON_TIMEZONES, isValidTimezone, resolveTimezone };
