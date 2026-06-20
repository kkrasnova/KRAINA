CREATE TABLE privacy_user_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  user_email text,
  request_type text NOT NULL CHECK (request_type IN ('export', 'delete')),
  app_language text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_privacy_user_requests_created ON privacy_user_requests (created_at DESC);
CREATE INDEX idx_privacy_user_requests_user ON privacy_user_requests (user_id);
