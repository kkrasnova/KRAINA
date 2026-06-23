import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { privacyUserRequestSchema } from '../schemas/privacy.schemas.js';
import { recordPrivacyUserRequest } from '../services/privacyRequestService.js';
import { pool } from '../db/pool.js';
import { HttpError } from '../errors/HttpError.js';
const router = Router();
router.post('/request', authenticateToken, async (req, res, next) => {
    try {
        const userId = req.authUser?.id;
        if (!userId)
            throw new HttpError(401, 'token_invalid');
        const parsed = privacyUserRequestSchema.safeParse(req.body);
        if (!parsed.success)
            throw new HttpError(400, 'invalid_body');
        const emailRow = await pool.query(`SELECT email FROM users WHERE id = $1::uuid`, [userId]);
        const dbEmail = emailRow.rows[0] && typeof emailRow.rows[0].email === 'string'
            ? String(emailRow.rows[0].email)
            : null;
        const userEmail = parsed.data.user_email?.trim() || dbEmail;
        await recordPrivacyUserRequest({
            userId,
            userEmail,
            requestType: parsed.data.request_type,
            appLanguage: parsed.data.app_language ?? null,
        });
        res.status(200).json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
export const privacyRouter = router;
//# sourceMappingURL=privacyRoutes.js.map