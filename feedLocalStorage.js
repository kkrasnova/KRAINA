import AsyncStorage from '@react-native-async-storage/async-storage';
import { stableUserKey } from './countryStorage';

const POSTS_PREFIX = '@kraina_feed_posts_v1:';
const STORIES_PREFIX = '@kraina_feed_stories_v1:';
const STORY_LIKES_PREFIX = '@kraina_feed_story_likes_v1:';

const MAX_POSTS = 50;
const MAX_STORIES = 30;

function postsKey(user) {
  return `${POSTS_PREFIX}${stableUserKey(user)}`;
}

function storiesKey(user) {
  return `${STORIES_PREFIX}${stableUserKey(user)}`;
}

function storyLikesKey(user) {
  return `${STORY_LIKES_PREFIX}${stableUserKey(user)}`;
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
    scope: 'friends',
  };
  if (!row.uris.length && row.uri) row.uris = [row.uri];
  const next = [row, ...prev].slice(0, MAX_POSTS);
  await AsyncStorage.setItem(postsKey(user), JSON.stringify(next));
  return row;
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
