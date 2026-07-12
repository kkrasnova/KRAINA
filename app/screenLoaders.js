import { makeLazyLoader, prefetchLazyLoader } from './LazyScreen';
import { prefetchArchivePosts, seedArchiveCacheIfMissing } from './archivePostsCache';
import { seedProfilePostsCacheIfMissing, warmProfilePostsCache, profilePostsCacheKey } from './profilePostsCache';
import { loadSocialUserProfilePage, prefetchSocialUserProfileBundle } from './socialProfileNav';

let profileBundlePrefetchScheduled = false;
let homeTabScreensPrefetchScheduled = false;

export const loadChatsPage = makeLazyLoader(() => require('./ChatsPage'));
export const loadChatThreadPage = makeLazyLoader(() => require('./ChatThreadPage'));
export const loadStartChatPage = makeLazyLoader(() => require('./StartChatPage'));
export const loadSettingsArchivePage = makeLazyLoader(() => require('./SettingsArchivePage'));
export const loadDiscoverPeoplePage = makeLazyLoader(() => require('./DiscoverPeoplePage'));
export const loadProfileEditPage = makeLazyLoader(() => require('./ProfileEditPage'));
export const loadProfileFriendsPage = makeLazyLoader(() => require('./ProfileFriendsPage'));
export const loadProfileInvitesPage = makeLazyLoader(() => require('./ProfileInvitesPage'));
export const loadProfilePostDetailPage = makeLazyLoader(() => require('./ProfilePostDetailPage'));
export const loadProfileCommentsPage = makeLazyLoader(() => require('./ProfileCommentsPage'));
export const loadProfileLikesPage = makeLazyLoader(() => require('./ProfileLikesPage'));
export const loadProfileEditPublicationPage = makeLazyLoader(() => require('./ProfileEditPublicationPage'));
export const loadProfileGamificationHubPage = makeLazyLoader(() => require('./ProfileGamificationHubPage'));
export const loadSocialConnectionsPage = makeLazyLoader(() => require('./SocialConnectionsPage'));
export const loadSettingsPage = makeLazyLoader(() => require('./SettingsPage'));
export const loadFeedCameraPage = makeLazyLoader(() => require('./FeedCameraPage'));
export const loadFeedStoryViewerPage = makeLazyLoader(() => require('./FeedStoryViewerPage'));
export const loadFeedPostComposerPage = makeLazyLoader(() => require('./FeedPostComposerPage'));
export const loadFeedStorySharePage = makeLazyLoader(() => require('./FeedStorySharePage'));
export const loadFeedPage = makeLazyLoader(() => require('./FeedPage'));
export const loadLandmarkScannerPage = makeLazyLoader(() => require('./LandmarkScannerPage'));
export const loadLandmarkResultPage = makeLazyLoader(() => require('./LandmarkResultPage'));
export const loadMapTabPage = makeLazyLoader(() => require('./MapTabPage'));
export const loadProfilePage = makeLazyLoader(() => require('./ProfilePage'));
export { loadSocialUserProfilePage } from './socialProfileNav';

/** Попереднє завантаження екранів повідомлень (модуль + кеш тредів — без спінера при першому відкритті). */
export function prefetchChatsBundle() {
  void prefetchLazyLoader(loadChatsPage);
  void prefetchLazyLoader(loadChatThreadPage);
  void prefetchLazyLoader(loadStartChatPage);
  prefetchSocialUserProfileBundle();
  try {
    const { useAuthStore } = require('./auth/authStore');
    const { isBackendJwt } = require('./backendAuthApi');
    const { warmChatsInboxCache } = require('./chatsDataPrefetch');
    const { seedChatsCachesIfMissing } = require('./chatsThreadsCache');
    const { user, accessToken } = useAuthStore.getState();
    if (user && isBackendJwt(accessToken)) {
      const lang = String(user.appLanguage || 'uk').split(/[-_]/)[0].toLowerCase();
      const langUk = lang === 'uk';
      seedChatsCachesIfMissing(user, langUk);
      void warmChatsInboxCache(user, langUk).catch(() => {});
    }
  } catch {
    /* optional */
  }
}

