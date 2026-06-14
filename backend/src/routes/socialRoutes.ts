import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { optionalAuth } from '../middleware/authMiddleware.js';
import { HttpError } from '../errors/HttpError.js';
import { withIdempotency } from '../middleware/idempotency.js';
import { followBodySchema } from '../schemas/messages.schemas.js';
import {
  acceptFirestoreFollowIntoPostgres,
  acceptFriendRequest,
  cancelOutgoingRequest,
  declineFriendRequest,
  followByUserId,
  followByUsername,
  getRelationStateByTarget,
  listIncomingRequests,
  listSocialConnectionsByTarget,
  listMutualFriends,
  listOutgoingRequests,
  searchSocialProfiles,
  unfollowByUserId,
  unfollowByUsername,
} from '../services/socialService.js';

const router = Router();

router.get('/mutuals', authenticateToken, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    const users = await listMutualFriends(me);
    res.status(200).json({ users });
  } catch (e) {
    next(e);
  }
});

router.get('/search', optionalAuth, async (req, res, next) => {
  try {
    const me = req.authUser?.id || null;
    const q = String(req.query.q || '').trim();
    if (q.length < 1) {
      res.status(200).json({ users: [] });
      return;
    }
    const limit = Math.min(40, Math.max(1, Number(req.query.limit) || 24));
    const users = await searchSocialProfiles(me, q, limit);
    res.status(200).json({ users });
  } catch (e) {
    next(e);
  }
});

router.get('/connections', optionalAuth, async (req, res, next) => {
  try {
    const me = req.authUser?.id || null;
    const targetUsername = String(req.query.username || '').trim() || null;
    const targetUserId = String(req.query.user_id || '').trim() || null;
    const kindRaw = String(req.query.kind || 'friends').trim().toLowerCase();
    const kind = kindRaw === 'followers' || kindRaw === 'following' ? kindRaw : 'friends';
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 120));
    const users = await listSocialConnectionsByTarget({
      meId: me,
      targetUsername,
      targetUserId,
      kind,
      limit,
    });
    res.status(200).json({ users });
  } catch (e) {
    next(e);
  }
});

router.get('/relation', optionalAuth, async (req, res, next) => {
  try {
    const me = req.authUser?.id || null;
    const targetUsername = String(req.query.username || '').trim() || null;
    const targetUserId = String(req.query.user_id || '').trim() || null;
    const relation = await getRelationStateByTarget({
      meId: me,
      targetUsername,
      targetUserId,
    });
    res.status(200).json(relation);
  } catch (e) {
    next(e);
  }
});

router.post('/follow', authenticateToken, withIdempotency, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    const parsed = followBodySchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'invalid_body');
    const out = await followByUsername(me, parsed.data.username.replace(/^@/, ''));
    res.status(200).json({ ok: true, pending: out.pending });
  } catch (e) {
    next(e);
  }
});

router.post('/follow/by-id', authenticateToken, withIdempotency, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    const userId = String(req.body?.user_id || '').trim();
    if (!userId) throw new HttpError(400, 'invalid_body');
    const out = await followByUserId(me, userId);
    res.status(200).json({ ok: true, pending: out.pending });
  } catch (e) {
    next(e);
  }
});


router.post('/pending-follow/:followerId/accept-postgres', authenticateToken, withIdempotency, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    const followerId = String(req.params.followerId || '').trim();
    if (!followerId) throw new HttpError(400, 'invalid_follower');
    await acceptFirestoreFollowIntoPostgres(me, followerId);
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/follow/:username', authenticateToken, withIdempotency, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    const u = String(req.params.username || '').replace(/^@/, '');
    if (!u) throw new HttpError(400, 'invalid_body');
    await unfollowByUsername(me, u);
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/follow/by-id/:userId', authenticateToken, withIdempotency, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    const userId = String(req.params.userId || '').trim();
    if (!userId) throw new HttpError(400, 'invalid_body');
    await unfollowByUserId(me, userId);
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/requests/incoming', authenticateToken, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    const requests = await listIncomingRequests(me);
    res.status(200).json({ requests });
  } catch (e) {
    next(e);
  }
});

router.get('/requests/outgoing', authenticateToken, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    const requests = await listOutgoingRequests(me);
    res.status(200).json({ requests });
  } catch (e) {
    next(e);
  }
});

router.post('/requests/:userId/accept', authenticateToken, withIdempotency, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    await acceptFriendRequest(me, req.params.userId);
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/requests/:userId/decline', authenticateToken, withIdempotency, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    await declineFriendRequest(me, req.params.userId);
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/requests/outgoing/:userId', authenticateToken, withIdempotency, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    await cancelOutgoingRequest(me, req.params.userId);
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export const socialRouter = router;
