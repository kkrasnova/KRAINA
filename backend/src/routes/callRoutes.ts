import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { withIdempotency } from '../middleware/idempotency.js';
import { HttpError } from '../errors/HttpError.js';
import { config } from '../config.js';
import {
  getCallById,
  initiateCall,
  joinCallToken,
  markCallActive,
  endCall,
  declineCall,
  listPendingCalls,
  listCallHistory,
  registerVoipPushToken,
  removeVoipPushToken,
} from '../services/callService.js';

const router = Router();

/** GET /api/calls/:callId — статус конкретного дзвінка. */
router.get('/:callId', authenticateToken, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    const call = await getCallById(req.params.callId, me);
    res.status(200).json({ call });
  } catch (e) {
    next(e);
  }
});

/** GET /api/calls/pending — список вхідних дзвінків. */
router.get('/pending', authenticateToken, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    if (!config.livekitUrl) {
      res.status(200).json({ calls: [] });
      return;
    }
    const calls = await listPendingCalls(me);
    res.status(200).json({ calls });
  } catch (e) {
    next(e);
  }
});

/** POST /api/calls/initiate — створити новий дзвінок (audio або video). */
router.post('/initiate', authenticateToken, withIdempotency, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    if (!config.livekitUrl) {
      throw new HttpError(503, 'livekit_not_configured');
    }
    const { callee_id, is_video } = req.body as { callee_id?: string; is_video?: boolean };
    if (!callee_id || typeof callee_id !== 'string') {
      throw new HttpError(400, 'callee_id_required');
    }
    const result = await initiateCall(me, callee_id, !!is_video);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

/** POST /api/calls/:callId/join — отримати LiveKit токен для входу в кімнату. */
router.post('/:callId/join', authenticateToken, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    if (!config.livekitUrl) {
      throw new HttpError(503, 'livekit_not_configured');
    }
    const result = await joinCallToken(req.params.callId, me);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
});

/** POST /api/calls/:callId/accept — прийняти вхідний дзвінок (mark as active). */
router.post('/:callId/accept', authenticateToken, withIdempotency, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    await markCallActive(req.params.callId, me);
    // Return join token so the callee can connect
    const result = await joinCallToken(req.params.callId, me);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
});

/** POST /api/calls/:callId/end — завершити дзвінок. */
router.post('/:callId/end', authenticateToken, withIdempotency, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    const call = await endCall(req.params.callId, me);
    res.status(200).json({ call });
  } catch (e) {
    next(e);
  }
});

/** POST /api/calls/:callId/decline — відхилити вхідний дзвінок. */
router.post('/:callId/decline', authenticateToken, withIdempotency, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    await declineCall(req.params.callId, me);
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** GET /api/calls/history — історія дзвінків. */
router.get('/history', authenticateToken, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    const limit = Number(req.query.limit ?? 50);
    const calls = await listCallHistory(me, limit);
    res.status(200).json({ calls });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/calls/push-token — зареєструвати VoIP push токен пристрою.
 * Викликається з клієнта після отримання PushKit токена.
 */
router.post('/push-token', authenticateToken, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    const { voip_token, device_family } = req.body as {
      voip_token?: string;
      device_family?: string;
    };
    if (!voip_token || typeof voip_token !== 'string') {
      throw new HttpError(400, 'voip_token_required');
    }
    await registerVoipPushToken(me, voip_token, device_family ?? 'ios');
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/**
 * DELETE /api/calls/push-token — видалити VoIP push токен (при logout).
 */
router.delete('/push-token', authenticateToken, async (req, res, next) => {
  try {
    const me = req.authUser?.id;
    if (!me) throw new HttpError(401, 'token_invalid');
    await removeVoipPushToken(me);
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export const callRouter = router;
