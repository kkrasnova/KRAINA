-- Tier 1 production indexes.
-- All use CREATE INDEX IF NOT EXISTS (non-CONCURRENT) so they run safely
-- inside the BEGIN/COMMIT transaction that the migration runner wraps around
-- each file. CREATE INDEX CONCURRENTLY is forbidden inside a transaction.
--
-- Impact:
--   posts_user_created_active_idx   — eliminates seq-scan on listMyPosts /
--                                     listUserPostsForViewer (hits at 10k posts/user)
--   posts_visibility_created_active_idx — eliminates seq-scan on listWorldPosts
--                                         (hits at ~5k total public posts)
--   notifications_user_created_idx  — eliminates seq-scan on notification queries
--                                     (hits at ~1k notifications/user)
--   notifications_user_unread_idx   — fast unread-badge count without full table scan
--   push_tokens_user_idx            — eliminates seq-scan when looking up push tokens
--                                     during notification fan-out

CREATE INDEX IF NOT EXISTS posts_user_created_active_idx
  ON posts (user_id, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS posts_visibility_created_active_idx
  ON posts (visibility, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (user_id, is_read)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS push_tokens_user_idx
  ON push_tokens (user_id);
