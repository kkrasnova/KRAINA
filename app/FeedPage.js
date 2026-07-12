import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  Platform,
  Alert,
  Share,
  Linking,
  Modal,
  TextInput,
  ActivityIndicator,
  DeviceEventEmitter,
  useWindowDimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';

import { Video, ResizeMode } from './expoAvCompat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import PddHeaderWordmark from './PddHeaderWordmark';
import { useAppTheme } from './useAppTheme';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { RenderProfiler, markEnd } from './performanceMetrics';
import { ft } from './feedI18n';
import { pf } from './profileI18n';
import { routeRegionTitle } from './routePlanTitles';
import { getUserFeedPosts, getLatestUserStory, removeUserFeedPost, getFeedPostBackendId, resolveFeedLocalUser } from './feedLocalStorage';
import {
  addLocalFeedPostComment,
  deleteLocalFeedPostComment,
  getLocalFeedPostComments,
  hydrateLocalFeedPostStats,
  isLocalFeedCommentId,
  migrateLocalFeedPostInteractions,
  toggleLocalFeedPostCommentLike,
  setLocalFeedPostLikeState,
  toggleLocalFeedPostLike,
} from './feedLocalInteractions';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { accentForTheme, onAccentButtonText, ACCENT_BLUE, ACCENT_LEMON } from './themeAccent';
import { brandFontHeadMedium } from './brandFont';
import {
  hasFeedApiToken,
  ensureFeedApiReady,
  ensureFeedSocialReady,
  feedTogglePostLike,
  feedTogglePostRepost,
  feedToggleCommentLike,
  feedDeletePostComment,
  feedListPostComments,
  feedAddPostComment,
} from './feedApi';
import { resolveFeedMediaUrl } from './feedMediaUrl';
import { hydrateRoutePlan } from './profileStorage';
import { hasMessageApiToken, messagesOpenThread, messagesSendText, socialListMutuals } from './messageApi';
import { useAuthStore } from './auth/authStore';
import { KRAINA_FEED_MEDIA_UPDATED, emitFeedMediaUpdated, feedDeleteIdSet } from './feedSyncEvents';
import { rememberPostLikeState, warmPostLikeStateFromStats, rememberPostComment, rememberPostCommentsCount, peekPostLikeState } from './feedInteractionHotCache';
import { rememberProfileAvatarUrl } from './profileAvatarHotCache';
import { KRAINA_PROFILE_ME_UPDATED } from './profileMeSync';
import ProfileAvatarCircle, { useViewerProfileAvatarUri } from './ProfileAvatarCircle';
import { KRAINA_PROFILE_AVATAR_CHANGED } from './profileStorage';
import {
  storyAvatarRingStyle,
  shouldShowStoryInFeedTray,
  STORY_TRAY_AVATAR_INNER,
  STORY_TRAY_AVATAR_WRAP,
} from './storyTrayUtils';
import { useDeviceGallerySync } from './useDeviceGallerySync';
import { prefetchDiscoverBundle, prefetchFeedBundle } from './screenLoaders';
import { prefetchChatsForUser } from './chatsDataPrefetch';
import { isNavigableSocialUsername } from './socialFollowSyncEvents';
import {
  feedCacheKey,
  readFeedMainCache,
  writeFeedMainCache,
  clearFeedMainCache,
  patchFeedMainPostStats,
  patchFeedMainRemovePost,
  seedFeedMainCacheIfMissing,
  fetchFeedMainPayload,
  FEED_MAIN_CACHE_UPDATED,
  FEED_MAIN_CACHE_TTL,
} from './feedMainCache';
import { errorToUserText } from './errorText';
import { hasBackendSession } from './backendAuthApi';
import { isLocalFeedPostId, isServerFeedPostId, resolveBackendFeedPostId, isLocalFeedPostShadowedByApi, retrySyncLocalFeedPost, retryAllUnsyncedLocalFeedPosts, waitForFeedPostSync } from './feedPostSyncBridge';
const CARD_LIGHT = '#FFFFFF';
const CARD_DARK = '#141414';

function formatFeedPostAge(ms, language) {
  if (!ms || !Number.isFinite(ms)) return '';
  const langUk = language.split(/[-_]/)[0].toLowerCase() === 'uk';
  const diff = Date.now() - ms;
  const h = Math.floor(diff / 3600000);
  if (h < 1) return langUk ? 'щойно' : 'just now';
  if (h < 24) return `${h} ${pf(language, 'hoursAgo')}`;
  const d = Math.floor(h / 24);
  return `${d} ${langUk ? 'дн. назад' : 'd ago'}`;
}

const FEED_EMPTY_FRIENDS_PHOTOS = [
  require('./assets/carousel/photo-1580072624564-1fe6b660b7e2.webp'),
  require('./assets/carousel/photo-1615119449152-d94284eafa45.webp'),
  require('./assets/carousel/photo-1630227286297-f7cc7c97f415.webp'),
];

const FEED_EMPTY_WORLD_PHOTOS = [
  require('./assets/carousel/premium_photo-1676319876974-3c9759cb8c4a.webp'),
  require('./assets/carousel/photo-1518684079-3c830dcef090.webp'),
  require('./assets/carousel/premium_photo-1689371089286-6f75a9ecd4ca.webp'),
];

function FeedEmptyPlaceholder({
  segment,
  language,
  isLight,
  textMain,
  textMuted,
  accent,
  onAccentTxt,
  onCreate,
  onFindFriends,
  ripple,
}) {
  const photos = segment === 'world' ? FEED_EMPTY_WORLD_PHOTOS : FEED_EMPTY_FRIENDS_PHOTOS;
  const photoBorder = isLight ? '#FFFFFF' : 'rgba(255, 255, 255, 0.16)';
  const photoShadow = isLight ? '#0212EB' : '#000000';
  const headline =
    segment === 'world' ? ft(language, 'feedWorldEmptyHeadline') : ft(language, 'feedFriendsEmptyHeadline');
  const hintText = segment === 'world' ? ft(language, 'worldHint') : ft(language, 'friendsHint');
  const ctaLabel =
    segment === 'world' ? ft(language, 'feedWorldEmptyCta') : ft(language, 'feedFriendsEmptyCta');
  const onCta = segment === 'world' ? onCreate : onFindFriends;
  const ctaIcon = segment === 'world' ? 'camera-outline' : 'people-outline';

  return (
    <View style={styles.feedEmptyWrap}>
      <View style={styles.feedEmptyStage}>
        <View style={styles.feedEmptyPhotoRow} pointerEvents="none">
          {photos.map((source, idx) => {
            const center = idx === 1;
            return (
              <ExpoImage
                key={`feed-empty-${segment}-${String(idx)}`}
                source={source}
                style={[
                  styles.feedEmptyPhoto,
                  center ? styles.feedEmptyPhotoCenter : null,
                  {
                    borderColor: photoBorder,
                    transform: [{ rotate: idx === 0 ? '-10deg' : idx === 2 ? '10deg' : '0deg' }],
                    marginLeft: idx === 0 ? 0 : -26,
                    zIndex: center ? 3 : idx === 0 ? 1 : 2,
                    opacity: center ? 1 : 0.88,
                    ...(Platform.OS === 'ios'
                      ? {
                          shadowColor: photoShadow,
                          shadowOffset: { width: 0, height: center ? 10 : 6 },
                          shadowOpacity: isLight ? 0.18 : 0.35,
                          shadowRadius: center ? 16 : 10,
                        }
                      : { elevation: center ? 6 : 3 }),
                  },
                ]}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
              />
            );
          })}
        </View>

        <Text style={[styles.feedEmptyTitle, brandFontHeadMedium, { color: textMain }]} numberOfLines={2}>
          {headline}
        </Text>
        <Text style={[styles.feedEmptyHint, { color: textMuted }]}>{hintText}</Text>
      </View>

      {onCta ? (
        <Pressable
          onPress={onCta}
          style={({ pressed }) => [
            styles.feedEmptyCta,
            { backgroundColor: accent, opacity: pressed ? 0.92 : 1 },
          ]}
          android_ripple={ripple}
        >
          <Ionicons name={ctaIcon} size={22} color={onAccentTxt} />
          <Text style={[styles.feedEmptyCtaTxt, { color: onAccentTxt }]}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}


const MemoFeedHeader = React.memo(function MemoFeedHeader({ appTheme, insetsTop, onAdd, onMessages }) {
  const isLight = appTheme === 'light';
  const sendIcon = isLight
    ? require('./assets/15.png')
    : require('./assets/11221.png');
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const iconColor = isLight ? '#1E1E1E' : '#FFFFFF';
  const addCircleBorder = isLight ? 'rgba(30,30,30,0.18)' : 'rgba(255,255,255,0.35)';

  return (
    <View
      style={[
        styles.feedHeaderWrap,
        {
          paddingTop: insetsTop,
          backgroundColor: isLight ? LIGHT_BAR_BG : APP_SCREEN_BG,
        },
      ]}
    >
      <View style={styles.feedHeaderRow}>
        <View style={styles.feedHeaderSide}>
          <Pressable
            onPress={onAdd}
            hitSlop={12}
            style={({ pressed }) => [styles.addHit, pressed && styles.pressedIOS]}
            android_ripple={ripple}
            accessibilityRole="button"
            accessibilityLabel="Add"
          >
            <View style={[styles.addCircleBtn, { borderColor: addCircleBorder }]}>
              <Ionicons name="add" size={22} color={iconColor} />
            </View>
          </Pressable>
        </View>
        <View style={styles.feedHeaderCenter} pointerEvents="none">
          <PddHeaderWordmark isLight={isLight} fontSize={isLight ? 20 : 21} />
        </View>
        <View style={[styles.feedHeaderSide, styles.feedHeaderSideRight]}>
          <Pressable
            onPress={onMessages}
            hitSlop={12}
            style={({ pressed }) => [styles.msgHit, pressed && styles.pressedIOS]}
            android_ripple={ripple}
            accessibilityRole="button"
            accessibilityLabel="Messages"
          >
            <ExpoImage source={sendIcon} style={styles.sendImg} contentFit="contain" cachePolicy="memory-disk" transition={0} />
          </Pressable>
        </View>
      </View>
    </View>
  );
});

const MemoPostMediaCarousel = React.memo(function MemoPostMediaCarousel({ post, accent }) {
  const { width: screenW } = useWindowDimensions();
  const media = Array.isArray(post?.media_urls) ? post.media_urls.filter(Boolean) : [];
  const [active, setActive] = useState(0);
  const slideW = Math.max(1, Math.round(screenW - 36));
  const slideStyle = useMemo(() => [styles.postImage, { width: slideW }], [slideW]);
  if (!media.length) {
    return (
      <ExpoImage
        source={post?.isUri ? { uri: post?.image } : post?.image}
        style={slideStyle}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
      />
    );
  }
  if (media.length === 1) {
    const one = String(media[0] || '');
    const isVid = /\.(mp4|mov|m4v)(\?|$)/i.test(one);
    return isVid ? (
      <Video
        source={{ uri: one }}
        style={slideStyle}
        resizeMode={ResizeMode.COVER}
        useNativeControls
        shouldPlay={false}
      />
    ) : (
      <ExpoImage source={{ uri: one }} style={slideStyle} contentFit="cover" cachePolicy="memory-disk" transition={0} />
    );
  }
  return (
    <RenderProfiler id="FeedPage:MediaCarousel">
    <View>
      <FlatList
        data={media}
        horizontal
        pagingEnabled
        keyExtractor={(it, i) => `${i}_${it}`}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: slideW, offset: slideW * index, index })}
        maxToRenderPerBatch={3}
        windowSize={3}
        onMomentumScrollEnd={(e) => {
          const w = e?.nativeEvent?.layoutMeasurement?.width || slideW;
          const x = e?.nativeEvent?.contentOffset?.x || 0;
          const idx = Math.max(0, Math.min(media.length - 1, Math.round(x / w)));
          setActive(idx);
        }}
        renderItem={({ item }) => {
          const u = String(item || '');
          const isVid = /\.(mp4|mov|m4v)(\?|$)/i.test(u);
          return isVid ? (
            <Video
              source={{ uri: u }}
              style={slideStyle}
              resizeMode={ResizeMode.COVER}
              useNativeControls
              shouldPlay={false}
            />
          ) : (
            <ExpoImage source={{ uri: u }} style={slideStyle} contentFit="cover" cachePolicy="memory-disk" transition={0} />
          );
        }}
      />
      <View style={styles.postMediaDots}>
        {media.map((_, i) => (
          <View
            key={`md_${i}`}
            style={[styles.postMediaDot, i === active ? { backgroundColor: accent, opacity: 1 } : null]}
          />
        ))}
      </View>
    </View>
    </RenderProfiler>
  );
});

