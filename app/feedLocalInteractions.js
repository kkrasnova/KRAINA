import AsyncStorage from '@react-native-async-storage/async-storage';
import { stableUserKey } from './countryStorage';
import { rememberPostLikeState, rememberPostCommentsCount, rememberPostComment } from './feedInteractionHotCache';

const LIKES_PREFIX = '@kraina_feed_post_likes_v1:';
const COMMENTS_PREFIX = '@kraina_feed_post_comments_v1:';

function likesKey(user) {
  return `${LIKES_PREFIX}${stableUserKey(user)}`;
}

function commentsKey(user) {
  return `${COMMENTS_PREFIX}${stableUserKey(user)}`;
}

async function readLikesMap(user) {
  try {
    const raw = await AsyncStorage.getItem(likesKey(user));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeLikesMap(user, map) {
  await AsyncStorage.setItem(likesKey(user), JSON.stringify(map || {}));
}

async function readCommentsMap(user) {
  try {
    const raw = await AsyncStorage.getItem(commentsKey(user));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeCommentsMap(user, map) {
  await AsyncStorage.setItem(commentsKey(user), JSON.stringify(map || {}));
}

export function isLocalFeedCommentId(commentId) {
  return String(commentId || '').startsWith('lc_');
}

export async function getLocalFeedPostLikeState(user, postId) {
  const pid = String(postId || '');
  if (!user || !pid) return { liked: false, likes_count: 0 };
  const map = await readLikesMap(user);
  const row = map[pid];
  return {
    liked: !!row?.liked,
    likes_count: Math.max(0, Number(row?.likes_count) || 0),
  };
}

export async function setLocalFeedPostLikeState(user, postId, { liked, likes_count }) {
  const pid = String(postId || '');
  if (!user || !pid) return;
  const map = await readLikesMap(user);
  map[pid] = {
    liked: !!liked,
    likes_count: Math.max(0, Number(likes_count) || 0),
  };
  await writeLikesMap(user, map);
  rememberPostLikeState(pid, { liked, likes_count });
}

export async function toggleLocalFeedPostLike(user, postId) {
  const pid = String(postId || '');
  if (!user || !pid) return { liked: false, likes_count: 0 };
  const map = await readLikesMap(user);
  const prev = map[pid] || { liked: false, likes_count: 0 };
  const liked = !prev.liked;
  const likes_count = liked
    ? Math.max(0, Number(prev.likes_count) || 0) + 1
    : Math.max(0, (Number(prev.likes_count) || 0) - 1);
  map[pid] = { liked, likes_count };
  await writeLikesMap(user, map);
  rememberPostLikeState(pid, { liked, likes_count });
  return { liked, likes_count };
}

/** Зливаємо стан лайків з сервера та локального кешу для кількох id (local + backend). */
export async function resolveFeedPostLikeStateFromAliases(user, postIds, serverState = null) {
  const ids = (Array.isArray(postIds) ? postIds : [postIds]).map(String).filter(Boolean);
  let liked = !!(serverState?.liked ?? serverState?.liked_by_viewer);
  let likes_count = Math.max(0, Number(serverState?.likes_count ?? serverState?.count) || 0);
  if (!user || !ids.length) return { liked, likes_count };
  const map = await readLikesMap(user);
  for (const id of ids) {
    const row = map[id];
    if (!row) continue;
    liked = liked || !!row.liked;
    likes_count = Math.max(likes_count, Math.max(0, Number(row.likes_count) || 0));
  }
  return { liked, likes_count };
}

export async function getLocalFeedPostComments(user, postId) {
  const pid = String(postId || '');
  if (!user || !pid) return [];
  const map = await readCommentsMap(user);
  const list = map[pid];
  return Array.isArray(list) ? list : [];
}

export async function addLocalFeedPostComment(user, postId, { content, author }) {
  const pid = String(postId || '');
  const text = String(content || '').trim();
  if (!user || !pid || !text) throw new Error('empty_comment');
  const map = await readCommentsMap(user);
  const list = Array.isArray(map[pid]) ? map[pid] : [];
  const row = {
    id: `lc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    user_id: String(author?.userId || ''),
    content: text,
    created_at: new Date().toISOString(),
    likes_count: 0,
    liked_by_viewer: false,
    username: String(author?.username || author?.displayName || 'user').replace(/^@/, ''),
    avatar_url: author?.avatarUrl || null,
    author: {
      id: String(author?.userId || ''),
      display_name: String(author?.displayName || '').trim() || 'User',
      username: String(author?.username || '').trim(),
      avatar_url: author?.avatarUrl || null,
    },
  };
  map[pid] = [...list, row];
  await writeCommentsMap(user, map);
  rememberPostCommentsCount(pid, map[pid].length);
  rememberPostComment(pid, row);
  return row;
}

export async function toggleLocalFeedPostCommentLike(user, postId, commentId) {
  const pid = String(postId || '');
  const cid = String(commentId || '');
  if (!user || !pid || !cid) return { liked: false, likes_count: 0 };
  const map = await readCommentsMap(user);
  const list = Array.isArray(map[pid]) ? map[pid] : [];
  let out = { liked: false, likes_count: 0 };
  map[pid] = list.map((c) => {
    if (String(c.id) !== cid) return c;
    const prevLiked = !!c.liked_by_viewer;
    const liked = !prevLiked;
    const likes_count = liked
      ? Math.max(0, Number(c.likes_count) || 0) + 1
      : Math.max(0, (Number(c.likes_count) || 0) - 1);
    out = { liked, likes_count };
    return { ...c, liked_by_viewer: liked, likes_count };
  });
  await writeCommentsMap(user, map);
  return out;
}

export async function deleteLocalFeedPostComment(user, postId, commentId) {
  const pid = String(postId || '');
  const cid = String(commentId || '');
  if (!user || !pid || !cid) return false;
  const map = await readCommentsMap(user);
  const list = Array.isArray(map[pid]) ? map[pid] : [];
  const next = list.filter((c) => String(c.id) !== cid);
  if (next.length === list.length) return false;
  map[pid] = next;
  await writeCommentsMap(user, map);
  return true;
}

/** Після синхронізації поста на сервер — переносимо локальні лайки/коментарі на backend id. */
export async function migrateLocalFeedPostInteractions(user, localId, backendId) {
  const local = String(localId || '');
  const backend = String(backendId || '');
  if (!user || !local || !backend || local === backend) return;

  const likes = await readLikesMap(user);
  if (likes[local]) {
    const existing = likes[backend] || { liked: false, likes_count: 0 };
    likes[backend] = {
      liked: !!likes[local].liked || !!existing.liked,
      likes_count: Math.max(Number(likes[local].likes_count) || 0, Number(existing.likes_count) || 0),
    };
    delete likes[local];
    await writeLikesMap(user, likes);
  }

  const comments = await readCommentsMap(user);
  if (Array.isArray(comments[local]) && comments[local].length) {
    const prev = Array.isArray(comments[backend]) ? comments[backend] : [];
    comments[backend] = [...prev, ...comments[local]];
    delete comments[local];
    await writeCommentsMap(user, comments);
  }
}

export async function hydrateLocalFeedPostStats(user, postIds) {
  const ids = (Array.isArray(postIds) ? postIds : []).map(String).filter(Boolean);
  if (!user || !ids.length) return { likes: {}, likeCounts: {}, commentCounts: {} };
  const [likesMap, commentsMap] = await Promise.all([readLikesMap(user), readCommentsMap(user)]);
  const likes = {};
  const likeCounts = {};
  const commentCounts = {};
  for (const id of ids) {
    const likeRow = likesMap[id];
    if (likeRow) {
      likes[id] = !!likeRow.liked;
      likeCounts[id] = Math.max(0, Number(likeRow.likes_count) || 0);
    }
    const comments = commentsMap[id];
    if (Array.isArray(comments) && comments.length) {
      commentCounts[id] = comments.length;
    }
  }
  return { likes, likeCounts, commentCounts };
}
