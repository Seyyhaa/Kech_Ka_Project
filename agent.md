# AI Agent Guide

> **Note:** The full, comprehensive AI agent specification and architectural manual is maintained in [AGENTS.md](AGENTS.md).
> Please refer to [AGENTS.md](AGENTS.md) for detailed architecture, database design, request lifecycle, coding rules, and recipes.

---

## Quick Reference for AI Assistants

- **Stack:** Node.js (CommonJS), Express.js v4, grammy v1, PostgreSQL 14+ (`pg`), Luxon, chrono-node, node-cron, Pino.
- **Entry Points:**
  - `src/app.js`: Express server, bot initialization, webhook setup, cron scheduler, graceful shutdown.
  - `migrate.js`: Database migration runner (`npm run migrate`).
- **Core Architecture:**
  - **Webhook Mode:** `POST /webhook` with `X-Telegram-Bot-Api-Secret-Token` (Express -> `webhookGuard` -> `bot.handleUpdate`).
  - **Middleware Pipeline:** `pgSessionStorage` (`bot_sessions` table) -> `accessControl` (blocks pending/unregistered/blocked users, attaches `ctx.user`) -> Command Handlers.
  - **Three-Tier Separation:** Bot Handlers (`src/bot/commands/`) -> Services (`src/services/`) -> Repositories (`src/repositories/`).
- **Critical Invariants:**
  1. **Strictly CommonJS:** Always use `'use strict'`, `require`, and `module.exports`. Never use ES module `import`/`export`.
  2. **Config Single Source of Truth:** Never access `process.env` directly; import from `src/config/index.js`.
  3. **No Direct SQL in Handlers/Services:** All SQL must live in `src/repositories/` using parameterized queries (`$1, $2, ...`).
  4. **HTML Parse Mode:** All Telegram messages use `HTML`. Always escape user input using `escapeHtml()` from `src/utils/formatters.js`.
  5. **UTC in Database, Local Time in UI:** Store `TIMESTAMPTZ` in UTC. Parse and display dates using the user's IANA timezone (`ctx.user.timezone`).
  6. **Clean Up Session State:** Reset `ctx.session.step = null` once a multi-step conversation flow completes.
  7. **Answer Callback Queries:** Always call `await ctx.answerCallbackQuery()` on button interactions.

For detailed instructions, see [AGENTS.md](AGENTS.md).
