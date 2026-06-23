import AsyncStorage from '@react-native-async-storage/async-storage';
import { stableUserKey } from './countryStorage';

const POSTS_PREFIX = '@kraina_feed_posts_v1:';
const STORIES_PREFIX = '@kraina_feed_stories_v1:';
const STORY_LIKES_PREFIX = '@kraina_feed_story_likes_v1:';
const OWN_STORY_VIEWED_PREFIX = '@kraina_feed_own_story_viewed_v1:';
const POST_BACKEND_MAP_PREFIX = '@kraina_feed_post_backend_map_v1:';

const MAX_POSTS = 50;
const MAX_STORIES = 20;

function postsKey(user) {
  return `${POSTS_PREFIX}${stableUserKey(user)}`;
}

function storiesKey(user) {
  return `${STORIES_PREFIX}${stableUserKey(user)}`;
}

function storyLikesKey(user) {
  return `${STORY_LIKES_PREFIX}${stableUserKey(user)}`;
}

function ownStoryViewedKey(user) {
  return `${OWN_STORY_VIEWED_PREFIX}${stableUserKey(user)}`;
}

function postBackendMapKey(user) {
  return `${POST_BACKEND_MAP_PREFIX}${stableUserKey(user)}`;
}

export async function saveFeedPostBackendIdMap(user, localId, backendId) {
  const local = String(localId || '');
  const backend = String(backendId || '');
  if (!user || !local || !backend) return;
  try {
    const raw = await AsyncStorage.getItem(postBackendMapKey(user));
    const map = raw ? JSON.parse(raw) : {};
    map[local] = backend;
    await AsyncStorage.setItem(postBackendMapKey(user), JSON.stringify(map));
  } catch {
    /* */
  }
}

export async function getFeedPostBackendId(user, localId) {
  const local = String(localId || '');
  if (!user || !local) return null;
  try {
    const raw = await AsyncStorage.getItem(postBackendMapKey(user));
    if (!raw) return null;
    const map = JSON.parse(raw);
    const backend = map?.[local];
    return backend != null ? String(backend) : null;
  } catch {
    return null;
  }
}

export async function getOwnStoriesViewedIds(user) {
  try {
    const raw = await AsyncStorage.getItem(ownStoryViewedKey(user));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

export async function markOwnStoryViewed(user, storyId) {
  const id = String(storyId || '');
  if (!id || !user) return;
  const set = await getOwnStoriesViewedIds(user);
  if (set.has(id)) return;
  set.add(id);
  const arr = [...set].slice(-400);
  await AsyncStorage.setItem(ownStoryViewedKey(user), JSON.stringify(arr));
}

export async function ownStoriesHasUnviewed(user, storyIds) {
  const ids = Array.isArray(storyIds) ? storyIds.map(String).filter(Boolean) : [];
  if (!ids.length) return false;
  const viewed = await getOwnStoriesViewedIds(user);
  return ids.some((id) => !viewed.has(id));
}

export async function enrichOwnStoriesWithViewed(user, stories) {
  const viewed = await getOwnStoriesViewedIds(user);
  return (Array.isArray(stories) ? stories : []).map((s) => ({
    ...s,
    own_seen_by_viewer: viewed.has(String(s.id)),
  }));
}

export async function getUserFeedPosts(user) {
  try {
    const raw = await AsyncStorage.getItem(postsKey(user));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function prependUserFeedPost(user, post) {
  const prev = await getUserFeedPosts(user);
  const row = {
    id: post.id || `p_${Date.now()}`,
    uri: post.uri,
    uris: Array.isArray(post.uris) ? post.uris : post.uri ? [post.uri] : [],
    caption: post.caption || '',
    place: post.place || '',
    lat: post.lat != null ? post.lat : null,
    lng: post.lng != null ? post.lng : null,
    route_plan: post.route_plan || null,
    createdAt: post.createdAt || Date.now(),
    scope:
      post.scope ||
      (post.visibility === 'public' ? 'world' : 'friends'),
    visibility: post.visibility || (post.scope === 'world' ? 'public' : 'followers'),
  };
  if (!row.uris.length && row.uri) row.uris = [row.uri];
  const next = [row, ...prev].slice(0, MAX_POSTS);
  await AsyncStorage.setItem(postsKey(user), JSON.stringify(next));
  return row;
}

export async function removeUserFeedPost(user, postId) {
  const id = String(postId || '');
  if (!id || !user) return false;
  try {
    const prev = await getUserFeedPosts(user);
    const next = prev.filter((p) => String(p.id) !== id);
    if (next.length === prev.length) return false;
    await AsyncStorage.setItem(postsKey(user), JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export async function getUserFeedStories(user) {
  try {
    const raw = await AsyncStorage.getItem(storiesKey(user));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function removeUserFeedStory(user, storyId) {
  const id = String(storyId || '');
  if (!id || !user) return;
  try {
    const list = await getUserFeedStories(user);
    const next = list.filter((s) => String(s.id) !== id);
    await AsyncStorage.setItem(storiesKey(user), JSON.stringify(next));
  } catch {
    /* */
  }
}

export async function prependUserFeedStory(user, story) {
  const prev = await getUserFeedStories(user);
  const row = {
    id: story.id || `s_${Date.now()}`,
    uri: story.uri,
    caption: story.caption || '',
    createdAt: story.createdAt || Date.now(),
  };
  const next = [row, ...prev].slice(0, MAX_STORIES);
  await AsyncStorage.setItem(storiesKey(user), JSON.stringify(next));
  return row;
}

export async function getLatestUserStory(user) {
  const list = await getUserFeedStories(user);
  return list[0] || null;
}

export async function getLikedStoryIds(user) {
  try {
    const raw = await AsyncStorage.getItem(storyLikesKey(user));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

/** @returns {Promise<boolean>} true if liked after toggle */
export async function toggleFeedStoryLike(user, storyId) {
  const id = String(storyId || '');
  if (!id) return false;
  const set = await getLikedStoryIds(user);
  const nextLiked = !set.has(id);
  if (nextLiked) set.add(id);
  else set.delete(id);
  await AsyncStorage.setItem(storyLikesKey(user), JSON.stringify([...set]));
  return nextLiked;
}
