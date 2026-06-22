import { useAuthStore } from './auth/authStore';
import { db, firebaseEnabled } from './firebaseConfig';
import { ttlMemo, ttlInvalidate } from './ttlCache';
import { backendAuthFetch, backendAuthUpload, hasBackendSession } from './backendAuthApi';
import { Platform } from 'react-native';

// Стрічка/пости/сторіс працюють на РЕАЛЬНОМУ REST-бекенді (PostgreSQL) для справжніх
// зареєстрованих користувачів. Firestore лишається запасним джерелом лише тоді, коли
// бекенд-сесії немає (наприклад, офлайн або старі збірки без backend JWT).

const FEED = '/api/feed';

// Global cache to prevent redundant Firestore queries.
// Сapped at MAX_CACHE entries — oldest entries evicted to avoid unbounded growth.
const MAX_CACHE = 300;
const profileCache = new Map();
const profileFetchPromises = new Map();
const viewerLikesCache = new Map();

function evictOldest(map) {
  if (map.size > MAX_CACHE) {
    const keys = map.keys();
    for (let i = 0; i < map.size - MAX_CACHE; i += 1) {
      map.delete(keys.next().value);
    }
  }
}

async function getProfileCached(id) {
  if (!db || !id) return null;
  if (profileCache.has(id)) {
    return profileCache.get(id);
  }
  if (profileFetchPromises.has(id)) {
    return profileFetchPromises.get(id);
  }

  const { doc, getDoc } = require('firebase/firestore');
  const promise = (async () => {
    try {
      const snap = await getDoc(doc(db, 'profiles', id));
      if (snap.exists && snap.exists()) {
        const data = { id, ...(snap.data() || {}) };
        profileCache.set(id, data);
        evictOldest(profileCache);
        return data;
      }
    } catch {
      /* ignore */
    }
    return null;
  })();

  profileFetchPromises.set(id, promise);
  const result = await promise;
  profileFetchPromises.delete(id);
  return result;
}

async function isPostLikedByViewer(postId, me) {
  if (!db || !postId || !me) return false;
  const cacheKey = `${postId}:${me}`;
  if (viewerLikesCache.has(cacheKey)) {
    return viewerLikesCache.get(cacheKey);
  }
  const { doc, getDoc } = require('firebase/firestore');
  try {
    const likeSnap = await getDoc(doc(db, 'feedPosts', String(postId), 'likes', me));
    const liked = likeSnap.exists && likeSnap.exists();
    viewerLikesCache.set(cacheKey, liked);
    evictOldest(viewerLikesCache);
    return liked;
  } catch {
    return false;
  }
}


function uid() {
  return String(useAuthStore.getState().user?.id || '');
}

/** Чи доступний «реальний» бекенд стрічки: backend JWT або (як запас) Firebase. */
export function hasFeedApiToken() {
  return hasBackendSession() || (firebaseEnabled && !!db && !!uid());
}

/**
 * Спроба відновити backend-сесію перед стрічкою/постами/сторіс (refresh / Firebase / Google /
 * email). Дзеркалить `ensureMessageApiReady` для чатів — без цього транзієнтне протухання JWT
 * лишає стрічку порожньою, а публікацію — з помилкою, аж до перезапуску застосунку.
 */
export async function ensureFeedApiReady(localUser) {
  if (hasBackendSession()) return true;
  if (!useAuthStore.getState().hydrated) {
    await useAuthStore.getState().hydrate();
  }
  if (hasBackendSession()) return true;
  try {
    const { ensureBackendSession } = require('./syncBackendSessionBridge');
    return await ensureBackendSession(localUser);
  } catch {
    return false;
  }
}

/** Підготувати FormData-файл для multipart-завантаження на бекенд. */
function buildMediaFormFile(localUri) {
  const lower = String(localUri || '').toLowerCase();
  const isVideo = /\.(mp4|mov)(\?|$)/i.test(lower);
  const isAudio = /\.(m4a|aac|mp3|wav|caf)(\?|$)/i.test(lower);
  const type = isVideo
    ? 'video/mp4'
    : isAudio
      ? Platform.OS === 'ios'
        ? 'audio/m4a'
        : 'audio/mp4'
      : 'image/jpeg';
  const ext = isVideo ? 'mp4' : isAudio ? 'm4a' : 'jpg';
  return {
    file: { uri: localUri, type, name: `feed_${Date.now()}.${ext}` },
    media_kind: isVideo ? 'video' : isAudio ? 'audio' : 'image',
  };
}

