-- Canonical sealed successor to 022_users_email_trgm_index.sql.
-- Purpose: prevent any future 022_*.sql file from accidentally inserting between
-- the two existing 022_ migrations (022_profile_saved_route_plans and 022_users_email_trgm_index).
--
-- Existing DB (022_ already applied): runner skips 022_ (recorded), applies this
--   file as an idempotent no-op, records '022b_users_email_trgm_index.sql'. ✓
-- Fresh DB: runner applies 022_ first, then this file as a no-op. Both recorded. ✓
-- No schema_migrations manual intervention required in either case.
--
-- Do NOT add new 022_*.sql files. Next available prefix: 027_.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_users_email_trgm_active ON users USING gin (email gin_trgm_ops)
WHERE status <> 'deleted';
