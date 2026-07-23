import { Router } from 'express';
import { optionalAuth } from '../middleware/authMiddleware.js';
import { landmarkStoryRequestSchema } from '../schemas/landmarkStoryRequest.schemas.js';
import { createLandmarkStoryRequest } from '../services/landmarkStoryRequestService.js';
import { HttpError } from '../errors/HttpError.js';
import { scannerLocationRequestRateLimiter } from '../middleware/rateLimits.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asUuidOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return UUID_RE.test(s) ? s : null;
}

const router = Router();

router.post('/', scannerLocationRequestRateLimiter, optionalAuth, async (req, res, next) => {
  try {
    const parsed = landmarkStoryRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'invalid_body');

    const body = parsed.data;
    const authUserId = req.authUser?.id ?? null;
    const authEmail = req.authUser?.email ?? null;
    const userId = authUserId || asUuidOrNull(body.user_id);
    const userEmail = (body.user_email && String(body.user_email).trim()) || authEmail || null;

    const result = await createLandmarkStoryRequest({
      requestRef: body.request_ref,
      language: body.language ?? null,
      userId,
      userEmail,
      scanLatitude: body.scan_latitude ?? null,
      scanLongitude: body.scan_longitude ?? null,
      attachedLatitude: body.attached_latitude ?? null,
      attachedLongitude: body.attached_longitude ?? null,
      visionHintTitle: body.vision_hint_title ?? null,
      hasPhoto: !!body.has_photo,
    });

    res.status(201).json({ ok: true, id: result.id, telegram_sent: result.telegramSent });
  } catch (e) {
    next(e);
  }
});

export const landmarkStoryRequestRouter = router;
