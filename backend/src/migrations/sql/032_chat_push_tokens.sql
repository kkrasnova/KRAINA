-- Chat message push notifications: add Expo Push Token column
-- Each user can have both a VoIP token (calls) and an Expo push token (chat messages).

ALTER TABLE push_tokens
  ADD COLUMN IF NOT EXISTS expo_push_token text;

CREATE INDEX IF NOT EXISTS idx_push_tokens_expo
  ON push_tokens (expo_push_token)
  WHERE expo_push_token IS NOT NULL;
