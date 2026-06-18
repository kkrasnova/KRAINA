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
import apn from '@parse/node-apn';
import fs from 'node:fs';
import { logger } from '../logger.js';
let provider = null;
/**
 * Initialise the APNs provider from config.
 * Returns false if configuration is incomplete (APNs push will be skipped).
 */
export function initApnsProvider(cfg) {
    try {
        const token = {
            key: cfg.key,
            keyId: cfg.keyId,
            teamId: cfg.teamId,
        };
        provider = new apn.Provider({
            token,
            production: cfg.production,
        });
        logger.info('APNs provider initialised', {
            topic: cfg.topic,
            production: cfg.production,
        });
        return true;
    }
    catch (err) {
        logger.error('Failed to initialise APNs provider', err);
        provider = null;
        return false;
    }
}
/**
 * Build an ApnsConfig from env vars.
 * Returns null if APNs is not configured.
 */
export function apnsConfigFromEnv() {
    const keyId = process.env.APNS_KEY_ID ?? '';
    const teamId = process.env.APNS_TEAM_ID ?? '';
    const topic = process.env.APNS_TOPIC ?? '';
    const production = /^(1|true|yes)$/i.test(process.env.APNS_PRODUCTION ?? '');
    if (!keyId || !teamId || !topic) {
        return null;
    }
    // Prefer inline key content, fall back to file path
    let key = process.env.APNS_KEY ?? '';
    if (!key) {
        const keyPath = process.env.APNS_KEY_PATH ?? '';
        if (keyPath) {
            try {
                key = fs.readFileSync(keyPath, 'utf8');
            }
            catch (err) {
                logger.error('Failed to read APNS key file', { path: keyPath, err });
                return null;
            }
        }
    }
    if (!key) {
        return null;
    }
    return { key, keyId, teamId, topic, production };
}
/**
 * Send a VoIP push notification to a single device token.
 * Returns true if the push was accepted by APNs (not a guarantee of delivery).
 */
export async function sendVoipPush(deviceToken, payload) {
    if (!provider) {
        logger.warn('APNs provider not initialised — skipping VoIP push');
        return false;
    }
    const note = new apn.Notification();
    // VoIP push specific settings
    note.expiry = Math.floor(Date.now() / 1000) + 120; // 2 minutes
    note.priority = 5; // immediate
    note.pushType = 'voip';
    // VoIP pushes must NOT have alert/badge/sound — CallKit handles the UI.
    // The library omits these from the payload when they are left at default.
    note.contentAvailable = true;
    // Custom payload with call metadata
    note.payload = {
        CallUUID: payload.CallUUID,
        roomName: payload.roomName,
        callerId: payload.callerId,
        callerName: payload.callerName,
        isVideo: payload.isVideo,
    };
    try {
        const result = await provider.send(note, deviceToken);
        const failed = result.failed ?? [];
        if (failed.length > 0) {
            for (const err of failed) {
                logger.error('APNs send failed for device', {
                    device: err.device,
                    status: err.status,
                    response: err.response,
                });
            }
        }
        const sent = result.sent?.length ?? 0;
        logger.info('VoIP push sent', { sent, failed: failed.length });
        return sent > 0;
    }
    catch (err) {
        logger.error('APNs send error', err);
        return false;
    }
}
/**
 * Gracefully shut down the APNs provider (closes HTTP/2 connections).
 */
export async function shutdownApns() {
    if (provider) {
        await provider.shutdown();
        provider = null;
        logger.info('APNs provider shut down');
    }
}
//# sourceMappingURL=apnsService.js.map