// ─────────────────────────────── Firestore fallback (only when no backend) ───────────────────────────────

async function fsUploadMediaToStorage(localUri) {
  if (!firebaseEnabled || !db || !localUri) return null;
  const { getStorage, ref, uploadBytes, getDownloadURL } = require('firebase/storage');
  const response = await fetch(localUri);
  const blob = await response.blob();
  const path = `feed/${uid()}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const storage = getStorage();
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  const url = await getDownloadURL(storageRef);
  return { path, url };
}

async function fsCreatePost(body) {
  const userId = uid();
  if (!db || !userId) throw new Error('no_user');
  const { addDoc, collection, serverTimestamp } = require('firebase/firestore');
  const payload = {
    user_id: userId,
    content_text: String(body?.content_text ?? body?.content ?? ''),
    media_urls: Array.isArray(body?.media_urls) ? body.media_urls : [],
    visibility: body?.visibility || 'followers',
    place_label: body?.place_label || '',
    lat: body?.lat ?? null,
    lng: body?.lng ?? null,
    route_plan: body?.route_plan ?? null,
    likes_count: 0,
    comments_count: 0,
    archived: false,
    created_at: new Date().toISOString(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'feedPosts'), payload);
  ttlInvalidate('feed:');
  return { id: ref.id, ...payload };
}

async function enrichPostsWithAuthorsAndViewerLikes(rows) {
  if (!db || !Array.isArray(rows) || rows.length === 0) return rows || [];
  const me = uid();

  const profiles = await Promise.all(
    rows.map((r) => getProfileCached(r?.user_id))
  );

  const likedFlags = me
    ? await Promise.all(
        rows.map((r) => isPostLikedByViewer(r.id, me))
      )
    : rows.map(() => false);

  return rows.map((r, i) => {
    const p = profiles[i] || null;
    return {
      ...r,
      username: p?.username || p?.displayName || (p?.email ? String(p.email).split('@')[0] : '') || 'user',
      display_name: p?.display_name || p?.displayName || null,
      avatar_url: p?.avatar_url || p?.avatar || null,
      liked_by_viewer: !!likedFlags[i],
    };
  });
}

async function fsListMyArchivedPosts(limit) {
  const userId = uid();
  if (!db || !userId) return [];
  const { collection, getDocs, limit: qLimit, query, where } = require('firebase/firestore');
  try {
    const snap = await getDocs(
      query(
        collection(db, 'feedPosts'),
        where('user_id', '==', userId),
        where('archived', '==', true),
        qLimit(limit),
      ),
    );
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => {
      const ta = Date.parse(String(a?.archived_at || a?.updatedAt || a?.created_at || '')) || 0;
      const tb = Date.parse(String(b?.archived_at || b?.updatedAt || b?.created_at || '')) || 0;
      return tb - ta;
    });
    return enrichPostsWithAuthorsAndViewerLikes(rows);
  } catch {
    const snap = await getDocs(
      query(collection(db, 'feedPosts'), where('archived', '==', true), qLimit(limit)),
    );
    const rows = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((r) => String(r.user_id) === userId);
    rows.sort((a, b) => {
      const ta = Date.parse(String(a?.archived_at || a?.updatedAt || a?.created_at || '')) || 0;
      const tb = Date.parse(String(b?.archived_at || b?.updatedAt || b?.created_at || '')) || 0;
      return tb - ta;
    });
    return enrichPostsWithAuthorsAndViewerLikes(rows);
  }
}

async function fsListMyArchivedStories(limit) {
  const userId = uid();
  if (!db || !userId) return [];
  const { collection, getDocs, limit: qLimit, query, where } = require('firebase/firestore');
  const now = Date.now();
  try {
    const snap = await getDocs(
      query(collection(db, 'feedStories'), where('user_id', '==', userId), qLimit(limit * 2)),
    );
    const rows = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((r) => {
        const exp = r.expires_at || r.expiresAt;
        if (exp) {
          const t = Date.parse(String(exp));
          return Number.isFinite(t) && t <= now;
        }
        return true;
      })
      .slice(0, limit);
    rows.sort((a, b) => {
      const ta = Date.parse(String(a?.created_at || a?.createdAt || '')) || 0;
      const tb = Date.parse(String(b?.created_at || b?.createdAt || '')) || 0;
      return tb - ta;
    });
    return rows.map((r) => ({
      id: String(r.id),
      user_id: String(r.user_id || userId),
      media_url: String(r.media_url || r.mediaUrl || r.uri || ''),
      media_kind: String(r.media_kind || r.mediaKind || 'image'),
      caption: r.caption == null ? '' : String(r.caption),
      created_at: r.created_at
        ? String(r.created_at)
        : r.createdAt
          ? new Date(r.createdAt).toISOString()
          : new Date().toISOString(),
      expires_at: r.expires_at || r.expiresAt || null,
      view_count: Number(r.view_count) || 0,
      expired: true,
    }));
  } catch {
    return [];
  }
}

async function fsListPostsByField(field, value, limit) {
  if (!db) return [];
  const { collection, getDocs, limit: qLimit, query, where } = require('firebase/firestore');
  const snap = await getDocs(query(collection(db, 'feedPosts'), where(field, '==', value), qLimit(limit)));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => {
    const ta = Date.parse(String(a?.created_at || a?.createdAt || '')) || 0;
    const tb = Date.parse(String(b?.created_at || b?.createdAt || '')) || 0;
    return tb - ta;
  });
  return enrichPostsWithAuthorsAndViewerLikes(rows);
}

async function fsListUserPosts(usernameOrId, limit) {
  const raw = String(usernameOrId || '').replace(/^@/, '').trim();
  if (!raw || !db) return [];
  let rows = await fsListPostsByField('user_id', raw, limit);
  if (rows.length > 0) return rows;
  const { collection, getDocs, limit: qLimit, query, where } = require('firebase/firestore');
  try {
    const snap = await getDocs(
      query(collection(db, 'profiles'), where('username', '==', raw.toLowerCase()), qLimit(1)),
    );
    const profId = snap.docs[0]?.id;
    if (profId) rows = await fsListPostsByField('user_id', profId, limit);
  } catch {
    /* ignore */
  }
  return rows;
}

async function fsListWorldPosts(limit) {
  if (!db) return [];
  const cap = Math.max(1, Number(limit) || 40);
  const me = uid() || 'anon';
  return ttlMemo(`feed:world:${me}:${cap}`, 10000, async () => {
    const { collection, getDocs, limit: qLimit, query, where } = require('firebase/firestore');
    const snap = await getDocs(query(collection(db, 'feedPosts'), where('archived', '==', false), qLimit(cap)));
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => {
      const ta = Date.parse(String(a?.created_at || a?.createdAt || '')) || 0;
      const tb = Date.parse(String(b?.created_at || b?.createdAt || '')) || 0;
      return tb - ta;
    });
    return enrichPostsWithAuthorsAndViewerLikes(rows);
  });
}

async function enrichWithAuthors(rows) {
  if (!db || !Array.isArray(rows) || rows.length === 0) return rows || [];
  const profiles = await Promise.all(
    rows.map((r) => getProfileCached(r?.user_id))
  );
  return rows.map((r, i) => {
    const p = profiles[i] || null;
    const username = p?.username || p?.displayName || (p?.email ? String(p.email).split('@')[0] : '') || 'user';
    return {
      ...r,
      username,
      display_name: p?.display_name || p?.displayName || null,
      avatar_url: p?.avatar_url || p?.avatar || null,
    };
  });
}

// ─────────────────────────────── Public API (backend-first) ───────────────────────────────

export async function feedUploadMediaFromUri(localUri) {
  const uri = String(localUri || '').trim();
  if (!uri) return null;
  if (hasBackendSession()) {
    const { file, media_kind } = buildMediaFormFile(uri);
    const form = new FormData();
    form.append('file', file);
    const data = await backendAuthUpload(`${FEED}/upload`, form);
    const url = data?.url || data?.media_url;
    if (!url) throw new Error('upload_failed');
    return { media_url: url, url: String(url), media_kind: data?.media_kind || media_kind };
  }
  const uploaded = await fsUploadMediaToStorage(uri);
  return uploaded ? { media_url: uploaded.url, url: uploaded.url, path: uploaded.path } : null;
}

export async function feedCreatePost(body) {
  if (hasBackendSession()) {
    const media_urls = Array.isArray(body?.media_urls) ? body.media_urls.filter(Boolean) : [];
    if (!media_urls.length) throw new Error('no_media');
    const payload = {
      media_urls,
      content_text: body?.content_text ?? body?.content ?? null,
      visibility: body?.visibility || 'followers',
      place_label: body?.place_label ?? null,
      lat: body?.lat ?? null,
      lng: body?.lng ?? null,
      route_plan: body?.route_plan ?? null,
    };
    const data = await backendAuthFetch('POST', `${FEED}/posts`, payload);
    ttlInvalidate('feed:');
    return data?.post || data;
  }
  return fsCreatePost(body);
}

export async function feedListMyPosts(limit = 60) {
  const lim = Math.max(1, Number(limit) || 60);
  if (hasBackendSession()) {
    const data = await backendAuthFetch('GET', `${FEED}/posts/me?limit=${lim}`);
    return Array.isArray(data?.posts) ? data.posts : [];
  }
  return fsListPostsByField('user_id', uid(), lim);
}

export async function feedListUserPosts(usernameOrId, limit = 40) {
  const lim = Math.max(1, Number(limit) || 40);
  const raw = String(usernameOrId || '').replace(/^@/, '').trim();
  if (!raw) return [];
  if (hasBackendSession()) {
    try {
      const data = await backendAuthFetch(
        'GET',
        `${FEED}/posts/user/${encodeURIComponent(raw)}?limit=${lim}`,
      );
      return Array.isArray(data?.posts) ? data.posts : [];
    } catch (e) {
      if (__DEV__) console.warn('[feedApi] listUserPosts', e?.message);
      return [];
    }
  }
  return fsListUserPosts(raw, lim);
}

export async function feedListFriendsPosts(limit = 40) {
  const lim = Math.max(1, Number(limit) || 40);
  if (hasBackendSession()) {
    const me = uid() || 'anon';
    return ttlMemo(`feed:friends:${me}:${lim}`, 8000, async () => {
      const data = await backendAuthFetch('GET', `${FEED}/posts/friends?limit=${lim}`);
      return Array.isArray(data?.posts) ? data.posts : [];
    });
  }
  return fsListWorldPosts(lim);
}

export async function feedListWorldPosts(limit = 40) {
  const lim = Math.max(1, Number(limit) || 40);
  if (hasBackendSession()) {
    const me = uid() || 'anon';
    return ttlMemo(`feed:world:api:${me}:${lim}`, 8000, async () => {
      const data = await backendAuthFetch('GET', `${FEED}/posts/world?limit=${lim}`);
      return Array.isArray(data?.posts) ? data.posts : [];
    });
  }
  return fsListWorldPosts(lim);
}

export async function feedListMyArchivedPosts(limit = 40) {
  const lim = Math.max(1, Number(limit) || 40);
  if (hasBackendSession()) {
    const data = await backendAuthFetch('GET', `${FEED}/posts/me/archived?limit=${lim}`);
    return Array.isArray(data?.posts) ? data.posts : [];
  }
  return fsListMyArchivedPosts(lim);
}

export async function feedListMyArchivedStories(limit = 60) {
  const lim = Math.max(1, Number(limit) || 60);
  if (hasBackendSession()) {
    const data = await backendAuthFetch('GET', `${FEED}/stories/me/archived?limit=${lim}`);
    return Array.isArray(data?.stories) ? data.stories : [];
  }
  return fsListMyArchivedStories(lim);
}

export async function feedPatchPostArchive(postId, archived) {
  if (!postId) throw new Error('invalid_post');
  if (hasBackendSession()) {
    await backendAuthFetch('PATCH', `${FEED}/posts/${encodeURIComponent(String(postId))}`, {
      archived: !!archived,
    });
    ttlInvalidate('feed:');
    return { ok: true };
  }
  if (!db) throw new Error('invalid_post');
  const { doc, setDoc, serverTimestamp } = require('firebase/firestore');
  await setDoc(
    doc(db, 'feedPosts', String(postId)),
    { archived: !!archived, updatedAt: serverTimestamp() },
    { merge: true },
  );
  return { ok: true };
}

export async function feedUpdatePost(postId, body) {
  if (!postId) throw new Error('invalid_post');
  if (hasBackendSession()) {
    const payload = {};
    if (body?.content_text !== undefined || body?.content !== undefined) {
      payload.content_text = body?.content_text ?? body?.content ?? null;
    }
    if (body?.place_label !== undefined) payload.place_label = body.place_label;
    if (body?.lat !== undefined) payload.lat = body.lat;
    if (body?.lng !== undefined) payload.lng = body.lng;
    if (body?.route_plan !== undefined) payload.route_plan = body.route_plan;
    if (body?.visibility !== undefined) payload.visibility = body.visibility;
    await backendAuthFetch('PUT', `${FEED}/posts/${encodeURIComponent(String(postId))}`, payload);
    ttlInvalidate('feed:');
    return { ok: true };
  }
  if (!db) throw new Error('invalid_post');
  const { doc, setDoc, serverTimestamp } = require('firebase/firestore');
  await setDoc(doc(db, 'feedPosts', String(postId)), { ...body, updatedAt: serverTimestamp() }, { merge: true });
  return { ok: true };
}

export async function feedDeletePost(postId) {
  if (!postId) throw new Error('invalid_post');
  if (hasBackendSession()) {
    await backendAuthFetch('DELETE', `${FEED}/posts/${encodeURIComponent(String(postId))}`);
    ttlInvalidate('feed:');
    return true;
  }
  if (!db) throw new Error('invalid_post');
  const { deleteDoc, doc } = require('firebase/firestore');
  await deleteDoc(doc(db, 'feedPosts', String(postId)));
  return true;
}

export async function feedTogglePostRepost(postId, caption = '') {
  if (!postId) throw new Error('invalid_post');
  if (hasBackendSession()) {
    const out = await backendAuthFetch('POST', `${FEED}/posts/${encodeURIComponent(String(postId))}/repost`, {
      caption: String(caption || '').trim(),
    });
    ttlInvalidate('feed:');
    return { reposted: Boolean(out?.reposted), reposts_count: Number(out?.reposts_count) || 0 };
  }
  return { reposted: false, reposts_count: 0 };
}

export async function feedToggleCommentLike(commentId) {
  if (!commentId) throw new Error('invalid_comment');
  if (hasBackendSession()) {
    const out = await backendAuthFetch('POST', `${FEED}/comments/${encodeURIComponent(String(commentId))}/like`);
    return { liked: Boolean(out?.liked), likes_count: Number(out?.likes_count) || 0 };
  }
  return { liked: false, likes_count: 0 };
}

export async function feedTogglePostLike(postId) {
  if (!postId) throw new Error('invalid_post');
  if (hasBackendSession()) {
    const out = await backendAuthFetch('POST', `${FEED}/posts/${encodeURIComponent(String(postId))}/like`);
    ttlInvalidate('feed:');
    return { liked: Boolean(out?.liked), likes_count: Number(out?.likes_count) || 0 };
  }
  const me = uid();
  if (!db || !me) throw new Error('invalid_post');
  const { doc, runTransaction, serverTimestamp } = require('firebase/firestore');
  const postRef = doc(db, 'feedPosts', String(postId));
  const likeRef = doc(db, 'feedPosts', String(postId), 'likes', me);
  const result = await runTransaction(db, async (tx) => {
    const postSnap = await tx.get(postRef);
    const likeSnap = await tx.get(likeRef);
    const prevCount = Math.max(0, Number(postSnap.exists() ? postSnap.data()?.likes_count : 0) || 0);
    if (likeSnap.exists()) {
      tx.delete(likeRef);
      const next = Math.max(0, prevCount - 1);
      if (postSnap.exists()) tx.update(postRef, { likes_count: next, updatedAt: serverTimestamp() });
      return { liked: false, likes_count: next };
    }
    tx.set(likeRef, { userId: me, createdAt: serverTimestamp() });
    const next = prevCount + 1;
    if (postSnap.exists()) tx.update(postRef, { likes_count: next, updatedAt: serverTimestamp() });
    return { liked: true, likes_count: next };
  });
  ttlInvalidate('feed:');
  return result;
}

export async function feedGetPostLikeState(postId) {
  if (!postId) return { liked: false, likes_count: 0 };
  // Бекенд не має окремого GET для стану лайка — стан приходить разом із постом
  // (liked_by_viewer / likes_count). Тут лишаємо лише Firestore-запас.
  if (!db) return { liked: false, likes_count: 0 };
  const me = uid();
  const { doc, getDoc } = require('firebase/firestore');
  const postRef = doc(db, 'feedPosts', String(postId));
  const [postSnap, likeSnap] = await Promise.all([
    getDoc(postRef),
    me ? getDoc(doc(db, 'feedPosts', String(postId), 'likes', me)) : Promise.resolve(null),
  ]);
  const likes_count = Math.max(0, Number(postSnap.exists() ? postSnap.data()?.likes_count : 0) || 0);
  const liked = !!(likeSnap && likeSnap.exists && likeSnap.exists());
  return { liked, likes_count };
}

export async function feedListPostComments(postId, limit = 80) {
  if (!postId) return [];
  const lim = Math.max(1, Number(limit) || 80);
  if (hasBackendSession()) {
    const data = await backendAuthFetch(
      'GET',
      `${FEED}/posts/${encodeURIComponent(String(postId))}/comments?limit=${lim}`,
    );
    return Array.isArray(data?.comments) ? data.comments : [];
  }
  if (!db) return [];
  const { collection, getDocs, limit: qLimit, orderBy, query } = require('firebase/firestore');
  const snap = await getDocs(
    query(
      collection(db, 'feedPosts', String(postId), 'comments'),
      orderBy('createdAt', 'asc'),
      qLimit(lim),
    ),
  );
  const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return enrichWithAuthors(raw);
}

export async function feedAddPostComment(postId, content) {
  if (!postId) throw new Error('invalid_post');
  const text = String(content || '').trim();
  if (!text) throw new Error('empty_comment');
  if (hasBackendSession()) {
    const data = await backendAuthFetch(
      'POST',
      `${FEED}/posts/${encodeURIComponent(String(postId))}/comments`,
      { content: text },
    );
    ttlInvalidate('feed:');
    return data?.comment || data;
  }
  const me = uid();
  if (!db || !me) throw new Error('invalid_post');
  const {
    addDoc,
    collection,
    doc,
    getDoc,
    increment,
    serverTimestamp,
    updateDoc,
  } = require('firebase/firestore');
  const payload = {
    user_id: me,
    content: text,
    createdAt: serverTimestamp(),
    created_at: new Date().toISOString(),
  };
  const ref = await addDoc(collection(db, 'feedPosts', String(postId), 'comments'), payload);
  try {
    await updateDoc(doc(db, 'feedPosts', String(postId)), {
      comments_count: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch {
    /* ignore counter update */
  }
  let author = null;
  try {
    const snap = await getDoc(doc(db, 'profiles', me));
    if (snap.exists && snap.exists()) author = { id: me, ...(snap.data() || {}) };
  } catch {
    /* ignore */
  }
  const username =
    author?.username ||
    author?.displayName ||
    (author?.email ? String(author.email).split('@')[0] : '') ||
    'user';
  ttlInvalidate('feed:');
  return {
    id: ref.id,
    ...payload,
    username,
    display_name: author?.display_name || author?.displayName || null,
    avatar_url: author?.avatar_url || author?.avatar || null,
  };
}

export async function feedDeletePostComment(postId, commentId) {
  if (!commentId) throw new Error('invalid_comment');
  if (hasBackendSession()) {
    await backendAuthFetch('DELETE', `${FEED}/comments/${encodeURIComponent(String(commentId))}`);
    ttlInvalidate('feed:');
    return true;
  }
  const me = uid();
  if (!db || !postId || !me) throw new Error('invalid_comment');
  const { deleteDoc, doc, increment, serverTimestamp, updateDoc } = require('firebase/firestore');
  await deleteDoc(doc(db, 'feedPosts', String(postId), 'comments', String(commentId)));
  try {
    await updateDoc(doc(db, 'feedPosts', String(postId)), {
      comments_count: increment(-1),
      updatedAt: serverTimestamp(),
    });
  } catch {
    /* ignore */
  }
  ttlInvalidate('feed:');
  return true;
}

// ─────────────────────────────── Stories (backend-first) ───────────────────────────────

export async function feedCreateStoryFromUri(localUri, caption) {
  const uri = String(localUri || '').trim();
  if (!uri) throw new Error('upload_failed');
  if (hasBackendSession()) {
    const { file } = buildMediaFormFile(uri);
    const form = new FormData();
    form.append('file', file);
    if (caption != null) form.append('caption', String(caption));
    const data = await backendAuthUpload(`${FEED}/stories`, form);
    ttlInvalidate('feed:stories:');
    return data?.story || data;
  }
  const uploaded = await fsUploadMediaToStorage(uri);
  if (!uploaded || !db) throw new Error('upload_failed');
  const { addDoc, collection, serverTimestamp } = require('firebase/firestore');
  const now = Date.now();
  const payload = {
    user_id: uid(),
    media_url: uploaded.url,
    caption: String(caption || ''),
    createdAt: serverTimestamp(),
    created_at: new Date(now).toISOString(),
    expiresAt: now + 24 * 60 * 60 * 1000,
    likes_count: 0,
    views_count: 0,
  };
  const ref = await addDoc(collection(db, 'feedStories'), payload);
  ttlInvalidate('feed:stories:');
  return { id: ref.id, ...payload };
}

export async function feedListStoriesTray() {
  if (hasBackendSession()) {
    return ttlMemo('feed:stories:tray:api', 8000, async () => {
      const data = await backendAuthFetch('GET', `${FEED}/stories`);
      return Array.isArray(data?.stories) ? data.stories : [];
    });
  }
  if (!db) return [];
  return ttlMemo('feed:stories:tray', 10000, async () => {
    const { collection, getDocs, orderBy, query, where } = require('firebase/firestore');
    const snap = await getDocs(query(collection(db, 'feedStories'), where('expiresAt', '>', Date.now()), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
}

export async function feedListStoriesForUser(userId) {
  if (!userId) return [];
  if (hasBackendSession()) {
    try {
      const data = await backendAuthFetch(
        'GET',
        `${FEED}/stories/user/${encodeURIComponent(String(userId))}`,
      );
      return Array.isArray(data?.stories) ? data.stories : [];
    } catch (e) {
      if (__DEV__) console.warn('[feedApi] listStoriesForUser', e?.message);
      return [];
    }
  }
  if (!db) return [];
  const { collection, getDocs, query, where } = require('firebase/firestore');
  const snap = await getDocs(query(collection(db, 'feedStories'), where('user_id', '==', String(userId))));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function feedRecordStoryView(storyId) {
  if (!storyId) return { ok: false };
  if (hasBackendSession()) {
    try {
      await backendAuthFetch('POST', `${FEED}/stories/${encodeURIComponent(String(storyId))}/view`);
    } catch {
      /* best-effort */
    }
    return { ok: true };
  }
  return { ok: true };
}

export async function feedGetStoryStats(storyId) {
  if (!storyId) return { viewers: [], likers: [] };
  if (hasBackendSession()) {
    try {
      const data = await backendAuthFetch(
        'GET',
        `${FEED}/stories/${encodeURIComponent(String(storyId))}/stats`,
      );
      return {
        viewers: Array.isArray(data?.viewers) ? data.viewers : [],
        likers: Array.isArray(data?.likers) ? data.likers : [],
      };
    } catch {
      return { viewers: [], likers: [] };
    }
  }
  return { viewers: [], likers: [] };
}

export async function feedDeleteStory(storyId) {
  if (!storyId) return false;
  if (hasBackendSession()) {
    await backendAuthFetch('DELETE', `${FEED}/stories/${encodeURIComponent(String(storyId))}`);
    ttlInvalidate('feed:stories:');
    return true;
  }
  if (!db) return false;
  const { deleteDoc, doc } = require('firebase/firestore');
  await deleteDoc(doc(db, 'feedStories', String(storyId)));
  return true;
}

export async function feedToggleStoryLike(storyId) {
  if (!storyId) return false;
  if (hasBackendSession()) {
    const out = await backendAuthFetch(
      'POST',
      `${FEED}/stories/${encodeURIComponent(String(storyId))}/like`,
    );
    return Boolean(out?.liked);
  }
  return true;
}
