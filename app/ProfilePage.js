import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { accentForTheme, onAccentButtonText, ACCENT_BLUE, ACCENT_LEMON } from './themeAccent';
import { getAppTheme, THEME_CHANGED_EVENT } from './themeStorage';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { pf } from './profileI18n';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import {
  getProfileDisplayName,
  getProfileCity,
  getProfileBio,
  getProfileBirthDate,
  getProfileBirthPublic,
  getProfileAvatarLocalUri,
  getFriends,
  getSavedRoutes,
  KRAINA_SAVED_ROUTES_CHANGED,
} from './profileStorage';
import { getSavedLandmarks, KRAINA_SAVED_LANDMARKS_CHANGED } from './savedLandmarksStorage';
import { resolveSavedLandmarkRow } from './savedLandmarksResolve';
import { landmarkTitle, regionTitle } from './routeRegionsData';
import { landmarkResultExtrasFromResolvedLandmark } from './homeLandmarkResultParams';
import { dominantVisitCategoryFromLandmark } from './visitStatsStorage';
import {
  hasFeedApiToken,
  feedListMyPosts,
  feedListStoriesTray,
  feedListUserPosts,
  feedListStoriesForUser,
} from './feedApi';
import { getLatestUserStory, getUserFeedPosts } from './feedLocalStorage';
import { getVisitLog } from './visitStatsStorage';
import { computeGamificationFromVisits } from './visitGamification';
import ProfileGameLevelCard from './ProfileGameLevelCard';
import { brandFontHeadMedium, brandFontSans, brandFontSansSemibold } from './brandFont';
import { hasSocialApi, socialListIncomingRequests } from './socialApi';
import { socialListMutuals } from './messageApi';
import { useAuthStore } from './auth/authStore';
import ProfileVisitStats from './ProfileVisitStats';
import ProfileSavedRouteCard from './ProfileSavedRouteCard';
import { HOME_TAB_ROUTE, HOME_TAB } from './homeTabPagerConstants';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { KRAINA_FEED_MEDIA_UPDATED } from './feedSyncEvents';
import { resolveFeedMediaUrl } from './feedMediaUrl';
import { RenderProfiler } from './performanceMetrics';

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

function selfStoryRing(row, _viewerId, isLight) {
  if (!row) return { borderWidth: 0 };
  const bright = (Number(row.view_count) || 0) === 0;
  if (isLight) {
    return { borderWidth: 3, borderColor: bright ? ACCENT_BLUE : 'rgba(2, 18, 235, 0.38)' };
  }
  return { borderWidth: 3, borderColor: bright ? ACCENT_LEMON : 'rgba(225, 255, 0, 0.45)' };
}

