import { feedListMyArchivedPosts, feedListMyArchivedStories, hasFeedApiToken } from './feedApi';
import { useAuthStore } from './auth/authStore';

const store = new Map();
let refreshPromise = null;
/** Не чекаємо Render cold-start довше — показуємо кеш / порожній стан. */
const ARCHIVE_FETCH_TIMEOUT_MS = 15000;

function withArchiveTimeout(promise, label = 'archive') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}_timeout`));
    }, ARCHIVE_FETCH_TIMEOUT_MS);
    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

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

/** Порожній кеш — екран відкривається миттєво, дані підтягуються у фоні. */
export function seedArchiveCacheIfMissing(key = archiveCacheKey()) {
  if (!store.has(key)) {
    store.set(key, { posts: [], stories: [], at: Date.now() });
  }
}

export async function fetchArchiveData(limit = 80) {
  const lim = Math.max(1, Number(limit) || 80);
  const [posts, stories] = await Promise.all([
    withArchiveTimeout(feedListMyArchivedPosts(lim), 'archive_posts'),
    withArchiveTimeout(feedListMyArchivedStories(Math.min(80, lim)), 'archive_stories'),
  ]);
  return {
    posts: Array.isArray(posts) ? posts : [],
    stories: Array.isArray(stories) ? stories : [],
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
  const key = archiveCacheKey();
  seedArchiveCacheIfMissing(key);
  if (!hasFeedApiToken()) return Promise.resolve(readArchiveCache(key));
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetchArchiveData(limit)
    .then(({ posts, stories }) => {
      writeArchiveCache(key, { posts, stories });
      return { posts, stories };
    })
    .catch(() => readArchiveCache(key))
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}
