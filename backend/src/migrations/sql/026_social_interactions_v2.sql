-- backend/src/migrations/sql/026_social_interactions_v2.sql

-- Counts
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS reposts_count integer NOT NULL DEFAULT 0;

-- Comments: replies, likes, soft delete
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES comments (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS likes_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS comments_post_created_idx
  ON comments (post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS comments_parent_idx
  ON comments (parent_comment_id, created_at ASC)
  WHERE parent_comment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id uuid NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  liked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS comment_likes_user_idx
  ON comment_likes (user_id, liked_at DESC);

-- Reposts
CREATE TABLE IF NOT EXISTS post_reposts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  caption text CHECK (caption IS NULL OR char_length(caption) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS post_reposts_post_idx
  ON post_reposts (post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS post_reposts_user_created_idx
  ON post_reposts (user_id, created_at DESC);

-- Helpful indexes for scalable social graph/feed
CREATE INDEX IF NOT EXISTS follows_following_idx
  ON follows (following_id, followed_at DESC);

CREATE INDEX IF NOT EXISTS follows_follower_idx
  ON follows (follower_id, followed_at DESC);

CREATE INDEX IF NOT EXISTS post_likes_post_idx
  ON post_likes (post_id, liked_at DESC);

-- Repair counters after old bugs/manual DB edits
UPDATE posts p
SET likes_count = COALESCE(x.cnt, 0)
FROM (
  SELECT p2.id, COUNT(pl.user_id)::int AS cnt
  FROM posts p2
  LEFT JOIN post_likes pl ON pl.post_id = p2.id
  GROUP BY p2.id
) x
WHERE x.id = p.id;

UPDATE posts p
SET comments_count = COALESCE(x.cnt, 0)
FROM (
  SELECT p2.id, COUNT(c.id)::int AS cnt
  FROM posts p2
  LEFT JOIN comments c ON c.post_id = p2.id AND c.deleted_at IS NULL
  GROUP BY p2.id
) x
WHERE x.id = p.id;

UPDATE posts p
SET reposts_count = COALESCE(x.cnt, 0)
FROM (
  SELECT p2.id, COUNT(r.id)::int AS cnt
  FROM posts p2
  LEFT JOIN post_reposts r ON r.post_id = p2.id
  GROUP BY p2.id
) x
WHERE x.id = p.id;
