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
/** Scoped grants for a 1-to-1 audio call participant. */
export declare function generateLiveKitToken(opts: {
    identity: string;
    name?: string;
    roomName: string;
    ttl?: string;
}): Promise<string>;
export interface CallRow {
    id: string;
    room_name: string;
    caller_id: string;
    callee_id: string;
    status: 'pending' | 'ringing' | 'active' | 'ended' | 'missed' | 'declined';
    started_at: string | null;
    ended_at: string | null;
    duration_seconds: number;
    created_at: string;
}
/**
 * Initiate a new audio/video call.
 * Creates a call_history row with a unique room name, generates a LiveKit
 * token for the caller, sends a VoIP push to the callee (if APNs configured),
 * and returns everything the caller needs to connect.
 */
export declare function initiateCall(callerId: string, calleeId: string, isVideo?: boolean): Promise<{
    call: CallRow;
    token: string;
    livekitUrl: string;
}>;
/**
 * Generate a LiveKit token for the callee so they can join the same room.
 * Only the callee may request this (token is identity-scoped).
 */
export declare function joinCallToken(callId: string, userId: string): Promise<{
    token: string;
    livekitUrl: string;
    room: string;
}>;
/**
 * Mark a call as active (both participants are connected).
 */
export declare function markCallActive(callId: string, userId: string): Promise<void>;
/**
 * End a call. Either participant can end it.
 * Calculates duration_seconds from started_at → now().
 */
export declare function endCall(callId: string, userId: string): Promise<CallRow>;
/**
 * Decline an incoming call (callee only).
 */
export declare function declineCall(callId: string, userId: string): Promise<void>;
/**
 * Get a single call by ID (both participants can view).
 */
export declare function getCallById(callId: string, userId: string): Promise<CallRow>;
/**
 * List pending incoming calls for a user (polling-based ringing).
 */
export declare function listPendingCalls(userId: string): Promise<CallRow[]>;
/**
 * Get call history for a user (both as caller and callee).
 */
/**
 * Register or update a VoIP push token for the given user.
 */
export declare function registerVoipPushToken(userId: string, voipToken: string, deviceFamily?: string): Promise<void>;
/**
 * Remove a push token for a user (e.g., on logout).
 */
export declare function removeVoipPushToken(userId: string): Promise<void>;
export declare function listCallHistory(userId: string, limit?: number): Promise<CallRow[]>;
//# sourceMappingURL=callService.d.ts.map