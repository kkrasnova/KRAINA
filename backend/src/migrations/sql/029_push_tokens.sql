-- Push tokens for VoIP and remote notifications.
-- Each user may have at most one active push token (upsert).

CREATE TABLE IF NOT EXISTS push_tokens (
    user_id     uuid        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    voip_token  text        NOT NULL,
    device_family text      NOT NULL DEFAULT 'ios',
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens (user_id);
