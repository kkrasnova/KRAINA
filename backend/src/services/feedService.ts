import { randomUUID } from 'node:crypto';
import { HttpError } from '../errors/HttpError.js';
import { pool } from '../db/pool.js';
import { getStorageProvider } from '../storage/index.js';
import { sendPostLikePush, sendPostCommentPush, sendCommentLikePush } from './chatPushService.js';
import { logger } from '../logger.js';

function extFromMime(mimetype: string): string {
  if (mimetype === 'image/jpeg') return 'jpg';
  if (mimetype === 'image/png') return 'png';
  if (mimetype === 'image/webp') return 'webp';
  if (mimetype === 'video/mp4') return 'mp4';
  if (mimetype === 'video/quicktime') return 'mov';
  if (mimetype === 'audio/mp4' || mimetype === 'audio/m4a' || mimetype === 'audio/x-m4a') return 'm4a';
  if (mimetype === 'audio/x-caf') return 'caf';
  if (mimetype === 'audio/aac') return 'aac';
  if (mimetype === 'audio/mpeg') return 'mp3';
  if (mimetype === 'audio/wav' || mimetype === 'audio/x-wav') return 'wav';
  return 'bin';
}

export async function saveFeedMediaFile(file: {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
}): Promise<{ url: string; media_kind: 'image' | 'video' | 'audio' }> {
  let mimetype = String(file.mimetype || '');
  const originalname = String(file.originalname || '').toLowerCase();
  if (mimetype === 'application/octet-stream') {
    if (/\.(m4a|mp4)$/i.test(originalname)) mimetype = 'audio/m4a';
    else if (/\.aac$/i.test(originalname)) mimetype = 'audio/aac';
    else if (/\.mp3$/i.test(originalname)) mimetype = 'audio/mpeg';
    else if (/\.wav$/i.test(originalname)) mimetype = 'audio/wav';
    else if (/\.caf$/i.test(originalname)) mimetype = 'audio/x-caf';
  }
  const allowed = new Set([
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
    'audio/x-caf',
  ]);
  if (!allowed.has(mimetype)) {
    throw new HttpError(400, 'invalid_format');
  }
  const ext = extFromMime(mimetype);
  const media_kind: 'image' | 'video' | 'audio' = mimetype.startsWith('video/')
    ? 'video'
    : mimetype.startsWith('audio/')
      ? 'audio'
      : 'image';
  const name = `${randomUUID()}.${ext}`;
  const key = `feed/${name}`;
  const url = await getStorageProvider().upload(key, file.buffer, mimetype);
  return { url, media_kind };
}

export async function createPost(
  userId: string,
  body: {
    media_urls: string[];
    content_text?: string | null;
    visibility: 'public' | 'followers' | 'private';
    place_label?: string | null;
    lat?: number | null;
    lng?: number | null;
    route_plan?: Record<string, unknown> | null;
  },
) {
  const urls = Array.isArray(body.media_urls) ? body.media_urls.filter(Boolean) : [];
  if (!urls.length) {
    throw new HttpError(400, 'no_media');
  }
  if (urls.length > 10) {
    throw new HttpError(400, 'too_many_media');
  }
  const text = body.content_text?.trim() || null;
  if (text && text.length > 1000) {
    throw new HttpError(400, 'text_too_long');
  }
  const vis = body.visibility || 'followers';
  const plan =
    body.route_plan != null && typeof body.route_plan === 'object' ? body.route_plan : null;
  const r = await pool.query(
    `INSERT INTO posts (user_id, content_text, media_urls, visibility, place_label, lat, lng, route_plan)
     VALUES ($1, $2, $3::text[], $4, $5, $6, $7, $8::jsonb)
     RETURNING id, user_id, content_text, media_urls, visibility, place_label, lat, lng, route_plan, created_at`,
    [
      userId,
      text,
      urls,
      vis,
      body.place_label?.trim() || null,
      body.lat != null && Number.isFinite(body.lat) ? body.lat : null,
      body.lng != null && Number.isFinite(body.lng) ? body.lng : null,
      plan ? JSON.stringify(plan) : null,
    ],
  );
  return r.rows[0];
}

function mapPostRow(row: Record<string, unknown>, author: { username: string; avatar_url: string | null }) {
  const rawPlan = row.route_plan;
  let route_plan: Record<string, unknown> | null = null;
  if (rawPlan != null && typeof rawPlan === 'object' && !Array.isArray(rawPlan)) {
    route_plan = rawPlan as Record<string, unknown>;
  } else if (typeof rawPlan === 'string' && rawPlan.trim()) {
    try {
      route_plan = JSON.parse(rawPlan) as Record<string, unknown>;
    } catch {
      route_plan = null;
    }
  }
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    username: author.username,
    avatar_url: author.avatar_url,
    content_text: row.content_text == null ? '' : String(row.content_text),
    media_urls: Array.isArray(row.media_urls) ? row.media_urls.map(String) : [],
    visibility: String(row.visibility),
    place_label: row.place_label == null ? '' : String(row.place_label),
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
    route_plan,
    likes_count: Number(row.likes_count) || 0,
    comments_count: Number(row.comments_count) || 0,
    reposts_count: Number(row.reposts_count) || 0,
    liked_by_viewer: Boolean(row.liked_by_viewer),
    reposted_by_viewer: Boolean((row as { reposted_by_viewer?: boolean }).reposted_by_viewer),
    created_at: new Date(String(row.created_at)).toISOString(),
    archived_at:
      row.archived_at == null ? null : new Date(String(row.archived_at)).toISOString(),
  };
}

