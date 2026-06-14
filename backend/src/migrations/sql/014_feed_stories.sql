
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stories'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stories' AND column_name = 'location_id'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stories' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE stories RENAME TO location_stories;
  END IF;
END $$;


ALTER TABLE posts ADD COLUMN IF NOT EXISTS place_label text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS lng double precision;


CREATE TABLE IF NOT EXISTS stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  media_url text NOT NULL,
  media_kind text NOT NULL DEFAULT 'image' CHECK (media_kind IN ('image', 'video')),
  caption text CHECK (caption IS NULL OR char_length(caption) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS stories_user_created_idx ON stories (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stories_expires_idx ON stories (expires_at);

CREATE TABLE IF NOT EXISTS story_views (
  story_id uuid NOT NULL REFERENCES stories (id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS story_views_story_idx ON story_views (story_id);
