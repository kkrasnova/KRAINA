/**
 * Audio call service (LiveKit-based).
 *
 * Provides:
 *  1. LiveKit access-token generation for a caller/callee in a room.
 *  2. CRUD over call_history rows so both participants can see their call log.
 *
 * LiveKit server:
 *  - LiveKit Cloud (recommended for MVP): https://cloud.livekit.io
 *  - Self-hosted: https://docs.livekit.io/server/self-hosting/
 *
 * Required env vars:
 *   LIVEKIT_API_KEY    — LiveKit API Key
 *   LIVEKIT_API_SECRET — LiveKit API Secret
 *   LIVEKIT_URL        — WebSocket endpoint (wss://<host>)
 */
import { randomUUID } from 'node:crypto';
import { AccessToken } from 'livekit-server-sdk';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { HttpError } from '../errors/HttpError.js';
import { sendVoipPush } from './apnsService.js';
import { logger } from '../logger.js';
// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------
/** Scoped grants for a 1-to-1 audio call participant. */
export async function generateLiveKitToken(opts) {
    const { identity, name, roomName, ttl = '2h' } = opts;
    const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
        identity,
        ...(name ? { name } : {}),
        ttl,
    });
    at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
    });
    return await at.toJwt();
}
function mapRow(row) {
    return {
        id: String(row.id),
        room_name: String(row.room_name),
        caller_id: String(row.caller_id),
        callee_id: String(row.callee_id),
        status: row.status,
        started_at: row.started_at ? new Date(row.started_at).toISOString() : null,
        ended_at: row.ended_at ? new Date(row.ended_at).toISOString() : null,
        duration_seconds: Number(row.duration_seconds) || 0,
        created_at: new Date(row.created_at).toISOString(),
    };
}
// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
/**
 * Initiate a new audio/video call.
 * Creates a call_history row with a unique room name, generates a LiveKit
 * token for the caller, sends a VoIP push to the callee (if APNs configured),
 * and returns everything the caller needs to connect.
 */
