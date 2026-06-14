-- pgcrypto: provides gen_random_uuid() used as default for all PRIMARY KEY columns.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_stat_statements: NOT enabled here — it requires shared_preload_libraries
-- to be set in postgresql.conf BEFORE PostgreSQL starts, which cannot be done
-- inside a migration transaction. See backend/src/db/pool.ts for setup instructions.
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements; -- run manually after enabling shared_preload_libraries
