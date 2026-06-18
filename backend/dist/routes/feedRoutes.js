import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { HttpError } from '../errors/HttpError.js';
import { config } from '../config.js';
import { withIdempotency } from '../middleware/idempotency.js';
import { saveFeedMediaFile, createPost, listMyPosts, listMyArchivedPosts, setPostArchived, listWorldPosts, listFriendsPosts, listUserPostsForViewer, createStory, listActiveStoriesTray, listActiveStoriesForUser, recordStoryView, getStoryViewers, getStoryLikers, toggleStoryLike, deleteStoryAsAuthor, togglePostLike, listPostComments, addPostComment, updatePostByAuthor, deletePostByAuthor, togglePostRepost, toggleCommentLike, deletePostCommentByAuthor, } from '../services/feedService.js';
const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxFeedMediaBytes },
    fileFilter(_req, file, cb) {
        const name = String(file.originalname || '').toLowerCase();
        const audioExt = /\.(m4a|aac|mp3|wav|caf)$/i.test(name);
        const ok = [
            'image/jpeg',
            'image/png',
            'image/webp',
            'video/mp4',
            'video/quicktime',
            'audio/mp4',
            'audio/m4a',
            'audio/x-m4a',
            'audio/aac',
            'audio/mpeg',
            'audio/wav',
            'audio/x-wav',
        ].includes(file.mimetype) || (file.mimetype === 'application/octet-stream' && audioExt);
        cb(null, ok);
    },
});
const createPostSchema = z.object({
    media_urls: z.array(z.string().min(8)).min(1).max(10),
    content_text: z.string().max(1000).optional().nullable(),
    visibility: z.enum(['public', 'followers', 'private']).optional(),
    place_label: z.string().max(500).optional().nullable(),
    lat: z.number().finite().optional().nullable(),
    lng: z.number().finite().optional().nullable(),
    route_plan: z.record(z.string(), z.unknown()).optional().nullable(),
});
router.post('/upload', authenticateToken, upload.single('file'), async (req, res, next) => {
    try {
        const id = req.authUser?.id;
        if (!id)
            throw new HttpError(401, 'token_invalid');
        if (!req.file) {
            throw new HttpError(400, 'invalid_format');
        }
        const saved = await saveFeedMediaFile({
            buffer: req.file.buffer,
            mimetype: req.file.mimetype,
            originalname: req.file.originalname,
        });
        res.status(200).json(saved);
    }
    catch (e) {
        next(e);
    }
});
router.post('/posts', authenticateToken, withIdempotency, async (req, res, next) => {
    try {
        const id = req.authUser?.id;
        if (!id)
            throw new HttpError(401, 'token_invalid');
        const parsed = createPostSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpError(400, 'invalid_body');
        }
        const row = await createPost(id, {
            ...parsed.data,
            visibility: parsed.data.visibility ?? 'followers',
        });
        res.status(201).json({ post: row });
    }
    catch (e) {
        next(e);
    }
});
router.get('/posts/me', authenticateToken, async (req, res, next) => {
    try {
        const id = req.authUser?.id;
        if (!id)
            throw new HttpError(401, 'token_invalid');
        const limit = Math.min(80, Math.max(1, Number(req.query.limit) || 60));
        const posts = await listMyPosts(id, limit);
        res.status(200).json({ posts });
    }
    catch (e) {
        next(e);
    }
});
router.get('/posts/me/archived', authenticateToken, async (req, res, next) => {
    try {
        const id = req.authUser?.id;
        if (!id)
            throw new HttpError(401, 'token_invalid');
        const limit = Math.min(80, Math.max(1, Number(req.query.limit) || 40));
        const posts = await listMyArchivedPosts(id, limit);
        res.status(200).json({ posts });
    }
    catch (e) {
        next(e);
    }
});
const patchPostSchema = z.object({
    archived: z.boolean(),
});
const editPostSchema = z.object({
    content_text: z.string().max(1000).nullable().optional(),
    place_label: z.string().max(500).nullable().optional(),
    lat: z.number().finite().nullable().optional(),
    lng: z.number().finite().nullable().optional(),
    route_plan: z.record(z.string(), z.unknown()).nullable().optional(),
    visibility: z.enum(['public', 'followers', 'private']).optional(),
});
const postCommentSchema = z.object({
    content: z.string().trim().min(1).max(500),
    parent_comment_id: z.string().uuid().optional().nullable(),
});
const repostSchema = z.object({
    caption: z.string().max(1000).optional().nullable(),
});
router.patch('/posts/:postId', authenticateToken, withIdempotency, async (req, res, next) => {
    try {
        const id = req.authUser?.id;
        if (!id)
            throw new HttpError(401, 'token_invalid');
        const postId = String(req.params.postId || '').trim();
        if (!postId)
            throw new HttpError(400, 'invalid_body');
        const parsed = patchPostSchema.safeParse(req.body);
        if (!parsed.success)
            throw new HttpError(400, 'invalid_body');
        await setPostArchived(id, postId, parsed.data.archived);
        res.status(200).json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
router.put('/posts/:postId', authenticateToken, withIdempotency, async (req, res, next) => {
    try {
        const id = req.authUser?.id;
        if (!id)
            throw new HttpError(401, 'token_invalid');
        const postId = String(req.params.postId || '').trim();
        if (!postId)
            throw new HttpError(400, 'invalid_body');
        const parsed = editPostSchema.safeParse(req.body);
        if (!parsed.success)
            throw new HttpError(400, 'invalid_body');
        await updatePostByAuthor(id, postId, parsed.data);
        res.status(200).json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
router.delete('/posts/:postId', authenticateToken, withIdempotency, async (req, res, next) => {
    try {
        const id = req.authUser?.id;
        if (!id)
            throw new HttpError(401, 'token_invalid');
        const postId = String(req.params.postId || '').trim();
        if (!postId)
            throw new HttpError(400, 'invalid_body');
        await deletePostByAuthor(id, postId);
        res.status(200).json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
router.post('/posts/:postId/like', authenticateToken, withIdempotency, async (req, res, next) => {
    try {
        const viewerId = req.authUser?.id;
        if (!viewerId)
            throw new HttpError(401, 'token_invalid');
        const postId = String(req.params.postId || '').trim();
        if (!postId)
            throw new HttpError(400, 'invalid_body');
        const out = await togglePostLike(postId, viewerId);
        res.status(200).json(out);
    }
    catch (e) {
        next(e);
    }
});
router.get('/posts/:postId/comments', authenticateToken, async (req, res, next) => {
    try {
        const viewerId = req.authUser?.id;
        if (!viewerId)
            throw new HttpError(401, 'token_invalid');
        const postId = String(req.params.postId || '').trim();
        if (!postId)
            throw new HttpError(400, 'invalid_body');
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 80));
        const comments = await listPostComments(postId, viewerId, limit);
        res.status(200).json({ comments });
    }
    catch (e) {
        next(e);
    }
});
router.post('/posts/:postId/comments', authenticateToken, withIdempotency, async (req, res, next) => {
    try {
        const viewerId = req.authUser?.id;
        if (!viewerId)
            throw new HttpError(401, 'token_invalid');
        const postId = String(req.params.postId || '').trim();
        if (!postId)
            throw new HttpError(400, 'invalid_body');
        const parsed = postCommentSchema.safeParse(req.body);
        if (!parsed.success)
            throw new HttpError(400, 'invalid_body');
        const comment = await addPostComment(postId, viewerId, parsed.data.content, parsed.data.parent_comment_id ?? null);
        res.status(201).json({ comment });
    }
    catch (e) {
        next(e);
    }
});
router.get('/posts/user/:username', authenticateToken, async (req, res, next) => {
    try {
        const id = req.authUser?.id;
        if (!id)
            throw new HttpError(401, 'token_invalid');
        const limit = Math.min(80, Math.max(1, Number(req.query.limit) || 40));
        const username = String(req.params.username || '').trim();
        const posts = await listUserPostsForViewer(id, username, limit);
        res.status(200).json({ posts });
    }
    catch (e) {
        next(e);
    }
});
router.get('/posts/friends', authenticateToken, async (req, res, next) => {
    try {
        const id = req.authUser?.id;
        if (!id)
            throw new HttpError(401, 'token_invalid');
        const limit = Math.min(80, Math.max(1, Number(req.query.limit) || 40));
        const posts = await listFriendsPosts(id, limit);
        res.status(200).json({ posts });
    }
    catch (e) {
        next(e);
    }
});
router.get('/posts/world', authenticateToken, async (req, res, next) => {
    try {
        const id = req.authUser?.id ?? null;
        const limit = Math.min(80, Math.max(1, Number(req.query.limit) || 40));
        const posts = await listWorldPosts(id, limit);
        res.status(200).json({ posts });
    }
    catch (e) {
        next(e);
    }
});
router.post('/stories', authenticateToken, withIdempotency, upload.single('file'), async (req, res, next) => {
    try {
        const id = req.authUser?.id;
        if (!id)
            throw new HttpError(401, 'token_invalid');
        if (!req.file) {
            throw new HttpError(400, 'invalid_format');
        }
        const saved = await saveFeedMediaFile({ buffer: req.file.buffer, mimetype: req.file.mimetype });
        const caption = typeof req.body?.caption === 'string' ? req.body.caption : '';
        const row = await createStory(id, saved.url, saved.media_kind, caption);
        res.status(201).json({ story: row });
    }
    catch (e) {
        next(e);
    }
});
router.get('/stories', authenticateToken, async (req, res, next) => {
    try {
        const id = req.authUser?.id;
        if (!id)
            throw new HttpError(401, 'token_invalid');
        const stories = await listActiveStoriesTray(id);
        res.status(200).json({ stories });
    }
    catch (e) {
        next(e);
    }
});
router.get('/stories/user/:userId', authenticateToken, async (req, res, next) => {
    try {
        const viewerId = req.authUser?.id;
        if (!viewerId)
            throw new HttpError(401, 'token_invalid');
        const authorId = String(req.params.userId || '').trim();
        if (!authorId) {
            throw new HttpError(400, 'invalid_body');
        }
        const stories = await listActiveStoriesForUser(authorId, viewerId);
        res.status(200).json({ stories });
    }
    catch (e) {
        next(e);
    }
});
router.post('/stories/:storyId/view', authenticateToken, async (req, res, next) => {
    try {
        const viewerId = req.authUser?.id;
        if (!viewerId)
            throw new HttpError(401, 'token_invalid');
        const storyId = String(req.params.storyId || '').trim();
        await recordStoryView(storyId, viewerId);
        res.status(200).json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
router.get('/stories/:storyId/stats', authenticateToken, async (req, res, next) => {
    try {
        const authorId = req.authUser?.id;
        if (!authorId)
            throw new HttpError(401, 'token_invalid');
        const storyId = String(req.params.storyId || '').trim();
        const [viewers, likers] = await Promise.all([
            getStoryViewers(storyId, authorId),
            getStoryLikers(storyId, authorId),
        ]);
        res.status(200).json({ viewers, likers });
    }
    catch (e) {
        next(e);
    }
});
router.post('/stories/:storyId/like', authenticateToken, withIdempotency, async (req, res, next) => {
    try {
        const viewerId = req.authUser?.id;
        if (!viewerId)
            throw new HttpError(401, 'token_invalid');
        const storyId = String(req.params.storyId || '').trim();
        if (!storyId)
            throw new HttpError(400, 'invalid_body');
        const out = await toggleStoryLike(storyId, viewerId);
        res.status(200).json(out);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/stories/:storyId', authenticateToken, withIdempotency, async (req, res, next) => {
    try {
        const authorId = req.authUser?.id;
        if (!authorId)
            throw new HttpError(401, 'token_invalid');
        const storyId = String(req.params.storyId || '').trim();
        if (!storyId)
            throw new HttpError(400, 'invalid_body');
        await deleteStoryAsAuthor(storyId, authorId);
        res.status(200).json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
router.post('/posts/:postId/repost', authenticateToken, withIdempotency, async (req, res, next) => {
    try {
        const viewerId = req.authUser?.id;
        if (!viewerId)
            throw new HttpError(401, 'token_invalid');
        const postId = String(req.params.postId || '').trim();
        if (!postId)
            throw new HttpError(400, 'invalid_body');
        const parsed = repostSchema.safeParse(req.body || {});
        if (!parsed.success)
            throw new HttpError(400, 'invalid_body');
        const out = await togglePostRepost(postId, viewerId, parsed.data.caption || '');
        res.status(200).json(out);
    }
    catch (e) {
        next(e);
    }
});
router.post('/comments/:commentId/like', authenticateToken, withIdempotency, async (req, res, next) => {
    try {
        const viewerId = req.authUser?.id;
        if (!viewerId)
            throw new HttpError(401, 'token_invalid');
        const commentId = String(req.params.commentId || '').trim();
        if (!commentId)
            throw new HttpError(400, 'invalid_body');
        const out = await toggleCommentLike(commentId, viewerId);
        res.status(200).json(out);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/comments/:commentId', authenticateToken, withIdempotency, async (req, res, next) => {
    try {
        const viewerId = req.authUser?.id;
        if (!viewerId)
            throw new HttpError(401, 'token_invalid');
        const commentId = String(req.params.commentId || '').trim();
        if (!commentId)
            throw new HttpError(400, 'invalid_body');
        await deletePostCommentByAuthor(commentId, viewerId);
        res.status(200).json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
export const feedRouter = router;
//# sourceMappingURL=feedRoutes.js.map