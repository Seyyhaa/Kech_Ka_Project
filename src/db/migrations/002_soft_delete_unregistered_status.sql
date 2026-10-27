-- Migration: 002_soft_delete_unregistered_status.sql
-- Allow 'unregistered' status for soft deletion of users so tasks are preserved.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;

ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('pending', 'active', 'rejected', 'blocked', 'unregistered'));
