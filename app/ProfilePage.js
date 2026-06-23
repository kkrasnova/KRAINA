import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Platform,
  Dimensions,
  Alert,
  DeviceEventEmitter,
  RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { accentForTheme, onAccentButtonText, ACCENT_BLUE, ACCENT_LEMON } from './themeAccent';
import { useAppTheme } from './useAppTheme';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { pf } from './profileI18n';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import {
  getProfileDisplayName,
  getProfileCity,
  getProfileBio,
  getProfileBirthDate,
  getProfileBirthPublic,
  getProfileAvatarLocalUri,
  clearProfileAvatarLocalUri,
  getSavedRoutes,
  KRAINA_SAVED_ROUTES_CHANGED,
} from './profileStorage';
import { getSavedLandmarks, KRAINA_SAVED_LANDMARKS_CHANGED, toggleSavedLandmark } from './savedLandmarksStorage';
import { resolveSavedLandmarkRow } from './savedLandmarksResolve';
import { regionTitle } from './routeRegionsData';
import { buildLandmarkResultParamsFromHomeLandmark } from './homeLandmarkResultParams';
import { resolveHomeLandmarkDistKm } from './homeLandmarkDisplay';
import HomeLandmarkCard, {
  HOME_LANDMARK_CARD_DARK,
  HOME_LANDMARK_CARD_BORDER_DARK,
  HOME_LANDMARK_CARD_BORDER_LIGHT,
  HOME_LANDMARK_CARD_MUTED_DARK,
  HOME_LANDMARK_CARD_MUTED_LIGHT,
} from './HomeLandmarkCard';
import { runAfterInteractions } from './runAfterInteractions';

/** Lazy require — уникаємо циклічного import з screenLoaders (там же lazy-load ProfilePage). */
function prefetchProfileScreens(user) {
  try {
    require('./screenLoaders').prefetchProfileBundle(user);
  } catch {
    /* optional */
  }
}

function prefetchDiscoverScreen() {
  try {
    require('./screenLoaders').prefetchDiscoverBundle();
  } catch {
    /* optional */
  }
}
import {
  hasFeedApiToken,
} from './feedApi';
import { getUserFeedPosts } from './feedLocalStorage';
import { getVisitLog } from './visitStatsStorage';
import { computeGamificationFromVisits } from './visitGamification';
import { getLandmarkQuizBonusXpTotal } from './landmarkQuizRewards';
import { getPhysicalVisitBonusXpTotal } from './physicalVisitRewards';
import ProfileLevelBadge from './ProfileLevelBadge';
import { brandFontHeadMedium, brandFontSans, brandFontSansSemibold } from './brandFont';
import { KRAINA_PROFILE_ME_UPDATED, PROFILE_ME_SYNC_TTL_MS, refreshSocialProfileCounts } from './profileMeSync';
import { KRAINA_SOCIAL_GRAPH_CHANGED } from './socialFollowSyncEvents';
import { ensureBackendSession } from './syncBackendSessionBridge';
import { KRAINA_PROFILE_AVATAR_CHANGED } from './profileStorage';
import { useAuthStore } from './auth/authStore';
import ProfileSavedRouteCard from './ProfileSavedRouteCard';
import { HOME_TAB_ROUTE, HOME_TAB } from './homeTabPagerConstants';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { KRAINA_FEED_MEDIA_UPDATED } from './feedSyncEvents';
import {
  mapLocalPostsToGrid,
  mergeGridPostRows,
  localPostToGridRow,
} from './profilePostsGrid';
import {
  PROFILE_POSTS_CACHE_UPDATED,
  fetchProfilePostsPayload,
  profilePostsCacheKey,
  readProfilePostsCache,
  warmProfilePostsCache,
  writeProfilePostsCache,
} from './profilePostsCache';
import ProfileAvatarCircle, { resolveProfileAvatarUri } from './ProfileAvatarCircle';
import { storyAvatarRingStyle } from './storyTrayUtils';
import { RenderProfiler } from './performanceMetrics';
import { resolveFeedMediaUrl } from './feedMediaUrl';

/** Вирівнювання «+» з `FeedPage` / `FeedHeader`: у `AppTopBar.leftSlotWrap` є paddingLeft 16, у стрічці — лише 18. */
const PROFILE_ADD_LEFT_NUDGE = -16;

/** Horizontal padding for tabs / chrome (keeps segment control aligned with content above). */
const GRID_H_PAD = 16;
/** Dense 3-column post grid: small gutters, almost edge-to-edge. */
const POST_GRID_GAP = 1;
const POST_GRID_EDGE = 3;
const TILE_RADIUS = 2;

function formatBirthLabel(iso, lang) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  if (lang === 'uk') return `${d}.${m}.${y}`;
  return `${m}/${d}/${y}`;
}

const COLS = 3;
const W = Dimensions.get('window').width;
const CELL = (W - POST_GRID_EDGE * 2 - POST_GRID_GAP * (COLS - 1)) / COLS;

/** Вкладки профілю — лише іконки; підписи в accessibilityLabel і в контенті вкладки. */
const PROFILE_TABS = [
  { id: 'posts', icon: 'grid-outline', iconActive: 'grid', labelKey: 'myPosts' },
  { id: 'routes', icon: 'map-outline', iconActive: 'map', labelKey: 'savedRoutes' },
  { id: 'stats', icon: 'bar-chart-outline', iconActive: 'bar-chart', labelKey: 'visitsStats' },
];

let ProfileVisitStatsComponent = null;
function getProfileVisitStats() {
  if (!ProfileVisitStatsComponent) {
    ProfileVisitStatsComponent = require('./ProfileVisitStats').default;
  }
  return ProfileVisitStatsComponent;
}

function readCachedProfileFields() {
  const pm = useAuthStore.getState().profileMe?.profile;
  if (!pm) return {};
  const out = {};
  if (pm.display_name != null && String(pm.display_name).trim()) {
    out.name = String(pm.display_name).trim();
  }
  if (pm.location_label != null && String(pm.location_label).trim()) {
    out.city = String(pm.location_label).trim();
  }
  if (pm.bio != null && String(pm.bio).trim()) {
    out.bio = String(pm.bio).trim();
  }
  if (Number.isFinite(Number(pm.followers_count))) {
    out.followersCount = Number(pm.followers_count);
  }
  if (Number.isFinite(Number(pm.following_count))) {
    out.followingCount = Number(pm.following_count);
  }
  return out;
}

