/** Синхронний in-memory кеш лайків/коментарів — без миготіння при переході feed ↔ profile. */
const likesByPostId = new Map();
const commentsByPostId = new Map();

function normalizeIds(postIds) {
  return [...new Set((Array.isArray(postIds) ? postIds : [postIds]).map(String).filter(Boolean))];
}

export function rememberPostLikeState(postIds, { liked, likes_count }) {
  const ids = normalizeIds(postIds);
  if (!ids.length) return;
  const row = {
    liked: !!liked,
    likes_count: Math.max(0, Number(likes_count) || 0),
    at: Date.now(),
  };
  ids.forEach((id) => likesByPostId.set(id, row));
}

export function peekPostLikeState(postIds) {
  const ids = normalizeIds(postIds);
  let liked = false;
  let likes_count = 0;
  let has = false;
  let latestAt = 0;
  for (const id of ids) {
    const row = likesByPostId.get(id);
    if (!row) continue;
    has = true;
    if (row.at >= latestAt) {
      latestAt = row.at;
      liked = !!row.liked;
      likes_count = Math.max(likes_count, Math.max(0, Number(row.likes_count) || 0));
    }
    liked = liked || !!row.liked;
    likes_count = Math.max(likes_count, Math.max(0, Number(row.likes_count) || 0));
  }
  return { liked, likes_count, has };
}

export function rememberPostCommentsCount(postIds, comments_count) {
  const ids = normalizeIds(postIds);
  if (!ids.length) return;
  const count = Math.max(0, Number(comments_count) || 0);
  const existing = peekPostComments(postIds);
  const items = existing.items || [];
  const row = { count: Math.max(count, items.length), items, at: Date.now() };
  ids.forEach((id) => commentsByPostId.set(id, row));
}

export function rememberPostComment(postIds, comment) {
  const ids = normalizeIds(postIds);
  if (!ids.length || !comment) return;
  const existing = peekPostComments(ids);
  const items = Array.isArray(existing.items) ? [...existing.items] : [];
  const key = `${comment.author || ''}:${comment.text || comment.content || ''}`;
  if (!items.some((c) => `${c.author || ''}:${c.text || c.content || ''}` === key)) {
    items.push(comment);
  }
  const row = { count: Math.max(items.length, existing.count || 0), items, at: Date.now() };
  ids.forEach((id) => commentsByPostId.set(id, row));
}

export function peekPostComments(postIds) {
  const ids = normalizeIds(postIds);
  let count = 0;
  let items = [];
  let has = false;
  for (const id of ids) {
    const row = commentsByPostId.get(id);
    if (!row) continue;
    has = true;
    count = Math.max(count, Math.max(0, Number(row.count) || 0));
    if (Array.isArray(row.items) && row.items.length > items.length) {
      items = row.items;
    }
  }
  return { count, items, has };
}

export function warmPostLikeStateFromStats(stats, postIds) {
  const ids = normalizeIds(postIds);
  if (!stats || !ids.length) return;
  for (const id of ids) {
    if (stats.likes?.[id] == null && stats.likeCounts?.[id] == null) continue;
    if (likesByPostId.has(id)) continue;
    rememberPostLikeState(id, {
      liked: !!stats.likes?.[id],
      likes_count: Math.max(0, Number(stats.likeCounts?.[id]) || 0),
    });
  }
  for (const id of ids) {
    if (stats.commentCounts?.[id] == null) continue;
    if (commentsByPostId.has(id)) continue;
    rememberPostCommentsCount(id, stats.commentCounts[id]);
  }
}
