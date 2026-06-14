# backend/src/routes/feedRoutes.ts patch snippets

## 1) Add imports from feedService

togglePostRepost,
toggleCommentLike,
deletePostCommentByAuthor,

## 2) Replace postCommentSchema

const postCommentSchema = z.object({
  content: z.string().trim().min(1).max(500),
  parent_comment_id: z.string().uuid().optional().nullable(),
});

const repostSchema = z.object({
  caption: z.string().max(1000).optional().nullable(),
});

## 3) Replace add comment handler call

const comment = await addPostComment(
  postId,
  viewerId,
  parsed.data.content,
  parsed.data.parent_comment_id ?? null,
);

## 4) Add routes before export const feedRouter = router

router.post('/posts/:postId/repost', authenticateToken, withIdempotency, async (req, res, next) => {
  try {
    const viewerId = req.authUser?.id;
    if (!viewerId) throw new HttpError(401, 'token_invalid');

    const postId = String(req.params.postId || '').trim();
    if (!postId) throw new HttpError(400, 'invalid_body');

    const parsed = repostSchema.safeParse(req.body || {});
    if (!parsed.success) throw new HttpError(400, 'invalid_body');

    const out = await togglePostRepost(postId, viewerId, parsed.data.caption || '');
    res.status(200).json(out);
  } catch (e) {
    next(e);
  }
});

router.post('/comments/:commentId/like', authenticateToken, withIdempotency, async (req, res, next) => {
  try {
    const viewerId = req.authUser?.id;
    if (!viewerId) throw new HttpError(401, 'token_invalid');

    const commentId = String(req.params.commentId || '').trim();
    if (!commentId) throw new HttpError(400, 'invalid_body');

    const out = await toggleCommentLike(commentId, viewerId);
    res.status(200).json(out);
  } catch (e) {
    next(e);
  }
});

router.delete('/comments/:commentId', authenticateToken, withIdempotency, async (req, res, next) => {
  try {
    const viewerId = req.authUser?.id;
    if (!viewerId) throw new HttpError(401, 'token_invalid');

    const commentId = String(req.params.commentId || '').trim();
    if (!commentId) throw new HttpError(400, 'invalid_body');

    await deletePostCommentByAuthor(commentId, viewerId);
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});
