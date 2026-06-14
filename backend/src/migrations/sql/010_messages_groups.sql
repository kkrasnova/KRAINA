CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) <= 2000),
  media_url text,
  shared_location_id uuid REFERENCES locations (id) ON DELETE SET NULL,
  shared_route_id uuid REFERENCES routes (id) ON DELETE SET NULL,
  is_read boolean NOT NULL DEFAULT false,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_pair ON messages (sender_id, receiver_id, sent_at DESC);

CREATE TABLE group_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users (id),
  route_id uuid NOT NULL REFERENCES routes (id),
  name text NOT NULL,
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'done', 'cancelled')),
  max_members integer DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_trip_members (
  group_id uuid NOT NULL REFERENCES group_trips (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
