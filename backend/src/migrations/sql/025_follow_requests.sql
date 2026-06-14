CREATE TABLE IF NOT EXISTS follow_requests (
  follower_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);

CREATE INDEX IF NOT EXISTS follow_requests_followee_idx ON follow_requests (followee_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS follow_requests_follower_idx ON follow_requests (follower_id, requested_at DESC);
