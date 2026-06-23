/**
 * Chat message push notification service.
 *
 * Sends push notifications via Expo Push API when a new chat message arrives.
 * The recipient must have registered an Expo push token.
 *
 * Expo Push API: https://docs.expo.dev/push-notifications/sending-notifications/
 */

import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Get the Expo push token for a user, or null if none registered.
 */
async function getExpoPushToken(receiverId: string): Promise<string | null> {
  const tokenRow = await pool.query(
    `SELECT expo_push_token FROM push_tokens WHERE user_id = $1::uuid AND expo_push_token IS NOT NULL`,
    [receiverId],
  );
  if (!tokenRow.rowCount) return null;
  const expoToken = String((tokenRow.rows[0] as { expo_push_token: string }).expo_push_token);
  if (!expoToken || !expoToken.startsWith('ExponentPushToken[')) return null;
  return expoToken;
}

interface ExpoPushPayload {
  title: string;
  body: string;
  data: Record<string, unknown>;
  categoryId?: string;
  priority?: 'default' | 'high';
  sound?: string;
}

/**
 * Low-level helper: send a push notification via Expo Push API to a single user.
 * Fire-and-forget: logs errors but never throws.
 */
async function sendExpoPushRaw(
  receiverId: string,
  payload: ExpoPushPayload,
): Promise<void> {
  if (!config.expoPushAccessToken) {
    logger.debug('[expoPush] Expo push not configured — skip');
    return;
  }

  try {
    const expoToken = await getExpoPushToken(receiverId);
    if (!expoToken) {
      logger.debug('[expoPush] No Expo push token for user', { receiverId });
      return;
    }

    const pushPayload = {
      to: expoToken,
      sound: payload.sound || 'default',
      title: payload.title,
      body: payload.body.length > 120
        ? payload.body.slice(0, 117) + '...'
        : payload.body,
      data: payload.data,
      categoryId: payload.categoryId || 'default',
      priority: payload.priority || 'high',
      _displayInForeground: true,
    };

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(config.expoPushAccessToken
          ? { 'Authorization': `Bearer ${config.expoPushAccessToken}` }
          : {}),
      },
      body: JSON.stringify(pushPayload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error('[expoPush] Expo API error', { status: res.status, body: text });
      return;
    }

    const result = await res.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
    const data = (result?.data as Record<string, unknown>) ?? null;
    if (data && data.status === 'error') {
      logger.error('[expoPush] Expo send error', {
        message: String(data.message || ''),
        details: data.details,
      });
      const details = data.details as Record<string, unknown> | undefined;
      if (details?.error === 'DeviceNotRegistered') {
        await pool.query(
          `UPDATE push_tokens SET expo_push_token = NULL WHERE user_id = $1::uuid`,
          [receiverId],
        );
        logger.info('[expoPush] Removed invalid Expo token', { receiverId });
      }
    }
  } catch (e) {
    logger.error('[expoPush] Failed to send push', e instanceof Error ? e.message : e);
  }
}

/**
 * Send a push notification for a new chat message.
 * Fire-and-forget: logs errors but never throws.
 */
export async function sendChatMessagePush(
  receiverId: string,
  payload: {
    threadId: string;
    senderName: string;
    senderId: string;
    content: string;
  },
): Promise<void> {
  const body = payload.content;
  await sendExpoPushRaw(receiverId, {
    title: payload.senderName || 'KRAЇNA',
    body,
    data: {
      type: 'chat_message',
      threadId: payload.threadId,
      senderId: payload.senderId,
    },
    categoryId: 'chat_message',
  });
}

/**
 * Send a push notification when someone likes a post.
 * Fire-and-forget: logs errors but never throws.
 */
export async function sendPostLikePush(
  postAuthorId: string,
  payload: {
    likerName: string;
    likerId: string;
    postId: string;
  },
): Promise<void> {
  await sendExpoPushRaw(postAuthorId, {
    title: payload.likerName,
    body: 'liked your post',
    data: {
      type: 'post_like',
      postId: payload.postId,
      likerId: payload.likerId,
    },
    categoryId: 'post_like',
  });
}

/**
 * Send a push notification when someone comments on a post.
 * Fire-and-forget: logs errors but never throws.
 */
export async function sendPostCommentPush(
  postAuthorId: string,
  payload: {
    commenterName: string;
    commenterId: string;
    postId: string;
    commentId: string;
    commentPreview: string;
  },
): Promise<void> {
  const preview = payload.commentPreview.length > 80
    ? payload.commentPreview.slice(0, 77) + '...'
    : payload.commentPreview;
  await sendExpoPushRaw(postAuthorId, {
    title: payload.commenterName,
    body: preview,
    data: {
      type: 'post_comment',
      postId: payload.postId,
      commentId: payload.commentId,
      commenterId: payload.commenterId,
    },
    categoryId: 'post_comment',
  });
}

/**
 * Send a push notification when someone likes a comment.
 * Fire-and-forget: logs errors but never throws.
 */
export async function sendCommentLikePush(
  commentAuthorId: string,
  payload: {
    likerName: string;
    likerId: string;
    commentId: string;
    postId: string;
  },
): Promise<void> {
  await sendExpoPushRaw(commentAuthorId, {
    title: payload.likerName,
    body: 'liked your comment',
    data: {
      type: 'comment_like',
      commentId: payload.commentId,
      postId: payload.postId,
      likerId: payload.likerId,
    },
    categoryId: 'comment_like',
  });
}

/**
 * Register or update an Expo push token for the current user.
 */
export async function registerExpoPushToken(
  userId: string,
  expoToken: string,
): Promise<void> {
  const token = String(expoToken || '').trim();
  if (!token || !token.startsWith('ExponentPushToken[')) {
    throw new Error('invalid_expo_push_token');
  }

  await pool.query(
    `INSERT INTO push_tokens (user_id, expo_push_token, device_family, updated_at)
     VALUES ($1::uuid, $2, $3, now())
     ON CONFLICT (user_id)
     DO UPDATE SET expo_push_token = EXCLUDED.expo_push_token,
                   device_family = EXCLUDED.device_family,
                   updated_at = now()`,
    [userId, token, 'expo'],
  );
}

/**
 * Remove the Expo push token for a user (on logout).
 */
export async function removeExpoPushToken(userId: string): Promise<void> {
  await pool.query(
    `UPDATE push_tokens SET expo_push_token = NULL, updated_at = now() WHERE user_id = $1::uuid`,
    [userId],
  );
}
