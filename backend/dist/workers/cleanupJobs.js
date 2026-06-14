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
import { pool } from '../db/pool.js';
import { logger } from '../logger.js';
// ---------------------------------------------------------------------------
// Interval helpers
// ---------------------------------------------------------------------------
function parseIntervalMs(envName, defaultMs) {
    const v = Number(process.env[envName]);
    return Number.isFinite(v) && v > 0 ? v : defaultMs;
}
function isCleanupEnabled() {
    const v = (process.env.CLEANUP_ENABLED ?? '1').trim().toLowerCase();
    return v !== '0' && v !== 'false' && v !== 'no' && v !== 'off';
}
// ---------------------------------------------------------------------------
// Job: expired refresh tokens
// ---------------------------------------------------------------------------
/**
 * Deletes expired refresh tokens in batches of 500 to avoid long table locks.
 *
 * A 1-day expiry buffer is applied (expires_at < now() - INTERVAL '1 day') so
 * that a freshly-expired token is not deleted before every in-flight request
 * that holds it has had a chance to receive a 401 and stop retrying.
 *
 * The refresh token rotation scheme (rotateRefreshToken in authService) marks
 * consumed tokens with replaced_at. Those rows are safe to delete once their
 * expires_at window has passed — the theft-detection response (blow up all
 * sessions) is only triggered when a replaced token is re-presented within its
 * TTL. After expiry, the token can no longer be presented, so the row is dead.
 */
async function cleanExpiredRefreshTokens() {
    const r = await pool.query(`WITH deleted AS (
       DELETE FROM refresh_tokens
       WHERE id IN (
         SELECT id FROM refresh_tokens
         WHERE expires_at < now() - INTERVAL '1 day'
         LIMIT 500
       )
       RETURNING 1
     )
     SELECT COUNT(*) AS count FROM deleted`);
    const n = Number(r.rows[0]?.count ?? 0);
    if (n > 0) {
        logger.info('cleanup.refresh_tokens.deleted', { count: n });
    }
}
// ---------------------------------------------------------------------------
// Job: expired password-reset tokens
// ---------------------------------------------------------------------------
/**
 * Deletes expired password-reset tokens.
 *
 * These are 60-minute TTL and very low volume. authService already deletes the
 * token on successful use (DELETE ... WHERE user_id = $1) and on new reset
 * requests, so rows that remain here are genuinely abandoned/expired.
 * No batching required.
 */
async function cleanExpiredPasswordResetTokens() {
    const r = await pool.query(`WITH deleted AS (
       DELETE FROM password_reset_tokens
       WHERE expires_at < now()
       RETURNING 1
     )
     SELECT COUNT(*) AS count FROM deleted`);
    const n = Number(r.rows[0]?.count ?? 0);
    if (n > 0) {
        logger.info('cleanup.password_reset_tokens.deleted', { count: n });
    }
}
// ---------------------------------------------------------------------------
// Job: notification retention audit (soft plan — no deletions yet)
// ---------------------------------------------------------------------------
/**
 * Audits old notifications and logs candidacy counts.
 * No rows are deleted by this job.
 *
 * Intended retention policy (not yet implemented — requires migration first):
 *
 *   Phase 1 — Soft archival:
 *     Migration 029: ADD COLUMN archived_at timestamptz to notifications.
 *     This job: UPDATE notifications SET archived_at = now()
 *               WHERE created_at < now() - INTERVAL '90 days' AND archived_at IS NULL
 *               LIMIT 2000;
 *     Mobile client: hide rows where archived_at IS NOT NULL from the UI.
 *
 *   Phase 2 — Hard deletion:
 *     This job: DELETE FROM notifications
 *               WHERE archived_at < now() - INTERVAL '90 days'
 *               LIMIT 2000;
 *     (Total minimum age before hard deletion: 180 days.)
 *
 *   Prerequisite migration: 029_notifications_archived_at.sql
 */
async function auditNotificationRetention() {
    const r = await pool.query(`SELECT COUNT(*) AS count
     FROM notifications
     WHERE created_at < now() - INTERVAL '90 days'`);
    const n = Number(r.rows[0]?.count ?? 0);
    logger.info('cleanup.notifications.audit', {
        eligible_for_archival: n,
        policy_phase: 'none',
        action: 'count_only',
    });
}
// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------
/**
 * Returns a guarded wrapper around `fn` that:
 *   1. Skips execution if the previous run is still active (overlap guard).
 *   2. Catches and logs any error without rethrowing.
 */
function makeScheduled(jobName, fn) {
    let running = false;
    return () => {
        if (running) {
            logger.warn(`cleanup.${jobName}.skipped`, { reason: 'previous_run_still_active' });
            return;
        }
        running = true;
        fn()
            .catch((e) => {
            logger.error(`cleanup.${jobName}.error`, {
                err: e instanceof Error ? e.message : String(e),
            });
        })
            .finally(() => {
            running = false;
        });
    };
}
// Module-level interval handles so stopCleanupJobs() can clear them.
const _handles = [];
/**
 * Starts all cleanup jobs. Call once from index.ts after the server begins
 * listening. Each job fires immediately at startup, then repeats on its
 * configured interval.
 */
export function startCleanupJobs() {
    if (!isCleanupEnabled()) {
        logger.info('cleanup.disabled', { hint: 'set CLEANUP_ENABLED=1 to enable' });
        return;
    }
    const MS_6H = 6 * 60 * 60 * 1000;
    const MS_1H = 60 * 60 * 1000;
    const MS_24H = 24 * 60 * 60 * 1000;
    const jobs = [
        {
            name: 'refresh_tokens',
            fn: cleanExpiredRefreshTokens,
            intervalMs: parseIntervalMs('CLEANUP_REFRESH_TOKENS_INTERVAL_MS', MS_6H),
        },
        {
            name: 'password_tokens',
            fn: cleanExpiredPasswordResetTokens,
            intervalMs: parseIntervalMs('CLEANUP_PASSWORD_TOKENS_INTERVAL_MS', MS_1H),
        },
        {
            name: 'notifications',
            fn: auditNotificationRetention,
            intervalMs: parseIntervalMs('CLEANUP_NOTIFICATIONS_INTERVAL_MS', MS_24H),
        },
    ];
    for (const job of jobs) {
        const scheduled = makeScheduled(job.name, job.fn);
        // Run immediately at startup for operational visibility, then on interval.
        scheduled();
        _handles.push(setInterval(scheduled, job.intervalMs));
    }
    logger.info('cleanup.started', {
        jobs: jobs.map((j) => ({ name: j.name, interval_ms: j.intervalMs })),
    });
}
/**
 * Stops all scheduled cleanup jobs by clearing their intervals.
 * Call during graceful shutdown before closing the database pool.
 * Any job that is currently mid-run will finish naturally — this only
 * prevents new invocations from being scheduled.
 */
export function stopCleanupJobs() {
    for (const h of _handles) {
        clearInterval(h);
    }
    _handles.length = 0;
    logger.info('cleanup.stopped');
}
//# sourceMappingURL=cleanupJobs.js.map