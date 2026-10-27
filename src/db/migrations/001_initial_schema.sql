-- Migration: 001_initial_schema.sql
-- Creates the full database schema for the Telegram Task Manager Bot.
-- Run with: npm run migrate

-- ─────────────────────────────────────────────────────────────────────────────
-- USERS
-- Stores registered Telegram users.
-- status: pending (awaiting approval) | active | rejected | blocked
-- role:   user | admin
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                SERIAL       PRIMARY KEY,
  chat_id           BIGINT       UNIQUE NOT NULL,
  telegram_username VARCHAR(255),
  display_name      VARCHAR(255) NOT NULL,
  status            VARCHAR(20)  NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'rejected', 'blocked')),
  role              VARCHAR(20)  NOT NULL DEFAULT 'user'
                    CHECK (role IN ('user', 'admin')),
  timezone          VARCHAR(100) NOT NULL DEFAULT 'UTC',
  summary_time      TIME         NOT NULL DEFAULT '08:00:00',
  terms_accepted_at TIMESTAMPTZ,
  registered_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INVITE CODES
-- Single-use or limited-use codes for invite-mode registration.
-- created_by references the admin's chat_id (not user.id) for flexibility.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invite_codes (
  id          SERIAL       PRIMARY KEY,
  code        VARCHAR(64)  UNIQUE NOT NULL,
  created_by  BIGINT       REFERENCES users(chat_id) ON DELETE SET NULL,
  max_uses    INT          NOT NULL DEFAULT 1,
  used_count  INT          NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- BOT SESSIONS
-- Persists grammy session state (registration flow, inline-edit state) across
-- server restarts. Key is the Telegram chat_id as a string.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_sessions (
  key        VARCHAR(255) PRIMARY KEY,
  data       JSONB        NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TASKS
-- user_id cascades on delete so removing a user wipes their tasks.
-- due_at stored as TIMESTAMPTZ (UTC).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id           SERIAL       PRIMARY KEY,
  user_id      INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT         NOT NULL,
  priority     VARCHAR(10)  NOT NULL DEFAULT 'medium'
               CHECK (priority IN ('low', 'medium', 'high')),
  status       VARCHAR(20)  NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'in_progress', 'done', 'deleted')),
  due_at       TIMESTAMPTZ,
  recurrence   VARCHAR(20)
               CHECK (recurrence IN ('daily', 'weekly', 'monthly') OR recurrence IS NULL),
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TAGS
-- Per-user tag namespace. Tags are lowercased and unique per user.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
  id      SERIAL       PRIMARY KEY,
  user_id INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name    VARCHAR(100) NOT NULL,
  UNIQUE (user_id, name)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TASK_TAGS (many-to-many join table)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_tags (
  task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  INT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- REMINDERS
-- task_id cascades on delete (deleting a task removes its reminders).
-- sent = FALSE means it hasn't been dispatched yet.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reminders (
  id         SERIAL      PRIMARY KEY,
  task_id    INT         NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  remind_at  TIMESTAMPTZ NOT NULL,
  sent       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- Tuned for the most common query patterns.
-- ─────────────────────────────────────────────────────────────────────────────

-- User lookups by Telegram chat_id (every single request)
CREATE INDEX IF NOT EXISTS idx_users_chat_id
  ON users(chat_id);

-- Task listings for a user filtered by status (the /list, /today, /week commands)
CREATE INDEX IF NOT EXISTS idx_tasks_user_status
  ON tasks(user_id, status);

-- Tasks ordered/filtered by due date (today/week queries)
CREATE INDEX IF NOT EXISTS idx_tasks_due_at
  ON tasks(due_at);

-- Reminder dispatch: only unsent reminders need to be scanned
CREATE INDEX IF NOT EXISTS idx_reminders_due
  ON reminders(remind_at)
  WHERE sent = FALSE;

-- Session lookups (every update)
CREATE INDEX IF NOT EXISTS idx_bot_sessions_key
  ON bot_sessions(key);

-- Tag lookups by name within a user namespace
CREATE INDEX IF NOT EXISTS idx_tags_user_name
  ON tags(user_id, name);