export async function initiateCall(callerId, calleeId, isVideo = false) {
    if (callerId === calleeId) {
        throw new HttpError(400, 'cannot_call_self');
    }
    // Verify callee exists
    const userCheck = await pool.query(`SELECT 1 FROM users WHERE id = $1::uuid AND status <> 'deleted'`, [calleeId]);
    if (!userCheck.rowCount) {
        throw new HttpError(404, 'user_not_found');
    }
    const roomName = `call_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const r = await pool.query(`INSERT INTO call_history (room_name, caller_id, callee_id, status)
     VALUES ($1, $2::uuid, $3::uuid, 'pending')
     RETURNING *`, [roomName, callerId, calleeId]);
    const call = mapRow(r.rows[0]);
    const token = await generateLiveKitToken({
        identity: callerId,
        roomName,
    });
    // Look up the caller's display name for the push notification
    const callerProfile = await pool.query(`SELECT display_name FROM profiles WHERE user_id = $1::uuid`, [callerId]);
    const callerName = callerProfile.rows[0]?.display_name ??
        'Someone';
    // Send VoIP push to the callee (fire-and-forget)
    // APNs provider is initialised at app startup — sendVoipPush skips if not configured.
    sendVoipPushToCallee(calleeId, {
        CallUUID: call.id,
        roomName,
        callerId,
        callerName,
        isVideo,
    }).catch((err) => {
        logger.error('Failed to send VoIP push', err);
    });
    return { call, token, livekitUrl: config.livekitUrl };
}
/**
 * Generate a LiveKit token for the callee so they can join the same room.
 * Only the callee may request this (token is identity-scoped).
 */
export async function joinCallToken(callId, userId) {
    const r = await pool.query(`SELECT * FROM call_history WHERE id = $1::uuid`, [callId]);
    if (!r.rowCount)
        throw new HttpError(404, 'call_not_found');
    const row = r.rows[0];
    if (String(row.callee_id) !== userId) {
        throw new HttpError(403, 'not_your_call');
    }
    if (row.status === 'ended' || row.status === 'declined' || row.status === 'missed') {
        throw new HttpError(400, 'call_already_ended');
    }
    const token = await generateLiveKitToken({
        identity: userId,
        roomName: String(row.room_name),
    });
    return { token, livekitUrl: config.livekitUrl, room: String(row.room_name) };
}
/**
 * Mark a call as active (both participants are connected).
 */
export async function markCallActive(callId, userId) {
    const r = await pool.query(`UPDATE call_history
     SET status = 'active', started_at = COALESCE(started_at, now())
     WHERE id = $1::uuid
       AND (caller_id = $2::uuid OR callee_id = $2::uuid)
       AND status IN ('pending', 'ringing')`, [callId, userId]);
    if (!r.rowCount) {
        // Not an error — call may already be active or belong to another user
        return;
    }
}
/**
 * End a call. Either participant can end it.
 * Calculates duration_seconds from started_at → now().
 */
export async function endCall(callId, userId) {
    const r = await pool.query(`UPDATE call_history
     SET status = 'ended',
         ended_at = now(),
         duration_seconds = EXTRACT(EPOCH FROM COALESCE(now() - started_at, '0'::interval))::int
     WHERE id = $1::uuid
       AND (caller_id = $2::uuid OR callee_id = $2::uuid)
       AND status IN ('pending', 'ringing', 'active')
     RETURNING *`, [callId, userId]);
    if (!r.rowCount) {
        throw new HttpError(404, 'call_not_found');
    }
    return mapRow(r.rows[0]);
}
/**
 * Decline an incoming call (callee only).
 */
export async function declineCall(callId, userId) {
    const r = await pool.query(`UPDATE call_history
     SET status = 'declined'
     WHERE id = $1::uuid AND callee_id = $2::uuid AND status = 'pending'`, [callId, userId]);
    if (!r.rowCount) {
        throw new HttpError(404, 'call_not_found');
    }
}
/**
 * Get a single call by ID (both participants can view).
 */
export async function getCallById(callId, userId) {
    const r = await pool.query(`SELECT * FROM call_history WHERE id = $1::uuid AND (caller_id = $2::uuid OR callee_id = $2::uuid)`, [callId, userId]);
    if (!r.rowCount)
        throw new HttpError(404, 'call_not_found');
    return mapRow(r.rows[0]);
}
/**
 * List pending incoming calls for a user (polling-based ringing).
 */
export async function listPendingCalls(userId) {
    const r = await pool.query(`SELECT * FROM call_history
     WHERE callee_id = $1::uuid
       AND status IN ('pending', 'ringing')
     ORDER BY created_at DESC
     LIMIT 10`, [userId]);
    return r.rows.map(mapRow);
}
/**
 * Get call history for a user (both as caller and callee).
 */
// ---------------------------------------------------------------------------
// Push token management
// ---------------------------------------------------------------------------
/**
 * Register or update a VoIP push token for the given user.
 */
export async function registerVoipPushToken(userId, voipToken, deviceFamily = 'ios') {
    await pool.query(`INSERT INTO push_tokens (user_id, voip_token, device_family, updated_at)
     VALUES ($1::uuid, $2, $3, now())
     ON CONFLICT (user_id)
     DO UPDATE SET voip_token = EXCLUDED.voip_token,
                   device_family = EXCLUDED.device_family,
                   updated_at = now()`, [userId, voipToken, deviceFamily]);
}
/**
 * Remove a push token for a user (e.g., on logout).
 */
export async function removeVoipPushToken(userId) {
    await pool.query(`DELETE FROM push_tokens WHERE user_id = $1::uuid`, [userId]);
}
// ---------------------------------------------------------------------------
// VoIP push sending
// ---------------------------------------------------------------------------
async function sendVoipPushToCallee(calleeId, payload) {
    const tokenRow = await pool.query(`SELECT voip_token FROM push_tokens WHERE user_id = $1::uuid`, [calleeId]);
    if (!tokenRow.rowCount) {
        logger.info('No push token for callee — skip VoIP push', { calleeId });
        return;
    }
    const deviceToken = tokenRow.rows[0].voip_token;
    await sendVoipPush(deviceToken, payload);
}
export async function listCallHistory(userId, limit = 50) {
    const lim = Math.min(100, Math.max(1, limit));
    const r = await pool.query(`SELECT * FROM call_history
     WHERE (caller_id = $1::uuid OR callee_id = $1::uuid)
       AND status IN ('active', 'ended', 'declined', 'missed')
     ORDER BY created_at DESC
     LIMIT $2`, [userId, lim]);
    return r.rows.map(mapRow);
}
//# sourceMappingURL=callService.js.map