export default function FeedPage({ navigation, route, isTabActive = true }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const { appTheme, isLight, screenBg } = useAppTheme(route?.params?.appTheme, route);
  const [segment, setSegment] = useState('friends');
  const routeUser = route?.params?.user;
  const authUser = useAuthStore((s) => s.user);
  const profileMeUserId = useAuthStore((s) => s.profileMe?.profile?.user_id);
  const feedLocalUser = useMemo(
    () => resolveFeedLocalUser(routeUser, { authUser, profileUserId: profileMeUserId }),
    [routeUser, authUser, profileMeUserId],
  );
  const user = feedLocalUser || routeUser;
  const userKey = String(user?.id || user?.email || '');
  const mainCacheKey = feedCacheKey(user);
  const [userPosts, setUserPosts] = useState([]);
  const [userStory, setUserStory] = useState(null);
  const [apiFriendsPosts, setApiFriendsPosts] = useState(() => {
    seedFeedMainCacheIfMissing(mainCacheKey);
    return readFeedMainCache(mainCacheKey)?.fp ?? null;
  });
  const [apiWorldPosts, setApiWorldPosts] = useState(() => {
    seedFeedMainCacheIfMissing(mainCacheKey);
    return readFeedMainCache(mainCacheKey)?.wp ?? null;
  });
  const [trayStories, setTrayStories] = useState(() => {
    seedFeedMainCacheIfMissing(mainCacheKey);
    return readFeedMainCache(mainCacheKey)?.st ?? [];
  });
  const [postLikeMap, setPostLikeMap] = useState({});
  const [postLikeCountMap, setPostLikeCountMap] = useState({});
  const [postRepostMap, setPostRepostMap] = useState({});
  const [postRepostCountMap, setPostRepostCountMap] = useState({});
  const [postCommentCountMap, setPostCommentCountMap] = useState({});
  const [commentModalPost, setCommentModalPost] = useState(null);
  const [commentList, setCommentList] = useState([]);
  const [commentLikeMap, setCommentLikeMap] = useState({});
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [actionBusyMap, setActionBusyMap] = useState({});

  const profileMeDisplayName = useAuthStore((s) => {
    const dn = s.profileMe?.profile?.display_name;
    return dn != null && String(dn).trim() ? String(dn).trim() : '';
  });
  const viewerUserId = profileMeUserId ? String(profileMeUserId) : String(user?.id || '');
  const viewerAvatarUri = useViewerProfileAvatarUri(user);

  const { latest: deviceGalleryLatest, items: deviceGalleryItems } = useDeviceGallerySync({
    enabled: isTabActive && !!viewerUserId,
    limit: 12,
  });

  const fetchApiFeed = useCallback(async () => {
    const viewerId = profileMeUserId ? String(profileMeUserId) : String(user?.id || '');
    return fetchFeedMainPayload(user, viewerId);
  }, [profileMeUserId, user?.id, user?.firebaseUid, user?.email]);

  const pruneShadowedLocalPosts = useCallback(
    async (apiPosts) => {
      if (!user || !viewerUserId || !Array.isArray(apiPosts)) return;
      try {
        const locals = await getUserFeedPosts(user);
        await Promise.all(
          locals
            .filter(
              (local) =>
                isLocalFeedPostId(local.id) &&
                isLocalFeedPostShadowedByApi(local, apiPosts, viewerUserId),
            )
            .map((local) => removeUserFeedPost(user, local.id)),
        );
        const nextLocals = await getUserFeedPosts(user);
        setUserPosts(nextLocals);
      } catch {
        /* */
      }
    },
    [user, viewerUserId],
  );

  /** Застосувати результат API-запиту до стейтів. */
  const applyApiResult = useCallback((apiResult) => {
    if (!apiResult) {
      setApiFriendsPosts(null);
      setApiWorldPosts(null);
      setTrayStories([]);
      return;
    }
    setApiFriendsPosts(apiResult.fp);
    setApiWorldPosts(apiResult.wp);
    setTrayStories(apiResult.st);
    void pruneShadowedLocalPosts(apiResult.fp);
  }, [pruneShadowedLocalPosts]);

  /** При події оновлення медіа — повний refetch лише для нових постів/історій. */
  useEffect(() => {
    const subMedia = DeviceEventEmitter.addListener(KRAINA_FEED_MEDIA_UPDATED, (payload) => {
      if (payload?.kind === 'delete') {
        const ids = feedDeleteIdSet(payload);
        if (!ids.size) return;
        const removeFromList = (prev) => {
          if (!Array.isArray(prev)) return prev;
          return prev.filter((p) => !ids.has(String(p.id)));
        };
        setApiFriendsPosts(removeFromList);
        setApiWorldPosts(removeFromList);
        setUserPosts((prev) => prev.filter((p) => !ids.has(String(p.id))));
        patchFeedMainRemovePost(mainCacheKey, payload.postId, payload.localPostId, payload.removedIds);
        return;
      }

      if (payload?.postId && !payload?.kind) return;

      if (payload?.kind === 'interaction') {
        const ids = [payload?.postId, payload?.localPostId].map(String).filter(Boolean);
        if (!ids.length) return;
        if (payload.liked != null) {
          setPostLikeMap((prev) => {
            const next = { ...prev };
            ids.forEach((id) => {
              next[id] = !!payload.liked;
            });
            return next;
          });
        }
        if (payload.likes_count != null) {
          const count = Math.max(0, Number(payload.likes_count) || 0);
          setPostLikeCountMap((prev) => {
            const next = { ...prev };
            ids.forEach((id) => {
              next[id] = count;
            });
            return next;
          });
          ids.forEach((id) => {
            patchPostInFeedLists(id, {
              ...(payload.liked != null ? { liked_by_viewer: !!payload.liked } : {}),
              likes_count: count,
            });
          });
        }
        if (payload.comments_count != null) {
          const count = Math.max(0, Number(payload.comments_count) || 0);
          setPostCommentCountMap((prev) => {
            const next = { ...prev };
            ids.forEach((id) => {
              next[id] = count;
            });
            return next;
          });
          ids.forEach((id) => {
            patchPostInFeedLists(id, { comments_count: count });
          });
        }
        return;
      }

      if (__DEV__) console.log('[Cache] FeedPage media updated — cache cleared');

      if (payload?.kind === 'post' && payload?.post && !payload?.synced) {
        const local = payload.post;
        const authorId = String(payload.userId || profileMeUserId || user?.id || '');
        const visibility = payload?.visibility === 'public' ? 'public' : 'followers';
        const optimistic = {
          id: String(local.id),
          user_id: authorId,
          username: profileMeDisplayName || user?.name || user?.email?.split('@')[0] || '',
          content_text: local.caption || '',
          media_urls: (Array.isArray(local.uris) ? local.uris : local.uri ? [local.uri] : []).filter(Boolean),
          visibility,
          place_label: local.place || '',
          lat: local.lat ?? null,
          lng: local.lng ?? null,
          route_plan: local.route_plan || null,
          likes_count: 0,
          comments_count: 0,
          reposts_count: 0,
          liked_by_viewer: false,
          reposted_by_viewer: false,
          created_at: new Date(local.createdAt || Date.now()).toISOString(),
        };
        const insertOptimistic = (prev) => {
          const list = Array.isArray(prev) ? prev : [];
          if (list.some((p) => String(p.id) === String(local.id))) return list;
          return [optimistic, ...list];
        };
        // Always show the freshly published post in the viewer's own friends
        // feed, and additionally in the world feed when it's public — so it
        // appears immediately regardless of which tab the user is on.
        setApiFriendsPosts(insertOptimistic);
        if (visibility === 'public') {
          setApiWorldPosts(insertOptimistic);
        }
      }

      if (payload?.synced && payload?.localPostId && payload?.postId) {
        const localId = String(payload.localPostId);
        const backendId = String(payload.postId);
        const replaceId = (prev) => {
          if (!Array.isArray(prev)) return prev;
          return prev.map((p) => (String(p.id) === localId ? { ...p, id: backendId } : p));
        };
        setApiFriendsPosts(replaceId);
        setApiWorldPosts(replaceId);
      }

      clearFeedMainCache(mainCacheKey);
      void (async () => {
        if (!user?.id && !user?.firebaseUid && !user?.email) return;
        const [posts, story] = await Promise.all([getUserFeedPosts(user), getLatestUserStory(user)]);
        setUserPosts(posts);
        setUserStory(story);
        await ensureFeedApiReady(user);
        const apiResult = await fetchApiFeed();
        if (apiResult) {
          applyApiResult(apiResult);
          writeFeedMainCache(mainCacheKey, apiResult);
        }
      })();
    });
    const subAvatar = DeviceEventEmitter.addListener(KRAINA_PROFILE_AVATAR_CHANGED, () => {
      clearFeedMainCache(mainCacheKey);
    });
    const subProfile = DeviceEventEmitter.addListener(KRAINA_PROFILE_ME_UPDATED, () => {
      clearFeedMainCache(mainCacheKey);
      void useAuthStore.getState().loadProfileMeIfStale(0);
    });
    const subCache = DeviceEventEmitter.addListener(FEED_MAIN_CACHE_UPDATED, ({ key }) => {
      if (key !== mainCacheKey) return;
      const cached = readFeedMainCache(mainCacheKey);
      if (cached) applyApiResult(cached);
    });
    return () => {
      subMedia.remove();
      subAvatar.remove();
      subProfile.remove();
      subCache.remove();
    };
  }, [user, mainCacheKey, fetchApiFeed, applyApiResult, patchPostInFeedLists, patchFeedMainRemovePost, profileMeUserId, profileMeDisplayName, user?.id, user?.name, user?.email]);

  const [feedVisibleEpoch, setFeedVisibleEpoch] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!isTabActive) return undefined;
      setFeedVisibleEpoch((n) => n + 1);
      return undefined;
    }, [isTabActive]),
  );

  useEffect(() => {
    if (!isTabActive || feedVisibleEpoch === 0) return undefined;
    let cancelled = false;
    (async () => {
        if (!user?.id && !user?.firebaseUid && !user?.email) return;

        void retryAllUnsyncedLocalFeedPosts(user).catch(() => {});

        const cached = readFeedMainCache(mainCacheKey);
        const cacheFresh = cached && Date.now() - cached.at < FEED_MAIN_CACHE_TTL;

        if (!cancelled && cached) {
          applyApiResult(cached);
          markEnd('feed_interactive');
          if (cacheFresh) {
            if (__DEV__) console.log(`[Cache] FeedPage HIT fresh age=${Date.now() - cached.at}ms`);
            void Promise.all([getUserFeedPosts(user), getLatestUserStory(user)]).then(([posts, story]) => {
              if (!cancelled) {
                setUserPosts(posts);
                setUserStory(story);
              }
            });
            return;
          }
          if (__DEV__) console.log(`[Cache] FeedPage STALE hit age=${Date.now() - cached.at}ms — background revalidation`);
        } else if (__DEV__ && !cancelled) {
          console.log(`[Cache] FeedPage MISS`);
        }

        const localPromise = Promise.all([getUserFeedPosts(user), getLatestUserStory(user)]).then(
          ([posts, story]) => {
            if (!cancelled) {
              setUserPosts(posts);
              setUserStory(story);
            }
          },
        );

        if (cancelled) return;

        await ensureFeedApiReady(user);
        if (cancelled) return;
        if (useAuthStore.getState().accessToken) {
          try {
            await useAuthStore.getState().loadProfileMeIfStale();
          } catch {
            /* */
          }
        }
        if (cancelled) return;

        const apiResult = await fetchApiFeed();
        if (cancelled) return;

        if (apiResult) {
          writeFeedMainCache(mainCacheKey, apiResult);
          applyApiResult(apiResult);
          if (__DEV__) console.log(`[Cache] FeedPage refreshed from API`);
        } else if (!cached) {
          applyApiResult(null);
        }
        await localPromise;
        markEnd('feed_interactive');
      })();
    return () => {
      cancelled = true;
    };
  }, [feedVisibleEpoch, isTabActive, user?.id, user?.firebaseUid, user?.email, mainCacheKey, fetchApiFeed, applyApiResult]);

  useEffect(() => {
    if (!isTabActive) return undefined;
    const subSession = DeviceEventEmitter.addListener('kraina_backend_session_merged_v1', () => {
      setFeedVisibleEpoch((n) => n + 1);
    });
    return () => subSession.remove();
  }, [isTabActive]);

  useEffect(() => {
    if (!isTabActive) return;
    setFeedVisibleEpoch((n) => n + 1);
    prefetchFeedBundle(user);
  }, [isTabActive, user?.id, user?.firebaseUid, user?.email]);

  const accent = accentForTheme(isLight);
  const onAccentTxt = onAccentButtonText(isLight);
  const bg = screenBg;
  const textMain = isLight ? '#1E1E1E' : 'rgba(255,255,255,0.9)';
  const textMuted = isLight ? '#5C5C5C' : '#9A9A9A';
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;

  const shell = useMemo(
    () => ({
      user: route?.params?.user,
      language,
      ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
      appTheme: isLight ? 'light' : 'dark',
    }),
    [route?.params?.user, route?.params?.countryId, language, isLight],
  );

  const posts = useMemo(() => {
    const displayName =
      user?.name || (user?.email ? String(user.email).split('@')[0] : '') || ft(language, 'me');
    const mapApi = (p) => {
      const mediaUrls = Array.isArray(p.media_urls)
        ? p.media_urls.filter(Boolean).map((u) => resolveFeedMediaUrl(String(u)))
        : [];
      const url = mediaUrls[0] || '';
      const isVid = /\.(mp4|mov)(\?|$)/i.test(String(url));
      return {
        id: p.id,
        authorUserId: p.user_id ? String(p.user_id) : '',
        scope: p.visibility === 'public' ? 'world' : 'friends',
        name: p.username || '—',
        place: (p.place_label && String(p.place_label).trim()) || '',
        image: url,
        media_urls: mediaUrls,
        isUri: true,
        isVideo: isVid,
        avatarUrl: p.avatar_url ? resolveFeedMediaUrl(String(p.avatar_url)) : null,
        caption: p.content_text || '',
        route_plan: p.route_plan || null,
        lat: p.lat != null ? Number(p.lat) : null,
        lng: p.lng != null ? Number(p.lng) : null,
        likedByViewer: Boolean(p.liked_by_viewer),
        repostedByViewer: Boolean(p.reposted_by_viewer),
        likesCount: Number(p.likes_count) || 0,
        repostsCount: Number(p.reposts_count) || 0,
        commentsCount: Number(p.comments_count) || 0,
        createdAtMs: p.created_at ? new Date(String(p.created_at)).getTime() : 0,
      };
  };
  const mapLocal = (p) => {
    const media_urls = (Array.isArray(p.uris) && p.uris.length ? p.uris : p.uri ? [p.uri] : [])
      .map((u) => resolveFeedMediaUrl(String(u)))
      .filter(Boolean);
    const url = media_urls[0] || '';
    return {
    id: p.id,
    authorUserId: viewerUserId || '',
    scope:
      p.scope === 'world' || p.visibility === 'public' ? 'world' : 'friends',
    name: displayName,
    place: (p.place && String(p.place).trim()) || '',
    image: url,
    media_urls,
    isUri: true,
    isVideo: /\.(mp4|mov)(\?|$)/i.test(String(url)),
    avatarUrl: viewerAvatarUri || null,
    caption: p.caption || '',
    route_plan: p.route_plan || null,
    lat: p.lat != null ? Number(p.lat) : null,
    lng: p.lng != null ? Number(p.lng) : null,
    likedByViewer: false,
    likesCount: 0,
    commentsCount: 0,
    createdAtMs: p.createdAt ? Number(p.createdAt) : Date.now(),
  };
  };
    const apiList = segment === 'world' ? apiWorldPosts : apiFriendsPosts;

    if (hasFeedApiToken()) {
      if (!Array.isArray(apiList)) return [];
      const mapped = apiList.map(mapApi);
      if (segment === 'world') return mapped;
      // For friends segment: always add unsynced local posts on top of API posts
      const apiIds = new Set(mapped.map((p) => String(p.id)));
      const localExtras = userPosts
        .filter(
          (p) =>
            isLocalFeedPostId(p.id) &&
            !apiIds.has(String(p.id)) &&
            !isLocalFeedPostShadowedByApi(p, apiList, viewerUserId),
        )
        .map(mapLocal);
      return localExtras.length ? [...localExtras, ...mapped] : mapped;
    }

    if (apiList && apiList.length) {
      const mapped = apiList.map(mapApi);
      if (segment === 'world') return mapped;
      const apiIds = new Set(mapped.map((p) => String(p.id)));
      const localExtras = userPosts
        .filter(
          (p) =>
            !apiIds.has(String(p.id)) && !isLocalFeedPostShadowedByApi(p, apiList, viewerUserId),
        )
        .map(mapLocal);
      return localExtras.length ? [...mapped, ...localExtras] : mapped;
    }
    return userPosts.map(mapLocal);
  }, [
    userPosts,
    segment,
    userKey,
    user?.name,
    user?.email,
    language,
    apiFriendsPosts,
    apiWorldPosts,
    viewerAvatarUri,
    viewerUserId,
  ]);

  const feedReady = !hasFeedApiToken() || (segment === 'world' ? apiWorldPosts : apiFriendsPosts) !== null;
  const showFeedEmpty = posts.length === 0 && feedReady;

  const syncCountMapsFromPosts = useCallback((sourcePosts) => {
    setPostLikeMap((prev) => {
      const next = {};
      let changed = Object.keys(prev).length !== sourcePosts.length;
      sourcePosts.forEach((p) => {
        const id = String(p.id);
        const v = prev[id] != null ? prev[id] : !!p.likedByViewer;
        next[id] = v;
        if (prev[id] !== v) changed = true;
      });
      return changed ? next : prev;
    });
    setPostLikeCountMap((prev) => {
      const next = {};
      let changed = Object.keys(prev).length !== sourcePosts.length;
      sourcePosts.forEach((p) => {
        const id = String(p.id);
        const v = Number.isFinite(Number(prev[id])) ? Number(prev[id]) : Number(p.likesCount) || 0;
        next[id] = v;
        if (prev[id] !== v) changed = true;
      });
      return changed ? next : prev;
    });
    setPostRepostMap((prev) => {
      const next = {};
      let changed = Object.keys(prev).length !== sourcePosts.length;
      sourcePosts.forEach((p) => {
        const id = String(p.id);
        const v = prev[id] != null ? prev[id] : !!p.repostedByViewer;
        next[id] = v;
        if (prev[id] !== v) changed = true;
      });
      return changed ? next : prev;
    });
    setPostRepostCountMap((prev) => {
      const next = {};
      let changed = Object.keys(prev).length !== sourcePosts.length;
      sourcePosts.forEach((p) => {
        const id = String(p.id);
        const v = Number.isFinite(Number(prev[id])) ? Number(prev[id]) : Number(p.repostsCount) || 0;
        next[id] = v;
        if (prev[id] !== v) changed = true;
      });
      return changed ? next : prev;
    });
    setPostCommentCountMap((prev) => {
      const next = {};
      let changed = Object.keys(prev).length !== sourcePosts.length;
      sourcePosts.forEach((p) => {
        const id = String(p.id);
        const v = Number.isFinite(Number(prev[id])) ? Number(prev[id]) : Number(p.commentsCount) || 0;
        next[id] = v;
        if (prev[id] !== v) changed = true;
      });
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    syncCountMapsFromPosts(posts);
    posts.forEach((p) => {
      const id = String(p.id);
      if (peekPostLikeState(id).has) return;
      rememberPostLikeState(id, {
        liked: !!p.likedByViewer,
        likes_count: Number(p.likesCount) || 0,
      });
      rememberPostCommentsCount(id, Number(p.commentsCount) || 0);
      const authorId = String(p.user_id || p.userId || '');
      if (authorId && authorId === String(viewerUserId || '')) {
        const av = p.avatarUrl || p.avatar_url || '';
        if (av) rememberProfileAvatarUrl(av);
      }
    });
  }, [posts, syncCountMapsFromPosts, viewerUserId]);

  const localPostIdsSig = useMemo(
    () => posts.filter((p) => isLocalFeedPostId(p.id)).map((p) => String(p.id)).join('|'),
    [posts],
  );

  useEffect(() => {
    if (!user || !localPostIdsSig) return undefined;
    let cancelled = false;
    void (async () => {
      const ids = localPostIdsSig.split('|').filter(Boolean);
      const stats = await hydrateLocalFeedPostStats(user, ids);
      if (cancelled) return;
      warmPostLikeStateFromStats(stats, ids);
      if (Object.keys(stats.likes).length) {
        setPostLikeMap((prev) => ({ ...prev, ...stats.likes }));
      }
      if (Object.keys(stats.likeCounts).length) {
        setPostLikeCountMap((prev) => ({ ...prev, ...stats.likeCounts }));
      }
      if (Object.keys(stats.commentCounts).length) {
        setPostCommentCountMap((prev) => ({ ...prev, ...stats.commentCounts }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, localPostIdsSig]);

  const remapFeedPostId = useCallback((localId, backendId) => {
    const lid = String(localId || '');
    const bid = String(backendId || '');
    if (!lid || !bid || lid === bid) return;
    void migrateLocalFeedPostInteractions(user, lid, bid);
    const replaceInList = (list) => {
      if (!Array.isArray(list)) return list;
      return list.map((p) => (String(p.id) === lid ? { ...p, id: bid } : p));
    };
    setApiFriendsPosts((fp) => replaceInList(fp));
    setApiWorldPosts((wp) => replaceInList(wp));
    const migrateMap = (setter) => {
      setter((prev) => {
        if (prev[lid] == null && prev[bid] == null) return prev;
        const next = { ...prev };
        if (next[lid] != null) {
          next[bid] = next[lid];
          delete next[lid];
        }
        return next;
      });
    };
    migrateMap(setPostLikeMap);
    migrateMap(setPostLikeCountMap);
    migrateMap(setPostRepostMap);
    migrateMap(setPostRepostCountMap);
    migrateMap(setPostCommentCountMap);
  }, [user]);

  const inferPostVisibility = useCallback(
    (postId, postScope) => {
      if (postScope === 'world') return 'public';
      const id = String(postId || '');
      if (apiWorldPosts?.some((p) => String(p.id) === id)) return 'public';
      return 'followers';
    },
    [apiWorldPosts],
  );

  const unsyncedLocalSig = useMemo(
    () =>
      posts
        .filter((p) => isLocalFeedPostId(p.id))
        .map((p) => `${String(p.id)}:${p.scope || ''}`)
        .join('|'),
    [posts],
  );

  useEffect(() => {
    if (!user?.id && !user?.firebaseUid && !user?.email) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        await ensureFeedApiReady(user);
      } catch {
        return;
      }
      if (cancelled || !hasFeedApiToken()) return;
      for (const post of posts) {
        if (!isLocalFeedPostId(post.id)) continue;
        const lid = String(post.id);
        const mapped = await getFeedPostBackendId(user, lid);
        if (mapped) {
          remapFeedPostId(lid, mapped);
          continue;
        }
        const visibility = inferPostVisibility(lid, post.scope);
        const backendId = await retrySyncLocalFeedPost(user, lid, { visibility });
        if (cancelled) return;
        if (backendId) remapFeedPostId(lid, backendId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [unsyncedLocalSig, user, posts, inferPostVisibility, remapFeedPostId]);

  const patchPostInFeedLists = useCallback(
    (postId, stats) => {
      const pid = String(postId || '');
      if (!pid) return;
      const patchList = (list) => {
        if (!Array.isArray(list)) return list;
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
      };
      setApiFriendsPosts((fp) => patchList(fp));
      setApiWorldPosts((wp) => patchList(wp));
      patchFeedMainPostStats(mainCacheKey, pid, stats);
    },
    [mainCacheKey],
  );

  const guardFeedInteraction = useCallback(
    async (postId, postScope) => {
      if (!user?.id && !user?.firebaseUid && !user?.email) {
        Alert.alert('', ft(language, 'feedNeedLogin'));
        return null;
      }
      if (postId && isLocalFeedPostId(postId)) {
        return String(postId);
      }
      let resolvedId = await resolveBackendFeedPostId(postId, { user });
      if (postId && isLocalFeedPostId(postId) && !isServerFeedPostId(resolvedId)) {
        await waitForFeedPostSync(postId, 45000);
        resolvedId = await resolveBackendFeedPostId(postId, { user });
      }
      if (postId && isLocalFeedPostId(postId) && !isServerFeedPostId(resolvedId)) {
        try {
          await ensureFeedSocialReady(user);
          if (!hasBackendSession()) {
            Alert.alert('', ft(language, 'feedServerRequired'));
            return null;
          }
          const visibility = inferPostVisibility(postId, postScope);
          const backendId = await retrySyncLocalFeedPost(user, postId, { visibility });
          if (backendId) {
            remapFeedPostId(postId, backendId);
            resolvedId = backendId;
          }
        } catch (e) {
          Alert.alert('', errorToUserText(e, language) || ft(language, 'feedActionFailed'));
          return null;
        }
        if (!isServerFeedPostId(resolvedId)) {
          Alert.alert('', ft(language, 'feedLocalPostAction'));
          return null;
        }
      }
      try {
        await ensureFeedSocialReady(user);
      } catch (e) {
        Alert.alert('', errorToUserText(e, language) || ft(language, 'feedActionFailed'));
        return null;
      }
      if (!hasBackendSession()) {
        Alert.alert('', ft(language, 'feedServerRequired'));
        return null;
      }
      return resolvedId || null;
    },
    [user, language, inferPostVisibility, remapFeedPostId],
  );

  const openChats = useCallback(() => {
    prefetchChatsForUser(user, language.split(/[-_]/)[0].toLowerCase() === 'uk');
    navigation.navigate('Chats', shell);
  }, [navigation, shell, user, language]);
  const openCreate = useCallback(
    () =>
      navigation.navigate('FeedCamera', {
        ...shell,
        publishVisibility: segment === 'world' ? 'public' : 'followers',
        cameraInitialMode: segment === 'world' ? 'post' : 'story',
      }),
    [navigation, shell, segment],
  );

  const openFindFriends = useCallback(() => {
    prefetchDiscoverBundle();
    navigation.navigate('DiscoverPeople', shell);
  }, [navigation, shell]);

  useEffect(() => {
    if (!isTabActive) return;
    prefetchDiscoverBundle();
  }, [isTabActive]);

  const openStoryForUser = useCallback(
    (row) => {
      if (!row?.user_id) return;
      navigation.navigate('FeedStoryViewer', {
        user,
        language,
        appTheme: appTheme === 'light' ? 'light' : 'dark',
        ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
        userId: String(row.user_id),
        authorUsername: row.username || '',
        authorAvatarUrl: row.avatar_url ? resolveFeedMediaUrl(String(row.avatar_url)) : viewerAvatarUri || null,
        ...(row.display_name && String(row.display_name).trim()
          ? { authorDisplayName: String(row.display_name).trim() }
          : {}),
      });
    },
    [navigation, user, language, appTheme, route?.params?.countryId, viewerAvatarUri],
  );

  const openLocalStories = useCallback(() => {
    const localViewerId = viewerUserId || String(user?.id || '');
    if (!localViewerId) return;
    navigation.navigate('FeedStoryViewer', {
      user,
      language,
      appTheme: appTheme === 'light' ? 'light' : 'dark',
      ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
      userId: localViewerId,
      useLocalStories: true,
      ...(profileMeDisplayName
        ? { authorDisplayName: profileMeDisplayName }
        : user?.name && String(user.name).trim()
          ? { authorDisplayName: String(user.name).trim() }
          : {}),
      ...(viewerAvatarUri ? { authorAvatarUrl: viewerAvatarUri } : {}),
    });
  }, [navigation, user, language, appTheme, route?.params?.countryId, viewerUserId, viewerAvatarUri, profileMeDisplayName]);

  const openPostRoute = useCallback(
    (post) => {
      const sharePoint = (lat, lng, label) => {
        const q = encodeURIComponent(label || 'Place');
        const web = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
        const mapsUrl =
          Platform.OS === 'ios'
            ? `maps://?ll=${lat},${lng}&q=${q}`
            : `geo:${lat},${lng}?q=${lat},${lng}(${q})`;
        Alert.alert(ft(language, 'route'), label || '', [
          {
            text: ft(language, 'openInMaps'),
            onPress: () => Linking.openURL(mapsUrl).catch(() => Linking.openURL(web)),
          },
          {
            text: ft(language, 'shareRoute'),
            onPress: () =>
              Share.share({
                message: `${label || 'KRAЇNA'}\n${web}`,
                url: web,
              }).catch(() => {}),
          },
          { text: 'OK', style: 'cancel' },
        ]);
      };
      if (post.route_plan) {
        const hydrated = hydrateRoutePlan(post.route_plan);
        const title = routeRegionTitle(language, hydrated) || '';
        Alert.alert(ft(language, 'routeLine'), title, [
          {
            text: ft(language, 'followThisRoute'),
            onPress: () =>
              navigation.navigate('RouteNavigation', {
                ...shell,
                routePlan: hydrated,
              }),
          },
          {
            text: ft(language, 'shareRoute'),
            onPress: () =>
              Share.share({
                message: ft(language, 'shareKrainaRoute').replace(/\{title\}/g, title),
              }).catch(() => {}),
          },
          { text: pf(language, 'cancel'), style: 'cancel' },
        ]);
        return;
      }
      if (post.lat != null && post.lng != null && Number.isFinite(post.lat) && Number.isFinite(post.lng)) {
        sharePoint(post.lat, post.lng, post.place);
        return;
      }
      Alert.alert('', ft(language, 'postNoRouteOrMapPoint'));
    },
    [navigation, shell, language],
  );

  const syncPostInteraction = useCallback(
    async ({ postId, localPostId, liked, likes_count, comments_count }) => {
      const ids = [postId, localPostId].map(String).filter(Boolean);
      const uniqueIds = [...new Set(ids)];
      if (liked != null && likes_count != null) {
        await Promise.all(
          uniqueIds.map((pid) =>
            setLocalFeedPostLikeState(user, pid, { liked: !!liked, likes_count: Number(likes_count) || 0 }),
          ),
        );
      }
      emitFeedMediaUpdated({
        kind: 'interaction',
        postId: String(postId || localPostId || ''),
        ...(localPostId && String(localPostId) !== String(postId) ? { localPostId: String(localPostId) } : {}),
        ...(liked != null ? { liked: !!liked } : {}),
        ...(likes_count != null ? { likes_count: Number(likes_count) || 0 } : {}),
        ...(comments_count != null ? { comments_count: Number(comments_count) || 0 } : {}),
      });
    },
    [user],
  );

  const toggleLike = useCallback(async (post) => {
    const id = String(post?.id || '');
    if (!id || actionBusyMap[id]) return;

    if (isLocalFeedPostId(id)) {
      const prevLiked = !!postLikeMap[id];
      const prevCount = Number(postLikeCountMap[id]) || 0;
      const optimistic = prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1;
      const optimisticLiked = !prevLiked;
      rememberPostLikeState(id, { liked: optimisticLiked, likes_count: optimistic });
      setPostLikeMap((m) => ({ ...m, [id]: optimisticLiked }));
      setPostLikeCountMap((m) => ({ ...m, [id]: optimistic }));
      try {
        const out = await toggleLocalFeedPostLike(user, id);
        setPostLikeMap((m) => ({ ...m, [id]: !!out.liked }));
        setPostLikeCountMap((m) => ({ ...m, [id]: Number(out.likes_count) || 0 }));
        void syncPostInteraction({
          postId: id,
          liked: out.liked,
          likes_count: out.likes_count,
        });
      } catch {
        setPostLikeMap((m) => ({ ...m, [id]: prevLiked }));
        setPostLikeCountMap((m) => ({ ...m, [id]: prevCount }));
      }
      void (async () => {
        try {
          const backendId = await resolveBackendFeedPostId(id, { user });
          if (!isServerFeedPostId(backendId)) return;
          const out = await feedTogglePostLike(backendId);
          setPostLikeMap((m) => ({ ...m, [id]: !!out.liked, [backendId]: !!out.liked }));
          setPostLikeCountMap((m) => ({
            ...m,
            [id]: Number(out.likes_count) || 0,
            [backendId]: Number(out.likes_count) || 0,
          }));
          void syncPostInteraction({
            postId: backendId,
            localPostId: id,
            liked: out.liked,
            likes_count: out.likes_count,
          });
        } catch {
          /* локальний лайк уже збережено */
        }
      })();
      return;
    }

    setActionBusyMap((m) => ({ ...m, [id]: true }));
    try {
      const resolvedId = await guardFeedInteraction(id, post.scope);
      if (!resolvedId) return;
      if (resolvedId !== id) remapFeedPostId(id, resolvedId);
      const prevLiked = !!postLikeMap[id] || !!postLikeMap[resolvedId];
      const prevCount = Number(postLikeCountMap[id] ?? postLikeCountMap[resolvedId]) || 0;
      const optimistic = prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1;
      const optimisticLiked = !prevLiked;
      rememberPostLikeState([id, resolvedId], { liked: optimisticLiked, likes_count: optimistic });
      setPostLikeMap((m) => ({ ...m, [id]: optimisticLiked, [resolvedId]: optimisticLiked }));
      setPostLikeCountMap((m) => ({ ...m, [id]: optimistic, [resolvedId]: optimistic }));
      try {
        const out = await feedTogglePostLike(resolvedId);
        setPostLikeMap((m) => ({ ...m, [id]: !!out.liked, [resolvedId]: !!out.liked }));
        setPostLikeCountMap((m) => ({ ...m, [id]: Number(out.likes_count) || 0, [resolvedId]: Number(out.likes_count) || 0 }));
        patchPostInFeedLists(resolvedId, {
          liked_by_viewer: !!out.liked,
          likes_count: Number(out.likes_count) || 0,
        });
        void syncPostInteraction({
          postId: resolvedId,
          localPostId: resolvedId !== id ? id : undefined,
          liked: out.liked,
          likes_count: out.likes_count,
        });
      } catch (e) {
        setPostLikeMap((m) => ({ ...m, [id]: prevLiked, [resolvedId]: prevLiked }));
        setPostLikeCountMap((m) => ({ ...m, [id]: prevCount, [resolvedId]: prevCount }));
        Alert.alert('', errorToUserText(e, language) || ft(language, 'feedActionFailed'));
      }
    } finally {
      setActionBusyMap((m) => ({ ...m, [id]: false }));
    }
  }, [postLikeMap, postLikeCountMap, guardFeedInteraction, patchPostInFeedLists, remapFeedPostId, actionBusyMap, language, user, syncPostInteraction]);

  const toggleRepost = useCallback(async (post) => {
    const id = String(post?.id || '');
    if (!id || actionBusyMap[id]) return;
    setActionBusyMap((m) => ({ ...m, [id]: true }));
    try {
      const resolvedId = await guardFeedInteraction(id, post.scope);
      if (!resolvedId) return;
      if (resolvedId !== id) remapFeedPostId(id, resolvedId);
      const prevReposted = !!postRepostMap[id] || !!postRepostMap[resolvedId];
      const prevCount = Number(postRepostCountMap[id] ?? postRepostCountMap[resolvedId]) || 0;
      const optimistic = prevReposted ? Math.max(0, prevCount - 1) : prevCount + 1;
      setPostRepostMap((m) => ({ ...m, [id]: !prevReposted, [resolvedId]: !prevReposted }));
      setPostRepostCountMap((m) => ({ ...m, [id]: optimistic, [resolvedId]: optimistic }));
      try {
        const out = await feedTogglePostRepost(resolvedId);
        setPostRepostMap((m) => ({ ...m, [id]: !!out.reposted, [resolvedId]: !!out.reposted }));
        setPostRepostCountMap((m) => ({ ...m, [id]: Number(out.reposts_count) || 0, [resolvedId]: Number(out.reposts_count) || 0 }));
        patchPostInFeedLists(resolvedId, {
          reposted_by_viewer: !!out.reposted,
          reposts_count: Number(out.reposts_count) || 0,
        });
      } catch (e) {
        setPostRepostMap((m) => ({ ...m, [id]: prevReposted, [resolvedId]: prevReposted }));
        setPostRepostCountMap((m) => ({ ...m, [id]: prevCount, [resolvedId]: prevCount }));
        Alert.alert('', errorToUserText(e, language) || ft(language, 'feedActionFailed'));
      }
    } finally {
      setActionBusyMap((m) => ({ ...m, [id]: false }));
    }
  }, [postRepostMap, postRepostCountMap, guardFeedInteraction, patchPostInFeedLists, remapFeedPostId, actionBusyMap, language]);

  const openComments = useCallback(async (post) => {
    const id = String(post?.id || '');
    if (!id || actionBusyMap[id]) return;
    setCommentModalPost(post);
    setCommentText('');

    if (isLocalFeedPostId(id)) {
      setCommentBusy(true);
      try {
        const list = await getLocalFeedPostComments(user, id);
        setCommentList(Array.isArray(list) ? list : []);
        const likeMap = {};
        (Array.isArray(list) ? list : []).forEach((c) => {
          likeMap[String(c.id)] = !!c.liked_by_viewer;
        });
        setCommentLikeMap(likeMap);
      } catch {
        setCommentList([]);
      } finally {
        setCommentBusy(false);
      }
      return;
    }

    setActionBusyMap((m) => ({ ...m, [id]: true }));
    setCommentList([]);
    setCommentLikeMap({});
    setCommentBusy(true);
    try {
      const resolvedId = await guardFeedInteraction(id, post.scope);
      if (!resolvedId) {
        setCommentModalPost(null);
        return;
      }
      if (resolvedId !== id) remapFeedPostId(id, resolvedId);
      setCommentModalPost({ ...post, id: resolvedId });
      const list = await feedListPostComments(resolvedId, 120);
      setCommentList(Array.isArray(list) ? list : []);
      const likeMap = {};
      (Array.isArray(list) ? list : []).forEach((c) => {
        const cid = String(c.id);
        likeMap[cid] = !!c.liked_by_viewer;
      });
      setCommentLikeMap(likeMap);
    } catch (e) {
      setCommentList([]);
      setCommentModalPost(null);
      Alert.alert('', errorToUserText(e, language) || ft(language, 'feedActionFailed'));
    } finally {
      setCommentBusy(false);
      setActionBusyMap((m) => ({ ...m, [id]: false }));
    }
  }, [guardFeedInteraction, remapFeedPostId, actionBusyMap, language, user]);

  const toggleCommentLike = useCallback(async (comment) => {
    const cid = String(comment?.id || '');
    if (!cid) return;
    const postId = String(commentModalPost?.id || '');

    if (isLocalFeedPostId(postId) || isLocalFeedCommentId(cid)) {
      const prevLiked = !!commentLikeMap[cid];
      setCommentLikeMap((m) => ({ ...m, [cid]: !prevLiked }));
      try {
        const out = await toggleLocalFeedPostCommentLike(user, postId, cid);
        setCommentLikeMap((m) => ({ ...m, [cid]: !!out.liked }));
        setCommentList((prev) =>
          prev.map((c) =>
            String(c.id) === cid
              ? { ...c, liked_by_viewer: !!out.liked, likes_count: Number(out.likes_count) || 0 }
              : c,
          ),
        );
      } catch {
        setCommentLikeMap((m) => ({ ...m, [cid]: prevLiked }));
      }
      return;
    }

    const resolvedId = await guardFeedInteraction(commentModalPost?.id, commentModalPost?.scope);
    if (!resolvedId) return;
    const prevLiked = !!commentLikeMap[cid];
    setCommentLikeMap((m) => ({ ...m, [cid]: !prevLiked }));
    try {
      const out = await feedToggleCommentLike(cid);
      setCommentLikeMap((m) => ({ ...m, [cid]: !!out.liked }));
      setCommentList((prev) =>
        prev.map((c) =>
          String(c.id) === cid
            ? { ...c, liked_by_viewer: !!out.liked, likes_count: Number(out.likes_count) || 0 }
            : c,
        ),
      );
    } catch (e) {
      setCommentLikeMap((m) => ({ ...m, [cid]: prevLiked }));
      Alert.alert('', errorToUserText(e, language) || ft(language, 'feedActionFailed'));
    }
  }, [commentLikeMap, commentModalPost?.id, commentModalPost?.scope, guardFeedInteraction, language, user]);

  const deleteComment = useCallback(async (comment) => {
    const cid = String(comment?.id || '');
    if (!cid) return;
    const postId = String(commentModalPost?.id || '');
    Alert.alert(
      ft(language, 'deleteCommentTitle'),
      ft(language, 'deleteCommentConfirm'),
      [
        { text: pf(language, 'cancel'), style: 'cancel' },
        {
          text: pf(language, 'delete'),
          style: 'destructive',
          onPress: async () => {
            if (isLocalFeedPostId(postId) || isLocalFeedCommentId(cid)) {
              setCommentBusy(true);
              try {
                await deleteLocalFeedPostComment(user, postId, cid);
                setCommentList((prev) => prev.filter((c) => String(c.id) !== cid));
                const nextCount = Math.max(0, (Number(postCommentCountMap[postId]) || 0) - 1);
                setPostCommentCountMap((m) => ({ ...m, [postId]: nextCount }));
                patchPostInFeedLists(postId, { comments_count: nextCount });
              } finally {
                setCommentBusy(false);
              }
              return;
            }
            setCommentBusy(true);
            try {
              await feedDeletePostComment(postId, cid);
              setCommentList((prev) => prev.filter((c) => String(c.id) !== cid));
              setPostCommentCountMap((m) => ({
                ...m,
                [postId]: Math.max(0, (Number(m[postId]) || 0) - 1),
              }));
              const nextCount = Math.max(0, (Number(postCommentCountMap[postId]) || 0) - 1);
              patchPostInFeedLists(postId, { comments_count: nextCount });
            } catch (e) {
              Alert.alert('', errorToUserText(e, language) || ft(language, 'feedActionFailed'));
            } finally {
              setCommentBusy(false);
            }
          },
        },
      ],
    );
  }, [commentModalPost?.id, language, postCommentCountMap, patchPostInFeedLists, user]);

  const sendComment = useCallback(async () => {
    const postId = String(commentModalPost?.id || '');
    const text = String(commentText || '').trim();
    if (!postId || !text || commentBusy) return;

    if (isLocalFeedPostId(postId)) {
      setCommentBusy(true);
      try {
        const row = await addLocalFeedPostComment(user, postId, {
          content: text,
          author: {
            userId: viewerUserId,
            displayName: profileMeDisplayName || user?.name || user?.email?.split('@')[0] || 'User',
            username: user?.username || '',
            avatarUrl: viewerAvatarUri || null,
          },
        });
        setCommentList((prev) => [...prev, row]);
        setCommentText('');
        const nextCount = (Number(postCommentCountMap[postId]) || 0) + 1;
        setPostCommentCountMap((m) => ({ ...m, [postId]: nextCount }));
        patchPostInFeedLists(postId, { comments_count: nextCount });
        void syncPostInteraction({ postId, comments_count: nextCount });
        void (async () => {
          try {
            const backendId = await resolveBackendFeedPostId(postId, { user });
            if (!isServerFeedPostId(backendId)) return;
            await feedAddPostComment(backendId, text);
            void syncPostInteraction({ postId: backendId, localPostId: postId, comments_count: nextCount });
          } catch {
            /* локальний коментар уже збережено */
          }
        })();
      } catch (e) {
        Alert.alert('', errorToUserText(e, language) || ft(language, 'feedActionFailed'));
      } finally {
        setCommentBusy(false);
      }
      return;
    }

    const resolvedId = await guardFeedInteraction(postId, commentModalPost?.scope);
    if (!resolvedId) return;
    setCommentBusy(true);
    try {
      const row = await feedAddPostComment(resolvedId, text);
      setCommentList((prev) => [...prev, row]);
      setCommentText('');
      const nextCount = (Number(postCommentCountMap[postId]) || 0) + 1;
      setPostCommentCountMap((m) => ({ ...m, [postId]: nextCount }));
      patchPostInFeedLists(postId, { comments_count: nextCount });
      rememberPostComment(
        resolvedId !== postId ? [resolvedId, postId] : [resolvedId],
        row,
      );
      rememberPostCommentsCount(
        resolvedId !== postId ? [resolvedId, postId] : [resolvedId],
        nextCount,
      );
      void syncPostInteraction({
        postId: resolvedId,
        localPostId: resolvedId !== postId ? postId : undefined,
        comments_count: nextCount,
      });
    } catch (e) {
      Alert.alert('', errorToUserText(e, language) || ft(language, 'feedActionFailed'));
    } finally {
      setCommentBusy(false);
    }
  }, [
    commentModalPost?.id,
    commentText,
    commentBusy,
    guardFeedInteraction,
    postCommentCountMap,
    patchPostInFeedLists,
    language,
    user,
    viewerUserId,
    profileMeDisplayName,
    viewerAvatarUri,
    syncPostInteraction,
  ]);

  const sharePost = useCallback((post) => {
    const link = Array.isArray(post.media_urls) && post.media_urls[0] ? String(post.media_urls[0]) : String(post.image || '');
    const body = [post.name, post.caption || post.place || ''].filter(Boolean).join(': ');
    Share.share({ message: [body, link].filter(Boolean).join('\n') }).catch(() => {});
  }, []);

  const sendPostToFriend = useCallback(async (post, asRoute = false) => {
    if (!hasMessageApiToken()) {
      Alert.alert('', ft(language, 'storyNeedLogin'));
      return;
    }
    const friends = await socialListMutuals();
    const rows = (Array.isArray(friends) ? friends : []).filter((u) => isNavigableSocialUsername(u.username)).slice(0, 8);
    if (!rows.length) {
      Alert.alert('', ft(language, 'postNoFriendsToShare'));
      return;
    }
    const title = asRoute ? ft(language, 'routeToFriend') : ft(language, 'postShareToFriend');
    Alert.alert(
      title,
      '',
      rows.map((u) => ({
        text: `@${u.username}`,
        onPress: async () => {
          try {
            const meta = await messagesOpenThread({ peerUserId: String(u.user_id || u.id || '') });
            const link = Array.isArray(post.media_urls) && post.media_urls[0] ? String(post.media_urls[0]) : '';
            const routeTitle = post.route_plan ? routeRegionTitle(language, post.route_plan) : post.place || '';
            const body = asRoute
              ? `${ft(language, 'routeLine')}: ${routeTitle}\n${ft(language, 'shareKrainaRoute').replace(/\{title\}/g, routeTitle || 'Route')}\n${link}\nМожемо піти разом?`
              : `${post.name}: ${post.caption || ''}\n${link}`;
            await messagesSendText(meta.id, body.trim());
            Alert.alert('', ft(language, 'postSharedOk'));
          } catch {
            /* */
          }
        },
      })).concat([{ text: pf(language, 'cancel'), style: 'cancel' }]),
    );
  }, [language]);

  const trayStoriesFiltered = useMemo(
    () => trayStories.filter((s) => shouldShowStoryInFeedTray(s)),
    [trayStories],
  );

  const storyItems = useMemo(() => {
    const rows = [{ type: 'add', key: 'add' }];
    const devicePreview = deviceGalleryLatest?.thumbUri || deviceGalleryLatest?.uri || '';
    if (devicePreview) {
      rows[0] = { type: 'add', key: 'add', devicePreviewUri: devicePreview };
    }
    if (userStory?.uri && !trayStoriesFiltered.some((s) => String(s.user_id) === viewerUserId)) {
      rows.push({ type: 'local', key: 'local', uri: userStory.uri, has_unviewed: true, story_count: 1 });
    } else if (
      devicePreview &&
      !userStory?.uri &&
      !trayStoriesFiltered.some((s) => String(s.user_id) === viewerUserId)
    ) {
      rows.push({
        type: 'local',
        key: 'device_preview',
        uri: devicePreview,
        has_unviewed: true,
        story_count: deviceGalleryItems.length || 1,
        fromDeviceGallery: true,
      });
    }
    trayStoriesFiltered.forEach((s) => {
      rows.push({ ...s, type: 'tray', key: s.id });
    });
    return rows;
  }, [userStory, trayStoriesFiltered, viewerUserId, deviceGalleryLatest, deviceGalleryItems.length]);

  const tabBottomPad = lightTabBarScrollContentPadding(insets.bottom, 24);

  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
      <MemoFeedHeader
        appTheme={appTheme}
        insetsTop={insets.top}
        onAdd={openCreate}
        onMessages={openChats}
      />
      <RenderProfiler id="FeedPage:FlashList">
      <FlashList
        style={styles.scroll}
        data={posts}
        keyExtractor={(post) => String(post.id)}
        estimatedItemSize={450}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: tabBottomPad,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
        ListHeaderComponent={
          <>
        <FlatList
          horizontal
          data={storyItems}
          keyExtractor={(it) => it.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.storiesRow}
          decelerationRate="fast"
          snapToInterval={108}
          snapToAlignment="start"
          disableIntervalMomentum
          windowSize={3}
          maxToRenderPerBatch={4}
          removeClippedSubviews={Platform.OS === 'android'}
          initialNumToRender={4}
          renderItem={({ item }) => {
            if (item.type === 'add') {
              return (
                <Pressable
                  onPress={openCreate}
                  style={({ pressed }) => [styles.storyCreateCard, pressed && { opacity: 0.88 }]}
                  accessibilityRole="button"
                  accessibilityLabel={ft(language, 'createStory')}
                >
                  {item.devicePreviewUri ? (
                    <ExpoImage
                      source={{ uri: item.devicePreviewUri }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={0}
                    />
                  ) : null}
                  {item.devicePreviewUri ? (
                    <View style={styles.storyCreateDim} pointerEvents="none" />
                  ) : null}
                  <View style={[styles.storyCreateBorder, { borderColor: accent }]} />
                  <Ionicons name="add" size={32} color={accent} />
                </Pressable>
              );
            }
            if (item.type === 'local') {
              return (
                <Pressable
                  style={({ pressed }) => [styles.storyCard, pressed && { opacity: 0.88 }]}
                  onPress={item.fromDeviceGallery ? openCreate : openLocalStories}
                >
                  <ExpoImage source={{ uri: item.uri }} style={styles.storyImage} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                  <View
                    style={[
                      styles.storyAvatarWrap,
                      storyAvatarRingStyle({
                        hasStories: true,
                        hasUnviewed: item.has_unviewed !== false,
                        isLight,
                      }),
                    ]}
                  >
                    <ProfileAvatarCircle uri={viewerAvatarUri} size={STORY_TRAY_AVATAR_INNER} isLight={isLight} />
                  </View>
                </Pressable>
              );
            }
            const row = item;
            if (item.type !== 'tray') return null;
            const storyCount = Number(row.story_count) || 1;
            return (
              <Pressable
                style={({ pressed }) => [styles.storyCard, pressed && { opacity: 0.85 }]}
                onPress={() => openStoryForUser(row)}
              >
                <ExpoImage
                  source={{ uri: resolveFeedMediaUrl(row.media_url) }}
                  style={styles.storyImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={0}
                />
                {storyCount > 1 ? (
                  <View style={[styles.storyCountBadge, { backgroundColor: accent }]}>
                    <Text style={[styles.storyCountBadgeTxt, { color: onAccentTxt }]}>{storyCount}</Text>
                  </View>
                ) : null}
                <View
                  style={[
                    styles.storyAvatarWrap,
                    storyAvatarRingStyle({
                      hasStories: true,
                      hasUnviewed: row.has_unviewed !== false,
                      isLight,
                    }),
                  ]}
                >
                  <ProfileAvatarCircle
                    uri={
                      String(row.user_id) === viewerUserId
                        ? viewerAvatarUri ||
                          (row.avatar_url ? resolveFeedMediaUrl(String(row.avatar_url)) : '')
                        : row.avatar_url
                          ? resolveFeedMediaUrl(String(row.avatar_url))
                          : ''
                    }
                    size={STORY_TRAY_AVATAR_INNER}
                    isLight={isLight}
                  />
                </View>
              </Pressable>
            );
          }}
        />

        <View
          style={[
            styles.feedTabsBleed,
            {
              borderBottomColor: isLight ? 'rgba(30, 30, 30, 0.1)' : 'rgba(255, 255, 255, 0.1)',
            },
          ]}
        >
          <View style={styles.feedTabsRow}>
            <Pressable
              onPress={() => setSegment('friends')}
              style={({ pressed }) => [styles.feedTab, pressed && styles.pressedIOS]}
              android_ripple={ripple}
            >
              <Text
                style={[
                  styles.feedTabText,
                  {
                    color: segment === 'friends' ? textMain : textMuted,
                    fontWeight: segment === 'friends' ? '800' : '500',
                    opacity: segment === 'friends' ? 1 : 0.72,
                  },
                ]}
              >
                {ft(language, 'friends')}
              </Text>
              <View style={styles.feedTabIndicatorTrack}>
                {segment === 'friends' ? (
                  <View style={[styles.feedTabIndicator, { backgroundColor: accent }]} />
                ) : (
                  <View style={styles.feedTabIndicatorSpacer} />
                )}
              </View>
            </Pressable>
            <Pressable
              onPress={() => setSegment('world')}
              style={({ pressed }) => [styles.feedTab, pressed && styles.pressedIOS]}
              android_ripple={ripple}
            >
              <Text
                style={[
                  styles.feedTabText,
                  {
                    color: segment === 'world' ? textMain : textMuted,
                    fontWeight: segment === 'world' ? '800' : '500',
                    opacity: segment === 'world' ? 1 : 0.72,
                  },
                ]}
              >
                {ft(language, 'world')}
              </Text>
              <View style={styles.feedTabIndicatorTrack}>
                {segment === 'world' ? (
                  <View style={[styles.feedTabIndicator, { backgroundColor: accent }]} />
                ) : (
                  <View style={styles.feedTabIndicatorSpacer} />
                )}
              </View>
            </Pressable>
          </View>
        </View>
          </>
        }
        ListEmptyComponent={
          showFeedEmpty ? (
            <FeedEmptyPlaceholder
              segment={segment}
              language={language}
              isLight={isLight}
              textMain={textMain}
              textMuted={textMuted}
              accent={accent}
              onAccentTxt={onAccentTxt}
              onCreate={openCreate}
              onFindFriends={openFindFriends}
              ripple={ripple}
            />
          ) : null
        }
        renderItem={({ item: post }) => {
          const routeTitle = post.route_plan ? routeRegionTitle(language, post.route_plan) : '';
          const placeLine = routeTitle
            ? `${ft(language, 'routeLine')}: ${routeTitle}`
            : String(post.place || '').trim();
          const captionLine = post.caption
            ? post.caption
            : placeLine
              ? `${ft(language, 'feedWasToday')} ${placeLine}…`
              : '';
          const timeLabel = formatFeedPostAge(post.createdAtMs, language);
          return (
          <View
            style={[
              styles.postCard,
              {
                backgroundColor: isLight ? CARD_LIGHT : CARD_DARK,
                borderColor: isLight ? 'rgba(30,30,30,0.06)' : 'rgba(255,255,255,0.06)',
              },
            ]}
          >
            <View style={styles.postHead}>
              <ProfileAvatarCircle
                uri={
                  (post.authorUserId && post.authorUserId === viewerUserId && viewerAvatarUri) ||
                  post.avatarUrl ||
                  ''
                }
                size={36}
                isLight={isLight}
                style={styles.postAvatar}
              />
              <View style={styles.postHeadText}>
                <Text style={[styles.postName, { color: textMain }]}>{post.name}</Text>
                {placeLine ? (
                  <Text style={[styles.postPlace, { color: textMuted }]} numberOfLines={2}>
                    {placeLine}
                  </Text>
                ) : null}
              </View>
              <Pressable hitSlop={8} style={({ pressed }) => pressed && styles.pressedIOS}>
                <Ionicons name="ellipsis-vertical" size={18} color={textMuted} />
              </Pressable>
            </View>
            <MemoPostMediaCarousel post={post} accent={accent} />
            <View style={[styles.postActionsDivider, { backgroundColor: isLight ? 'rgba(30,30,30,0.06)' : 'rgba(255,255,255,0.08)' }]} />
            <View style={styles.postActions}>
              <View style={styles.postActionsLeft}>
                <Pressable
                  onPress={() => toggleLike(post)}
                  style={({ pressed }) => [styles.actionPress, pressed && styles.actionPressActive]}
                  hitSlop={6}
                >
                  <Ionicons
                    name={postLikeMap[String(post.id)] ? 'heart' : 'heart-outline'}
                    size={24}
                    color={postLikeMap[String(post.id)] ? '#FF4D6A' : textMain}
                    style={styles.actionIcon}
                  />
                  {(Number(postLikeCountMap[String(post.id)]) || 0) > 0 ? (
                    <Text style={[styles.actionCount, { color: textMuted }]}>
                      {Number(postLikeCountMap[String(post.id)]) || 0}
                    </Text>
                  ) : null}
                </Pressable>
                <Pressable
                  onPress={() => openComments(post)}
                  style={({ pressed }) => [styles.actionPress, pressed && styles.actionPressActive]}
                  hitSlop={6}
                >
                  <Ionicons name="chatbubble-outline" size={22} color={textMain} style={styles.actionIcon} />
                  {(Number(postCommentCountMap[String(post.id)]) || 0) > 0 ? (
                    <Text style={[styles.actionCount, { color: textMuted }]}>
                      {Number(postCommentCountMap[String(post.id)]) || 0}
                    </Text>
                  ) : null}
                </Pressable>
                <Pressable
                  onPress={() => sharePost(post)}
                  style={({ pressed }) => [styles.actionPress, pressed && styles.actionPressActive]}
                  hitSlop={6}
                >
                  <Ionicons name="paper-plane-outline" size={21} color={textMain} style={styles.actionIcon} />
                </Pressable>
              </View>
              <View style={styles.postActionsRight}>
                <Pressable
                  onPress={() => openPostRoute(post)}
                  style={({ pressed }) => [
                    styles.routeBtn,
                    isLight ? styles.routeBtnLight : styles.routeBtnFeedDark,
                    { opacity: pressed ? 0.88 : 1 },
                  ]}
                >
                  <Text
                    style={[
                      styles.routeBtnText,
                      isLight ? styles.routeBtnTextOnLight : styles.routeBtnTextFeedDark,
                    ]}
                  >
                    {ft(language, 'route')}
                  </Text>
                  <Ionicons
                    name="return-down-back-outline"
                    size={16}
                    color={isLight ? '#1E1E1E' : '#1E1E1E'}
                  />
                </Pressable>
                <Pressable
                  onPress={() => Alert.alert('', ft(language, 'feedBookmarkSoon'))}
                  style={({ pressed }) => [styles.bookmarkBtn, pressed && styles.actionPressActive]}
                  hitSlop={8}
                >
                  <Ionicons name="bookmark-outline" size={22} color={textMain} />
                </Pressable>
              </View>
            </View>
            {captionLine || timeLabel ? (
              <View style={styles.postCaptionWrap}>
                {captionLine ? (
                  <Text style={[styles.postCaption, { color: textMain }]} numberOfLines={3}>
                    <Text style={styles.postCaptionAuthor}>{post.name} </Text>
                    {captionLine}
                  </Text>
                ) : null}
                {timeLabel ? (
                  <Text style={[styles.postTime, { color: textMuted }]}>{timeLabel}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
          );
        }}
      />
      </RenderProfiler>
      <Modal visible={!!commentModalPost} transparent animationType="slide" onRequestClose={() => setCommentModalPost(null)}>
        <KeyboardAvoidingView
          style={styles.commentsModalBg}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.commentsModalBackdrop} onPress={() => setCommentModalPost(null)} />
          <View
            style={[
              styles.commentsModalCard,
              {
                backgroundColor: isLight ? '#FFFFFF' : '#1A1A1A',
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <View style={styles.commentsModalHandle} />
            <View style={styles.commentsModalHeader}>
              <ProfileAvatarCircle
                uri={commentModalPost?.avatarUrl || viewerAvatarUri || ''}
                size={32}
                isLight={isLight}
              />
              <Text style={[styles.commentsModalTitle, { color: textMain }]}>{ft(language, 'postCommentsTitle')}</Text>
              <Pressable onPress={() => setCommentModalPost(null)} hitSlop={12} style={styles.commentsModalCloseBtn}>
                <Ionicons name="close" size={22} color={textMuted} />
              </Pressable>
            </View>
            {commentBusy ? (
              <View style={styles.commentsLoadingWrap}>
                <ActivityIndicator color={accent} />
              </View>
            ) : (
              <ScrollView style={styles.commentsScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {!commentList.length ? (
                  <Text style={[styles.commentsEmpty, { color: textMuted }]}>{ft(language, 'postCommentsEmpty')}</Text>
                ) : null}
                {commentList.map((c) => {
                  const cid = String(c.id);
                  const liked = !!commentLikeMap[cid];
                  return (
                    <View key={cid} style={[styles.commentRow, { borderBottomColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }]}>
                      <ProfileAvatarCircle
                        uri={c.avatar_url ? resolveFeedMediaUrl(String(c.avatar_url)) : ''}
                        size={30}
                        isLight={isLight}
                        style={styles.commentAvatar}
                      />
                      <View style={styles.commentBody}>
                        <View style={styles.commentHead}>
                          <Text style={[styles.commentAuthor, { color: textMain }]} numberOfLines={1}>
                            @{c.username || 'user'}
                          </Text>
                          <View style={styles.commentHeadActions}>
                            {(viewerUserId === String(c.user_id || '') ||
                              viewerUserId === String(commentModalPost?.authorUserId || '')) ? (
                              <Pressable onPress={() => deleteComment(c)} hitSlop={10} style={styles.commentDeleteBtn}>
                                <Ionicons name="trash-outline" size={14} color={textMuted} />
                              </Pressable>
                            ) : null}
                            <Pressable onPress={() => toggleCommentLike(c)} hitSlop={8} style={styles.commentLikeBtn}>
                              <Ionicons
                                name={liked ? 'heart' : 'heart-outline'}
                                size={14}
                                color={liked ? '#FF4D6A' : textMuted}
                              />
                              {(Number(c.likes_count) || 0) > 0 ? (
                                <Text style={[styles.commentLikeCount, { color: textMuted }]}>
                                  {Number(c.likes_count) || 0}
                                </Text>
                              ) : null}
                            </Pressable>
                          </View>
                        </View>
                        <Text style={[styles.commentText, { color: textMain }]}>{c.content}</Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
            <View style={[styles.commentComposer, { backgroundColor: isLight ? '#F4F4F0' : '#242424' }]}>
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder={ft(language, 'postCommentPlaceholder')}
                placeholderTextColor={textMuted}
                style={[styles.commentInput, { color: textMain }]}
                multiline
                maxLength={500}
              />
              <Pressable
                onPress={sendComment}
                disabled={!String(commentText || '').trim() || commentBusy}
                style={[
                  styles.commentSend,
                  {
                    backgroundColor: String(commentText || '').trim() ? accent : isLight ? '#D8D8D0' : '#333',
                  },
                ]}
              >
                <Ionicons name="send" size={18} color={String(commentText || '').trim() ? onAccentButtonText(isLight) : textMuted} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  feedHeaderWrap: {},
  feedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  feedHeaderSide: {
    width: 62,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 18,
  },
  feedHeaderSideRight: {
    alignItems: 'flex-end',
    paddingLeft: 0,
    paddingRight: 18,
  },
  feedHeaderCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 22,
  },
  addHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendImg: { width: 20, height: 18 },
  pressedIOS: { opacity: 0.65 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 12 },
  feedTabsBleed: {
    marginHorizontal: -18,
    marginTop: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  feedTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
  },
  feedTab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 2,
  },
  feedTabText: {
    fontSize: 15,
    letterSpacing: 0.2,
  },
  feedTabIndicatorTrack: {
    marginTop: 8,
    height: 3,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  feedTabIndicator: {
    width: 36,
    height: 3,
    borderRadius: 2,
  },
  feedTabIndicatorSpacer: {
    width: 36,
    height: 3,
    opacity: 0,
  },
  feedEmptyWrap: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 32,
  },
  feedEmptyStage: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  feedEmptyPhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 118,
    marginBottom: 26,
    paddingHorizontal: 8,
  },
  feedEmptyPhoto: {
    width: 74,
    height: 98,
    borderRadius: 16,
    borderWidth: 2.5,
  },
  feedEmptyPhotoCenter: {
    width: 84,
    height: 108,
    borderRadius: 18,
  },
  feedEmptyTitle: {
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.5,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: 12,
  },
  feedEmptyHint: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
    opacity: 0.88,
  },
  feedEmptyCta: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
  },
  feedEmptyCtaTxt: { fontSize: 16, fontWeight: '800' },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  postsSectionTitle: {
    marginTop: 2,
    marginBottom: 8,
  },
  storiesRow: { gap: 12, paddingBottom: 12, paddingRight: 8, marginBottom: 4 },
  storyCard: {
    width: 96,
    height: 152,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#222',
  },
  storyCreateCard: {
    width: 96,
    height: 152,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  storyCreateBorder: {
    position: 'absolute',
    left: 1,
    top: 1,
    right: 1,
    bottom: 1,
    borderRadius: 17,
    borderWidth: 2,
    borderStyle: 'dashed',
    opacity: 0.6,
  },
  storyCreateDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  storyImage: { width: '100%', height: '100%' },
  storyAvatarWrap: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: STORY_TRAY_AVATAR_WRAP,
    height: STORY_TRAY_AVATAR_WRAP,
    borderRadius: STORY_TRAY_AVATAR_WRAP / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#444',
  },
  storyAvatar: { width: '100%', height: '100%' },
  storyCountBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyCountBadgeTxt: { fontSize: 11, fontWeight: '800' },
  postCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  postHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  postAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 9 },
  postHeadText: { flex: 1 },
  postName: { fontSize: 14, fontWeight: '700' },
  postPlace: { fontSize: 12, marginTop: 1 },
  postImage: { width: '100%', aspectRatio: 1.36, backgroundColor: '#111' },
  postMediaDots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  postMediaDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.72)',
    opacity: 0.55,
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  postActionsDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 12,
  },
  postSyncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  postSyncBannerTxt: {
    fontSize: 12,
    fontWeight: '500',
  },
  postActionsLeft: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  postActionsRight: { flexDirection: 'row', alignItems: 'center' },
  actionPress: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  actionPressActive: { opacity: 0.65 },
  actionCount: { fontSize: 13, fontWeight: '600', marginLeft: 2, minWidth: 14 },
  actionIcon: { marginRight: 0 },
  routeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  routeBtnLight: {
    backgroundColor: '#F2F2EA',
  },
  routeBtnFeedDark: {
    backgroundColor: '#FFFFFF',
  },
  routeBtnText: { fontSize: 13, fontWeight: '700' },
  routeBtnTextOnLight: { color: '#1E1E1E' },
  routeBtnTextFeedDark: { color: '#1E1E1E' },
  bookmarkBtn: {
    marginLeft: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  postCaptionWrap: {
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  postCaption: {
    fontSize: 14,
    lineHeight: 20,
  },
  postTime: {
    fontSize: 12,
    marginTop: 6,
    lineHeight: 16,
  },
  postCaptionAuthor: { fontWeight: '700' },
  commentsModalBg: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  commentsModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  commentsModalCard: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 8,
    paddingHorizontal: 16,
    maxHeight: '78%',
  },
  commentsModalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.45)',
    marginBottom: 12,
  },
  commentsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  commentsModalTitle: { flex: 1, fontSize: 17, fontWeight: '800' },
  commentsModalCloseBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentsLoadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 10,
  },
  commentsLoadingTxt: { fontSize: 13 },
  commentsScroll: { maxHeight: 300, marginBottom: 10 },
  commentsEmpty: {
    textAlign: 'center',
    fontSize: 14,
    paddingVertical: 24,
    lineHeight: 20,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commentAvatar: { marginRight: 10, marginTop: 2 },
  commentBody: { flex: 1 },
  commentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commentAuthor: { fontSize: 13, fontWeight: '700', flex: 1 },
  commentHeadActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commentDeleteBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  commentLikeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingLeft: 8,
  },
  commentLikeCount: { fontSize: 11, marginLeft: 2 },
  commentText: { fontSize: 14, lineHeight: 20, marginTop: 3, paddingRight: 8 },
  commentComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  commentInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 96,
    fontSize: 15,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
  },
  commentSend: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