export default function ProfilePage({ navigation, route, isTabActive = true }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const { appTheme, isLight, screenBg, savedAppTheme } = useAppTheme(route?.params?.appTheme, route);
  const [tab, setTab] = useState(() =>
    route?.params?.initialTab === 'routes'
      ? 'routes'
      : route?.params?.initialTab === 'stats'
        ? 'stats'
        : 'posts',
  );
  const [statsMounted, setStatsMounted] = useState(
    () => route?.params?.initialTab === 'stats',
  );
  const cachedProfile = readCachedProfileFields();
  const [name, setName] = useState(cachedProfile.name || '');
  const [city, setCity] = useState(cachedProfile.city || '');
  const [bioPreview, setBioPreview] = useState(cachedProfile.bio || '');
  const [birthIso, setBirthIso] = useState(null);
  const [followersCount, setFollowersCount] = useState(cachedProfile.followersCount ?? 0);
  const [followingCount, setFollowingCount] = useState(cachedProfile.followingCount ?? 0);
  const [saved, setSaved] = useState([]);
  const [savedPlaces, setSavedPlaces] = useState([]);
  const [userCoords, setUserCoords] = useState(null);
  const [gridPosts, setGridPosts] = useState([]);
  const [selfStories, setSelfStories] = useState([]);
  const [selfStoryHasUnviewed, setSelfStoryHasUnviewed] = useState(false);
  const [localAvatarUri, setLocalAvatarUri] = useState('');
  const [gamify, setGamify] = useState(() => computeGamificationFromVisits([]));
  const [refreshing, setRefreshing] = useState(false);

  const user = route?.params?.user || {};
  const countryId = route?.params?.countryId;
  const shell = {
    user,
    language,
    ...(countryId != null ? { countryId } : {}),
    appTheme: savedAppTheme,
  };

  const profileAvatarUrlRaw = useAuthStore((s) => s.profileMe?.profile?.avatar_url);
  const profileMeUserId = useAuthStore((s) => s.profileMe?.profile?.user_id);
  const profileUsername = useAuthStore((s) => s.profileMe?.profile?.username);
  const profileMeLevel = useAuthStore((s) => s.profileMe?.profile?.level);
  const profileMeXp = useAuthStore((s) => s.profileMe?.profile?.xp_points);
  const profileMeFollowers = useAuthStore((s) => s.profileMe?.profile?.followers_count);
  const profileMeFollowing = useAuthStore((s) => s.profileMe?.profile?.following_count);
  const accessToken = useAuthStore((s) => s.accessToken);
  const authUserId = useAuthStore((s) => s.user?.id);
  const authUser = useAuthStore((s) => s.user);

  /** Вкладка профілю в HomeTabPager — завжди «свій», якщо явно не передали чужий profileUserId. */
  const isOwnProfile =
    route?.params?.isOtherUserProfile === true
      ? false
      : route?.params?.profileUserId != null
        ? String(route.params.profileUserId) ===
          String(authUserId || profileMeUserId || user?.id || '')
        : true;
  const profileAvatarUrl = resolveProfileAvatarUri({
    isOwnProfile,
    accessToken,
    profileAvatarUrlRaw,
    localAvatarUri,
    userAvatar: user?.avatar,
  });

  const ownServerGamify =
    isOwnProfile &&
    accessToken &&
    profileMeLevel != null &&
    Number.isFinite(Number(profileMeLevel))
      ? {
          level: Number(profileMeLevel),
          xp:
            profileMeXp != null && Number.isFinite(Number(profileMeXp))
              ? Number(profileMeXp)
              : undefined,
        }
      : null;

  const profileDisplayLevel = ownServerGamify?.level ?? gamify.level ?? 1;

  const hasActiveStory = selfStories.length > 0;
  const effectiveUser = isOwnProfile ? authUser || user : user;
  const effectiveUserId =
    (isOwnProfile && profileMeUserId ? String(profileMeUserId) : null) ||
    effectiveUser?.id ||
    user?.id ||
    null;
  const profileCacheKey = useMemo(
    () => profilePostsCacheKey(effectiveUser, isOwnProfile, profileUsername || ''),
    [effectiveUser, isOwnProfile, profileUsername],
  );

  const syncProfileMediaFromPayload = useCallback(
    (payload, { persist = true } = {}) => {
      if (!payload) return;
      setGridPosts(Array.isArray(payload.gridPosts) ? payload.gridPosts : []);
      setSelfStories(Array.isArray(payload.selfStories) ? payload.selfStories : []);
      setSelfStoryHasUnviewed(!!payload.selfStoryHasUnviewed);
      if (persist) writeProfilePostsCache(profileCacheKey, payload);
    },
    [profileCacheKey],
  );

  const avatarStoryInteractive = Boolean(effectiveUserId && (hasActiveStory || isOwnProfile));

  const profileGridItems = useMemo(
    () =>
      gridPosts.map((p) => ({
        ...p,
        uri: resolveFeedMediaUrl(p.uri || ''),
      })),
    [gridPosts],
  );

  const applyOptimisticFeedPayload = useCallback(
    (payload) => {
      if (!isOwnProfile) return;
      if (payload?.kind === 'post' && payload?.post && !payload?.synced) {
        const row = localPostToGridRow(payload.post);
        if (row) setGridPosts((prev) => mergeGridPostRows(prev, [row]));
      }
      if (payload?.synced && payload?.localPostId && payload?.postId) {
        const localId = String(payload.localPostId);
        const backendId = String(payload.postId);
        setGridPosts((prev) => {
          const existing = prev.find((row) => String(row.id) === localId);
          if (!existing) return prev;
          return [
            { ...existing, id: backendId },
            ...prev.filter((row) => {
              const id = String(row.id);
              return id !== localId && id !== backendId;
            }),
          ];
        });
      }
      const cached = readProfilePostsCache(profileCacheKey);
      if (cached?.gridPosts?.length) {
        syncProfileMediaFromPayload(cached, { persist: false });
      }
    },
    [isOwnProfile, profileCacheKey, syncProfileMediaFromPayload],
  );

  const refreshProfileMedia = useCallback(async () => {
    const pm = useAuthStore.getState().profileMe?.profile;
    const remoteUsername =
      !isOwnProfile && pm?.username
        ? String(pm.username)
        : !isOwnProfile && user?.username
          ? String(user.username)
          : '';
    try {
      const payload = await fetchProfilePostsPayload({
        user: effectiveUser,
        isOwnProfile,
        effectiveUserId,
        remoteUsername,
        effectiveUser,
      });
      syncProfileMediaFromPayload(payload);
    } catch {
      try {
        const localOnly = mapLocalPostsToGrid(
          effectiveUserId ? await getUserFeedPosts(effectiveUser) : [],
        );
        syncProfileMediaFromPayload({
          gridPosts: localOnly,
          selfStories: [],
          selfStoryHasUnviewed: false,
        });
      } catch {
        const cached = readProfilePostsCache(profileCacheKey);
        if (cached?.gridPosts?.length) {
          syncProfileMediaFromPayload(cached, { persist: false });
        }
      }
    }
  }, [isOwnProfile, effectiveUser, effectiveUserId, user?.username, syncProfileMediaFromPayload, profileCacheKey]);

  const applySocialCounts = useCallback((counts) => {
    if (!counts || typeof counts !== 'object') return;
    if (Number.isFinite(Number(counts.followersCount))) setFollowersCount(Number(counts.followersCount));
    if (Number.isFinite(Number(counts.followingCount))) setFollowingCount(Number(counts.followingCount));
  }, []);

  const reload = useCallback(async (withSpinner = false) => {
    if (withSpinner) setRefreshing(true);
    try {
      const authState = useAuthStore.getState();
      if (!authState.hydrated) {
        await authState.hydrate();
      }
      if (!useAuthStore.getState().accessToken) {
        await Promise.race([
          useAuthStore.getState().refreshSession().catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 1200)),
        ]);
      }
      const routeUser = route?.params?.user;
      const storeUser = useAuthStore.getState().user;
      const resolvedEffectiveUser = isOwnProfile ? storeUser || routeUser : routeUser;
      const sessionUser =
        resolvedEffectiveUser?.id || resolvedEffectiveUser?.email ? resolvedEffectiveUser : routeUser;
      if (sessionUser) {
        await ensureBackendSession(sessionUser);
      }
      if (useAuthStore.getState().accessToken) {
        try {
          await useAuthStore.getState().loadProfileMeIfStale(isOwnProfile ? 0 : PROFILE_ME_SYNC_TTL_MS);
        } catch {
          /* */
        }
      }
      const token = useAuthStore.getState().accessToken;
      const pm = useAuthStore.getState().profileMe?.profile;
      const n =
        token && pm?.display_name != null && String(pm.display_name).trim()
          ? String(pm.display_name).trim()
          : await getProfileDisplayName(routeUser?.name || routeUser?.email || '');
      const c =
        token && pm?.location_label != null && String(pm.location_label).trim()
          ? String(pm.location_label).trim()
          : await getProfileCity();
      const bioRaw =
        token && pm?.bio != null && String(pm.bio).trim()
          ? String(pm.bio).trim()
          : (await getProfileBio()).trim();
      setBioPreview(bioRaw);
      const birthLocal = (await getProfileBirthDate()).trim().slice(0, 10);
      const birthPublicLocal = await getProfileBirthPublic();
      const birthRaw =
        token && pm?.birth_date && pm?.birth_date_public
          ? String(pm.birth_date).slice(0, 10)
          : birthPublicLocal && birthLocal
            ? birthLocal
            : null;
      setBirthIso(birthRaw);
      const [sv, places] = await Promise.all([getSavedRoutes(), getSavedLandmarks()]);
      try {
        const [visitLog, quizBonusXp, physicalBonusXp] = await Promise.all([
          getVisitLog({ physicalOnly: true }),
          getLandmarkQuizBonusXpTotal(),
          getPhysicalVisitBonusXpTotal(),
        ]);
        setGamify(computeGamificationFromVisits(visitLog, quizBonusXp + physicalBonusXp));
      } catch {
        setGamify(computeGamificationFromVisits([]));
      }
      setName(n);
      setCity(c);
      if (!isOwnProfile) {
        setFollowersCount(Number(pm?.followers_count) || 0);
        setFollowingCount(Number(pm?.following_count) || 0);
      }
      setSaved(Array.isArray(sv) ? sv : []);
      setSavedPlaces(Array.isArray(places) ? places : []);
      try {
        const serverAvatarEmpty =
          token && pm && !String(pm.avatar_url || '').trim();
        if (serverAvatarEmpty) {
          await clearProfileAvatarLocalUri();
          setLocalAvatarUri('');
        } else {
          const avLocal = await getProfileAvatarLocalUri();
          setLocalAvatarUri(avLocal);
        }
      } catch {
        setLocalAvatarUri('');
      }

      const resolvedUserId =
        (isOwnProfile && pm?.user_id ? String(pm.user_id) : null) ||
        resolvedEffectiveUser?.id ||
        routeUser?.id ||
        effectiveUserId;

      try {
        const remoteUsername =
          !isOwnProfile && pm?.username
            ? String(pm.username)
            : !isOwnProfile && routeUser?.username
              ? String(routeUser.username)
              : '';
        const payload = await fetchProfilePostsPayload({
          user: resolvedEffectiveUser || routeUser,
          isOwnProfile,
          effectiveUserId: resolvedUserId,
          remoteUsername,
          effectiveUser: resolvedEffectiveUser || routeUser,
        });
        syncProfileMediaFromPayload(payload);
      } catch {
        try {
          const localOnly = mapLocalPostsToGrid(
            resolvedUserId ? await getUserFeedPosts(resolvedEffectiveUser || routeUser) : [],
          );
          const cached = readProfilePostsCache(profileCacheKey);
          syncProfileMediaFromPayload({
            gridPosts: localOnly.length
              ? localOnly
              : Array.isArray(cached?.gridPosts)
                ? cached.gridPosts
                : [],
            selfStories: Array.isArray(cached?.selfStories) ? cached.selfStories : [],
            selfStoryHasUnviewed: !!cached?.selfStoryHasUnviewed,
          });
        } catch {
          const cached = readProfilePostsCache(profileCacheKey);
          if (cached?.gridPosts?.length) {
            syncProfileMediaFromPayload(cached, { persist: false });
          }
        }
      }
    } finally {
      if (withSpinner) setRefreshing(false);
    }
  }, [
    route?.params?.user,
    user?.name,
    user?.email,
    user?.id,
    isOwnProfile,
    effectiveUserId,
    profileCacheKey,
    syncProfileMediaFromPayload,
  ]);

  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    const cached = readProfilePostsCache(profileCacheKey);
    if (cached?.gridPosts?.length) {
      syncProfileMediaFromPayload(cached, { persist: false });
    }
    void getUserFeedPosts(effectiveUser).then((locals) => {
      const localRows = mapLocalPostsToGrid(locals);
      if (!localRows.length) return;
      setGridPosts((prev) => mergeGridPostRows(prev, localRows));
    });
    void warmProfilePostsCache(effectiveUser, {
      isOwnProfile,
      effectiveUserId,
      username: profileUsername,
    }).then((payload) => {
      if (payload?.gridPosts?.length) syncProfileMediaFromPayload(payload);
    });
  }, [
    profileCacheKey,
    effectiveUser,
    isOwnProfile,
    effectiveUserId,
    profileUsername,
    syncProfileMediaFromPayload,
  ]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(PROFILE_POSTS_CACHE_UPDATED, ({ key }) => {
      if (key !== profileCacheKey) return;
      const cached = readProfilePostsCache(key);
      if (cached) syncProfileMediaFromPayload(cached, { persist: false });
    });
    return () => sub.remove();
  }, [profileCacheKey, syncProfileMediaFromPayload]);

  const refreshSavedCollections = useCallback(async () => {
    try {
      const [sv, places] = await Promise.all([getSavedRoutes(), getSavedLandmarks()]);
      setSaved(Array.isArray(sv) ? sv : []);
      setSavedPlaces(Array.isArray(places) ? places : []);
    } catch {
      setSaved([]);
      setSavedPlaces([]);
    }
  }, []);

  /** Усередині HomeTabPager — повне оновлення профілю при відкритті вкладки. */
  useEffect(() => {
    if (!isTabActive) return;
    void reloadRef.current();
  }, [isTabActive]);

  /** Попереднє завантаження всіх екранів профілю — кнопки відкриваються без затримки. */
  useEffect(() => {
    if (!isTabActive) return undefined;
    const task = runAfterInteractions(() => {
      prefetchProfileScreens(authUser || user);
    });
    return () => task?.cancel?.();
  }, [isTabActive, authUser, user]);

  useEffect(() => {
    const subA = DeviceEventEmitter.addListener(KRAINA_SAVED_ROUTES_CHANGED, () => {
      void refreshSavedCollections();
    });
    const subB = DeviceEventEmitter.addListener(KRAINA_SAVED_LANDMARKS_CHANGED, () => {
      void refreshSavedCollections();
    });
    return () => {
      subA.remove();
      subB.remove();
    };
  }, [refreshSavedCollections]);

  useEffect(() => {
    if (!isTabActive) return undefined;
    let cancelled = false;
    const task = runAfterInteractions(async () => {
      try {
        const Location = require('expo-location');
        const existing = await Location.getForegroundPermissionsAsync();
        if (existing.status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      } catch {
        /* ignore */
      }
    });
    return () => {
      cancelled = true;
      task?.cancel?.();
    };
  }, [isTabActive]);

  useFocusEffect(
    useCallback(() => {
      if (!isTabActive) return undefined;
      void reloadRef.current();
      return undefined;
    }, [isTabActive]),
  );

  useEffect(() => {
    if (!isOwnProfile) return;
    if (profileMeFollowers != null && Number.isFinite(Number(profileMeFollowers))) {
      setFollowersCount(Number(profileMeFollowers));
    }
    if (profileMeFollowing != null && Number.isFinite(Number(profileMeFollowing))) {
      setFollowingCount(Number(profileMeFollowing));
    }
  }, [isOwnProfile, profileMeFollowers, profileMeFollowing]);

  useEffect(() => {
    const onProfileMeUpdated = (payload) => {
      if (!isOwnProfile) return;
      if (payload?.counts) {
        applySocialCounts(payload.counts);
        return;
      }
      if (payload?.source === 'loadProfileMe' || payload?.source === 'social_counts') {
        const pm = useAuthStore.getState().profileMe?.profile;
        if (pm) {
          applySocialCounts({
            followersCount: Number(pm.followers_count) || 0,
            followingCount: Number(pm.following_count) || 0,
          });
        }
      }
    };
    const onAvatarOrSession = () => {
      if (isOwnProfile) void reload();
    };
    const onSocialGraphChanged = () => {
      if (!isOwnProfile) return;
      void refreshSocialProfileCounts();
    };
    const subProfile = DeviceEventEmitter.addListener(KRAINA_PROFILE_ME_UPDATED, onProfileMeUpdated);
    const subGraph = DeviceEventEmitter.addListener(KRAINA_SOCIAL_GRAPH_CHANGED, onSocialGraphChanged);
    const subAvatar = DeviceEventEmitter.addListener(KRAINA_PROFILE_AVATAR_CHANGED, onAvatarOrSession);
    const subSession = DeviceEventEmitter.addListener('kraina_backend_session_merged_v1', onAvatarOrSession);
    return () => {
      subProfile.remove();
      subGraph.remove();
      subAvatar.remove();
      subSession.remove();
    };
  }, [isOwnProfile, applySocialCounts, reload]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_FEED_MEDIA_UPDATED, (payload) => {
      const updatedUserId = payload?.userId ? String(payload.userId) : '';
      const ownerMatch =
        isOwnProfile ||
        !updatedUserId ||
        (effectiveUserId && String(effectiveUserId) === updatedUserId);
      if (!ownerMatch) return;
      applyOptimisticFeedPayload(payload);
      void refreshProfileMedia();
    });
    return () => sub.remove();
  }, [applyOptimisticFeedPayload, refreshProfileMedia, effectiveUserId, isOwnProfile]);

  useEffect(() => {
    const it = route?.params?.initialTab;
    if (it === 'routes') setTab('routes');
    else if (it === 'stats') {
      setTab('stats');
      setStatsMounted(true);
    } else if (it === 'posts') setTab('posts');
  }, [route?.params?.initialTab]);

  useEffect(() => {
    if (tab === 'stats') setStatsMounted(true);
  }, [tab]);

  const openProfileStatsTab = useCallback(() => {
    setStatsMounted(true);
    setTab('stats');
  }, []);

  const openSettings = () => {
    prefetchProfileScreens(authUser || user);
    navigation.navigate('Settings', {
      ...shell,
      appTheme,
    });
  };

  const openSocialConnections = useCallback(
    (kind) => {
      prefetchProfileScreens(authUser || user);
      let un = profileUsername ? String(profileUsername).replace(/^@/, '').trim() : '';
      if (!un) {
        const pm = useAuthStore.getState().profileMe?.profile;
        un = pm?.username ? String(pm.username).replace(/^@/, '').trim() : '';
      }
      if (!un) return;
      navigation.navigate('SocialConnections', {
        ...shell,
        username: un,
        kind,
      });
    },
    [navigation, shell, profileUsername, authUser, user],
  );

  const displayFollowersCount = isOwnProfile
    ? Number(profileMeFollowers ?? followersCount) || 0
    : followersCount;
  const displayFollowingCount = isOwnProfile
    ? Number(profileMeFollowing ?? followingCount) || 0
    : followingCount;
  const displayPostsCount = gridPosts.length;

  const profileHandleBare = profileUsername
    ? String(profileUsername).replace(/^@/, '').trim()
    : '';
  const profileHandle = profileHandleBare ? `@${profileHandleBare}` : '';
  const displayTitle = (name && String(name).trim()) || profileHandleBare;
  const showHandleLine =
    profileHandle &&
    displayTitle &&
    displayTitle.toLowerCase() !== profileHandleBare.toLowerCase();

  const openProfileScreen = useCallback(
    (screen, extraParams = {}) => {
      prefetchProfileScreens(authUser || user);
      navigation.navigate(screen, { ...shell, ...extraParams });
    },
    [navigation, shell, authUser, user],
  );

  const openStoryCamera = useCallback(() => {
    if (!user?.id || !isOwnProfile) return;
    navigation.navigate('FeedCamera', {
      ...shell,
      publishVisibility: 'followers',
      cameraInitialMode: 'story',
    });
  }, [navigation, shell, user?.id, isOwnProfile]);

  const onAvatarStoryPress = useCallback(() => {
    if (!effectiveUserId) return;
    if (hasActiveStory) {
      navigation.navigate('FeedStoryViewer', {
        ...shell,
        userId: String(effectiveUserId),
        authorUsername: profileUsername || '',
        authorDisplayName: name,
        authorAvatarUrl: profileAvatarUrl || null,
        fromProfile: true,
        ...(!hasFeedApiToken() ? { useLocalStories: true } : {}),
      });
      return;
    }
    if (isOwnProfile) {
      openStoryCamera();
    }
  }, [
    effectiveUserId,
    hasActiveStory,
    isOwnProfile,
    navigation,
    shell,
    profileUsername,
    name,
    profileAvatarUrl,
    localAvatarUri,
    user?.avatar,
    selfStories.length,
    selfStoryHasUnviewed,
    openStoryCamera,
  ]);

  /** Як на стрічці (вкладка «Друзі»): одразу камера; історія/публікація перемикаються на екрані зйомки. */
  const openFindPeople = useCallback(() => {
    prefetchDiscoverScreen();
    navigation.navigate('DiscoverPeople', shell);
  }, [navigation, shell]);

  const openFeedCamera = useCallback(() => {
    // Navigate immediately so the button feels instant; hydrate/refresh in the background.
    // FeedCamera re-checks auth on mount and handles missing token itself.
    navigation.navigate('FeedCamera', {
      ...shell,
      publishVisibility: 'followers',
      cameraInitialMode: 'story',
    });
    void (async () => {
      await useAuthStore.getState().hydrate();
      if (!useAuthStore.getState().accessToken) {
        await useAuthStore.getState().refreshSession().catch(() => {});
      }
    })();
  }, [navigation, shell]);

  const openMapForSavedRoutes = useCallback(() => {
    navigation.navigate(HOME_TAB_ROUTE, {
      ...shell,
      tabIndex: HOME_TAB.MAP,
      routeFinderExtras: {},
    });
  }, [navigation, shell]);

  const openSavedPlace = useCallback(
    (row) => {
      const resolved = resolveSavedLandmarkRow(row);
      if (!resolved) {
        Alert.alert('', pf(language, 'savedPlaceUnavailable'));
        return;
      }
      const { lm, region } = resolved;
      navigation.navigate(
        'LandmarkResult',
        buildLandmarkResultParamsFromHomeLandmark({
          lm,
          region,
          countryId: row.countryId,
          language,
          appTheme,
          user,
        }),
      );
    },
    [navigation, language, appTheme, user],
  );

  const onToggleSaveSavedPlace = useCallback(
    (row) => {
      if (!row?.countryId || !row?.regionId || !row?.landmarkId) return;
      void toggleSavedLandmark({
        countryId: row.countryId,
        regionId: row.regionId,
        landmarkId: row.landmarkId,
        titleUk: row.titleUk || '',
        titleEn: row.titleEn || '',
        regionTitleUk: row.regionTitleUk || '',
        regionTitleEn: row.regionTitleEn || '',
        flag: typeof row.flag === 'string' ? row.flag : '',
      }).then(() => refreshSavedCollections());
    },
    [refreshSavedCollections],
  );

  const accent = accentForTheme(isLight);
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#727272' : '#A8A8A8';
  const textStatLabel = isLight ? '#5C5C5C' : '#9A9A9A';
  const homeCardBg = isLight ? '#F2F2F2' : HOME_LANDMARK_CARD_DARK;
  const homeCardBorder = isLight ? HOME_LANDMARK_CARD_BORDER_LIGHT : HOME_LANDMARK_CARD_BORDER_DARK;
  const homeCardTextMuted = isLight ? HOME_LANDMARK_CARD_MUTED_LIGHT : HOME_LANDMARK_CARD_MUTED_DARK;
  const profileCardBg = isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)';
  const profileCardBorder = isLight ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.12)';
  const tabBottomPad = lightTabBarScrollContentPadding(insets.bottom);
  const headerRipple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const topBarLeft = useMemo(
    () => (
      <View style={{ marginLeft: PROFILE_ADD_LEFT_NUDGE }}>
        <Pressable
          onPress={openFeedCamera}
          hitSlop={12}
          style={({ pressed }) => [styles.profileAddHit, pressed && styles.profileAddPressed]}
          android_ripple={headerRipple}
          accessibilityRole="button"
          accessibilityLabel="Add"
        >
          <Ionicons name="add" size={28} color={isLight ? '#1E1E1E' : '#FFFFFF'} />
        </Pressable>
      </View>
    ),
    [openFeedCamera, isLight, headerRipple],
  );

  const topBarRight = useMemo(
    () => (
      <Pressable onPress={openSettings} hitSlop={12} accessibilityRole="button" accessibilityLabel="Settings">
        <Ionicons name="menu" size={26} color={isLight ? '#1E1E1E' : '#FFFFFF'} />
      </Pressable>
    ),
    [openSettings, isLight],
  );

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
        lightMenuButton="hamburger"
        leftSlot={topBarLeft}
        rightSlot={topBarRight}
        hideSendButton
      />
      <RenderProfiler id="ProfilePage">
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: tabBottomPad,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void reload(true)}
            tintColor={accent}
          />
        }
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
      >
        <View style={styles.headWrap}>
          <View style={[styles.headCard, { backgroundColor: profileCardBg, borderColor: profileCardBorder }]}>
            <View style={styles.headRow}>
              <View style={styles.avatarCol}>
                {avatarStoryInteractive ? (
                  <Pressable
                    onPress={onAvatarStoryPress}
                    style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}
                    accessibilityRole="button"
                  >
                    <View
                      style={[
                        styles.avatarOuter,
                        hasActiveStory
                          ? storyAvatarRingStyle({
                              hasStories: true,
                              hasUnviewed: selfStoryHasUnviewed,
                              isLight,
                            })
                          : { borderWidth: 0 },
                      ]}
                    >
                      <ProfileAvatarCircle uri={profileAvatarUrl} size={82} isLight={isLight} />
                    </View>
                  </Pressable>
                ) : (
                  <View
                    style={[
                      styles.avatarOuter,
                      { borderWidth: 0 },
                    ]}
                  >
                    <ProfileAvatarCircle uri={profileAvatarUrl} size={82} isLight={isLight} />
                  </View>
                )}
              </View>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statNum, { color: textMain }]}>{displayPostsCount}</Text>
                  <Text style={[styles.statLabel, { color: textStatLabel }]} numberOfLines={1}>
                    {pf(language, 'userPosts')}
                  </Text>
                </View>
                <Pressable
                  onPress={() => openSocialConnections('following')}
                  style={styles.statItem}
                  accessibilityRole="button"
                >
                  <Text style={[styles.statNum, { color: textMain }]}>{displayFollowingCount}</Text>
                  <Text style={[styles.statLabel, { color: textStatLabel }]} numberOfLines={1}>
                    {pf(language, 'following')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => openSocialConnections('followers')}
                  style={styles.statItem}
                  accessibilityRole="button"
                >
                  <Text style={[styles.statNum, { color: textMain }]}>{displayFollowersCount}</Text>
                  <Text style={[styles.statLabel, { color: textStatLabel }]} numberOfLines={1}>
                    {pf(language, 'followers')}
                  </Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.headText}>
              <View style={styles.nameRow}>
                <Text style={[styles.userName, { color: textMain, flex: 1 }]} numberOfLines={2}>
                  {displayTitle}
                </Text>
                {isOwnProfile ? (
                  <ProfileLevelBadge
                    level={profileDisplayLevel}
                    language={language}
                    accent={accent}
                    isLight={isLight}
                    onPress={openProfileStatsTab}
                  />
                ) : null}
              </View>
              {showHandleLine ? (
                <Text style={[styles.userHandle, { color: textMuted }]}>{profileHandle}</Text>
              ) : profileHandle && !displayTitle ? (
                <Text style={[styles.userHandle, { color: textMuted }]}>{profileHandle}</Text>
              ) : null}
              {city ? (
                <Text style={[styles.userCity, { color: textMuted }]}>{city}</Text>
              ) : null}
              {bioPreview ? (
                <Text style={[styles.userBio, { color: textMuted }]} numberOfLines={3}>
                  {bioPreview}
                </Text>
              ) : null}
              {birthIso ? (
                <Text style={[styles.userBirth, { color: textStatLabel }]}>
                  {formatBirthLabel(birthIso, language)}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {isOwnProfile ? (
          <Pressable
            style={({ pressed }) => [
              styles.editBtn,
              isLight ? styles.editBtnLight : { backgroundColor: accent },
              pressed && { opacity: 0.9 },
            ]}
            onPress={() => openProfileScreen('ProfileEdit')}
            android_ripple={headerRipple}
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.editBtnText,
                { color: isLight ? '#FFFFFF' : onAccentButtonText(false) },
              ]}
            >
              {pf(language, 'editProfile')}
            </Text>
          </Pressable>
        ) : null}

        {isOwnProfile ? (
          <Pressable
            style={({ pressed }) => [
              styles.findPeopleBtn,
              {
                backgroundColor: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
                borderColor: isLight ? 'rgba(2, 18, 235, 0.16)' : 'rgba(255,255,255,0.14)',
              },
              isLight && styles.findPeopleBtnLight,
              pressed && { opacity: 0.9 },
            ]}
            onPress={openFindPeople}
            android_ripple={headerRipple}
            accessibilityRole="button"
          >
            <Ionicons
              name="people-outline"
              size={18}
              color={isLight ? accent : '#FFFFFF'}
              style={styles.findPeopleIcon}
            />
            <Text
              style={[
                styles.findPeopleBtnText,
                { color: isLight ? accent : '#FFFFFF' },
              ]}
            >
              {pf(language, 'findPeopleBtn')}
            </Text>
          </Pressable>
        ) : null}

        {isOwnProfile ? (
          <View style={styles.socialShortcutRow}>
            <Pressable
              style={({ pressed }) => [
                styles.socialShortcutBtn,
                {
                  backgroundColor: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
                  borderColor: isLight ? 'rgba(2, 18, 235, 0.16)' : 'rgba(255,255,255,0.14)',
                },
                isLight && styles.findPeopleBtnLight,
                pressed && { opacity: 0.9 },
              ]}
              onPress={() => openProfileScreen('ProfileFriends')}
              android_ripple={headerRipple}
              accessibilityRole="button"
            >
              <Ionicons
                name="heart-outline"
                size={18}
                color={isLight ? accent : '#FFFFFF'}
                style={styles.findPeopleIcon}
              />
              <Text style={[styles.socialShortcutText, { color: isLight ? accent : '#FFFFFF' }]}>
                {pf(language, 'friends')}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.socialShortcutBtn,
                {
                  backgroundColor: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
                  borderColor: isLight ? 'rgba(2, 18, 235, 0.16)' : 'rgba(255,255,255,0.14)',
                },
                isLight && styles.findPeopleBtnLight,
                pressed && { opacity: 0.9 },
              ]}
              onPress={() => openProfileScreen('ProfileInvites')}
              android_ripple={headerRipple}
              accessibilityRole="button"
            >
              <Ionicons
                name="mail-open-outline"
                size={18}
                color={isLight ? accent : '#FFFFFF'}
                style={styles.findPeopleIcon}
              />
              <Text style={[styles.socialShortcutText, { color: isLight ? accent : '#FFFFFF' }]}>
                {pf(language, 'invitations')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View
          style={[
            styles.tabRail,
            {
              backgroundColor: isLight ? 'rgba(2, 18, 235, 0.07)' : 'rgba(255,255,255,0.08)',
              borderColor: isLight ? 'rgba(2, 18, 235, 0.1)' : 'rgba(255,255,255,0.1)',
            },
          ]}
        >
          {PROFILE_TABS.map((seg) => {
            const active = tab === seg.id;
            const iconColor = active ? (isLight ? accent : '#FFFFFF') : textMuted;
            return (
              <Pressable
                key={seg.id}
                onPress={() => {
                  if (seg.id === 'stats') setStatsMounted(true);
                  setTab(seg.id);
                }}
                onPressIn={() => {
                  if (seg.id === 'stats') getProfileVisitStats();
                }}
                style={({ pressed }) => [
                  styles.tabSegment,
                  active && [
                    styles.tabSegmentActive,
                    {
                      backgroundColor: isLight ? '#FFFFFF' : 'rgba(36,36,40,0.95)',
                      borderColor: isLight ? 'rgba(2, 18, 235, 0.14)' : 'rgba(255,255,255,0.12)',
                    },
                  ],
                  pressed && { opacity: 0.9 },
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={pf(language, seg.labelKey)}
              >
                <Ionicons
                  name={active ? seg.iconActive : seg.icon}
                  size={22}
                  color={iconColor}
                />
              </Pressable>
            );
          })}
        </View>

        {tab === 'posts' ? (
          <View style={styles.grid}>
            {profileGridItems.length === 0 ? (
              <View
                style={[
                  styles.emptyPostsWrap,
                  isLight ? styles.emptyPostsWrapLight : styles.emptyPostsWrapDark,
                ]}
              >
                <View style={styles.emptyStickerRow}>
                  <View
                    style={[
                      styles.emptySticker,
                      { borderColor: accent, backgroundColor: isLight ? '#FFFEF8' : 'rgba(255,255,255,0.08)' },
                    ]}
                  >
                    <Text style={[styles.emptyStickerGlyph, { color: accent }]}>✦</Text>
                    <Text
                      style={[
                        styles.emptyStickerLabel,
                        brandFontSansSemibold,
                        { color: isLight ? '#1E1E1E' : '#F2F2EA' },
                      ]}
                    >
                      {pf(language, 'profilePostsEmptySticker')}
                    </Text>
                  </View>
                  <Text style={styles.emptyStickerEmoji} allowFontScaling={false}>
                    📷
                  </Text>
                </View>
                <Text
                  style={[
                    styles.emptyPostsTitle,
                    brandFontHeadMedium,
                    { color: textMain },
                  ]}
                >
                  {pf(language, 'profilePostsEmptyTitle')}
                </Text>
                <Text style={[styles.emptyPostsBody, brandFontSans, { color: textMuted }]}>
                  {pf(language, 'profilePostsEmptySubtitle')}
                </Text>
                <Pressable
                  onPress={openFeedCamera}
                  style={({ pressed }) => [
                    styles.emptyPostsCta,
                    { backgroundColor: isLight ? '#1E1E1E' : accent },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Ionicons
                    name="add"
                    size={22}
                    color={isLight ? '#FFFFFF' : onAccentButtonText(false)}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={[
                      styles.emptyPostsCtaText,
                      brandFontSansSemibold,
                      { color: isLight ? '#FFFFFF' : onAccentButtonText(false) },
                    ]}
                  >
                    {pf(language, 'profilePostsEmptyCta')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              profileGridItems.map((it) => {
                const phBg = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)';
                const tileBorder = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)';
                const multi = (it.mediaCount || 1) > 1;

                const onPress = () =>
                  openProfileScreen('ProfilePostDetail', {
                    postId: it.id,
                    coverUrl: it.uri,
                  });

                return (
                  <View
                    key={it.id}
                    style={[
                      styles.postTileOuter,
                      {
                        width: CELL,
                        height: CELL,
                        borderRadius: TILE_RADIUS,
                      },
                    ]}
                  >
                    <Pressable
                      onPress={onPress}
                      style={({ pressed }) => [
                        styles.postTileFace,
                        {
                          borderRadius: TILE_RADIUS,
                          borderColor: tileBorder,
                          backgroundColor: phBg,
                        },
                        pressed && { opacity: 0.88 },
                      ]}
                    >
                      {it.uri ? (
                        <ExpoImage
                          source={{ uri: it.uri }}
                          style={styles.postTileImage}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          transition={0}
                        />
                      ) : (
                        <View style={styles.postTilePlaceholder}>
                          <Ionicons
                            name="image-outline"
                            size={32}
                            color={isLight ? 'rgba(30,30,30,0.22)' : 'rgba(255,255,255,0.28)'}
                          />
                        </View>
                      )}
                      {it.isVideo ? (
                        <View style={styles.postTileBadgeVideo}>
                          <Ionicons name="play" size={13} color="#FFFFFF" style={{ marginLeft: 1 }} />
                        </View>
                      ) : null}
                      {multi ? (
                        <View style={styles.postTileBadgeStack}>
                          <Ionicons name="images-outline" size={15} color="#FFFFFF" />
                        </View>
                      ) : null}
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>
        ) : tab === 'routes' ? (
          <View style={styles.routeList}>
            <Text style={[styles.tabSectionTitle, brandFontSansSemibold, { color: textMuted }]}>
              {pf(language, 'savedRoutes')}
            </Text>
            {saved.length > 0 ? (
              saved.map((item) => (
                <ProfileSavedRouteCard
                  key={item.id}
                  item={item}
                  language={language}
                  isLight={isLight}
                  accent={accent}
                  shell={shell}
                  navigation={navigation}
                />
              ))
            ) : savedPlaces.length === 0 ? (
              <View
                style={[
                  styles.emptyPostsWrap,
                  isLight ? styles.emptyPostsWrapLight : styles.emptyPostsWrapDark,
                ]}
              >
                <View style={styles.emptyStickerRow}>
                  <View
                    style={[
                      styles.emptySticker,
                      { borderColor: accent, backgroundColor: isLight ? '#FFFEF8' : 'rgba(255,255,255,0.08)' },
                    ]}
                  >
                    <Text style={[styles.emptyStickerGlyph, { color: accent }]}>✦</Text>
                    <Text
                      style={[
                        styles.emptyStickerLabel,
                        brandFontSansSemibold,
                        { color: isLight ? '#1E1E1E' : '#F2F2EA' },
                      ]}
                    >
                      {pf(language, 'profileRoutesEmptySticker')}
                    </Text>
                  </View>
                  <Text style={styles.emptyStickerEmoji} allowFontScaling={false}>
                    🗺️
                  </Text>
                </View>
                <Text style={[styles.emptyPostsTitle, brandFontHeadMedium, { color: textMain }]}>
                  {pf(language, 'profileRoutesEmptyTitle')}
                </Text>
                <Text style={[styles.emptyPostsBody, brandFontSans, { color: textMuted }]}>
                  {pf(language, 'profileRoutesEmptySubtitle')}
                </Text>
                <Pressable
                  onPress={openMapForSavedRoutes}
                  style={({ pressed }) => [
                    styles.emptyPostsCta,
                    { backgroundColor: isLight ? '#1E1E1E' : accent },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Ionicons
                    name="map-outline"
                    size={22}
                    color={isLight ? '#FFFFFF' : onAccentButtonText(false)}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={[
                      styles.emptyPostsCtaText,
                      brandFontSansSemibold,
                      { color: isLight ? '#FFFFFF' : onAccentButtonText(false) },
                    ]}
                  >
                    {pf(language, 'profileRoutesEmptyCta')}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {savedPlaces.length > 0 ? (
              <View style={styles.savedPlacesBlock}>
                <Text style={[styles.savedPlacesSectionTitle, brandFontHeadMedium, { color: textMain }]}>
                  {pf(language, 'savedPlacesHeading')}
                </Text>
                {savedPlaces.map((row) => {
                  const resolved = resolveSavedLandmarkRow(row);
                  if (!resolved) return null;
                  const { lm, region } = resolved;
                  const regionLabel = regionTitle(region, langUk);
                  const dist = resolveHomeLandmarkDistKm(userCoords, lm, region);
                  return (
                    <HomeLandmarkCard
                      key={row.key}
                      lm={lm}
                      region={region}
                      countryId={row.countryId}
                      language={language}
                      langUk={langUk}
                      isLight={isLight}
                      accent={accent}
                      cardBg={homeCardBg}
                      cardBorder={homeCardBorder}
                      textMain={textMain}
                      textMuted={homeCardTextMuted}
                      regionLabel={regionLabel}
                      dist={dist}
                      isSaved
                      onOpen={() => openSavedPlace(row)}
                      onToggleSave={() => onToggleSaveSavedPlace(row)}
                    />
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : tab === 'stats' && statsMounted ? (
          React.createElement(getProfileVisitStats(), {
            language,
            isLight,
            navigation,
            shell,
          })
        ) : null}
      </ScrollView>
      </RenderProfiler>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  /** Як `FeedPage` → `FeedHeader` → кнопка додавання (історії / зйомка). */
  profileAddHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAddPressed: { opacity: 0.65 },
  headWrap: { paddingHorizontal: 16, paddingTop: 14 },
  headCard: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCol: {
    marginRight: 16,
    maxWidth: 200,
    alignItems: 'stretch',
  },
  avatarOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignSelf: 'center',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  avatarDark: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  emptyPostsWrap: {
    width: '100%',
    marginTop: 4,
    borderRadius: 28,
    paddingVertical: 20,
    paddingHorizontal: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyPostsWrapLight: {
    backgroundColor: 'rgba(2, 18, 235, 0.06)',
    borderColor: 'rgba(2, 18, 235, 0.14)',
  },
  emptyPostsWrapDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  emptyStickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  emptySticker: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 2,
    transform: [{ rotate: '-4deg' }],
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyStickerGlyph: { fontSize: 20, marginRight: 8 },
  emptyStickerLabel: { fontSize: 13, letterSpacing: 0.5 },
  emptyStickerEmoji: { fontSize: 44, marginRight: 4 },
  emptyPostsTitle: { fontSize: 20, lineHeight: 26, marginBottom: 10 },
  emptyPostsBody: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
  emptyPostsCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  emptyPostsCtaText: { fontSize: 16 },
  headText: { marginTop: 12 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  userName: { fontSize: 20, fontWeight: '700' },
  userHandle: { fontSize: 14, marginTop: 2 },
  userCity: { fontSize: 14, marginTop: 4 },
  userBio: { fontSize: 14, marginTop: 8, lineHeight: 20 },
  userBirth: { fontSize: 13, marginTop: 6, fontWeight: '500' },
  statsRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', minWidth: 0 },
  statItem: { flex: 1, alignItems: 'center', minWidth: 0, paddingHorizontal: 2 },
  statNum: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 12, marginTop: 2, textAlign: 'center' },
  editBtn: {
    marginHorizontal: 20,
    marginTop: 18,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  editBtnLight: {
    backgroundColor: '#1E1E1E',
  },
  editBtnText: { fontSize: 16, fontWeight: '600' },
  findPeopleBtn: {
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  findPeopleBtnLight: {
    shadowColor: '#0212EB',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  findPeopleIcon: { marginRight: 8 },
  findPeopleBtnText: { fontSize: 15, fontWeight: '600' },
  socialShortcutRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 10,
  },
  socialShortcutBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  socialShortcutText: { fontSize: 14, fontWeight: '600' },
  tabRail: {
    flexDirection: 'row',
    marginHorizontal: GRID_H_PAD,
    marginTop: 14,
    borderRadius: 18,
    padding: 4,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabSegment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    minHeight: 42,
  },
  tabSegmentActive: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: POST_GRID_GAP,
    paddingHorizontal: POST_GRID_EDGE,
    paddingTop: 12,
    paddingBottom: 8,
  },
  postTileOuter: {
    backgroundColor: 'transparent',
  },
  postTileFace: {
    flex: 1,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  postTileImage: { ...StyleSheet.absoluteFillObject },
  postTilePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postTileCreate: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  postTileCreateLabel: {
    marginTop: 4,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  postTileBadgeDevice: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postTileBadgeVideo: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  postTileBadgeStack: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  routeList: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  tabSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  savedPlacesBlock: { marginTop: 4 },
  savedPlacesSectionTitle: { fontSize: 17, marginBottom: 12, marginLeft: 2 },
});
