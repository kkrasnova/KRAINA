import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/adminMiddleware.js';
import { adminActionRateLimiter, adminAiJobPollRateLimiter } from '../middleware/rateLimits.js';
import { adminGrantAdminSchema, adminGrantSubscriptionSchema, adminAiDuplicateDecisionSchema, adminLocationAiEnrichJobSchema, adminLocationAiEnrichSchema, adminRevokeAdminSchema, } from '../schemas/admin.schemas.js';
import { grantSubscriptionByEmail } from '../services/adminSubscriptionService.js';
import { searchUsersByEmailFragment } from '../services/adminUsersSearchService.js';
import { grantAdminByEmail, listAdminUsers, revokeAdminByEmail, } from '../services/adminUsersAdminService.js';
import { listCancelFeedbackForAdmin } from '../services/subscriptionCancelFeedbackService.js';
import { listLandmarkStoryRequestsForAdmin } from '../services/landmarkStoryRequestService.js';
import { enrichLocationsFromVerifiedSources } from '../services/locationAiEnrichmentService.js';
import { createEnrichJob, getEnrichJob, listEnrichJobs, removeEnrichJobItem, resolveEnrichJobDuplicate, serializeEnrichJob, serializeEnrichJobSummary, } from '../services/locationAiEnrichJobService.js';
import { HttpError } from '../errors/HttpError.js';
const router = Router();
router.get('/users/search', adminActionRateLimiter, authenticateToken, requireAdmin, async (req, res, next) => {
    try {
        const q = String(req.query.q ?? '').trim();
        if (q.length < 2) {
            res.status(200).json({ users: [] });
            return;
        }
        const users = await searchUsersByEmailFragment(q, 25);
        res.status(200).json({ users });
    }
    catch (e) {
        next(e);
    }
});
router.get('/subscription-cancel-feedback', adminActionRateLimiter, authenticateToken, requireAdmin, async (req, res, next) => {
    try {
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 80));
        const rows = await listCancelFeedbackForAdmin(limit);
        res.status(200).json({ items: rows });
    }
    catch (e) {
        next(e);
    }
});
router.get('/landmark-story-requests', adminActionRateLimiter, authenticateToken, requireAdmin, async (req, res, next) => {
    try {
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 80));
        const rows = await listLandmarkStoryRequestsForAdmin(limit);
        res.status(200).json({ items: rows });
    }
    catch (e) {
        next(e);
    }
});
router.post('/locations/ai-enrich', adminActionRateLimiter, authenticateToken, requireAdmin, async (req, res, next) => {
    try {
        const parsed = adminLocationAiEnrichSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpError(400, 'invalid_body');
        }
        const out = await enrichLocationsFromVerifiedSources(parsed.data);
        res.status(200).json({ ok: true, ...out });
    }
    catch (e) {
        next(e);
    }
});
router.get('/locations/ai-enrich-jobs', adminAiJobPollRateLimiter, authenticateToken, requireAdmin, async (_req, res, next) => {
    try {
        const items = listEnrichJobs().map((j) => serializeEnrichJobSummary(j));
        res.status(200).json({ ok: true, items });
    }
    catch (e) {
        next(e);
    }
});
router.post('/locations/ai-enrich-job', adminActionRateLimiter, authenticateToken, requireAdmin, async (req, res, next) => {
    try {
        const parsed = adminLocationAiEnrichJobSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpError(400, 'invalid_body');
        }
        if (parsed.data.autoPublish && !parsed.data.mergeTarget?.countryId) {
            throw new HttpError(400, 'merge_target_required');
        }
        const job = createEnrichJob(parsed.data);
        res.status(202).json(serializeEnrichJob(job, { includeLandmarks: false }));
    }
    catch (e) {
        next(e);
    }
});
router.get('/locations/ai-enrich-job/:jobId', adminAiJobPollRateLimiter, authenticateToken, requireAdmin, async (req, res, next) => {
    try {
        const job = getEnrichJob(String(req.params.jobId || ''));
        if (!job) {
            throw new HttpError(404, 'job_not_found');
        }
        res.status(200).json(serializeEnrichJob(job, { includeLandmarks: true }));
    }
    catch (e) {
        next(e);
    }
});
router.post('/locations/ai-enrich-job/:jobId/items/:itemIndex/remove', adminAiJobPollRateLimiter, authenticateToken, requireAdmin, async (req, res, next) => {
    try {
        const job = removeEnrichJobItem(String(req.params.jobId || ''), Number(req.params.itemIndex));
        res.status(200).json(serializeEnrichJob(job, { includeLandmarks: true }));
    }
    catch (e) {
        next(e);
    }
});
router.post('/locations/ai-enrich-job/:jobId/items/:itemIndex/duplicate-decision', adminActionRateLimiter, authenticateToken, requireAdmin, async (req, res, next) => {
    try {
        const parsed = adminAiDuplicateDecisionSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpError(400, 'invalid_body');
        }
        const job = await resolveEnrichJobDuplicate(String(req.params.jobId || ''), Number(req.params.itemIndex), parsed.data.action);
        res.status(200).json(serializeEnrichJob(job, { includeLandmarks: true }));
    }
    catch (e) {
        next(e);
    }
});
router.get('/admins', adminActionRateLimiter, authenticateToken, requireAdmin, async (_req, res, next) => {
    try {
        const admins = await listAdminUsers();
        res.status(200).json({ admins });
    }
    catch (e) {
        next(e);
    }
});
router.post('/admins/grant', adminActionRateLimiter, authenticateToken, requireAdmin, async (req, res, next) => {
    try {
        const parsed = adminGrantAdminSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpError(400, 'invalid_email');
        }
        const admin = await grantAdminByEmail(parsed.data.email);
        res.status(200).json({ ok: true, admin });
    }
    catch (e) {
        next(e);
    }
});
router.post('/admins/revoke', adminActionRateLimiter, authenticateToken, requireAdmin, async (req, res, next) => {
    try {
        const parsed = adminRevokeAdminSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpError(400, 'invalid_email');
        }
        const actorId = req.authUser?.id;
        if (!actorId) {
            throw new HttpError(401, 'token_invalid');
        }
        await revokeAdminByEmail(parsed.data.email, actorId);
        res.status(200).json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
router.post('/subscriptions/grant', adminActionRateLimiter, authenticateToken, requireAdmin, async (req, res, next) => {
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
    }
    catch (e) {
        next(e);
    }
});
export const adminRouter = router;
//# sourceMappingURL=adminRoutes.js.map