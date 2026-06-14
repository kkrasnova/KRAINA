CREATE TABLE routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  cover_image_url text,
  type text NOT NULL CHECK (type IN ('manual', 'ai_generated')),
  duration_min integer,
  distance_m integer,
  budget_level text CHECK (budget_level IN ('free', 'budget', 'mid', 'premium')),
  city text,
  is_public boolean NOT NULL DEFAULT false,
  is_saved boolean NOT NULL DEFAULT false,
  likes_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE route_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES routes (id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations (id),
  point_order integer NOT NULL,
  planned_min integer,
  notes text,
  UNIQUE (route_id, point_order)
);

CREATE TABLE route_likes (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES routes (id) ON DELETE CASCADE,
  liked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, route_id)
);
