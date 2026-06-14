

## 2) backend/src/services/feedService.ts

### In listFriendsPosts, replace the mutual-only subquery

OLD:
OR p.user_id IN (
  SELECT f1.following_id
  FROM follows f1
  JOIN follows f2
    ON f2.follower_id = f1.following_id
   AND f2.following_id = f1.follower_id
  WHERE f1.follower_id = $1::uuid
)

NEW:
OR p.user_id IN (
  SELECT f.following_id
  FROM follows f
  WHERE f.follower_id = $1::uuid
)

### In listActiveStoriesTray, replace the same mutual-only subquery

OLD:
OR s.user_id IN (
  SELECT f1.following_id
  FROM follows f1
  JOIN follows f2
    ON f2.follower_id = f1.following_id
   AND f2.following_id = f1.follower_id
  WHERE f1.follower_id = $1::uuid
)

NEW:
OR s.user_id IN (
  SELECT f.following_id
  FROM follows f
  WHERE f.follower_id = $1::uuid
)

### In listUserPostsForViewer, fix followers-only visibility

OLD:
const canSeeFollowersScope = isFollower || isPublicProfile;

NEW:
const canSeeFollowersScope = isFollower;

### Replace canViewerAccessPost

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
  if (vis === 'followers') return Boolean(row.is_follower);

  return false;
}

### Update mapPostRow return object

Add these fields near likes_count/comments_count:

reposts_count: Number(row.reposts_count) || 0,
reposted_by_viewer: Boolean((row as { reposted_by_viewer?: boolean }).reposted_by_viewer),

### In list queries SELECT add repost flag

Where you already have:
EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = $X::uuid) AS liked_by_viewer

add:
EXISTS(SELECT 1 FROM post_reposts r WHERE r.post_id = p.id AND r.user_id = $X::uuid) AS reposted_by_viewer

Use the same viewer parameter number as the like check.


### Replace togglePostLike

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

  return {
    liked: Boolean(out.rows[0]?.liked),
    likes_count: Number(out.rows[0]?.likes_count) || 0,
  };
}

### Replace listPostComments

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

### Replace addPostComment

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

  const ins = await pool.query(
    `INSERT INTO comments (post_id, user_id, parent_comment_id, content)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
     RETURNING id, post_id, user_id, parent_comment_id, content, likes_count, created_at`,
    [postId, viewerId, parent, text],
  );

  await pool.query(
    `UPDATE posts
     SET comments_count = comments_count + 1
     WHERE id = $1::uuid`,
    [postId],
  );

  const me = await loadAuthor(viewerId);
  const row = ins.rows[0];

  return {
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
}

### Add new feedService functions

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

  return {
    liked: Boolean(out.rows[0]?.liked),
    likes_count: Number(out.rows[0]?.likes_count) || 0,
  };
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

  await pool.query(
    `UPDATE comments
     SET deleted_at = now(), content = ''
     WHERE id = $1::uuid`,
    [commentId],
  );

  await pool.query(
    `UPDATE posts
     SET comments_count = GREATEST(0, comments_count - 1)
     WHERE id = $1::uuid`,
    [String(row.post_id)],
  );
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