/** Модуль DiscoverPeople + кеш топ-профілів — відкриття без затримки. */
export function prefetchDiscoverBundle() {
  void prefetchLazyLoader(loadDiscoverPeoplePage);
  try {
    const { socialWarmDiscoverSearch } = require('./socialApi');
    socialWarmDiscoverSearch();
  } catch {
    /* optional */
  }
}

/** Попереднє завантаження архіву з налаштувань — модуль + дані в памʼяті. */
export function prefetchArchiveBundle() {
  seedArchiveCacheIfMissing();
  void prefetchLazyLoader(loadSettingsArchivePage);
  void prefetchArchivePosts();
}

/** Попереднє завантаження екранів профілю — миттєве відкриття кнопок без LazyScreen-спінера. */
export function prefetchProfilePosts(user) {
  if (!user) return Promise.resolve(null);
  const key = profilePostsCacheKey(user, true);
  seedProfilePostsCacheIfMissing(key);
  return warmProfilePostsCache(user, { isOwnProfile: true });
}

export function prefetchProfileBundle(user) {
  if (user) {
    void prefetchProfilePosts(user);
  }
  if (!profileBundlePrefetchScheduled) {
    profileBundlePrefetchScheduled = true;
    const loaders = [
      loadSocialUserProfilePage,
      loadProfilePage,
      loadProfileEditPage,
      loadProfileFriendsPage,
      loadProfileInvitesPage,
      loadProfilePostDetailPage,
      loadProfileCommentsPage,
      loadProfileLikesPage,
      loadProfileEditPublicationPage,
      loadProfileGamificationHubPage,
      loadSocialConnectionsPage,
      loadSettingsPage,
      loadFeedCameraPage,
      loadFeedStoryViewerPage,
      loadFeedPostComposerPage,
      loadFeedStorySharePage,
    ];
    loaders.forEach((loader, index) => {
      setTimeout(() => {
        void prefetchLazyLoader(loader);
      }, index * 80);
    });
    setTimeout(prefetchDiscoverBundle, loaders.length * 80);
  }
  if (user) {
    try {
      const { warmMutualsCache } = require('./chatsDataPrefetch');
      void warmMutualsCache(user).catch(() => {});
    } catch {
      /* optional */
    }
  }
  try {
    const { getFriends } = require('./profileStorage');
    void getFriends().catch(() => {});
  } catch {
    /* optional */
  }
}

/** Попереднє завантаження стрічки (Друзі / Світ / історії) — дані в памʼяті до відкриття вкладки. */
export function prefetchFeedBundle(user) {
  void prefetchLazyLoader(loadFeedPage);
  try {
    const { seedFeedMainCacheIfMissing, feedCacheKey, warmFeedMainCache } = require('./feedMainCache');
    if (user) {
      seedFeedMainCacheIfMissing(feedCacheKey(user));
      void warmFeedMainCache(user).catch(() => {});
    }
  } catch {
    /* optional */
  }
}

export function prefetchHomeTabScreens() {
  if (homeTabScreensPrefetchScheduled) return;
  homeTabScreensPrefetchScheduled = true;
  void prefetchLazyLoader(loadMapTabPage);
  const loaders = [loadFeedPage, loadProfilePage, loadLandmarkResultPage];
  loaders.forEach((loader, index) => {
    setTimeout(() => {
      void prefetchLazyLoader(loader);
    }, 120 + index * 120);
  });
  prefetchLandmarkBundle();
}

/** Модуль LandmarkResult + кеш hero-фото — миттєве відкриття локацій. */
export function prefetchLandmarkBundle() {
  void prefetchLazyLoader(loadLandmarkResultPage);
  try {
    const { prefetchAllLandmarkImages } = require('./landmarkImagePrefetch');
    void prefetchAllLandmarkImages();
  } catch {
    /* optional */
  }
}
