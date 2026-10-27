-- Seed data for development and testing.
-- Run manually: psql $DATABASE_URL -f src/db/seeds/001_seed.sql
-- DO NOT run in production.

-- Admin user (replace with your actual Telegram chat_id)
INSERT INTO users (chat_id, display_name, status, role, timezone, summary_time, terms_accepted_at, registered_at)
VALUES (123456789, 'Admin User', 'active', 'admin', 'Asia/Bangkok', '08:00:00', NOW(), NOW())
ON CONFLICT (chat_id) DO NOTHING;

-- Sample regular user
INSERT INTO users (chat_id, display_name, status, role, timezone, summary_time, terms_accepted_at, registered_at)
VALUES (987654321, 'Test User', 'active', 'user', 'UTC', '09:00:00', NOW(), NOW())
ON CONFLICT (chat_id) DO NOTHING;

-- Sample invite code (for invite mode testing)
INSERT INTO invite_codes (code, created_by, max_uses, used_count)
VALUES ('TESTCODE123', 123456789, 5, 0)
ON CONFLICT (code) DO NOTHING;

-- Sample tasks for the test user
WITH u AS (SELECT id FROM users WHERE chat_id = 987654321 LIMIT 1)
INSERT INTO tasks (user_id, title, priority, status, due_at, created_at, updated_at)
SELECT
  u.id, 'Buy groceries', 'high', 'pending', NOW() + INTERVAL '1 day', NOW(), NOW() FROM u
UNION ALL
SELECT u.id, 'Read a book', 'low', 'pending', NOW() + INTERVAL '3 days', NOW(), NOW() FROM u
UNION ALL
SELECT u.id, 'Exercise', 'medium', 'pending', NOW() + INTERVAL '1 hour', NOW(), NOW() FROM u
UNION ALL
SELECT u.id, 'Learn PostgreSQL', 'high', 'done', NOW() - INTERVAL '1 day', NOW(), NOW() FROM u;
