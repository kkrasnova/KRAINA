CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  plan_type text NOT NULL CHECK (plan_type IN ('free', 'explorer', 'pro', 'family')),
  billing_period text CHECK (billing_period IN ('monthly', 'yearly')),
  price_usd decimal(10, 2),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  payment_provider text CHECK (payment_provider IN ('apple', 'google', 'stripe')),
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_active ON subscriptions (user_id, is_active);

CREATE TABLE usage_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  period_month text NOT NULL,
  ar_scans_used integer NOT NULL DEFAULT 0,
  routes_created integer NOT NULL DEFAULT 0,
  locations_viewed integer NOT NULL DEFAULT 0,
  UNIQUE (user_id, period_month)
);

CREATE TABLE family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  member_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  invited_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, member_user_id),
  CHECK (owner_user_id <> member_user_id)
);
