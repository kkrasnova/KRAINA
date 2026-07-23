CREATE TABLE landmark_story_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_ref text NOT NULL,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  user_email text,
  app_language text,
  scan_latitude double precision,
  scan_longitude double precision,
  attached_latitude double precision,
  attached_longitude double precision,
  vision_hint_title text,
  has_photo boolean NOT NULL DEFAULT false,
  telegram_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_landmark_story_requests_created ON landmark_story_requests (created_at DESC);
CREATE INDEX idx_landmark_story_requests_ref ON landmark_story_requests (request_ref);
