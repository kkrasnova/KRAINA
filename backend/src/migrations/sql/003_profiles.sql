CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  avatar_url text,
  bio text CHECK (char_length(bio) <= 300),
  language text NOT NULL DEFAULT 'uk',
  xp_points integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5),
  is_public boolean NOT NULL DEFAULT true,
  locations_visited integer NOT NULL DEFAULT 0,
  routes_created integer NOT NULL DEFAULT 0,
  followers_count integer NOT NULL DEFAULT 0,
  following_count integer NOT NULL DEFAULT 0,
  username_changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_username_lower ON profiles (lower(username));
