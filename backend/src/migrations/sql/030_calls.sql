-- Audio call history (LiveKit-based)
-- Stores every call attempt so both participants can review their call log.

CREATE TABLE IF NOT EXISTS call_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_name     TEXT NOT NULL UNIQUE,           -- LiveKit room name (unique per call)
  caller_id     UUID NOT NULL REFERENCES users(id),
  callee_id     UUID NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','ringing','active','ended','missed','declined')),
  started_at    TIMESTAMPTZ,                    -- when the call became 'active'
  ended_at      TIMESTAMPTZ,                    -- when either side hung up
  duration_seconds INT DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_history_caller   ON call_history(caller_id);
CREATE INDEX IF NOT EXISTS idx_call_history_callee   ON call_history(callee_id);
CREATE INDEX IF NOT EXISTS idx_call_history_status   ON call_history(status);
CREATE INDEX IF NOT EXISTS idx_call_history_created  ON call_history(created_at DESC);
