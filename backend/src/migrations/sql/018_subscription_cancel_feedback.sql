
CREATE TABLE subscription_cancel_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  user_email text,
  previous_plan text NOT NULL CHECK (previous_plan IN ('explorer', 'pro', 'family')),
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  comment text,
  app_language text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscription_cancel_feedback_created ON subscription_cancel_feedback (created_at DESC);
CREATE INDEX idx_subscription_cancel_feedback_user ON subscription_cancel_feedback (user_id);
