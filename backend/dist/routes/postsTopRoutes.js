import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { HttpError } from '../errors/HttpError.js';
import { createPostViaSequelize } from '../services/postsCrudService.js';
const router = Router();
const createPostSchema = z.object({
    media_urls: z.array(z.string().min(8)).min(1).max(10),
    content_text: z.string().max(1000).optional().nullable(),
    visibility: z.enum(['public', 'followers', 'private']).optional(),
    place_label: z.string().max(500).optional().nullable(),
    lat: z.number().finite().optional().nullable(),
    lng: z.number().finite().optional().nullable(),
    route_plan: z.record(z.string(), z.unknown()).optional().nullable(),
    route_id: z.string().uuid().optional().nullable(),
    location_id: z.string().uuid().optional().nullable(),
});
router.post('/', authenticateToken, async (req, res, next) => {
    try {
        const id = req.authUser?.id;
        if (!id)
            throw new HttpError(401, 'token_invalid');
        const parsed = createPostSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpError(400, 'invalid_body');
        }
        const row = await createPostViaSequelize(id, {
            ...parsed.data,
            visibility: parsed.data.visibility ?? 'followers',
        });
        res.status(201).json({ post: row });
    }
    catch (e) {
        next(e);
    }
});
export const postsTopRouter = router;
//# sourceMappingURL=postsTopRoutes.js.map