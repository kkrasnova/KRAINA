import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { messageSendRateLimiter } from '../middleware/rateLimits.js';
import { withIdempotency } from '../middleware/idempotency.js';
import { HttpError } from '../errors/HttpError.js';
import { openThreadSchema, sendMessageSchema } from '../schemas/messages.schemas.js';
import { acceptThread, listMessages, listThreads, markThreadRead, openThreadByUserId, openThreadByUsername, sendTextMessage, } from '../services/messageService.js';
const router = Router();
router.get('/threads', authenticateToken, async (req, res, next) => {
    try {
        const me = req.authUser?.id;
        if (!me)
            throw new HttpError(401, 'token_invalid');
        const folder = req.query.folder === 'requests' ? 'requests' : 'inbox';
        const threads = await listThreads(me, folder);
        res.status(200).json({ threads });
    }
    catch (e) {
        next(e);
    }
});
router.post('/threads/open', authenticateToken, withIdempotency, async (req, res, next) => {
    try {
        const me = req.authUser?.id;
        if (!me)
            throw new HttpError(401, 'token_invalid');
        const parsed = openThreadSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpError(400, parsed.error.issues[0]?.message || 'invalid_body');
        }
        const meta = parsed.data.peer_user_id != null
            ? await openThreadByUserId(me, parsed.data.peer_user_id)
            : await openThreadByUsername(me, parsed.data.peer_username);
        res.status(200).json(meta);
    }
    catch (e) {
        next(e);
    }
});
router.get('/threads/:threadId/messages', authenticateToken, async (req, res, next) => {
    try {
        const me = req.authUser?.id;
        if (!me)
            throw new HttpError(401, 'token_invalid');
        const limit = Number(req.query.limit ?? 80);
        const messages = await listMessages(req.params.threadId, me, limit);
        res.status(200).json({ messages });
    }
    catch (e) {
        next(e);
    }
});
router.post('/threads/:threadId/read', authenticateToken, withIdempotency, async (req, res, next) => {
    try {
        const me = req.authUser?.id;
        if (!me)
            throw new HttpError(401, 'token_invalid');
        await markThreadRead(req.params.threadId, me);
        res.status(200).json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
router.post('/threads/:threadId/messages', authenticateToken, withIdempotency, messageSendRateLimiter, async (req, res, next) => {
    try {
        const me = req.authUser?.id;
        if (!me)
            throw new HttpError(401, 'token_invalid');
        const parsed = sendMessageSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpError(400, 'invalid_body');
        }
        const message = await sendTextMessage(req.params.threadId, me, parsed.data.content);
        res.status(201).json({ message });
    }
    catch (e) {
        next(e);
    }
});
router.post('/threads/:threadId/accept', authenticateToken, withIdempotency, async (req, res, next) => {
    try {
        const me = req.authUser?.id;
        if (!me)
            throw new HttpError(401, 'token_invalid');
        const meta = await acceptThread(req.params.threadId, me);
        res.status(200).json(meta);
    }
    catch (e) {
        next(e);
    }
});
export const messageRouter = router;
//# sourceMappingURL=messageRoutes.js.map