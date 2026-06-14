import { Router } from 'express';
import multer from 'multer';
import { patchProfileSchema } from '../schemas/profile.schemas.js';
import { getProfileMe, patchProfileMe, saveAvatar, clearAvatar, getPublicProfileByUsername, getPublicProfileFullByUsername, searchProfilesForViewer, } from '../services/profileService.js';
import { authenticateToken, optionalAuth } from '../middleware/authMiddleware.js';
import { HttpError } from '../errors/HttpError.js';
import { config } from '../config.js';
import { withIdempotency } from '../middleware/idempotency.js';
const router = Router();
router.get('/search', authenticateToken, async (req, res, next) => {
    try {
        const id = req.authUser?.id;
        if (!id)
            throw new HttpError(401, 'token_invalid');
        const q = typeof req.query.q === 'string' ? req.query.q : '';
        const limit = Math.min(40, Math.max(1, Number(req.query.limit) || 24));
        const users = await searchProfilesForViewer(id, q, limit);
        res.status(200).json({ users });
    }
    catch (e) {
        next(e);
    }
});
router.get('/search-public', optionalAuth, async (req, res, next) => {
    try {
        const viewer = req.authUser?.id ?? null;
        const q = typeof req.query.q === 'string' ? req.query.q : '';
        const limit = Math.min(40, Math.max(1, Number(req.query.limit) || 24));
        const users = await searchProfilesForViewer(viewer, q, limit);
        res.status(200).json({ users });
    }
    catch (e) {
        next(e);
    }
});
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxAvatarBytes },
    fileFilter(_req, file, cb) {
        const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
        cb(null, ok);
    },
});
router.get('/me', authenticateToken, async (req, res, next) => {
    try {
        const id = req.authUser?.id;
        if (!id)
            throw new HttpError(401, 'token_invalid');
        const data = await getProfileMe(id);
        res.status(200).json(data);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/me', authenticateToken, withIdempotency, async (req, res, next) => {
    try {
        const id = req.authUser?.id;
        if (!id)
            throw new HttpError(401, 'token_invalid');
        const parsed = patchProfileSchema.safeParse(req.body);
        if (!parsed.success) {
            const z = parsed.error.issues[0];
            const key = z?.path[0];
            let code = 'validation_error';
            if (key === 'bio' && z.code === 'too_big')
                code = 'bio_too_long';
            else if (key === 'username')
                code = 'username_invalid';
            else if (key === 'birth_date')
                code = 'invalid_birth_date';
            else if (key === 'display_name' && z.code === 'too_big')
                code = 'display_name_too_long';
            else if (key === 'location_label' && z.code === 'too_big')
                code = 'location_label_too_long';
            else if (key === 'firebase_uid')
                code = 'firebase_uid_invalid';
            throw new HttpError(400, code);
        }
        const profile = await patchProfileMe(id, parsed.data);
        res.status(200).json({ profile });
    }
    catch (e) {
        next(e);
    }
});
router.post('/me/avatar', authenticateToken, upload.single('file'), async (req, res, next) => {
    try {
        const id = req.authUser?.id;
        if (!id)
            throw new HttpError(401, 'token_invalid');
        if (!req.file) {
            throw new HttpError(400, 'invalid_format');
        }
        const url = await saveAvatar(id, req.file);
        res.status(200).json({ avatar_url: url });
    }
    catch (e) {
        next(e);
    }
});
router.delete('/me/avatar', authenticateToken, async (req, res, next) => {
    try {
        const id = req.authUser?.id;
        if (!id)
            throw new HttpError(401, 'token_invalid');
        await clearAvatar(id);
        res.status(200).json({ avatar_url: null });
    }
    catch (e) {
        next(e);
    }
});
router.get('/:username', optionalAuth, async (req, res, next) => {
    try {
        const viewer = req.authUser?.id ?? null;
        const profile = await getPublicProfileByUsername(req.params.username, viewer);
        res.status(200).json({ profile });
    }
    catch (e) {
        next(e);
    }
});
router.get('/:username/full', optionalAuth, async (req, res, next) => {
    try {
        const viewer = req.authUser?.id ?? null;
        const limit = Math.min(120, Math.max(1, Number(req.query.limit) || 80));
        const data = await getPublicProfileFullByUsername(req.params.username, viewer, limit);
        res.status(200).json(data);
    }
    catch (e) {
        next(e);
    }
});
export const profileRouter = router;
//# sourceMappingURL=profileRoutes.js.map