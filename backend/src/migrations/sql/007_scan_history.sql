CREATE TABLE scan_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  location_id uuid REFERENCES locations (id) ON DELETE SET NULL,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  result_type text NOT NULL CHECK (result_type IN ('success', 'not_found', 'error')),
  confidence decimal(3, 2),
  raw_label text
);

CREATE INDEX idx_scan_history_user ON scan_history (user_id);
