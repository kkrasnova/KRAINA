import {
  feedListMyPosts,
  ensureFeedSocialReady,
  feedUploadMediaFromUri,
  feedCreatePost,
} from './feedApi';
import { hasBackendSession } from './backendAuthApi';
import {
  getFeedPostBackendId,
  getUserFeedPosts,
  saveFeedPostBackendIdMap,
  removeUserFeedPost,
} from './feedLocalStorage';
import { emitFeedMediaUpdated } from './feedSyncEvents';

export const BACKEND_FEED_POST_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEMO_POST_ID = 'profile_demo_post';

/** Локальні чернетки з AsyncStorage — лише вони блокують дії в стрічці. */
export function isLocalFeedPostId(postId) {
  return String(postId || '').startsWith('p_');
}

/** Будь-який серверний id (PostgreSQL uuid, Firestore doc id тощо). */
export function isServerFeedPostId(postId) {
  const id = String(postId || '');
  if (!id || isLocalFeedPostId(id) || id === DEMO_POST_ID) return false;
  return true;
}

/** @deprecated use isServerFeedPostId */
export function isBackendFeedPostId(postId) {
  return isServerFeedPostId(postId);
}

const pendingByLocalId = new Map();

export function registerPendingFeedPostSync(localId, promise) {
  const key = String(localId || '');
  if (!key || !isLocalFeedPostId(key)) return;
  const tracked = promise
    .then((backendId) => {
      const id = backendId != null ? String(backendId) : '';
      return isServerFeedPostId(id) ? id : null;
    })
    .catch(() => null)
    .finally(() => {
      pendingByLocalId.delete(key);
    });
  pendingByLocalId.set(key, tracked);
}

/** Дочекатися фонової синхронізації локального поста (лайк/коментар без помилки). */
export async function waitForFeedPostSync(localId, timeoutMs = 45000) {
  const key = String(localId || '');
  if (!key || !isLocalFeedPostId(key)) return null;
  const pending = pendingByLocalId.get(key);
  if (!pending) return null;
  let timer;
  try {
    return await Promise.race([
      pending,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function isLocalFeedPostShadowedByApi(localPost, apiPosts, viewerUserId) {
  if (!localPost || !viewerUserId || isServerFeedPostId(localPost.id)) return false;
  const cap = String(localPost.caption || '').trim();
  const created = Number(localPost.createdAt) || 0;
  return (Array.isArray(apiPosts) ? apiPosts : []).some((api) => {
    const authorId = String(api.user_id || api.authorUserId || '');
    if (authorId !== String(viewerUserId)) return false;
    const apiMedia = Array.isArray(api.media_urls)
      ? api.media_urls.filter(Boolean)
      : Array.isArray(api.mediaUrls)
        ? api.mediaUrls.filter(Boolean)
        : [];
    if (!apiMedia.length) return false;
    const apiCap = String(api.content_text ?? api.caption ?? '').trim();
    if (apiCap !== cap) return false;
    const apiAt = api.created_at
      ? new Date(String(api.created_at)).getTime()
      : Number(api.createdAtMs) || 0;
    if (!created || !apiAt) return true;
    return Math.abs(apiAt - created) < 10 * 60 * 1000;
  });
}

async function lookupBackendPostIdFromApi(user, localId) {
  if (!user || !hasBackendSession() || !isLocalFeedPostId(localId)) return null;
  try {
    const [myPosts, localPosts] = await Promise.all([
      feedListMyPosts(30),
      getUserFeedPosts(user),
    ]);
    const local = (Array.isArray(localPosts) ? localPosts : []).find(
      (p) => String(p.id) === String(localId),
    );
    const viewerUserId = String(
      useAuthStore.getState().profileMe?.profile?.user_id || user?.id || '',
    );
    if (local && Array.isArray(myPosts)) {
      const match = myPosts.find((api) => isLocalFeedPostShadowedByApi(local, [api], viewerUserId));
      if (match?.id) return String(match.id);
    }
  } catch {
    /* ignore lookup errors */
  }
  return null;
}

export async function resolveBackendFeedPostId(postId, { user } = {}) {
  const id = String(postId || '');
  if (!id) return id;
  if (isServerFeedPostId(id)) return id;

  const pending = pendingByLocalId.get(id);
  if (pending) {
    const fromPending = await pending;
    if (fromPending) return fromPending;
  }

  if (user) {
    const mapped = await getFeedPostBackendId(user, id);
    if (mapped) return mapped;

    const fromApi = await lookupBackendPostIdFromApi(user, id);
    if (fromApi) return fromApi;
  }

  return id;
}

/** Re-upload a local draft post when background sync failed or was interrupted. */
export async function retrySyncLocalFeedPost(user, localId, { visibility = 'followers' } = {}) {
  const id = String(localId || '');
  if (!user || !isLocalFeedPostId(id)) return null;

  const mapped = await getFeedPostBackendId(user, id);
  if (mapped) return mapped;

  const pending = pendingByLocalId.get(id);
  if (pending) {
    const fromPending = await pending;
    if (fromPending) return fromPending;
  }

  const locals = await getUserFeedPosts(user);
  const local = (Array.isArray(locals) ? locals : []).find((p) => String(p.id) === id);
  if (!local) {
    return lookupBackendPostIdFromApi(user, id);
  }

  const uris =
    Array.isArray(local.uris) && local.uris.length
      ? local.uris.filter(Boolean)
      : local.uri
        ? [local.uri]
        : [];
  if (!uris.length) return null;

  const syncPromise = (async () => {
    await ensureFeedSocialReady(user);
    if (!hasBackendSession()) return null;

    const remoteUrls = [];
    for (const u of uris) {
      const up = await feedUploadMediaFromUri(u);
      if (up?.url) remoteUrls.push(up.url);
    }
    if (!remoteUrls.length) return null;

    const caption = String(local.caption || '').trim();
    const created = await feedCreatePost({
      media_urls: remoteUrls,
      content_text: caption ? caption.slice(0, 1000) : null,
      visibility: visibility === 'public' ? 'public' : 'followers',
      place_label: local.place || null,
      lat: local.lat ?? null,
      lng: local.lng ?? null,
      route_plan: local.route_plan || null,
    });
    const backendPostId = String(created?.id || '');
    if (!backendPostId) return null;

    await saveFeedPostBackendIdMap(user, id, backendPostId);
    await removeUserFeedPost(user, id);
    const userId = String(user?.id || '');
    emitFeedMediaUpdated({
      kind: 'post',
      userId,
      postId: backendPostId,
      localPostId: id,
      synced: true,
      mediaUrls: remoteUrls,
    });
    return backendPostId;
  })();

  registerPendingFeedPostSync(id, syncPromise);
  return syncPromise.catch(() => null);
}

/** Повторно відправити всі локальні чернетки постів на бекенд (після збою фонової синхронізації). */
export async function retryAllUnsyncedLocalFeedPosts(user) {
  if (!user) return [];
  const locals = await getUserFeedPosts(user);
  const drafts = (Array.isArray(locals) ? locals : []).filter((p) => isLocalFeedPostId(p?.id));
  if (!drafts.length) return [];

  const synced = [];
  for (const post of drafts) {
    const localId = String(post.id);
    const mapped = await getFeedPostBackendId(user, localId);
    if (mapped) continue;
    const visibility =
      post.scope === 'world' || post.visibility === 'public' ? 'public' : 'followers';
    const backendId = await retrySyncLocalFeedPost(user, localId, { visibility }).catch(() => null);
    if (backendId) synced.push(backendId);
  }
  return synced;
}
