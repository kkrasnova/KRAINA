import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { billingVerifyRateLimiter } from '../middleware/rateLimits.js';
import { billingCancelFeedbackSchema, billingVerifySchema } from '../schemas/billing.schemas.js';
import { verifyAndSaveSubscription } from '../services/billingService.js';
import { recordCancelFeedbackAndDeactivateSubs } from '../services/subscriptionCancelFeedbackService.js';
import { pool } from '../db/pool.js';
import { HttpError } from '../errors/HttpError.js';
const router = Router();
router.post('/cancel-feedback', authenticateToken, async (req, res, next) => {
    try {
        const userId = req.authUser?.id;
        if (!userId)
            throw new HttpError(401, 'token_invalid');
        const parsed = billingCancelFeedbackSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpError(400, 'invalid_body');
        }
        const emailRow = await pool.query(`SELECT email FROM users WHERE id = $1::uuid`, [userId]);
        const userEmail = emailRow.rows[0] && typeof emailRow.rows[0].email === 'string'
            ? String(emailRow.rows[0].email)
            : null;
        await recordCancelFeedbackAndDeactivateSubs({
            userId,
            userEmail,
            previousPlan: parsed.data.previous_plan,
            reasonCodes: parsed.data.reason_codes,
            comment: parsed.data.comment ?? null,
            appLanguage: parsed.data.app_language ?? null,
        });
        res.status(200).json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
router.post('/verify', billingVerifyRateLimiter, authenticateToken, async (req, res, next) => {
    try {
        const userId = req.authUser?.id;
        if (!userId)
            throw new HttpError(401, 'token_invalid');
        const parsed = billingVerifySchema.safeParse(req.body);
        if (!parsed.success) {
            const issue = parsed.error.issues[0];
            const code = typeof issue?.message === 'string' && issue.message.length < 80
                ? issue.message
                : 'invalid_body';
            throw new HttpError(400, code);
        }
        const out = await verifyAndSaveSubscription(userId, parsed.data);
        res.status(200).json(out);
    }
    catch (e) {
        next(e);
    }
});
export const billingRouter = router;
//# sourceMappingURL=billingRoutes.js.map