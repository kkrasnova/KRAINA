-- NOTE: this file shares the 022_ prefix with 022_profile_saved_route_plans.sql.
-- The duplicate prefix is benign — alphabetical sort is deterministic (p < u) and
-- neither migration depends on the other.
-- 022b_users_email_trgm_index.sql exists as a canonical sealed successor so that
-- no future file can accidentally slot in as a third 022_ migration. It is a
-- no-op on any DB where this file has already been applied (IF NOT EXISTS).
-- Do NOT add new 022_*.sql files; the next available prefix is 027_.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_users_email_trgm_active ON users USING gin (email gin_trgm_ops)
WHERE status <> 'deleted';
