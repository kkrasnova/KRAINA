import { feedListMyArchivedPosts, hasFeedApiToken } from './feedApi';
import { useAuthStore } from './auth/authStore';

const store = new Map();
let refreshPromise = null;

export function archiveCacheKey() {
  const uid = String(useAuthStore.getState().user?.id || '');
  return hasFeedApiToken() ? `feed:${uid}` : 'guest';
}

export function readArchiveCache(key = archiveCacheKey()) {
  const row = store.get(key);
  if (!row) return null;
  return {
    posts: Array.isArray(row.posts) ? row.posts : [],
    at: Number(row.at) || 0,
  };
}

export function writeArchiveCache(key, posts) {
  store.set(key, {
    posts: Array.isArray(posts) ? posts : [],
    at: Date.now(),
  });
}

/** Фонове завантаження архіву — екран відкривається з кешем без спінера. */
export function prefetchArchivePosts(limit = 80) {
  if (!hasFeedApiToken()) return Promise.resolve(null);
  const key = archiveCacheKey();
  if (refreshPromise) return refreshPromise;
  refreshPromise = feedListMyArchivedPosts(limit)
    .then((list) => {
      const posts = Array.isArray(list) ? list : [];
      writeArchiveCache(key, posts);
      return posts;
    })
    .catch(() => null)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}