export default function ProfilePage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await getAppTheme();
      if (!cancelled) setAppTheme(t === 'light' ? 'light' : 'dark');
    })();
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setAppTheme(v === 'light' ? 'light' : 'dark');
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
  const [tab, setTab] = useState('posts');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [bioPreview, setBioPreview] = useState('');
  const [birthIso, setBirthIso] = useState(null);
  const [friendsCount, setFriendsCount] = useState(0);
  const [inviteCount, setInviteCount] = useState(0);
  const [saved, setSaved] = useState([]);
  const [savedPlaces, setSavedPlaces] = useState([]);
  const [gridPosts, setGridPosts] = useState([]);
  const [selfStory, setSelfStory] = useState(null);
  const [localAvatarUri, setLocalAvatarUri] = useState('');
  const [gamify, setGamify] = useState(() => computeGamificationFromVisits([]));
  const [refreshing, setRefreshing] = useState(false);

  const user = route?.params?.user || {};
  const countryId = route?.params?.countryId;
  const shell = {
    user,
    language,
    ...(countryId != null ? { countryId } : {}),
    appTheme,
  };

  const profileAvatarUrlRaw = useAuthStore((s) => s.profileMe?.profile?.avatar_url);
  const profileMeUserId = useAuthStore((s) => s.profileMe?.profile?.user_id);
  const profileUsername = useAuthStore((s) => s.profileMe?.profile?.username);
  const profileMeLevel = useAuthStore((s) => s.profileMe?.profile?.level);
  const profileMeXp = useAuthStore((s) => s.profileMe?.profile?.xp_points);
  const accessToken = useAuthStore((s) => s.accessToken);
  const authUserId = useAuthStore((s) => s.user?.id);
  const authUser = useAuthStore((s) => s.user);

  const isOwnProfile =
    route?.params?.isOtherUserProfile === true
      ? false
      : !user?.id || !authUserId || String(authUserId) === String(user.id);
  const profileAvatarUrl = resolveFeedMediaUrl(profileAvatarUrlRaw || '');

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

  const hasActiveStory = !!selfStory;
  const effectiveUser = isOwnProfile ? authUser || user : user;
  const effectiveUserId =
    (isOwnProfile && profileMeUserId ? String(profileMeUserId) : null) ||
    effectiveUser?.id ||
    user?.id ||
    null;
  const avatarStoryInteractive = Boolean(effectiveUserId && (hasActiveStory || isOwnProfile));

  const reload = useCallback(async (withSpinner = false) => {
    if (withSpinner) setRefreshing(true);
    try {
      const t = await getAppTheme();
      setAppTheme(t === 'light' ? 'light' : 'dark');
      await useAuthStore.getState().hydrate();
      if (!useAuthStore.getState().accessToken) {
        await useAuthStore.getState().refreshSession().catch(() => {});
      }
      if (useAuthStore.getState().accessToken) {
        try {
          await useAuthStore.getState().loadProfileMeIfStale();
        } catch {
          /* */
        }
      }
      const token = useAuthStore.getState().accessToken;
      const pm = useAuthStore.getState().profileMe?.profile;
      const n =
        token && pm?.display_name != null && String(pm.display_name).trim()
          ? String(pm.display_name).trim()
          : await getProfileDisplayName(user?.name || user?.email || '');
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
      const fr = await getFriends();
      let serverFriendsCount = fr.length;
      let inv = [];
      if (hasSocialApi()) {
        try {
          const [mutuals, serverInv] = await Promise.all([
            socialListMutuals(),
            isOwnProfile ? socialListIncomingRequests() : Promise.resolve([]),
          ]);
          if (Array.isArray(mutuals)) serverFriendsCount = mutuals.length;
          inv = Array.isArray(serverInv) ? serverInv : [];
        } catch {
          inv = [];
        }
      }
      const [sv, places] = await Promise.all([getSavedRoutes(), getSavedLandmarks()]);
      try {
        const visitLog = await getVisitLog({ physicalOnly: true });
        setGamify(computeGamificationFromVisits(visitLog));
      } catch {
        setGamify(computeGamificationFromVisits([]));
      }
      setName(n);
      setCity(c);
      setFriendsCount(serverFriendsCount);
      setInviteCount(inv.length);
      setSaved(Array.isArray(sv) ? sv : []);
      setSavedPlaces(Array.isArray(places) ? places : []);
      try {
        const avLocal = await getProfileAvatarLocalUri();
        setLocalAvatarUri(avLocal);
      } catch {
        setLocalAvatarUri('');
      }

      const mapLocalPosts = (arr) =>
        (Array.isArray(arr) ? arr : []).map((p) => {
          const u = p.uri || (Array.isArray(p.uris) && p.uris[0]) || '';
          const nUris = Array.isArray(p.uris) ? p.uris.length : u ? 1 : 0;
          return {
            id: p.id,
            uri: u,
            isVideo: /\.(mp4|mov)(\?|$)/i.test(String(u)),
            mediaCount: Math.max(nUris, u ? 1 : 0),
          };
        });

      if (hasFeedApiToken() && effectiveUserId) {
        try {
          const remoteUsername =
            !isOwnProfile && pm?.username
              ? String(pm.username)
              : !isOwnProfile && user?.username
                ? String(user.username)
                : '';
          const [posts, tray, userStories] = await Promise.all([
            isOwnProfile ? feedListMyPosts(60) : feedListUserPosts(remoteUsername, 60),
            isOwnProfile ? feedListStoriesTray() : Promise.resolve([]),
            isOwnProfile ? Promise.resolve([]) : feedListStoriesForUser(String(effectiveUserId)),
          ]);
          if (isOwnProfile) {
            const mine = (Array.isArray(tray) ? tray : []).find(
              (s) => String(s.user_id) === String(effectiveUserId),
            );
            setSelfStory(mine || null);
          } else {
            const latest = Array.isArray(userStories) && userStories.length ? userStories[userStories.length - 1] : null;
            setSelfStory(latest || null);
          }
          let next = [];
          if (Array.isArray(posts) && posts.length) {
            next = posts.map((p) => {
              const urls = Array.isArray(p.media_urls) ? p.media_urls : [];
              const u = resolveFeedMediaUrl(urls[0] || '');
              return {
                id: p.id,
                uri: u,
                isVideo: /\.(mp4|mov)(\?|$)/i.test(String(u)),
                mediaCount: urls.length || (u ? 1 : 0),
              };
            });
          }
          const localRows = mapLocalPosts(await getUserFeedPosts(effectiveUser));
          const apiIds = new Set(next.map((x) => String(x.id)));
          const extras = localRows.filter((row) => !apiIds.has(String(row.id)));
          setGridPosts([...next, ...extras]);
        } catch {
          setSelfStory(null);
          try {
            setGridPosts(mapLocalPosts(await getUserFeedPosts(effectiveUser)));
          } catch {
            setGridPosts([]);
          }
        }
      } else {
        try {
          setGridPosts(mapLocalPosts(effectiveUserId ? await getUserFeedPosts(effectiveUser) : []));
        } catch {
          setGridPosts([]);
        }
        try {
          const ls = effectiveUserId ? await getLatestUserStory(effectiveUser) : null;
          setSelfStory(
            ls && effectiveUserId
              ? { id: ls.id, user_id: String(effectiveUserId), view_count: 0 }
              : null,
          );
        } catch {
          setSelfStory(null);
        }
      }
    } finally {
      if (withSpinner) setRefreshing(false);
    }
  }, [user?.name, user?.email, user?.id, isOwnProfile, effectiveUser, effectiveUserId]);

  const homePagerTabIndex = Number(route?.params?.homePagerTabIndex);
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

  /** Усередині HomeTabPager екран навігації залишається «зфокусованим» при свайпі вкладок — useFocusEffect не викликається; оновлюємо збережені маршрути та місця при відкритті вкладки профілю. */
  useEffect(() => {
    if (!Number.isFinite(homePagerTabIndex) || homePagerTabIndex !== HOME_TAB.PROFILE) return;
    void refreshSavedCollections();
  }, [homePagerTabIndex, refreshSavedCollections]);

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

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_FEED_MEDIA_UPDATED, (payload) => {
      const updatedUserId = payload?.userId ? String(payload.userId) : '';
      if (!updatedUserId) {
        void reload();
        return;
      }
      if (effectiveUserId && String(effectiveUserId) === updatedUserId) {
        void reload();
      }
    });
    return () => sub.remove();
  }, [reload, effectiveUserId]);

  useEffect(() => {
    const it = route?.params?.initialTab;
    if (it === 'routes') setTab('routes');
    else if (it === 'stats') setTab('stats');
    else if (it === 'posts') setTab('posts');
  }, [route?.params?.initialTab]);

  const openSettings = () =>
    navigation.navigate('Settings', {
      ...shell,
      appTheme,
    });

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
        authorAvatarUrl: profileAvatarUrl || localAvatarUri || user.avatar || null,
        storyId: selfStory.id,
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
    selfStory?.id,
    openStoryCamera,
  ]);

  /** Як на стрічці (вкладка «Друзі»): одразу камера; історія/публікація перемикаються на екрані зйомки. */
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
      const title = landmarkTitle(lm, langUk);
      const cityName = regionTitle(region, langUk);
      const extract = langUk ? lm.descUk || '' : lm.descEn || lm.descUk || '';
      const rawAudio = typeof lm?.story?.audioUri === 'string' ? lm.story.audioUri.trim() : '';
      const audioGuideUrl = /^https?:\/\//i.test(rawAudio) ? rawAudio : undefined;
      const dist = lm?.distKm;
      const visitKm = dist != null && Number.isFinite(Number(dist)) ? Number(dist) : undefined;
      navigation.navigate('LandmarkResult', {
        language,
        appTheme,
        ...landmarkResultExtrasFromResolvedLandmark({
          lm,
          region,
          countryId: row.countryId,
          language,
          user,
        }),
        subtitle: `${region.flag} ${cityName}`,
        extract,
        source: 'sourceDemo',
        startPhase: 'full',
        visitCity: cityName,
        visitCategory: dominantVisitCategoryFromLandmark(lm),
        ...(visitKm != null ? { visitKm } : {}),
        ...(row.countryId ? { countryId: row.countryId } : {}),
        ...(audioGuideUrl ? { audioGuideUrl } : {}),
      });
    },
    [navigation, language, appTheme, langUk, user],
  );

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#727272' : '#A8A8A8';
  const textStatLabel = isLight ? '#5C5C5C' : '#9A9A9A';
  const profileCardBg = isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)';
  const profileCardBorder = isLight ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.12)';
  const headerRipple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const topBarLeft = useMemo(
    () => (
      <View style={{ marginLeft: PROFILE_ADD_LEFT_NUDGE }}>
        <Pressable
          onPress={openFeedCamera}
          hitSlop={12}
          style={({ pressed }) => [
            styles.profileAddCircle,
            { borderColor: isLight ? '#000000' : '#FFFFFF', borderWidth: 1.5 },
            pressed && styles.profileAddPressed,
          ]}
          android_ripple={headerRipple}
          accessibilityRole="button"
          accessibilityLabel="Add"
        >
          <Ionicons name="add" size={22} color={isLight ? '#1E1E1E' : '#FFFFFF'} />
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
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + lightTabBarExtraScrollPadding() + 24,
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
                        hasActiveStory ? selfStoryRing(selfStory, user?.id, isLight) : { borderWidth: 0 },
                      ]}
                    >
                      {profileAvatarUrl || localAvatarUri || user.avatar ? (
                        <Image
                          source={{ uri: resolveFeedMediaUrl(profileAvatarUrl || localAvatarUri || user.avatar) }}
                          style={styles.avatar}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.avatar, !isLight && styles.avatarDark]} />
                      )}
                    </View>
                  </Pressable>
                ) : (
                  <View
                    style={[
                      styles.avatarOuter,
                      { borderWidth: 0 },
                    ]}
                  >
                    {profileAvatarUrl || localAvatarUri || user.avatar ? (
                      <Image
                        source={{ uri: resolveFeedMediaUrl(profileAvatarUrl || localAvatarUri || user.avatar) }}
                        style={styles.avatar}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.avatar, !isLight && styles.avatarDark]} />
                    )}
                  </View>
                )}
              </View>
              <View style={styles.headText}>
                <Text style={[styles.userName, { color: textMain }]}>{name}</Text>
                <Text style={[styles.userCity, { color: textMuted }]}>{city}</Text>
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
                <View style={styles.statsRow}>
                  <Pressable
                    onPress={() => navigation.navigate('ProfileFriends', shell)}
                    style={styles.statPress}
                  >
                    <Text style={[styles.statNum, { color: textMain }]}>{friendsCount}</Text>
                    <Text style={[styles.statLabel, { color: textStatLabel }]}> {pf(language, 'friends')}</Text>
                  </Pressable>
                  {isOwnProfile ? (
                    <Pressable
                      onPress={() => navigation.navigate('ProfileInvites', shell)}
                      style={styles.statPress}
                    >
                      <Text style={[styles.statNum, { color: textMain }]}>{inviteCount}</Text>
                      <Text style={[styles.statLabel, { color: textStatLabel }]}> {pf(language, 'invitations')}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        </View>

        {isOwnProfile ? (
          ownServerGamify ? (
            <ProfileGameLevelCard
              serverMode={ownServerGamify}
              language={language}
              isLight={isLight}
              accent={accent}
              onPress={() => navigation.navigate('ProfileGamificationHub', shell)}
            />
          ) : (
            <ProfileGameLevelCard
              snapshot={gamify}
              language={language}
              isLight={isLight}
              accent={accent}
              onPress={() => navigation.navigate('ProfileGamificationHub', shell)}
            />
          )
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.editBtn,
            isLight ? styles.editBtnLight : { backgroundColor: accent },
            pressed && { opacity: 0.9 },
          ]}
          onPress={() => navigation.navigate('ProfileEdit', shell)}
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

        {isOwnProfile ? (
          <Pressable
            style={({ pressed }) => [
              styles.discoverBtn,
              {
                borderColor: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.2)',
                backgroundColor: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)',
              },
              pressed && { opacity: 0.88 },
            ]}
            onPress={() => navigation.navigate('DiscoverPeople', shell)}
          >
            <Text style={[styles.discoverBtnText, { color: textMain }]}>{pf(language, 'discoverTitle')}</Text>
          </Pressable>
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
          <Pressable
            onPress={() => setTab('posts')}
            style={({ pressed }) => [
              styles.tabSegment,
              tab === 'posts' && [
                styles.tabSegmentActive,
                {
                  backgroundColor: isLight ? '#FFFFFF' : 'rgba(36,36,40,0.95)',
                  borderColor: isLight ? 'rgba(2, 18, 235, 0.14)' : 'rgba(255,255,255,0.12)',
                },
              ],
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text
              style={[
                styles.tabSegmentText,
                brandFontSansSemibold,
                { color: tab === 'posts' ? textMain : textMuted },
              ]}
              numberOfLines={1}
            >
              {pf(language, 'myPosts')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('routes')}
            style={({ pressed }) => [
              styles.tabSegment,
              tab === 'routes' && [
                styles.tabSegmentActive,
                {
                  backgroundColor: isLight ? '#FFFFFF' : 'rgba(36,36,40,0.95)',
                  borderColor: isLight ? 'rgba(2, 18, 235, 0.14)' : 'rgba(255,255,255,0.12)',
                },
              ],
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text
              style={[
                styles.tabSegmentText,
                brandFontSansSemibold,
                { color: tab === 'routes' ? textMain : textMuted },
              ]}
              numberOfLines={1}
            >
              {pf(language, 'savedRoutes')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('stats')}
            style={({ pressed }) => [
              styles.tabSegment,
              tab === 'stats' && [
                styles.tabSegmentActive,
                {
                  backgroundColor: isLight ? '#FFFFFF' : 'rgba(36,36,40,0.95)',
                  borderColor: isLight ? 'rgba(2, 18, 235, 0.14)' : 'rgba(255,255,255,0.12)',
                },
              ],
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text
              style={[
                styles.tabSegmentText,
                brandFontSansSemibold,
                { color: tab === 'stats' ? textMain : textMuted },
              ]}
              numberOfLines={1}
            >
              {pf(language, 'visitsStats')}
            </Text>
          </Pressable>
        </View>

        {tab === 'posts' ? (
          <View style={styles.grid}>
            {gridPosts.length === 0 ? (
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
                    name="add-circle-outline"
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
              gridPosts.map((it) => {
                const phBg = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)';
                const tileBorder = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)';
                const multi = (it.mediaCount || 1) > 1;
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
                      onPress={() =>
                        navigation.navigate('ProfilePostDetail', {
                          ...shell,
                          postId: it.id,
                          coverUrl: it.uri,
                        })
                      }
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
                        <Image source={{ uri: it.uri }} style={styles.postTileImage} resizeMode="cover" />
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
            {saved.length > 0 ? (
              <>
                {saved.map((item) => (
                  <ProfileSavedRouteCard
                    key={item.id}
                    item={item}
                    language={language}
                    isLight={isLight}
                    accent={accent}
                    shell={shell}
                    navigation={navigation}
                  />
                ))}
                {accessToken && saved.length > 0 ? (
                  <Text style={[styles.savedRoutesSyncNote, { color: textMuted }, brandFontSans]}>
                    {pf(language, 'profileSavedRoutesSyncNote')}
                  </Text>
                ) : null}
              </>
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
            ) : (
              <View
                style={[
                  styles.routesHintOnly,
                  isLight ? styles.emptyPostsWrapLight : styles.emptyPostsWrapDark,
                ]}
              >
                <Text style={[styles.routesHintOnlyTxt, brandFontSans, { color: textMuted }]}>
                  {pf(language, 'profileSavedRoutesEmptyHint')}
                </Text>
              </View>
            )}

            {savedPlaces.length > 0 ? (
              <View style={styles.savedPlacesBlock}>
                <Text style={[styles.savedPlacesSectionTitle, brandFontHeadMedium, { color: textMain }]}>
                  {pf(language, 'savedPlacesHeading')}
                </Text>
                {savedPlaces.map((row) => {
                  const resolved = resolveSavedLandmarkRow(row);
                  const placeTitle = langUk ? row.titleUk || row.titleEn : row.titleEn || row.titleUk;
                  const regionLine = langUk ? row.regionTitleUk || row.regionTitleEn : row.regionTitleEn || row.regionTitleUk;
                  const thumb = resolved?.lm?.thumb;
                  return (
                    <Pressable
                      key={row.key}
                      onPress={() => openSavedPlace(row)}
                      android_ripple={headerRipple}
                      style={({ pressed }) => [
                        styles.profilePlaceCard,
                        {
                          borderColor: isLight ? 'rgba(2, 18, 235, 0.12)' : 'rgba(255,255,255,0.12)',
                          backgroundColor: isLight ? 'rgba(2,18,235,0.04)' : 'rgba(255,255,255,0.06)',
                        },
                        pressed && { opacity: 0.9 },
                        !resolved && styles.profilePlaceCardStale,
                      ]}
                    >
                      {thumb ? (
                        <Image source={thumb} style={styles.profilePlaceThumb} resizeMode="cover" />
                      ) : (
                        <View style={[styles.profilePlaceThumb, styles.profilePlaceThumbPh]}>
                          <Text style={styles.profilePlaceFlag}>{row.flag || '🏳️'}</Text>
                        </View>
                      )}
                      <View style={styles.profilePlaceBody}>
                        <Text style={[styles.profilePlaceTag, brandFontSansSemibold, { color: accent }]} numberOfLines={1}>
                          {row.flag} {regionLine}
                        </Text>
                        <Text style={[styles.profilePlaceTitle, brandFontSansSemibold, { color: textMain }]} numberOfLines={2}>
                          {placeTitle}
                        </Text>
                        <Text style={[styles.profilePlaceMore, brandFontSansSemibold, { color: accent }]}>
                          {pf(language, 'more')}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : (
          <ProfileVisitStats language={language} isLight={isLight} navigation={navigation} shell={shell} />
        )}
      </ScrollView>
      </RenderProfiler>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  /** Як `FeedPage` → `FeedHeader` → кнопка додавання (історії / зйомка). */
  profileAddCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    alignItems: 'flex-start',
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
    marginTop: 8,
    borderRadius: 28,
    paddingVertical: 28,
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
  headText: { flex: 1 },
  userName: { fontSize: 20, fontWeight: '700' },
  userCity: { fontSize: 14, marginTop: 4 },
  userBio: { fontSize: 14, marginTop: 8, lineHeight: 20 },
  userBirth: { fontSize: 13, marginTop: 6, fontWeight: '500' },
  statsRow: { flexDirection: 'row', marginTop: 12, gap: 20 },
  statPress: { flexDirection: 'row', alignItems: 'baseline' },
  statNum: { fontSize: 16, fontWeight: '700' },
  statLabel: { fontSize: 14 },
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
  discoverBtn: {
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  discoverBtnText: { fontSize: 15, fontWeight: '600' },
  tabRail: {
    flexDirection: 'row',
    marginHorizontal: GRID_H_PAD,
    marginTop: 20,
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
    minHeight: 44,
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
  tabSegmentText: {
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: 0.15,
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
  routesHintOnly: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  routesHintOnlyTxt: { fontSize: 14, lineHeight: 20 },
  savedPlacesBlock: { marginTop: 4 },
  savedPlacesSectionTitle: { fontSize: 17, marginBottom: 12, marginLeft: 2 },
  profilePlaceCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    overflow: 'hidden',
  },
  profilePlaceCardStale: { opacity: 0.62 },
  profilePlaceThumb: { width: 88, height: 88, backgroundColor: 'rgba(128,128,128,0.2)' },
  profilePlaceThumbPh: { alignItems: 'center', justifyContent: 'center' },
  profilePlaceFlag: { fontSize: 28 },
  profilePlaceBody: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
    minWidth: 0,
  },
  profilePlaceTag: { fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' },
  profilePlaceTitle: { fontSize: 15, lineHeight: 20, marginTop: 4 },
  profilePlaceMore: { fontSize: 13, marginTop: 8 },
  savedRoutesSyncNote: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
});
