import { DeviceEventEmitter } from 'react-native';
import { chatUserKey } from './chatService';
import {
  hasFeedApiToken,
  feedListMyPosts,
  feedListUserPosts,
  feedListStoriesForUser,
} from './feedApi';
import { getUserFeedPosts, ownStoriesHasUnviewed } from './feedLocalStorage';
import { storiesHasUnviewed } from './storyTrayUtils';
import { useAuthStore } from './auth/authStore';
import {
  localPostToGridRow,
  mapLocalPostsToGrid,
  mergeProfileGridFromApi,
} from './profilePostsGrid';

export const PROFILE_POSTS_CACHE_UPDATED = 'profile_posts_cache_updated_v1';
export const PROFILE_POSTS_CACHE_TTL = 120000;

const store = new Map();
const warmByKey = new Map();

export function profilePostsCacheKey(user, isOwnProfile = true, username = '') {
  const who = chatUserKey(user);
  return isOwnProfile
    ? `profile:own:${who}`
    : `profile:user:${String(username || who).toLowerCase()}`;
}

function resolveViewerUserId(effectiveUserId, user) {
  return String(
    effectiveUserId ||
      useAuthStore.getState().profileMe?.profile?.user_id ||
      user?.id ||
      '',
  );
}

export function readProfilePostsCache(key) {
  const row = store.get(key);
  if (!row) return null;
  return {
    gridPosts: Array.isArray(row.gridPosts) ? row.gridPosts : [],
    selfStories: Array.isArray(row.selfStories) ? row.selfStories : [],
    selfStoryHasUnviewed: !!row.selfStoryHasUnviewed,
    at: Number(row.at) || 0,
  };
}

export function writeProfilePostsCache(key, data) {
  if (!key) return;
  store.set(key, {
    gridPosts: Array.isArray(data?.gridPosts) ? data.gridPosts : [],
    selfStories: Array.isArray(data?.selfStories) ? data.selfStories : [],
    selfStoryHasUnviewed: !!data?.selfStoryHasUnviewed,
    at: Date.now(),
  });
  DeviceEventEmitter.emit(PROFILE_POSTS_CACHE_UPDATED, { key });
}

export function seedProfilePostsCacheIfMissing(key) {
  if (!key || store.has(key)) return;
  store.set(key, {
    gridPosts: [],
    selfStories: [],
    selfStoryHasUnviewed: false,
    at: 0,
  });
}

export function applyProfilePostsOptimistic(key, payload, effectiveUserId) {
  if (!key || !payload) return;
  const row = readProfilePostsCache(key) || {
    gridPosts: [],
    selfStories: [],
    selfStoryHasUnviewed: false,
  };
  let { gridPosts, selfStories, selfStoryHasUnviewed } = row;
  if (payload.kind === 'post' && payload.post && !payload.synced) {
    const gridRow = localPostToGridRow(payload.post);
    if (gridRow) {
      const id = String(gridRow.id);
      gridPosts = [gridRow, ...gridPosts.filter((x) => String(x.id) !== id)];
    }
  }
  if (payload.kind === 'post' && payload.synced && payload.localPostId && payload.postId) {
    const localId = String(payload.localPostId);
    const backendId = String(payload.postId);
    const existing = gridPosts.find((row) => String(row.id) === localId);
    if (existing) {
      gridPosts = [
        { ...existing, id: backendId },
        ...gridPosts.filter((row) => {
          const id = String(row.id);
          return id !== localId && id !== backendId;
        }),
      ];
    }
  }
  if (payload.kind === 'story' && payload.story) {
    const storyId = String(payload.story.id || '');
    if (storyId) {
      selfStories = [
        { id: storyId, user_id: String(effectiveUserId || '') },
        ...selfStories.filter((x) => String(x.id) !== storyId),
      ];
      selfStoryHasUnviewed = true;
    }
  }
  writeProfilePostsCache(key, { gridPosts, selfStories, selfStoryHasUnviewed });
}

export async function fetchProfilePostsPayload({
  user,
  isOwnProfile = true,
  effectiveUserId,
  remoteUsername = '',
  effectiveUser,
}) {
  const resolvedUser = effectiveUser || user;
  const localPosts = resolvedUser ? await getUserFeedPosts(resolvedUser) : [];
  const viewerUserId = resolveViewerUserId(effectiveUserId, resolvedUser);
  if (!hasFeedApiToken()) {
    return {
      gridPosts: mapLocalPostsToGrid(localPosts),
      selfStories: [],
      selfStoryHasUnviewed: false,
    };
  }
  const storiesUserId = viewerUserId || String(effectiveUserId || '');
  const [posts, userStories] = await Promise.all([
    isOwnProfile ? feedListMyPosts(60) : feedListUserPosts(remoteUsername, 60),
    storiesUserId ? feedListStoriesForUser(storiesUserId) : Promise.resolve([]),
  ]);
  const storyList = Array.isArray(userStories) ? userStories : [];
  let selfStoryHasUnviewed = false;
  if (isOwnProfile && resolvedUser) {
    selfStoryHasUnviewed = await ownStoriesHasUnviewed(
      resolvedUser,
      storyList.map((s) => s.id),
    );
  } else {
    selfStoryHasUnviewed = storiesHasUnviewed(storyList, { isAuthor: false });
  }
  return {
    gridPosts: mergeProfileGridFromApi(posts, localPosts, viewerUserId),
    selfStories: storyList,
    selfStoryHasUnviewed,
  };
}

export function warmProfilePostsCache(user, opts = {}) {
  const isOwnProfile = opts.isOwnProfile !== false;
  const username =
    opts.username || useAuthStore.getState().profileMe?.profile?.username || '';
  const effectiveUserId =
    opts.effectiveUserId ||
    useAuthStore.getState().profileMe?.profile?.user_id ||
    user?.id ||
    null;
  const key = profilePostsCacheKey(user, isOwnProfile, username);
  seedProfilePostsCacheIfMissing(key);

  const cached = readProfilePostsCache(key);
  if (cached?.gridPosts?.length && Date.now() - cached.at < PROFILE_POSTS_CACHE_TTL) {
    return Promise.resolve(cached);
  }

  if (!hasFeedApiToken()) {
    return fetchProfilePostsPayload({
      user,
      isOwnProfile,
      effectiveUserId,
      remoteUsername: username,
      effectiveUser: user,
    }).then((payload) => {
      writeProfilePostsCache(key, payload);
      return payload;
    });
  }

  const pending = warmByKey.get(key);
  if (pending) return pending;

  const promise = fetchProfilePostsPayload({
    user,
    isOwnProfile,
    effectiveUserId,
    remoteUsername: isOwnProfile ? '' : String(username || '').replace(/^@/, ''),
    effectiveUser: user,
  })
    .then((payload) => {
      writeProfilePostsCache(key, payload);
      return payload;
    })
    .catch(() => readProfilePostsCache(key))
    .finally(() => {
      if (warmByKey.get(key) === promise) warmByKey.delete(key);
    });

  warmByKey.set(key, promise);
  return promise;
}
