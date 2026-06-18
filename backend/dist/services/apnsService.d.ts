/**
 * APNs (Apple Push Notification service) connector for VoIP pushes.
 *
 * Uses @parse/node-apn to send push notifications via Apple's HTTP/2 API.
 *
 * Required env vars:
 *   APNS_KEY         — content of the .p8 key file (inline, for cloud deployments)
 *   APNS_KEY_PATH    — path to the .p8 key file (alternative to APNS_KEY)
 *   APNS_KEY_ID      — Key ID from Apple Developer Portal
 *   APNS_TEAM_ID     — Team ID from Apple Developer Portal
 *   APNS_TOPIC       — App bundle ID (e.g. com.kraina.app)
 *   APNS_PRODUCTION  — 1/true for production APNs, 0/false for sandbox (default)
 */
export interface ApnsConfig {
    key: string;
    keyId: string;
    teamId: string;
    topic: string;
    production: boolean;
}
export interface VoipPushPayload {
    /** Unique call UUID (for CallKit reportNewIncomingCall) */
    CallUUID: string;
    /** LiveKit room name */
    roomName: string;
    /** Caller's user ID */
    callerId: string;
    /** Caller's display name */
    callerName: string;
    /** Whether this is a video call */
    isVideo: boolean;
}
/**
 * Initialise the APNs provider from config.
 * Returns false if configuration is incomplete (APNs push will be skipped).
 */
export declare function initApnsProvider(cfg: ApnsConfig): boolean;
/**
 * Build an ApnsConfig from env vars.
 * Returns null if APNs is not configured.
 */
export declare function apnsConfigFromEnv(): ApnsConfig | null;
/**
 * Send a VoIP push notification to a single device token.
 * Returns true if the push was accepted by APNs (not a guarantee of delivery).
 */
export declare function sendVoipPush(deviceToken: string, payload: VoipPushPayload): Promise<boolean>;
/**
 * Gracefully shut down the APNs provider (closes HTTP/2 connections).
 */
export declare function shutdownApns(): Promise<void>;
//# sourceMappingURL=apnsService.d.ts.map