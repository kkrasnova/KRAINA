-- Tier 2 operational indexes.
-- All non-CONCURRENT — compatible with the BEGIN/COMMIT migration runner.
--
-- SKIPPED: refresh_tokens (user_id) index.
--   Already exists as idx_refresh_tokens_user_id, created in 002_users_auth.sql.
--   Creating refresh_tokens_user_idx here would produce a redundant duplicate
--   index with a different name on the same column, wasting storage and adding
--   write overhead on every INSERT/DELETE. No action needed.
--
-- NEW indexes below:

-- Speeds up the per-thread unread badge count subquery in listThreads:
--   (SELECT COUNT(*) FROM messages WHERE thread_id=b.id AND receiver_id=$1 AND is_read=false)
-- Partial index (is_read=false) keeps it small — only unread rows are indexed.
-- thread_id IS NOT NULL guard excludes legacy messages created before dm_threads.
CREATE INDEX IF NOT EXISTS messages_unread_idx
  ON messages (thread_id, receiver_id)
  WHERE is_read = false AND thread_id IS NOT NULL;

-- Speeds up the cleanup worker batch-delete query:
--   WHERE expires_at < now() - INTERVAL '1 day' LIMIT 500
-- Also speeds up the rotateRefreshToken expiry check and token theft detection.
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_idx
  ON refresh_tokens (expires_at);

-- password_reset_tokens has no indexes at all (002_users_auth.sql omitted them).
-- authService does: DELETE FROM password_reset_tokens WHERE user_id = $1
-- Without this index that is a sequential scan.
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON password_reset_tokens (user_id);

-- Speeds up the cleanup worker delete:
--   WHERE expires_at < now()
-- Also speeds up the validity check in resetPasswordWithToken:
--   WHERE token_hash = $1 AND expires_at > now()
-- (token_hash already has a UNIQUE index; adding expires_at as a standalone
--  index is still useful for the cleanup scan which doesn't filter by token_hash.)
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_idx
  ON password_reset_tokens (expires_at);
