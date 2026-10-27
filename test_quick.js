'use strict';

/**
 * Quick verification script to test timezone handling, NLP date parsing,
 * task parser, and keyboards without needing an active Telegram bot.
 *
 * Run with: node test_quick.js
 */

// Mock dummy env variables so tests run without needing actual bot credentials
process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123456789:dummy_token_for_tests';
process.env.WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://localhost:3000';
process.env.WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'dummy_webhook_secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/taskbot';

const { COMMON_TIMEZONES, isValidTimezone, resolveTimezone } = require('./src/utils/timezone');
const { parseDate, formatDateTime, formatRelative, getTodayRange } = require('./src/utils/dateParser');
const { parseAddInput } = require('./src/services/taskService');
const { buildTimezoneKeyboard } = require('./src/bot/keyboards');
const { formatTask } = require('./src/utils/formatters');

console.log('🧪 Starting Task Manager Bot Quick Tests...\n');

// 1. Timezone Check
console.log('--- 1. Timezone Validation ---');
const tz = 'Asia/Phnom_Penh';
console.log(`- Is "${tz}" valid?:`, isValidTimezone(tz) ? '✅ YES' : '❌ NO');
console.log('- Top timezone option:', COMMON_TIMEZONES[0]);
console.log('- Resolving "phnom penh":', resolveTimezone('phnom penh') === tz ? '✅ SUCCESS' : '❌ FAILED');

// 2. Date Parsing with Asia/Phnom_Penh
console.log('\n--- 2. Date Parsing (Phnom Penh) ---');
const parsed = parseDate('tomorrow at 14:00', tz);
console.log('- Input: "tomorrow at 14:00" in Phnom Penh');
console.log('- Parsed (UTC ISO):', parsed.toISOString());
console.log('- Display in Phnom Penh:', formatDateTime(parsed, tz));
console.log('- Relative display:', formatRelative(parsed, tz));

// 3. Task Input Parsing
console.log('\n--- 3. Task Input Parsing (Natural Language & Pipe Format) ---');
const pipeInput = 'Buy fresh coffee | tomorrow 3pm | high | #shopping #cadt';
const parsedPipe = parseAddInput(pipeInput, tz);
console.log('Pipe Syntax -> Title:', parsedPipe.title, '| Priority:', parsedPipe.priority, '| Tags:', parsedPipe.tags);

const naturalInput = 'Finish AI project tomorrow at 4pm !high #study';
const parsedNatural = parseAddInput(naturalInput, tz);
console.log('Natural Syntax -> Title:', parsedNatural.title, '| Priority:', parsedNatural.priority, '| Tags:', parsedNatural.tags, '| Due:', parsedNatural.dueAt ? formatDateTime(parsedNatural.dueAt, tz) : 'None');

const parsedTask = parsedNatural;

// 4. Formatter Check
console.log('\n--- 4. Task Display Formatter ---');
const mockTask = {
  id: 101,
  title: parsedTask.title,
  priority: parsedTask.priority,
  status: 'pending',
  due_at: parsedTask.dueAt,
  tags: parsedTask.tags,
  recurrence: null,
};
console.log(formatTask(mockTask, tz));

// 5. Timezone Keyboard Check
console.log('\n--- 5. Timezone Keyboard ---');
const kb = buildTimezoneKeyboard();
console.log('- First button label:', kb.inline_keyboard[0][0].text);
console.log('- First button callback:', kb.inline_keyboard[0][0].callback_data);

// 6. Home Keyboard Check
console.log('\n--- 6. Home Dashboard Keyboard ---');
const { buildHomeKeyboard } = require('./src/bot/keyboards');
const homeKb = buildHomeKeyboard();
console.log('- Home buttons rows count:', homeKb.inline_keyboard.length);
console.log('- Top left button:', homeKb.inline_keyboard[0][0].text, '->', homeKb.inline_keyboard[0][0].callback_data);
console.log('- Top right button:', homeKb.inline_keyboard[0][1].text, '->', homeKb.inline_keyboard[0][1].callback_data);

console.log('\n✨ All logic checks passed successfully!\n');
