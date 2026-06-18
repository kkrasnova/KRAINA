import { pool } from '../db/pool.js';
import { logger } from '../logger.js';
/** Bootstrap phases that are measured as part of cold-start TTI */
const BOOTSTRAP_PHASE_NAMES = new RegExp('^(first_screen|navigation_container_ready|home_tabs_mounted|feed_interactive|map_interactive)$');
/** Threshold: bootstrap phase > 5s is an alert */
const BOOTSTRAP_SLOW_MS = 5_000;
/** Threshold: render duration > 100ms is an alert */
const RENDER_SLOW_MS = 100;
/**
 * Accepts validated metrics from the front-end and writes them to the
 * `app_metrics` table as a single row (batched JSONB payload).
 *
 * This is intentionally a fire-and-forget insert — it does **not** return
 * data to the client and uses a dedicated pool connection to minimise
 * impact on request handlers.
 */
/**
 * Inspect a single metric entry and log an error-level alert if its value
 * exceeds the predefined threshold.
 *
 * Bootstrap phases (first_screen, navigation_container_ready, …):
 *   > 5 s → error
 * Component render durations (render:ComponentName):
 *   > 100 ms → error
 */
function alertIfSlowMetric(entry) {
    const name = typeof entry.name === 'string' ? entry.name : '';
    if (!name)
        return;
    if (entry.entryType === 'measure' && BOOTSTRAP_PHASE_NAMES.test(name)) {
        const duration = typeof entry.duration === 'number' ? entry.duration : 0;
        if (duration > BOOTSTRAP_SLOW_MS) {
            logger.error('[metrics] Slow bootstrap phase', {
                metric: name,
                durationMs: Math.round(duration),
                thresholdMs: BOOTSTRAP_SLOW_MS,
            });
        }
        return;
    }
    if (name.startsWith('render:')) {
        const duration = (typeof entry.duration === 'number' ? entry.duration : 0) ||
            (typeof entry.value === 'number' ? entry.value : 0);
        if (duration > RENDER_SLOW_MS) {
            logger.error('[metrics] Slow render', {
                component: name.slice('render:'.length),
                durationMs: Math.round(duration),
                thresholdMs: RENDER_SLOW_MS,
            });
        }
    }
}
export async function insertMetrics(userId, payload) {
    try {
        await pool.query(`INSERT INTO app_metrics (user_id, session_id, app_version, platform, os_version, device_model, metrics, client_ts)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz)`, [
            userId,
            payload.sessionId,
            payload.appVersion ?? null,
            payload.platform ?? null,
            payload.osVersion ?? null,
            payload.deviceModel ?? null,
            JSON.stringify(payload.metrics),
            payload.clientTs,
        ]);
        // Alert on slow metrics after a successful insert
        if (Array.isArray(payload.metrics)) {
            for (const entry of payload.metrics) {
                if (entry && typeof entry === 'object') {
                    alertIfSlowMetric(entry);
                }
            }
        }
    }
    catch (e) {
        // Metrics are non-critical — never let a failed insert crash a request.
        logger.warn('[metrics] insert failed', {
            error: e instanceof Error ? e.message : String(e),
        });
    }
}
//# sourceMappingURL=metricsService.js.map