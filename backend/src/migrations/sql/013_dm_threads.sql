
CREATE TABLE dm_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_low uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  user_high uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  pending_for_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_low, user_high),
  CHECK (user_low < user_high)
);

CREATE INDEX idx_dm_threads_low ON dm_threads (user_low);
CREATE INDEX idx_dm_threads_high ON dm_threads (user_high);
CREATE INDEX idx_dm_threads_pending ON dm_threads (pending_for_user_id)
  WHERE pending_for_user_id IS NOT NULL;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES dm_threads (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_messages_thread_sent ON messages (thread_id, sent_at DESC);
