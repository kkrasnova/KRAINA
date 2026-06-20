import { feedListMyArchivedPosts, feedListMyArchivedStories, hasFeedApiToken } from './feedApi';
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
    stories: Array.isArray(row.stories) ? row.stories : [],
    at: Number(row.at) || 0,
  };
}

export function writeArchiveCache(key, payload) {
  const prev = store.get(key);
  const posts = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.posts)
      ? payload.posts
      : prev?.posts || [];
  const stories = Array.isArray(payload?.stories) ? payload.stories : prev?.stories || [];
  store.set(key, {
    posts,
    stories,
    at: Date.now(),
  });
}

/** Фонове завантаження архіву — екран відкривається з кешем без спінера. */
export function prefetchArchivePosts(limit = 80) {
  if (!hasFeedApiToken()) return Promise.resolve(null);
  const key = archiveCacheKey();
  if (refreshPromise) return refreshPromise;
  refreshPromise = Promise.all([
    feedListMyArchivedPosts(limit),
    feedListMyArchivedStories(Math.min(80, limit)),
  ])
    .then(([posts, stories]) => {
      const nextPosts = Array.isArray(posts) ? posts : [];
      const nextStories = Array.isArray(stories) ? stories : [];
      writeArchiveCache(key, { posts: nextPosts, stories: nextStories });
      return { posts: nextPosts, stories: nextStories };
    })
    .catch(() => null)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}
