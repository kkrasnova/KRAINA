import { DeviceEventEmitter } from 'react-native';
import { chatUserKey } from './chatService';
import {
  hasFeedApiToken,
  ensureFeedApiReady,
  feedListMyPosts,
  feedListProfileUserPosts,
  feedListStoriesForUser,
} from './feedApi';
import { getUserFeedPosts, ownStoriesHasUnviewed, resolveFeedLocalUser } from './feedLocalStorage';
import { storiesHasUnviewed } from './storyTrayUtils';
import { useAuthStore } from './auth/authStore';
import { feedDeleteIdSet } from './feedDeleteIds';
import { filterDeletedFeedPostRows, getDeletedFeedPostIdSet } from './feedDeletedTombstones';
import { resolveFeedMediaUrl } from './feedMediaUrl';
import {
  localPostToGridRow,
  mapLocalPostsToGrid,
  mergeProfileGridFromApi,
  pickBestGridUri,
  profileGridNeedsRemoteHydration,
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
      const remoteUrls = Array.isArray(payload.mediaUrls)
        ? payload.mediaUrls.filter(Boolean).map((u) => resolveFeedMediaUrl(String(u)))
        : [];
      const remoteUri = remoteUrls[0] || '';
      gridPosts = [
        {
          ...existing,
          id: backendId,
          uri: pickBestGridUri(existing.uri, remoteUri),
          mediaCount: Math.max(
            Number(existing.mediaCount) || 1,
            remoteUrls.length || (remoteUri ? 1 : 0),
          ),
        },
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
  if (payload.kind === 'delete') {
    const ids = feedDeleteIdSet(payload);
    if (ids.size) {
      gridPosts = gridPosts.filter((row) => !ids.has(String(row.id)));
    }
  }
  writeProfilePostsCache(key, { gridPosts, selfStories, selfStoryHasUnviewed });
}

export function invalidateProfilePostsWarm(user, isOwnProfile = true, username = '') {
  const feedUser = resolveFeedLocalUser(user);
  const key = profilePostsCacheKey(feedUser || user, isOwnProfile, username);
  warmByKey.delete(key);
}

export async function fetchProfilePostsPayload({
  user,
  isOwnProfile = true,
  effectiveUserId,
  remoteUsername = '',
  effectiveUser,
}) {
  const resolvedUser = resolveFeedLocalUser(effectiveUser || user);
  const localPosts = resolvedUser ? await getUserFeedPosts(resolvedUser) : [];
  const viewerUserId = resolveViewerUserId(effectiveUserId, resolvedUser);
  await getDeletedFeedPostIdSet(resolvedUser);
  if (!hasFeedApiToken()) {
    return {
      gridPosts: filterDeletedFeedPostRows(
        resolvedUser,
        mapLocalPostsToGrid(localPosts),
      ),
      selfStories: [],
      selfStoryHasUnviewed: false,
    };
  }
  if (resolvedUser) {
    await ensureFeedApiReady(resolvedUser);
  }
  const storiesUserId = viewerUserId || String(effectiveUserId || '');
  const [posts, userStories] = await Promise.all([
    isOwnProfile
      ? feedListMyPosts(60)
      : feedListProfileUserPosts(remoteUsername, effectiveUserId || '', 60),
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
    gridPosts: filterDeletedFeedPostRows(
      resolvedUser,
      mergeProfileGridFromApi(posts, localPosts, viewerUserId),
    ),
    selfStories: storyList,
    selfStoryHasUnviewed,
  };
}

export function warmProfilePostsCache(user, opts = {}) {
  const isOwnProfile = opts.isOwnProfile !== false;
  const feedUser = resolveFeedLocalUser(user);
  const username =
    opts.username || useAuthStore.getState().profileMe?.profile?.username || '';
  const effectiveUserId =
    opts.effectiveUserId ||
    useAuthStore.getState().profileMe?.profile?.user_id ||
    user?.id ||
    null;
  const key = profilePostsCacheKey(feedUser || user, isOwnProfile, username);
  seedProfilePostsCacheIfMissing(key);

  const cached = readProfilePostsCache(key);
  if (
    cached?.gridPosts?.length &&
    Date.now() - cached.at < PROFILE_POSTS_CACHE_TTL &&
    !profileGridNeedsRemoteHydration(cached.gridPosts)
  ) {
    return Promise.resolve(cached);
  }

  if (!hasFeedApiToken()) {
    return fetchProfilePostsPayload({
      user: feedUser || user,
      isOwnProfile,
      effectiveUserId,
      remoteUsername: username,
      effectiveUser: feedUser || user,
    }).then((payload) => {
      writeProfilePostsCache(key, payload);
      return payload;
    });
  }

  const pending = warmByKey.get(key);
  if (pending) return pending;

  const promise = fetchProfilePostsPayload({
    user: feedUser || user,
    isOwnProfile,
    effectiveUserId,
    remoteUsername: isOwnProfile ? '' : String(username || '').replace(/^@/, ''),
    effectiveUser: feedUser || user,
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
