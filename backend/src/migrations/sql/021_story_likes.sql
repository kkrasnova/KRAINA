CREATE TABLE IF NOT EXISTS story_likes (
  story_id uuid NOT NULL REFERENCES stories (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  liked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, user_id)
);

CREATE INDEX IF NOT EXISTS story_likes_story_idx ON story_likes (story_id);
