import { makeLazyLoader, prefetchLazyLoader } from './LazyScreen';
import {
  socialGetCachedPublicProfileFull,
  socialPrefetchPublicProfileFull,
} from './socialApi';
import { ensureFeedApiReady, feedListProfileUserPosts, feedListStoriesForUser } from './feedApi';
import { isNavigableSocialUsername } from './socialFollowSyncEvents';

export const loadSocialUserProfilePage = makeLazyLoader(() => require('./SocialUserProfilePage'));

export function normalizeSocialUsername(raw) {
  return String(raw || '').replace(/^@/, '').trim();
}

export function buildSocialUserProfileParams(shell, { username, row } = {}) {
  const normalizedUsername = normalizeSocialUsername(username || row?.username);
  if (!normalizedUsername || !isNavigableSocialUsername(normalizedUsername)) return null;
  const cachedFull = socialGetCachedPublicProfileFull(normalizedUsername, 80);
  return {
    ...shell,
    username: normalizedUsername,
    ...(row ? { preloadedProfile: row } : {}),
    ...(cachedFull ? { preloadedFull: cachedFull } : {}),
  };
}

export function prefetchSocialUserProfile(username, limit = 80) {
  const u = normalizeSocialUsername(username);
  if (!u || !isNavigableSocialUsername(u)) return;
  void socialPrefetchPublicProfileFull(u, limit);
  void (async () => {
    await ensureFeedApiReady();
    const cached = socialGetCachedPublicProfileFull(u, limit);
    const ownerId = cached?.profile?.user_id ? String(cached.profile.user_id) : '';
    await feedListProfileUserPosts(u, ownerId, 60).catch(() => {});
    if (ownerId) await feedListStoriesForUser(ownerId).catch(() => {});
  })();
}

export function prefetchSocialUserProfileBundle() {
  void prefetchLazyLoader(loadSocialUserProfilePage);
}

export function openSocialUserProfile(navigation, shell, { username, row } = {}) {
  const params = buildSocialUserProfileParams(shell, { username, row });
  if (!params) return false;
  navigation.push('SocialUserProfile', params);
  prefetchSocialUserProfile(params.username);
  return true;
}
