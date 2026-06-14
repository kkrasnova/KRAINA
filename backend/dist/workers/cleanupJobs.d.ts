/**
 * Scheduled cleanup jobs for operational hygiene.
 *
 * All jobs run inside the main process using setInterval. Each job:
 *   - Has a per-job "running" guard to prevent overlapping executions.
 *   - Catches and logs its own errors — a failed cleanup never crashes the server.
 *   - Runs immediately once at startup, then on the configured interval.
 *
 * Environment variables (all optional):
 *   CLEANUP_ENABLED=0              — disable all jobs (e.g. in test environments)
 *   CLEANUP_REFRESH_TOKENS_INTERVAL_MS   — default: 6 hours
 *   CLEANUP_PASSWORD_TOKENS_INTERVAL_MS  — default: 1 hour
 *   CLEANUP_NOTIFICATIONS_INTERVAL_MS    — default: 24 hours
 *
 * TODO(redis-jobs): replace setInterval with a proper job queue (e.g. BullMQ + Redis)
 * once Redis is introduced. A queue provides: exactly-once execution across multiple
 * API replicas, per-job retry policies, visibility into job history, and clean
 * shutdown on SIGTERM. The functions below are already self-contained and can be
 * moved to queue workers without changes to their logic.
 */
/**
 * Starts all cleanup jobs. Call once from index.ts after the server begins
 * listening. Each job fires immediately at startup, then repeats on its
 * configured interval.
 */
export declare function startCleanupJobs(): void;
/**
 * Stops all scheduled cleanup jobs by clearing their intervals.
 * Call during graceful shutdown before closing the database pool.
 * Any job that is currently mid-run will finish naturally — this only
 * prevents new invocations from being scheduled.
 */
export declare function stopCleanupJobs(): void;
//# sourceMappingURL=cleanupJobs.d.ts.map