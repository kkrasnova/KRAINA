import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/adminMiddleware.js';
import { adminActionRateLimiter } from '../middleware/rateLimits.js';
import { adminGrantSubscriptionSchema } from '../schemas/admin.schemas.js';
import { grantSubscriptionByEmail } from '../services/adminSubscriptionService.js';
import { searchUsersByEmailFragment } from '../services/adminUsersSearchService.js';
import { listCancelFeedbackForAdmin } from '../services/subscriptionCancelFeedbackService.js';
import { listLandmarkStoryRequestsForAdmin } from '../services/landmarkStoryRequestService.js';
import { HttpError } from '../errors/HttpError.js';

const router = Router();

router.get(
  '/users/search',
  adminActionRateLimiter,
  authenticateToken,
  requireAdmin,
  async (req, res, next) => {
    try {
      const q = String(req.query.q ?? '').trim();
      if (q.length < 2) {
        res.status(200).json({ users: [] });
        return;
      }
      const users = await searchUsersByEmailFragment(q, 25);
      res.status(200).json({ users });
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  '/subscription-cancel-feedback',
  adminActionRateLimiter,
  authenticateToken,
  requireAdmin,
  async (req, res, next) => {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 80));
      const rows = await listCancelFeedbackForAdmin(limit);
      res.status(200).json({ items: rows });
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  '/landmark-story-requests',
  adminActionRateLimiter,
  authenticateToken,
  requireAdmin,
  async (req, res, next) => {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 80));
      const rows = await listLandmarkStoryRequestsForAdmin(limit);
      res.status(200).json({ items: rows });
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  '/subscriptions/grant',
  adminActionRateLimiter,
  authenticateToken,
  requireAdmin,
  async (req, res, next) => {
    try {
      const parsed = adminGrantSubscriptionSchema.safeParse(req.body);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? 'invalid_body';
        throw new HttpError(400, msg === 'duration_required' ? 'duration_required' : 'invalid_body');
      }
      const adminId = req.authUser?.id;
      if (!adminId) {
        throw new HttpError(401, 'token_invalid');
      }
      const out = await grantSubscriptionByEmail({
        email: parsed.data.email,
        plan_type: parsed.data.plan_type,
        duration_days: parsed.data.duration_days,
        lifetime: parsed.data.lifetime,
        adminId,
      });
      res.status(200).json({
        ok: true,
        user_id: out.user_id,
        plan_type: out.plan_type,
        expires_at: out.expires_at,
      });
    } catch (e) {
      next(e);
    }
  },
);

export const adminRouter = router;
