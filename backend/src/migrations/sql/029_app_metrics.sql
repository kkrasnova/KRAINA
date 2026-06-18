-- Performance / diagnostic metrics sent by the mobile app (react-native-performance).
-- This table stores batched metric payloads so the backend can aggregate, alert,
-- and surface FPS / render / bootstrap performance over time.
CREATE TABLE IF NOT EXISTS app_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  session_id text NOT NULL,
  app_version text,
  platform text,
  os_version text,
  device_model text,
  metrics jsonb NOT NULL DEFAULT '[]'::jsonb,
  client_ts timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for querying metrics per user (support / debugging)
CREATE INDEX idx_app_metrics_user_id ON app_metrics (user_id);
-- Index for querying by session (useful for tracing a single app lifecycle)
CREATE INDEX idx_app_metrics_session_id ON app_metrics (session_id);
-- Index for time-range scans (dashboards / alerts)
CREATE INDEX idx_app_metrics_created_at ON app_metrics (created_at);
