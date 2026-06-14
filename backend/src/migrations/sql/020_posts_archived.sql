ALTER TABLE posts ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS posts_user_archived_idx ON posts (user_id, archived_at DESC)
  WHERE archived_at IS NOT NULL;
