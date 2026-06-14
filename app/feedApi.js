import { useAuthStore } from './auth/authStore';
import { db, firebaseEnabled } from './firebaseConfig';
import { ttlMemo, ttlInvalidate } from './ttlCache';

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

export function hasFeedApiToken() {
  return firebaseEnabled && !!db && !!uid();
}

async function uploadMediaToStorage(localUri) {
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

export async function feedUploadMediaFromUri(localUri) {
  const uploaded = await uploadMediaToStorage(localUri);
  return uploaded ? { media_url: uploaded.url, path: uploaded.path } : null;
}

export async function feedCreatePost(body) {
  const userId = uid();
  if (!db || !userId) throw new Error('no_user');
  const { addDoc, collection, serverTimestamp } = require('firebase/firestore');
  const payload = {
    user_id: userId,
    content: String(body?.content || ''),
    media_urls: Array.isArray(body?.media_urls) ? body.media_urls : [],
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

async function listPostsByField(field, value, limit) {
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

export async function feedListMyPosts(limit = 60) {
  return listPostsByField('user_id', uid(), Math.max(1, Number(limit) || 60));
}

export async function feedListUserPosts(usernameOrId, limit = 40) {
  const raw = String(usernameOrId || '').replace(/^@/, '').trim();
  if (!raw || !db) return [];
  // Callers mix user ids (uid) and human usernames here. Try the raw value first as user_id;
  // if nothing matches, resolve the username → uid via profiles and query again.
  let rows = await listPostsByField('user_id', raw, Math.max(1, Number(limit) || 40));
  if (rows.length > 0) return rows;
  const { collection, getDocs, limit: qLimit, query, where } = require('firebase/firestore');
  try {
    const snap = await getDocs(
      query(collection(db, 'profiles'), where('username', '==', raw.toLowerCase()), qLimit(1)),
    );
    const profId = snap.docs[0]?.id;
    if (profId) rows = await listPostsByField('user_id', profId, Math.max(1, Number(limit) || 40));
  } catch {
    /* ignore */
  }
  return rows;
}

export async function feedListFriendsPosts(limit = 40) {
  return feedListWorldPosts(limit);
}

export async function feedListWorldPosts(limit = 40) {
  if (!db) return [];
  const cap = Math.max(1, Number(limit) || 40);
  // The viewer's like state is part of the output, so the cache key includes the viewer's uid —
  // otherwise user A would see user B's cached liked_by_viewer flags.
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

export async function feedCreateStoryFromUri(localUri, caption) {
  const uploaded = await uploadMediaToStorage(localUri);
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
  if (!db) return [];
  return ttlMemo('feed:stories:tray', 10000, async () => {
    const { collection, getDocs, orderBy, query, where } = require('firebase/firestore');
    const snap = await getDocs(query(collection(db, 'feedStories'), where('expiresAt', '>', Date.now()), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
}

export async function feedListStoriesForUser(userId) {
  if (!db || !userId) return [];
  const { collection, getDocs, query, where } = require('firebase/firestore');
  const snap = await getDocs(query(collection(db, 'feedStories'), where('user_id', '==', String(userId))));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function feedRecordStoryView() {}

export async function feedGetStoryStats() {
  return { viewers: [], likers: [] };
}

export async function feedDeleteStory(storyId) {
  if (!db || !storyId) return false;
  const { deleteDoc, doc } = require('firebase/firestore');
  await deleteDoc(doc(db, 'feedStories', String(storyId)));
  return true;
}

export async function feedToggleStoryLike() {
  return true;
}

export async function feedListMyArchivedPosts(limit = 40) {
  return listPostsByField('archived', true, Math.max(1, Number(limit) || 40));
}

export async function feedPatchPostArchive(postId, archived) {
  if (!db || !postId) throw new Error('invalid_post');
  const { doc, setDoc, serverTimestamp } = require('firebase/firestore');
  await setDoc(doc(db, 'feedPosts', String(postId)), { archived: !!archived, updatedAt: serverTimestamp() }, { merge: true });
  return { ok: true };
}

export async function feedUpdatePost(postId, body) {
  if (!db || !postId) throw new Error('invalid_post');
  const { doc, setDoc, serverTimestamp } = require('firebase/firestore');
  await setDoc(doc(db, 'feedPosts', String(postId)), { ...body, updatedAt: serverTimestamp() }, { merge: true });
  return { ok: true };
}

export async function feedDeletePost(postId) {
  if (!db || !postId) throw new Error('invalid_post');
  const { deleteDoc, doc } = require('firebase/firestore');
  await deleteDoc(doc(db, 'feedPosts', String(postId)));
  return true;
}

export async function feedTogglePostLike(postId) {
  const me = uid();
  if (!db || !postId || !me) throw new Error('invalid_post');
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
  const me = uid();
  if (!db || !postId) return { liked: false, likes_count: 0 };
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

export async function feedListPostComments(postId, limit = 80) {
  if (!db || !postId) return [];
  const { collection, getDocs, limit: qLimit, orderBy, query } = require('firebase/firestore');
  const snap = await getDocs(
    query(
      collection(db, 'feedPosts', String(postId), 'comments'),
      orderBy('createdAt', 'asc'),
      qLimit(Math.max(1, Number(limit) || 80)),
    ),
  );
  const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return enrichWithAuthors(raw);
}

export async function feedAddPostComment(postId, content) {
  const me = uid();
  if (!db || !postId || !me) throw new Error('invalid_post');
  const text = String(content || '').trim();
  if (!text) throw new Error('empty_comment');
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
  // Best-effort bump of the parent counter; don't fail the comment if the counter write is blocked.
  try {
    await updateDoc(doc(db, 'feedPosts', String(postId)), {
      comments_count: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch {
    /* ignore counter update */
  }
  // Return an enriched row so the UI can immediately render author name/avatar.
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
  const me = uid();
  if (!db || !postId || !commentId || !me) throw new Error('invalid_comment');
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
