import { Router, type Request, type Response } from 'express';
import { optionalAuth } from '../middleware/authMiddleware.js';
import { insertMetrics, type MetricsPayload } from '../services/metricsService.js';

const router = Router();

/**
 * POST /api/metrics
 *
 * Accepts a batch of performance metric entries from the mobile app.
 * The payload is a fire-and-forget insert — response is always 202 Accepted
 * and any DB error is silently swallowed (metrics are non-critical).
 *
 * Body:
 * ```json
 * {
 *   "sessionId": "uuid-or-random-id",
 *   "appVersion": "1.0.1",
 *   "platform": "ios",
 *   "osVersion": "17.4",
 *   "deviceModel": "iPhone15,2",
 *   "clientTs": "2026-06-14T12:00:00.000Z",
 *   "metrics": [
 *     { "name": "app_bootstrap", "entryType": "measure", "duration": 320.5, "startTime": 0 },
 *     { "name": "render:FeedPage", "entryType": "metric", "value": 12.3 }
 *   ]
 * }
 * ```
 */
router.post(
  '/',
  optionalAuth,
  async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;

    // Basic validation — reject malformed payloads early
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'invalid_payload' });
      return;
    }
    if (!body.sessionId || typeof body.sessionId !== 'string') {
      res.status(400).json({ error: 'missing_session_id' });
      return;
    }
    if (!Array.isArray(body.metrics) || body.metrics.length === 0) {
      // Empty batch is a no-op, but still accept it gracefully
      res.status(202).json({ accepted: true });
      return;
    }

    const payload: MetricsPayload = {
      sessionId: body.sessionId,
      appVersion: typeof body.appVersion === 'string' ? body.appVersion : undefined,
      platform: typeof body.platform === 'string' ? body.platform : undefined,
      osVersion: typeof body.osVersion === 'string' ? body.osVersion : undefined,
      deviceModel: typeof body.deviceModel === 'string' ? body.deviceModel : undefined,
      clientTs: typeof body.clientTs === 'string' ? body.clientTs : new Date().toISOString(),
      metrics: body.metrics,
    };

    const userId = req.authUser?.id ?? null;

    // Fire and forget — don't block the response on a DB write
    void insertMetrics(userId, payload);

    res.status(202).json({ accepted: true });
  },
);

export const metricsRouter = router;
