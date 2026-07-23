import { pool } from '../db/pool.js';
import {
  formatLandmarkStoryRequestTelegram,
  sendTelegramHtmlMessage,
} from './telegramNotifyService.js';

export interface LandmarkStoryRequestRow {
  id: string;
  request_ref: string;
  user_id: string | null;
  user_email: string | null;
  app_language: string | null;
  scan_latitude: number | null;
  scan_longitude: number | null;
  attached_latitude: number | null;
  attached_longitude: number | null;
  vision_hint_title: string | null;
  has_photo: boolean;
  telegram_sent: boolean;
  created_at: string;
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function createLandmarkStoryRequest(params: {
  requestRef: string;
  language: string | null;
  userId: string | null;
  userEmail: string | null;
  scanLatitude: number | null;
  scanLongitude: number | null;
  attachedLatitude: number | null;
  attachedLongitude: number | null;
  visionHintTitle: string | null;
  hasPhoto: boolean;
}): Promise<{ id: string; telegramSent: boolean }> {
  const r = await pool.query(
    `INSERT INTO landmark_story_requests (
       request_ref, user_id, user_email, app_language,
       scan_latitude, scan_longitude, attached_latitude, attached_longitude,
       vision_hint_title, has_photo
     )
     VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id::text`,
    [
      params.requestRef,
      params.userId,
      params.userEmail,
      params.language,
      params.scanLatitude,
      params.scanLongitude,
      params.attachedLatitude,
      params.attachedLongitude,
      params.visionHintTitle,
      params.hasPhoto,
    ],
  );

  const id = String((r.rows[0] as { id: string }).id);
  const telegramText = formatLandmarkStoryRequestTelegram({
    requestRef: params.requestRef,
    language: params.language,
    userEmail: params.userEmail,
    userId: params.userId,
    scanLatitude: params.scanLatitude,
    scanLongitude: params.scanLongitude,
    attachedLatitude: params.attachedLatitude,
    attachedLongitude: params.attachedLongitude,
    visionHintTitle: params.visionHintTitle,
    hasPhoto: params.hasPhoto,
  });

  const telegramSent = await sendTelegramHtmlMessage(telegramText);
  if (telegramSent) {
    await pool.query(`UPDATE landmark_story_requests SET telegram_sent = true WHERE id = $1::uuid`, [id]);
  }

  return { id, telegramSent };
}

export async function listLandmarkStoryRequestsForAdmin(limit = 80): Promise<LandmarkStoryRequestRow[]> {
  const lim = Math.min(200, Math.max(1, limit));
  const r = await pool.query(
    `SELECT id::text, request_ref, user_id::text AS user_id, user_email, app_language,
            scan_latitude, scan_longitude, attached_latitude, attached_longitude,
            vision_hint_title, has_photo, telegram_sent, created_at
     FROM landmark_story_requests
     ORDER BY created_at DESC
     LIMIT $1`,
    [lim],
  );

  return (r.rows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    request_ref: String(row.request_ref),
    user_id: row.user_id == null ? null : String(row.user_id),
    user_email: row.user_email == null ? null : String(row.user_email),
    app_language: row.app_language == null ? null : String(row.app_language),
    scan_latitude: toNum(row.scan_latitude),
    scan_longitude: toNum(row.scan_longitude),
    attached_latitude: toNum(row.attached_latitude),
    attached_longitude: toNum(row.attached_longitude),
    vision_hint_title: row.vision_hint_title == null ? null : String(row.vision_hint_title),
    has_photo: !!row.has_photo,
    telegram_sent: !!row.telegram_sent,
    created_at: new Date(String(row.created_at)).toISOString(),
  }));
}
