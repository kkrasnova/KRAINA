// pg_stat_statements — recommended for production query performance monitoring.
// Captures per-query execution statistics (total time, calls, rows, etc.).
// To enable:
//   1. Add to postgresql.conf (or Docker command args):
//        shared_preload_libraries = 'pg_stat_statements'
//        pg_stat_statements.track = all
//   2. After restarting PostgreSQL, run once:
//        CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
//   3. Query the top slow queries:
//        SELECT query, calls, total_exec_time, mean_exec_time, rows
//        FROM pg_stat_statements
//        ORDER BY total_exec_time DESC
//        LIMIT 20;
// On managed PostgreSQL (RDS, Cloud SQL, Supabase): enable via the parameter group.
// The docker-compose.yml postgres service has the command lines ready to uncomment.
import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../logger.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl,
  max: 20,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PG pool error', err);
});
