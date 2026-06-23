import { DeviceEventEmitter } from 'react-native';
import { chatUserKey } from './chatService';
import { hasBackendSession } from './backendAuthApi';
import {
  ensureFeedApiReady,
  feedListFriendsPosts,
  feedListWorldPosts,
  feedListStoriesTray,
  feedListStoriesForUser,
} from './feedApi';
import { ownStoriesHasUnviewed } from './feedLocalStorage';
import { isNavigableSocialUsername } from './socialFollowSyncEvents';
import { useAuthStore } from './auth/authStore';

export const FEED_MAIN_CACHE_UPDATED = 'feed_main_cache_updated_v1';
export const FEED_MAIN_CACHE_TTL = 120000;

const store = new Map();
let warmPromise = null;

export function feedCacheKey(user) {
  const who = chatUserKey(user);
  return hasBackendSession() ? `feed:${who}` : `guest:${who}`;
}

export function readFeedMainCache(key) {
  const row = store.get(key);
  if (!row) return null;
  return {
    fp: Array.isArray(row.fp) ? row.fp : [],
    wp: Array.isArray(row.wp) ? row.wp : [],
    st: Array.isArray(row.st) ? row.st : [],
    at: Number(row.at) || 0,
  };
}

export function hasFeedMainCache(key) {
  return store.has(key);
}

export function writeFeedMainCache(key, data) {
  const prev = store.get(key);
  store.set(key, {
    fp: Array.isArray(data?.fp) ? data.fp : prev?.fp || [],
    wp: Array.isArray(data?.wp) ? data.wp : prev?.wp || [],
    st: Array.isArray(data?.st) ? data.st : prev?.st || [],
    at: Date.now(),
  });
  DeviceEventEmitter.emit(FEED_MAIN_CACHE_UPDATED, { key });
}

export function clearFeedMainCache(key) {
  if (key) store.delete(key);
  else store.clear();
}

function patchPostListStats(list, postId, stats) {
  if (!Array.isArray(list)) return list;
  const pid = String(postId);
  let touched = false;
  const next = list.map((p) => {
    if (String(p.id) !== pid) return p;
    touched = true;
    return {
      ...p,
      ...(stats.likes_count != null ? { likes_count: stats.likes_count } : {}),
      ...(stats.liked_by_viewer != null ? { liked_by_viewer: stats.liked_by_viewer } : {}),
      ...(stats.comments_count != null ? { comments_count: stats.comments_count } : {}),
      ...(stats.reposts_count != null ? { reposts_count: stats.reposts_count } : {}),
      ...(stats.reposted_by_viewer != null ? { reposted_by_viewer: stats.reposted_by_viewer } : {}),
    };
  });
  return touched ? next : list;
}

/** Оновити лічильники поста в кеші без повного refetch стрічки. */
export function patchFeedMainPostStats(key, postId, stats = {}) {
  if (!key || !postId) return;
  const row = store.get(key);
  if (!row) return;
  const fp = patchPostListStats(row.fp, postId, stats);
  const wp = patchPostListStats(row.wp, postId, stats);
  if (fp === row.fp && wp === row.wp) return;
  store.set(key, { ...row, fp, wp, at: row.at });
  DeviceEventEmitter.emit(FEED_MAIN_CACHE_UPDATED, { key });
}

/** Порожній кеш — вкладки «Друзі» / «Світ» одразу готові, дані підтягуються у фоні. */
export function seedFeedMainCacheIfMissing(key) {
  if (!store.has(key)) {
    store.set(key, { fp: [], wp: [], st: [], at: Date.now() });
  }
}

export async function fetchFeedMainPayload(user, viewerUserId) {
  if (!hasBackendSession()) return null;
  try {
    const viewerId = viewerUserId ? String(viewerUserId) : '';
    const [fp, wp, st, ownStories] = await Promise.all([
      feedListFriendsPosts(50),
      feedListWorldPosts(50),
      feedListStoriesTray(),
      viewerId ? feedListStoriesForUser(viewerId).catch(() => []) : Promise.resolve([]),
    ]);
    let tray = Array.isArray(st) ? st : [];
    if (viewerId && user && Array.isArray(ownStories) && ownStories.length) {
      const ownHasUnviewed = await ownStoriesHasUnviewed(
        user,
        ownStories.map((s) => s.id),
      );
      tray = tray.map((row) =>
        String(row.user_id) === viewerId
          ? {
              ...row,
              story_count: ownStories.length,
              has_unviewed: ownHasUnviewed,
            }
          : row,
      );
      tray = tray.filter((row) => String(row.user_id) !== viewerId || ownHasUnviewed);
      if (!tray.some((row) => String(row.user_id) === viewerId) && ownHasUnviewed) {
        const latest = ownStories[ownStories.length - 1];
        tray = [
          {
            id: latest.id,
            user_id: viewerId,
            media_url: latest.media_url,
            story_count: ownStories.length,
            has_unviewed: true,
            seen_by_viewer: false,
            username: latest.username || '',
            avatar_url: latest.avatar_url || null,
            display_name: latest.display_name || null,
          },
          ...tray,
        ];
      }
    }
    tray = tray.filter((row) => {
      const username = row?.username != null ? String(row.username) : '';
      if (!username.trim()) return true;
      return isNavigableSocialUsername(username);
    });
    return {
      fp: Array.isArray(fp) ? fp : [],
      wp: Array.isArray(wp) ? wp : [],
      st: tray,
    };
  } catch {
    return null;
  }
}

/** Фонове наповнення кешу стрічки — відкриття вкладки без затримки. */
export async function warmFeedMainCache(user, { force = false, viewerUserId } = {}) {
  const key = feedCacheKey(user);
  seedFeedMainCacheIfMissing(key);
  const cached = readFeedMainCache(key);
  const cacheFresh = cached && Date.now() - cached.at < FEED_MAIN_CACHE_TTL;
  const hasContent = cached && (cached.fp.length || cached.wp.length || cached.st.length);
  if (!force && cacheFresh && hasContent) return cached;
  if (warmPromise && !force) return warmPromise;

  warmPromise = (async () => {
    try {
      await ensureFeedApiReady(user);
      if (!hasBackendSession()) return readFeedMainCache(key);
      const profileMeUserId = useAuthStore.getState().profileMe?.profile?.user_id;
      const viewerId =
        viewerUserId ||
        (profileMeUserId ? String(profileMeUserId) : String(user?.id || ''));
      const data = await fetchFeedMainPayload(user, viewerId);
      if (data) writeFeedMainCache(key, data);
      return readFeedMainCache(key);
    } catch (e) {
      if (__DEV__) console.warn('[warmFeedMainCache]', e?.message);
      return readFeedMainCache(key);
    } finally {
      warmPromise = null;
    }
  })();
  return warmPromise;
}