async function loadAuthor(userId: string): Promise<{ username: string; avatar_url: string | null }> {
  const r = await pool.query(`SELECT username, avatar_url FROM profiles WHERE user_id = $1`, [userId]);
  if (!r.rowCount) {
    throw new HttpError(404, 'profile_not_found');
  }
  const row = r.rows[0] as { username: string; avatar_url: string | null };
  return { username: row.username, avatar_url: row.avatar_url };
}

/** Best-effort username resolver for push notifications — never throws. */
async function resolveProfileUsername(userId: string): Promise<string> {
  try {
    const r = await pool.query(`SELECT username FROM profiles WHERE user_id = $1::uuid`, [userId]);
    if (r.rowCount) {
      const name = String((r.rows[0] as { username: string }).username);
      if (name.trim()) return name.trim();
    }
  } catch {
    /* best-effort */
  }
  return 'KRAЇNA';
}

// TODO(cursor-pagination): replace limit-only with (created_at DESC, id DESC) composite cursor.
// Add: before_created_at?: string, before_id?: string params.
// WHERE addition: AND (p.created_at, p.id) < ($beforeCreatedAt, $beforeId)
export async function listMyPosts(userId: string, limit = 60) {
  const r = await pool.query(
    `SELECT p.*,
        EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = $1::uuid) AS liked_by_viewer,
        EXISTS(SELECT 1 FROM post_reposts l WHERE l.post_id = p.id AND l.user_id = $1::uuid) AS reposted_by_viewer
     FROM posts p
     WHERE p.user_id = $1 AND p.archived_at IS NULL
     ORDER BY p.created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  const author = await loadAuthor(userId);
  return r.rows.map((row) => mapPostRow(row as Record<string, unknown>, author));
}

export async function listMyArchivedPosts(userId: string, limit = 40) {
  const r = await pool.query(
    `SELECT p.*,
        EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = $1::uuid) AS liked_by_viewer,
        EXISTS(SELECT 1 FROM post_reposts l WHERE l.post_id = p.id AND l.user_id = $1::uuid) AS reposted_by_viewer
     FROM posts p
     WHERE p.user_id = $1 AND p.archived_at IS NOT NULL
     ORDER BY p.archived_at DESC
     LIMIT $2`,
    [userId, Math.min(80, Math.max(1, limit))],
  );
  const author = await loadAuthor(userId);
  return r.rows.map((row) => mapPostRow(row as Record<string, unknown>, author));
}

export async function setPostArchived(userId: string, postId: string, archived: boolean): Promise<void> {
  const r = await pool.query(
    `UPDATE posts
     SET archived_at = CASE WHEN $3::boolean THEN now() ELSE NULL END
     WHERE id = $1::uuid AND user_id = $2::uuid
     RETURNING id`,
    [postId, userId, archived],
  );
  if (!r.rowCount) {
    throw new HttpError(404, 'post_not_found');
  }
}

export async function updatePostByAuthor(
  userId: string,
  postId: string,
  patch: {
    content_text?: string | null;
    place_label?: string | null;
    lat?: number | null;
    lng?: number | null;
    route_plan?: Record<string, unknown> | null;
    visibility?: 'public' | 'followers' | 'private';
  },
) {
  const text = patch.content_text == null ? null : String(patch.content_text).trim();
  if (text != null && text.length > 1000) {
    throw new HttpError(400, 'text_too_long');
  }
  const plan =
    patch.route_plan != null && typeof patch.route_plan === 'object' ? patch.route_plan : null;
  const r = await pool.query(
    `UPDATE posts
     SET content_text = COALESCE($3, content_text),
         place_label = COALESCE($4, place_label),
         lat = COALESCE($5, lat),
         lng = COALESCE($6, lng),
         route_plan = CASE WHEN $7::jsonb IS NULL THEN route_plan ELSE $7::jsonb END,
         visibility = COALESCE($8, visibility)
     WHERE id = $1::uuid AND user_id = $2::uuid
     RETURNING id`,
    [
      postId,
      userId,
      text,
      patch.place_label == null ? null : String(patch.place_label).trim(),
      patch.lat != null && Number.isFinite(patch.lat) ? patch.lat : null,
      patch.lng != null && Number.isFinite(patch.lng) ? patch.lng : null,
      plan ? JSON.stringify(plan) : null,
      patch.visibility ?? null,
    ],
  );
  if (!r.rowCount) {
    throw new HttpError(404, 'post_not_found');
  }
}

export async function deletePostByAuthor(userId: string, postId: string): Promise<void> {
  const r = await pool.query(
    `DELETE FROM posts WHERE id = $1::uuid AND user_id = $2::uuid RETURNING id`,
    [postId, userId],
  );
  if (!r.rowCount) {
    throw new HttpError(404, 'post_not_found');
  }
}

// TODO(cursor-pagination): replace limit-only with (created_at DESC, id DESC) composite cursor.
// Add: before_created_at?: string, before_id?: string params.
// WHERE addition: AND (p.created_at, p.id) < ($beforeCreatedAt, $beforeId)
export async function listWorldPosts(_viewerId: string | null, limit = 40) {
  const viewerId = _viewerId || '00000000-0000-0000-0000-000000000000';
  const r = await pool.query(
    `SELECT p.*, pr.username, pr.avatar_url,
        EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = $2::uuid) AS liked_by_viewer,
        EXISTS(SELECT 1 FROM post_reposts l WHERE l.post_id = p.id AND l.user_id = $2::uuid) AS reposted_by_viewer
     FROM posts p
     JOIN profiles pr ON pr.user_id = p.user_id
     JOIN users u ON u.id = p.user_id
     WHERE p.visibility = 'public' AND u.status <> 'deleted' AND p.archived_at IS NULL
     ORDER BY p.created_at DESC
     LIMIT $1`,
    [limit, viewerId],
  );
  return r.rows.map((row) =>
    mapPostRow(row as Record<string, unknown>, {
      username: String(row.username),
      avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
    }),
  );
}

// TODO(cursor-pagination): replace limit-only with (created_at DESC, id DESC) composite cursor.
// Add: before_created_at?: string, before_id?: string params.
// WHERE addition: AND (p.created_at, p.id) < ($beforeCreatedAt, $beforeId)
// NOTE: the IN (SELECT following_id ...) subquery materialises the full following list on every
// request. At >500 follows this becomes the dominant cost. Migrate to a fan-out materialised
// feed table before this function is cursor-paginated.
export async function listFriendsPosts(viewerId: string, limit = 40) {
  const r = await pool.query(
    `SELECT p.*, pr.username, pr.avatar_url,
        EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = $1::uuid) AS liked_by_viewer,
        EXISTS(SELECT 1 FROM post_reposts l WHERE l.post_id = p.id AND l.user_id = $1::uuid) AS reposted_by_viewer
     FROM posts p
     JOIN profiles pr ON pr.user_id = p.user_id
     JOIN users u ON u.id = p.user_id
     WHERE u.status <> 'deleted'
       AND p.visibility IN ('public', 'followers')
       AND p.archived_at IS NULL
       AND (
         p.user_id = $1
        OR p.user_id IN (
        SELECT f.following_id
        FROM follows f
        WHERE f.follower_id = $1::uuid
      )
       )
     ORDER BY p.created_at DESC
     LIMIT $2`,
    [viewerId, limit],
  );
  return r.rows.map((row) =>
    mapPostRow(row as Record<string, unknown>, {
      username: String(row.username),
      avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
    }),
  );
}


// TODO(cursor-pagination): replace limit-only with (created_at DESC, id DESC) composite cursor.
// Add: before_created_at?: string, before_id?: string params.
// WHERE addition: AND (p.created_at, p.id) < ($beforeCreatedAt, $beforeId)
export async function listUserPostsForViewer(
  viewerId: string | null,
  targetUsername: string,
  limit = 40,
) {
  const raw = String(targetUsername || '')
    .trim()
    .replace(/^@/, '');
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
  const uname = isUuid ? raw : raw.replace(/[^a-zA-Z0-9_]/g, '');
  if (!uname) {
    throw new HttpError(400, 'invalid_body');
  }
  const pr = isUuid
    ? await pool.query(
        `SELECT user_id::text, is_public, username FROM profiles WHERE user_id = $1::uuid`,
        [uname],
      )
    : await pool.query(
        `SELECT user_id::text, is_public, username FROM profiles WHERE lower(username) = lower($1)`,
        [uname],
      );
  if (!pr.rowCount) {
    throw new HttpError(404, 'profile_not_found');
  }
  const ownerId = String(pr.rows[0].user_id);
  const isPublicProfile = pr.rows[0].is_public == null ? true : Boolean(pr.rows[0].is_public);
  const queryViewerId = viewerId || '00000000-0000-0000-0000-000000000000';
  const isOwner = viewerId != null && viewerId === ownerId;
  const followR = viewerId
    ? await pool.query(
        `SELECT 1 FROM follows WHERE follower_id = $1::uuid AND following_id = $2::uuid`,
        [viewerId, ownerId],
      )
    : { rowCount: 0 };
  const isFollower = !!followR.rowCount;
  const lim = Math.min(80, Math.max(1, limit));

  // Публічний профіль: сітка видна всім (як Instagram). Приватний — лише підписникам.
  const canSeeFollowersScope = isOwner || isFollower || isPublicProfile;
  const visClause = isOwner
    ? `p.visibility <> 'private'`
    : `(p.visibility = 'public' OR (p.visibility = 'followers' AND $4::boolean))`;

  const r = await pool.query(
    `SELECT p.*, pr.username, pr.avatar_url,
        EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = $3::uuid) AS liked_by_viewer,
        EXISTS(SELECT 1 FROM post_reposts l WHERE l.post_id = p.id AND l.user_id = $3::uuid) AS reposted_by_viewer
     FROM posts p
     JOIN profiles pr ON pr.user_id = p.user_id
     JOIN users u ON u.id = p.user_id
     WHERE p.user_id = $1::uuid
       AND u.status <> 'deleted'
       AND p.archived_at IS NULL
       AND ${visClause}
     ORDER BY p.created_at DESC
     LIMIT $2`,
    isOwner ? [ownerId, lim, queryViewerId] : [ownerId, lim, queryViewerId, canSeeFollowersScope],
  );
  return r.rows.map((row) =>
    mapPostRow(row as Record<string, unknown>, {
      username: String(row.username),
      avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
    }),
  );
}

async function canViewerAccessPost(postId: string, viewerId: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT p.user_id, p.visibility,
            EXISTS(
              SELECT 1
              FROM follows f
              WHERE f.follower_id = $2::uuid
                AND f.following_id = p.user_id
            ) AS is_follower
     FROM posts p
     JOIN users u ON u.id = p.user_id
     WHERE p.id = $1::uuid
       AND p.archived_at IS NULL
       AND u.status <> 'deleted'`,
    [postId, viewerId],
  );

  if (!r.rowCount) return false;

  const row = r.rows[0];
  const ownerId = String(row.user_id);
  const vis = String(row.visibility || 'public');

  if (ownerId === viewerId) return true;
  if (vis === 'public') return true;
  if (vis === 'followers') {
    if (Boolean(row.is_follower)) return true;
    const pr = await pool.query(`SELECT is_public FROM profiles WHERE user_id = $1::uuid`, [ownerId]);
    return !!pr.rowCount && Boolean(pr.rows[0].is_public);
  }

  return false;
}
export async function togglePostLike(postId: string, viewerId: string): Promise<{ liked: boolean; likes_count: number }> {
  const allowed = await canViewerAccessPost(postId, viewerId);
  if (!allowed) throw new HttpError(403, 'forbidden');

  const out = await pool.query(
    `WITH deleted AS (
       DELETE FROM post_likes
       WHERE post_id = $1::uuid AND user_id = $2::uuid
       RETURNING 1
     ),
     inserted AS (
       INSERT INTO post_likes (post_id, user_id)
       SELECT $1::uuid, $2::uuid
       WHERE NOT EXISTS (SELECT 1 FROM deleted)
       ON CONFLICT DO NOTHING
       RETURNING 1
     ),
     updated AS (
       UPDATE posts
       SET likes_count = GREATEST(
         0,
         likes_count
         + COALESCE((SELECT COUNT(*) FROM inserted), 0)
         - COALESCE((SELECT COUNT(*) FROM deleted), 0)
       )
       WHERE id = $1::uuid
       RETURNING likes_count
     )
     SELECT
       EXISTS(SELECT 1 FROM inserted) AS liked,
       COALESCE((SELECT likes_count FROM updated), 0)::int AS likes_count`,
    [postId, viewerId],
  );

  const result = {
    liked: Boolean(out.rows[0]?.liked),
    likes_count: Number(out.rows[0]?.likes_count) || 0,
  };

  // Fire-and-forget push to post author on like (not unlike)
  if (result.liked) {
    Promise.all([
      pool.query(`SELECT user_id FROM posts WHERE id = $1::uuid`, [postId]).then(r => {
        if (r.rowCount) {
          const authorId = String(r.rows[0].user_id);
          if (authorId !== viewerId) {
            resolveProfileUsername(viewerId).then(name => {
              sendPostLikePush(authorId, {
                likerName: name,
                likerId: viewerId,
                postId,
              }).catch(e => logger.warn('[feedPush] togglePostLike', e instanceof Error ? e.message : e));
            }).catch(() => {});
          }
        }
      }).catch(() => {}),
    ]).catch(() => {});
  }

  return result;
}
export async function listPostComments(postId: string, viewerId: string, limit = 80) {
  const allowed = await canViewerAccessPost(postId, viewerId);
  if (!allowed) throw new HttpError(403, 'forbidden');

  const lim = Math.min(200, Math.max(1, limit));

  const r = await pool.query(
    `SELECT c.id, c.post_id, c.user_id, c.parent_comment_id,
            CASE WHEN c.deleted_at IS NULL THEN c.content ELSE '' END AS content,
            c.likes_count,
            c.deleted_at,
            c.created_at,
            p.username,
            p.avatar_url,
            EXISTS(
              SELECT 1 FROM comment_likes cl
              WHERE cl.comment_id = c.id AND cl.user_id = $2::uuid
            ) AS liked_by_viewer
     FROM comments c
     JOIN profiles p ON p.user_id = c.user_id
     WHERE c.post_id = $1::uuid
     ORDER BY c.created_at ASC
     LIMIT $3`,
    [postId, viewerId, lim],
  );

  return r.rows.map((row) => ({
    id: String(row.id),
    post_id: String(row.post_id),
    user_id: String(row.user_id),
    parent_comment_id: row.parent_comment_id == null ? null : String(row.parent_comment_id),
    username: String(row.username),
    avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
    content: String(row.content || ''),
    likes_count: Number(row.likes_count) || 0,
    liked_by_viewer: Boolean(row.liked_by_viewer),
    deleted: row.deleted_at != null,
    created_at: new Date(String(row.created_at)).toISOString(),
  }));
}
export async function addPostComment(
  postId: string,
  viewerId: string,
  content: string,
  parentCommentId: string | null = null,
) {
  const allowed = await canViewerAccessPost(postId, viewerId);
  if (!allowed) throw new HttpError(403, 'forbidden');

  const text = String(content || '').trim();
  if (!text) throw new HttpError(400, 'invalid_body');
  if (text.length > 500) throw new HttpError(400, 'text_too_long');

  const parent = parentCommentId ? String(parentCommentId).trim() : null;

  if (parent) {
    const parentRow = await pool.query(
      `SELECT 1
       FROM comments
       WHERE id = $1::uuid
         AND post_id = $2::uuid
         AND deleted_at IS NULL`,
      [parent, postId],
    );

    if (!parentRow.rowCount) throw new HttpError(404, 'parent_comment_not_found');
  }

  // Resolve author profile before acquiring the connection so that a missing
  // profile row (data integrity issue) fails fast without ever opening a tx.
  const me = await loadAuthor(viewerId);

  // Atomic: INSERT comment + increment posts.comments_count in one transaction.
  // Without the transaction a crash between the two writes leaves the counter
  // permanently wrong (row exists, count not incremented, or vice-versa).
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO comments (post_id, user_id, parent_comment_id, content)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
       RETURNING id, post_id, user_id, parent_comment_id, content, likes_count, created_at`,
      [postId, viewerId, parent, text],
    );
    await client.query(
      `UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1::uuid`,
      [postId],
    );
    await client.query('COMMIT');
    const row = ins.rows[0] as Record<string, unknown>;

    const comment = {
      id: String(row.id),
      post_id: String(row.post_id),
      user_id: String(row.user_id),
      parent_comment_id: row.parent_comment_id == null ? null : String(row.parent_comment_id),
      username: me.username,
      avatar_url: me.avatar_url,
      content: String(row.content || ''),
      likes_count: Number(row.likes_count) || 0,
      liked_by_viewer: false,
      deleted: false,
      created_at: new Date(String(row.created_at)).toISOString(),
    };

    // Fire-and-forget push to post author on new comment
    pool.query(`SELECT user_id FROM posts WHERE id = $1::uuid`, [postId]).then(r => {
      if (r.rowCount) {
        const authorId = String(r.rows[0].user_id);
        if (authorId !== viewerId) {
          sendPostCommentPush(authorId, {
            commenterName: me.username,
            commenterId: viewerId,
            postId,
            commentId: comment.id,
            commentPreview: text,
          }).catch(e => logger.warn('[feedPush] addPostComment', e instanceof Error ? e.message : e));
        }
      }
    }).catch(() => {});

    return comment;
  } catch (e) {
    // .catch() absorbs any ROLLBACK error (e.g. broken connection) so the
    // original error is always what propagates to the caller.
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const STORY_DAILY_LIMIT = 20;

export async function createStory(userId: string, media_url: string, media_kind: 'image' | 'video' | 'audio', caption: string) {
  const cap = caption?.trim() || '';
  if (cap.length > 500) {
    throw new HttpError(400, 'caption_too_long');
  }
  const daily = await pool.query(
    `SELECT COUNT(*)::int AS c FROM stories
     WHERE user_id = $1::uuid AND created_at > now() - interval '24 hours'`,
    [userId],
  );
  if (Number(daily.rows[0]?.c) >= STORY_DAILY_LIMIT) {
    throw new HttpError(429, 'story_daily_limit');
  }
  const expires = new Date(Date.now() + STORY_TTL_MS);
  const r = await pool.query(
    `INSERT INTO stories (user_id, media_url, media_kind, caption, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, media_url, media_kind, caption, created_at, expires_at`,
    [userId, media_url, media_kind, cap || null, expires.toISOString()],
  );
  return r.rows[0];
}


// TODO(feed-fanout): same IN-subquery fan-out problem as listFriendsPosts.
// At >500 follows, materialising the full following list for EVERY story tray
// request becomes the dominant cost. Fix path mirrors listFriendsPosts:
// maintain a materialised `story_feed_entries (viewer_id, story_id, author_id)`
// table updated by a follow/unfollow trigger or background worker, then replace
// the IN subquery with a JOIN on that table.
export async function listActiveStoriesTray(viewerId: string) {
  const r = await pool.query(
    `SELECT DISTINCT ON (s.user_id)
        s.id,
        s.user_id,
        s.media_url,
        s.media_kind,
        s.caption,
        s.created_at,
        s.expires_at,
        p.username,
        p.avatar_url,
        p.display_name,
        (SELECT COUNT(*)::int FROM story_views v WHERE v.story_id = s.id) AS view_count,
        EXISTS (SELECT 1 FROM story_views v WHERE v.story_id = s.id AND v.viewer_id = $1) AS seen_by_viewer,
        (SELECT COUNT(*)::int FROM stories s2
          WHERE s2.user_id = s.user_id AND s2.expires_at > now()) AS story_count,
        EXISTS (
          SELECT 1 FROM stories s2
          WHERE s2.user_id = s.user_id AND s2.expires_at > now()
            AND NOT EXISTS (
              SELECT 1 FROM story_views v
              WHERE v.story_id = s2.id AND v.viewer_id = $1
            )
        ) AS has_unviewed
     FROM stories s
     JOIN profiles p ON p.user_id = s.user_id
     JOIN users u ON u.id = s.user_id
     WHERE s.expires_at > now()
       AND u.status <> 'deleted'
       AND (
         s.user_id = $1
        OR s.user_id IN (
        SELECT f.following_id
        FROM follows f
        WHERE f.follower_id = $1::uuid
        )
       )
     ORDER BY s.user_id, s.created_at DESC`,
    [viewerId],
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    user_id: String(row.user_id),
    media_url: String(row.media_url),
    media_kind: String(row.media_kind) as 'image' | 'video',
    caption: row.caption == null ? '' : String(row.caption),
    created_at: new Date(String(row.created_at)).toISOString(),
    expires_at: new Date(String(row.expires_at)).toISOString(),
    username: String(row.username),
    avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
    display_name:
      row.display_name == null || String(row.display_name).trim() === ''
        ? null
        : String(row.display_name).trim(),
    view_count: Number(row.view_count) || 0,
    seen_by_viewer: Boolean(row.seen_by_viewer),
    story_count: Number((row as { story_count?: number }).story_count) || 0,
    has_unviewed: Boolean((row as { has_unviewed?: boolean }).has_unviewed),
  }));
}

export async function listMyArchivedStories(userId: string, limit = 60) {
  const r = await pool.query(
    `SELECT s.id, s.user_id, s.media_url, s.media_kind, s.caption, s.created_at, s.expires_at,
        (SELECT COUNT(*)::int FROM story_views v WHERE v.story_id = s.id) AS view_count
     FROM stories s
     WHERE s.user_id = $1::uuid AND s.expires_at <= now()
     ORDER BY s.created_at DESC
     LIMIT $2`,
    [userId, Math.min(80, Math.max(1, limit))],
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    user_id: String(row.user_id),
    media_url: String(row.media_url),
    media_kind: String(row.media_kind) as 'image' | 'video',
    caption: row.caption == null ? '' : String(row.caption),
    created_at: new Date(String(row.created_at)).toISOString(),
    expires_at: new Date(String(row.expires_at)).toISOString(),
    view_count: Number(row.view_count) || 0,
    expired: true,
  }));
}

export async function listActiveStoriesForUser(authorId: string, viewerId: string) {
  if (authorId !== viewerId) {
    const f = await pool.query(
      `SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2`,
      [viewerId, authorId],
    );
    if (!f.rowCount) {
      const pr = await pool.query(`SELECT is_public FROM profiles WHERE user_id = $1::uuid`, [authorId]);
      const isPublicProfile = !!pr.rowCount && Boolean(pr.rows[0].is_public);
      if (!isPublicProfile) {
        throw new HttpError(403, 'forbidden');
      }
    }
  }
  const r = await pool.query(
    `SELECT s.id, s.user_id, s.media_url, s.media_kind, s.caption, s.created_at, s.expires_at,
        p.username AS author_username,
        p.avatar_url AS author_avatar_url,
        p.display_name AS author_display_name,
        (SELECT COUNT(*)::int FROM story_views v WHERE v.story_id = s.id) AS view_count,
        EXISTS (
          SELECT 1 FROM story_views v WHERE v.story_id = s.id AND v.viewer_id = $2
        ) AS seen_by_viewer,
        EXISTS (
          SELECT 1 FROM story_likes l WHERE l.story_id = s.id AND l.user_id = $2::uuid
        ) AS liked_by_viewer
     FROM stories s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN profiles p ON p.user_id = s.user_id
     WHERE s.user_id = $1 AND s.expires_at > now() AND u.status <> 'deleted'
     ORDER BY s.created_at ASC`,
    [authorId, viewerId],
  );  
  return r.rows.map((row) => ({
    id: String(row.id),
    user_id: String(row.user_id),
    media_url: String(row.media_url),
    media_kind: String(row.media_kind) as 'image' | 'video',
    caption: row.caption == null ? '' : String(row.caption),
    created_at: new Date(String(row.created_at)).toISOString(),
    expires_at: new Date(String(row.expires_at)).toISOString(),
    view_count: Number(row.view_count) || 0,
    seen_by_viewer: Boolean(row.seen_by_viewer),
    liked_by_viewer: Boolean((row as { liked_by_viewer?: boolean }).liked_by_viewer),
    username: row.author_username == null ? '' : String(row.author_username),
    avatar_url: row.author_avatar_url == null ? null : String(row.author_avatar_url),
    display_name:
      (row as { author_display_name?: string | null }).author_display_name == null ||
      String((row as { author_display_name?: string | null }).author_display_name).trim() === ''
        ? null
        : String((row as { author_display_name?: string | null }).author_display_name).trim(),
  }));
}

export async function recordStoryView(storyId: string, viewerId: string) {
  const s = await pool.query(`SELECT user_id FROM stories WHERE id = $1 AND expires_at > now()`, [storyId]);
  if (!s.rowCount) {
    throw new HttpError(404, 'story_not_found');
  }
  const authorId = String(s.rows[0].user_id);
  if (authorId === viewerId) {
    return { ok: true };
  }
  const f = await pool.query(
    `SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2`,
    [viewerId, authorId],
  );
  if (!f.rowCount) {
    throw new HttpError(403, 'forbidden');
  }
  await pool.query(
    `INSERT INTO story_views (story_id, viewer_id) VALUES ($1, $2)
     ON CONFLICT (story_id, viewer_id) DO NOTHING`,
    [storyId, viewerId],
  );
  return { ok: true };
}

export async function getStoryViewers(storyId: string, authorId: string) {
  const s = await pool.query(`SELECT user_id FROM stories WHERE id = $1`, [storyId]);
  if (!s.rowCount) {
    throw new HttpError(404, 'story_not_found');
  }
  if (String(s.rows[0].user_id) !== authorId) {
    throw new HttpError(403, 'forbidden');
  }
  const r = await pool.query(
    `SELECT v.viewer_id, v.viewed_at, p.username, p.avatar_url
     FROM story_views v
     JOIN profiles p ON p.user_id = v.viewer_id
     WHERE v.story_id = $1
     ORDER BY v.viewed_at DESC
     LIMIT 200`,
    [storyId],
  );
  return r.rows.map((row) => ({
    viewer_id: String(row.viewer_id),
    username: String(row.username),
    avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
    viewed_at: new Date(String(row.viewed_at)).toISOString(),
  }));
}

export async function getStoryLikers(storyId: string, authorId: string) {
  const s = await pool.query(`SELECT user_id FROM stories WHERE id = $1`, [storyId]);
  if (!s.rowCount) {
    throw new HttpError(404, 'story_not_found');
  }
  if (String(s.rows[0].user_id) !== authorId) {
    throw new HttpError(403, 'forbidden');
  }
  const r = await pool.query(
    `SELECT l.user_id, l.liked_at, p.username, p.avatar_url
     FROM story_likes l
     JOIN profiles p ON p.user_id = l.user_id
     WHERE l.story_id = $1::uuid
     ORDER BY l.liked_at ASC
     LIMIT 200`,
    [storyId],
  );
  return r.rows.map((row) => ({
    user_id: String(row.user_id),
    username: String(row.username),
    avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
    liked_at: new Date(String(row.liked_at)).toISOString(),
  }));
}

export async function deleteStoryAsAuthor(storyId: string, authorId: string): Promise<void> {
  const r = await pool.query(
    `DELETE FROM stories WHERE id = $1::uuid AND user_id = $2::uuid RETURNING id`,
    [storyId, authorId],
  );
  if (!r.rowCount) {
    throw new HttpError(404, 'story_not_found');
  }
}

export async function toggleStoryLike(storyId: string, viewerId: string): Promise<{ liked: boolean }> {
  // Single multi-CTE statement replaces the old SELECT→DELETE/INSERT pattern.
  // The old approach had a race window: two concurrent requests could both read
  // "not liked" and both INSERT, hitting the PK constraint. The CTE executes
  // atomically: deleted CTE runs first; inserted CTE only fires when deleted
  // returns no rows. ON CONFLICT DO NOTHING handles any remaining edge races.
  const out = await pool.query(
    `WITH story_check AS (
       SELECT id FROM stories WHERE id = $1::uuid
     ),
     deleted AS (
       DELETE FROM story_likes
       WHERE story_id = $1::uuid AND user_id = $2::uuid
         AND (SELECT COUNT(*) FROM story_check) > 0
       RETURNING 1
     ),
     inserted AS (
       INSERT INTO story_likes (story_id, user_id)
       SELECT $1::uuid, $2::uuid
       WHERE NOT EXISTS (SELECT 1 FROM deleted)
         AND (SELECT COUNT(*) FROM story_check) > 0
       ON CONFLICT DO NOTHING
       RETURNING 1
     )
     SELECT
       (SELECT COUNT(*) FROM story_check) > 0 AS story_exists,
       EXISTS (SELECT 1 FROM inserted) AS liked`,
    [storyId, viewerId],
  );

  const row = out.rows[0] as { story_exists: boolean; liked: boolean } | undefined;
  if (!row?.story_exists) {
    throw new HttpError(404, 'story_not_found');
  }
  return { liked: Boolean(row.liked) };
}

export async function toggleCommentLike(commentId: string, viewerId: string): Promise<{ liked: boolean; likes_count: number }> {
  const cr = await pool.query(
    `SELECT post_id::text AS post_id
     FROM comments
     WHERE id = $1::uuid AND deleted_at IS NULL`,
    [commentId],
  );

  if (!cr.rowCount) throw new HttpError(404, 'comment_not_found');

  const postId = String(cr.rows[0].post_id);
  const allowed = await canViewerAccessPost(postId, viewerId);
  if (!allowed) throw new HttpError(403, 'forbidden');

  const out = await pool.query(
    `WITH deleted AS (
       DELETE FROM comment_likes
       WHERE comment_id = $1::uuid AND user_id = $2::uuid
       RETURNING 1
     ),
     inserted AS (
       INSERT INTO comment_likes (comment_id, user_id)
       SELECT $1::uuid, $2::uuid
       WHERE NOT EXISTS (SELECT 1 FROM deleted)
       ON CONFLICT DO NOTHING
       RETURNING 1
     ),
     updated AS (
       UPDATE comments
       SET likes_count = GREATEST(
         0,
         likes_count
         + COALESCE((SELECT COUNT(*) FROM inserted), 0)
         - COALESCE((SELECT COUNT(*) FROM deleted), 0)
       )
       WHERE id = $1::uuid
       RETURNING likes_count
     )
     SELECT
       EXISTS(SELECT 1 FROM inserted) AS liked,
       COALESCE((SELECT likes_count FROM updated), 0)::int AS likes_count`,
    [commentId, viewerId],
  );

  const result = {
    liked: Boolean(out.rows[0]?.liked),
    likes_count: Number(out.rows[0]?.likes_count) || 0,
  };

  // Fire-and-forget push to comment author on like (not unlike)
  if (result.liked) {
    Promise.all([
      pool.query(`SELECT user_id, post_id::text AS post_id FROM comments WHERE id = $1::uuid`, [commentId]).then(r => {
        if (r.rowCount) {
          const authorId = String(r.rows[0].user_id);
          const cPostId = String((r.rows[0] as { post_id: string }).post_id);
          if (authorId !== viewerId) {
            resolveProfileUsername(viewerId).then(name => {
              sendCommentLikePush(authorId, {
                likerName: name,
                likerId: viewerId,
                commentId,
                postId: cPostId,
              }).catch(e => logger.warn('[feedPush] toggleCommentLike', e instanceof Error ? e.message : e));
            }).catch(() => {});
          }
        }
      }).catch(() => {}),
    ]).catch(() => {});
  }

  return result;
}

export async function deletePostCommentByAuthor(commentId: string, viewerId: string): Promise<void> {
  const cr = await pool.query(
    `SELECT c.id, c.post_id, c.user_id, p.user_id AS post_author_id
     FROM comments c
     JOIN posts p ON p.id = c.post_id
     WHERE c.id = $1::uuid
       AND c.deleted_at IS NULL`,
    [commentId],
  );

  if (!cr.rowCount) throw new HttpError(404, 'comment_not_found');

  const row = cr.rows[0];
  const canDelete = String(row.user_id) === viewerId || String(row.post_author_id) === viewerId;
  if (!canDelete) throw new HttpError(403, 'forbidden');

  // Atomic: soft-delete the comment row + decrement posts.comments_count.
  // Without the transaction the counter can drift if one write succeeds and
  // the other doesn't. GREATEST(0, ...) prevents the counter going negative
  // from any pre-existing drift in the data.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE comments SET deleted_at = now(), content = '' WHERE id = $1::uuid`,
      [commentId],
    );
    await client.query(
      `UPDATE posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = $1::uuid`,
      [String(row.post_id)],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function togglePostRepost(
  postId: string,
  viewerId: string,
  caption = '',
): Promise<{ reposted: boolean; reposts_count: number }> {
  const allowed = await canViewerAccessPost(postId, viewerId);
  if (!allowed) throw new HttpError(403, 'forbidden');

  const text = String(caption || '').trim();
  if (text.length > 1000) throw new HttpError(400, 'text_too_long');

  const out = await pool.query(
    `WITH deleted AS (
       DELETE FROM post_reposts
       WHERE post_id = $1::uuid AND user_id = $2::uuid
       RETURNING 1
     ),
     inserted AS (
       INSERT INTO post_reposts (post_id, user_id, caption)
       SELECT $1::uuid, $2::uuid, NULLIF($3, '')
       WHERE NOT EXISTS (SELECT 1 FROM deleted)
       ON CONFLICT DO NOTHING
       RETURNING 1
     ),
     updated AS (
       UPDATE posts
       SET reposts_count = GREATEST(
         0,
         reposts_count
         + COALESCE((SELECT COUNT(*) FROM inserted), 0)
         - COALESCE((SELECT COUNT(*) FROM deleted), 0)
       )
       WHERE id = $1::uuid
       RETURNING reposts_count
     )
     SELECT
       EXISTS(SELECT 1 FROM inserted) AS reposted,
       COALESCE((SELECT reposts_count FROM updated), 0)::int AS reposts_count`,
    [postId, viewerId, text],
  );

  return {
    reposted: Boolean(out.rows[0]?.reposted),
    reposts_count: Number(out.rows[0]?.reposts_count) || 0,
  };
}