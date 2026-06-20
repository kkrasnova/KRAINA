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
  Image,
  Platform,
  Alert,
  Share,
  Linking,
  Modal,
  TextInput,
  ActivityIndicator,
  DeviceEventEmitter,
  useWindowDimensions,
} from 'react-native';

import { Video, ResizeMode } from './expoAvCompat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { getAppTheme, THEME_CHANGED_EVENT } from './themeStorage';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { RenderProfiler, markEnd } from './performanceMetrics';
import { ft } from './feedI18n';
import { pf } from './profileI18n';
import { routeRegionTitle } from './routePlanTitles';
import { getUserFeedPosts, getLatestUserStory } from './feedLocalStorage';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { accentForTheme, onAccentButtonText, ACCENT_BLUE, ACCENT_LEMON } from './themeAccent';
import { brandFontHeadMedium } from './brandFont';
import {
  hasFeedApiToken,
  feedListFriendsPosts,
  feedListWorldPosts,
  feedListStoriesTray,
  feedTogglePostLike,
  feedListPostComments,
  feedAddPostComment,
} from './feedApi';
import { resolveFeedMediaUrl } from './feedMediaUrl';
import { hydrateRoutePlan } from './profileStorage';
import { hasMessageApiToken, messagesOpenThread, messagesSendText, socialListMutuals } from './messageApi';
import { useAuthStore } from './auth/authStore';
import { emitFeedMediaUpdated, KRAINA_FEED_MEDIA_UPDATED } from './feedSyncEvents';

const CARD_LIGHT = '#FFFFFF';
const CARD_DARK = '#141414';

const AVATAR = require('./assets/person-12.png');

const FEED_EMPTY_FRIENDS_PHOTOS = [
  require('./assets/carousel/photo-1580072624564-1fe6b660b7e2.jpg'),
  require('./assets/carousel/photo-1615119449152-d94284eafa45.jpg'),
  require('./assets/carousel/photo-1630227286297-f7cc7c97f415.jpg'),
];

const FEED_EMPTY_WORLD_PHOTOS = [
  require('./assets/carousel/premium_photo-1676319876974-3c9759cb8c4a.jpg'),
  require('./assets/carousel/photo-1518684079-3c830dcef090.jpg'),
  require('./assets/carousel/premium_photo-1689371089286-6f75a9ecd4ca.jpg'),
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
              <Image
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
                resizeMode="cover"
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

function storyAvatarRingStyle(story, viewerId, isLight) {
  if (!story) return { borderWidth: 0 };
  const own = viewerId && String(story.user_id) === String(viewerId);
  const bright = own ? (Number(story.view_count) || 0) === 0 : !story.seen_by_viewer;
  if (isLight) {
    return {
      borderWidth: 3,
      borderColor: bright ? ACCENT_BLUE : 'rgba(2, 18, 235, 0.38)',
    };
  }
  return {
    borderWidth: 3,
    borderColor: bright ? ACCENT_LEMON : 'rgba(225, 255, 0, 0.45)',
  };
}

const MemoFeedHeader = React.memo(function MemoFeedHeader({ appTheme, insetsTop, onAdd, onMessages }) {
  const isLight = appTheme === 'light';
  const sendIcon = isLight
    ? require('./assets/15.png')
    : require('./assets/11221.png');
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const iconColor = isLight ? '#1E1E1E' : '#FFFFFF';

  return (
    <View
      style={[
        styles.feedHeaderWrap,
        {
          paddingTop: insetsTop,
          backgroundColor: isLight ? LIGHT_BAR_BG : APP_SCREEN_BG,
          borderBottomColor: isLight ? 'rgba(30, 30, 30, 0.1)' : 'rgba(255, 255, 255, 0.08)',
        },
      ]}
    >
      <View style={styles.feedHeaderRow}>
        <View style={styles.feedHeaderSide}>
          <Pressable
            onPress={onAdd}
            hitSlop={12}
            style={({ pressed }) => [
              styles.addCircle,
              { borderColor: isLight ? '#000000' : '#FFFFFF', borderWidth: 1.5 },
              pressed && styles.pressedIOS,
            ]}
            android_ripple={ripple}
            accessibilityRole="button"
            accessibilityLabel="Add"
          >
            <Ionicons name="add" size={22} color={iconColor} />
          </Pressable>
        </View>
        <View style={styles.feedHeaderCenter} pointerEvents="none" />
        <View style={[styles.feedHeaderSide, styles.feedHeaderSideRight]}>
          <Pressable
            onPress={onMessages}
            hitSlop={12}
            style={({ pressed }) => [styles.msgHit, pressed && styles.pressedIOS]}
            android_ripple={ripple}
            accessibilityRole="button"
            accessibilityLabel="Messages"
          >
            <Image source={sendIcon} style={styles.sendImg} resizeMode="contain" accessibilityIgnoresInvertColors />
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
      <Image
        source={post?.isUri ? { uri: post?.image } : post?.image}
        style={slideStyle}
        resizeMode="cover"
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
      <Image source={{ uri: one }} style={slideStyle} resizeMode="cover" />
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
            <Image source={{ uri: u }} style={slideStyle} resizeMode="cover" />
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

export default function FeedPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  const [segment, setSegment] = useState('friends');
  const [userPosts, setUserPosts] = useState([]);
  const [userStory, setUserStory] = useState(null);
  const [apiFriendsPosts, setApiFriendsPosts] = useState(null);
  const [apiWorldPosts, setApiWorldPosts] = useState(null);
  const [trayStories, setTrayStories] = useState([]);
  const feedApiCache = useRef({});
  const FEED_API_CACHE_TTL = 120000;
  const FEED_CACHE_KEY = 'feed_main';
  const [postLikeMap, setPostLikeMap] = useState({});
  const [postLikeCountMap, setPostLikeCountMap] = useState({});
  const [postCommentCountMap, setPostCommentCountMap] = useState({});
  const [commentModalPost, setCommentModalPost] = useState(null);
  const [commentList, setCommentList] = useState([]);
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentText, setCommentText] = useState('');

  const user = route?.params?.user;
  const profileMeUserId = useAuthStore((s) => s.profileMe?.profile?.user_id);
  const viewerUserId = profileMeUserId ? String(profileMeUserId) : String(user?.id || '');

  /** При події оновлення медіа (новий пост, лайк, коментар) — чистимо кеш, щоб стрічка оновилася при наступному фокусі. */
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_FEED_MEDIA_UPDATED, () => {
      if (__DEV__) console.log('[Cache] FeedPage media updated — cache cleared');
      feedApiCache.current = {};
    });
    return () => sub.remove();
  }, []);

  const fetchApiFeed = useCallback(async () => {
    if (!hasFeedApiToken()) return null;
    try {
      const [fp, wp, st] = await Promise.all([
        feedListFriendsPosts(50),
        feedListWorldPosts(50),
        feedListStoriesTray(),
      ]);
      return { fp: Array.isArray(fp) ? fp : [], wp: Array.isArray(wp) ? wp : [], st: Array.isArray(st) ? st : [] };
    } catch {
      return null;
    }
  }, []);

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
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!user?.id && !user?.firebaseUid && !user?.email) return;
        const [posts, story] = await Promise.all([getUserFeedPosts(user), getLatestUserStory(user)]);
        if (!cancelled) {
          setUserPosts(posts);
          setUserStory(story);
        }

        // Кеш для API-даних (friends + world + stories tray)
        const cached = feedApiCache.current[FEED_CACHE_KEY];
        const cacheFresh = cached && Date.now() - cached.at < FEED_API_CACHE_TTL;

        // Fresh cache → використати, без API-запиту
        if (!cancelled && cacheFresh) {
          if (__DEV__) console.log(`[Cache] FeedPage HIT fresh age=${Date.now() - cached.at}ms`);
          applyApiResult(cached.data);
          markEnd('feed_interactive');
          return;
        }

        // Stale cache → показати негайно, фонова ревалідація
        if (!cancelled && cached) {
          if (__DEV__) console.log(`[Cache] FeedPage STALE hit age=${Date.now() - cached.at}ms — background revalidation`);
          applyApiResult(cached.data);
          markEnd('feed_interactive');
        } else if (__DEV__ && !cancelled) {
          console.log(`[Cache] FeedPage MISS`);
        }

        if (cancelled) return;

        const apiResult = await fetchApiFeed();
        if (cancelled) return;

        if (apiResult) {
          feedApiCache.current[FEED_CACHE_KEY] = { at: Date.now(), data: apiResult };
          applyApiResult(apiResult);
          if (__DEV__) console.log(`[Cache] FeedPage refreshed from API`);
        } else if (!cached) {
          // No cache and API failed — set null
          applyApiResult(null);
        }
        markEnd('feed_interactive');
      })();
      return () => {
        cancelled = true;
      };
    }, [user?.id, user?.firebaseUid, user?.email, fetchApiFeed, applyApiResult]),
  );

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

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const onAccentTxt = onAccentButtonText(isLight);
  const bg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
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
      const mediaUrls = Array.isArray(p.media_urls) ? p.media_urls.filter(Boolean).map(String) : [];
      const url = mediaUrls[0] || '';
      const isVid = /\.(mp4|mov)(\?|$)/i.test(String(url));
      return {
        id: p.id,
        authorUserId: p.user_id ? String(p.user_id) : '',
        scope: p.visibility === 'public' ? 'world' : 'friends',
        name: p.username || '—',
        place: p.place_label || '—',
        image: url,
        media_urls: mediaUrls,
        isUri: true,
        isVideo: isVid,
        avatarUrl: p.avatar_url || null,
        caption: p.content_text || '',
        route_plan: p.route_plan || null,
        lat: p.lat != null ? Number(p.lat) : null,
        lng: p.lng != null ? Number(p.lng) : null,
        likedByViewer: Boolean(p.liked_by_viewer),
        likesCount: Number(p.likes_count) || 0,
        commentsCount: Number(p.comments_count) || 0,
      };
    };
    const apiList = segment === 'world' ? apiWorldPosts : apiFriendsPosts;
    if (apiList && apiList.length) {
      return apiList.map(mapApi);
    }
    const local = userPosts.map((p) => ({
      id: p.id,
      scope: 'friends',
      name: displayName,
      place: p.place || '—',
      image: p.uris?.[0] || p.uri,
      media_urls: Array.isArray(p.uris) && p.uris.length ? p.uris : p.uri ? [p.uri] : [],
      isUri: true,
      isVideo: /\.(mp4|mov)(\?|$)/i.test(String(p.uris?.[0] || p.uri || '')),
      avatarUrl: null,
      caption: p.caption || '',
      route_plan: p.route_plan || null,
      lat: p.lat != null ? Number(p.lat) : null,
      lng: p.lng != null ? Number(p.lng) : null,
      likedByViewer: false,
      likesCount: 0,
      commentsCount: 0,
    }));
    return local;
  }, [userPosts, segment, user, language, apiFriendsPosts, apiWorldPosts]);

  const feedReady = !hasFeedApiToken() || (segment === 'world' ? apiWorldPosts : apiFriendsPosts) !== null;
  const showFeedEmpty = posts.length === 0 && feedReady;

  useEffect(() => {
    const nextLike = {};
    const nextLikeCount = {};
    const nextCommentCount = {};
    posts.forEach((p) => {
      const id = String(p.id);
      nextLike[id] = postLikeMap[id] != null ? postLikeMap[id] : !!p.likedByViewer;
      nextLikeCount[id] = Number.isFinite(Number(postLikeCountMap[id]))
        ? Number(postLikeCountMap[id])
        : Number(p.likesCount) || 0;
      nextCommentCount[id] = Number.isFinite(Number(postCommentCountMap[id]))
        ? Number(postCommentCountMap[id])
        : Number(p.commentsCount) || 0;
    });
    setPostLikeMap(nextLike);
    setPostLikeCountMap(nextLikeCount);
    setPostCommentCountMap(nextCommentCount);
  }, [posts]);

  const openChats = () => navigation.navigate('Chats', shell);
  const openCreate = useCallback(
    () =>
      navigation.navigate('FeedCamera', {
        ...shell,
        publishVisibility: segment === 'world' ? 'public' : 'followers',
        cameraInitialMode: segment === 'world' ? 'post' : 'story',
      }),
    [navigation, shell, segment],
  );

  const openFindFriends = useCallback(
    () => navigation.navigate('DiscoverPeople', shell),
    [navigation, shell],
  );

  const openStoryForUser = useCallback(
    (row) => {
      if (!row?.user_id) return;
      navigation.navigate('FeedStoryViewer', {
        user,
        language,
        appTheme: appTheme === 'light' ? 'light' : 'dark',
        ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
        userId: String(row.user_id),
        storyId: row.id,
        authorUsername: row.username || '',
        authorAvatarUrl: row.avatar_url || null,
        ...(row.display_name && String(row.display_name).trim()
          ? { authorDisplayName: String(row.display_name).trim() }
          : {}),
      });
    },
    [navigation, user, language, appTheme, route?.params?.countryId],
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
      ...(user?.name && String(user.name).trim() ? { authorDisplayName: String(user.name).trim() } : {}),
    });
  }, [navigation, user, language, appTheme, route?.params?.countryId, viewerUserId]);

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

  const toggleLike = useCallback(async (post) => {
    const id = String(post?.id || '');
    if (!id) return;
    const prevLiked = !!postLikeMap[id];
    const prevCount = Number(postLikeCountMap[id]) || 0;
    const optimistic = prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1;
    setPostLikeMap((m) => ({ ...m, [id]: !prevLiked }));
    setPostLikeCountMap((m) => ({ ...m, [id]: optimistic }));
    try {
      const out = await feedTogglePostLike(id);
      setPostLikeMap((m) => ({ ...m, [id]: !!out.liked }));
      setPostLikeCountMap((m) => ({ ...m, [id]: Number(out.likes_count) || 0 }));
      emitFeedMediaUpdated({ postId: id });
    } catch {
      setPostLikeMap((m) => ({ ...m, [id]: prevLiked }));
      setPostLikeCountMap((m) => ({ ...m, [id]: prevCount }));
    }
  }, [postLikeMap, postLikeCountMap]);

  const openComments = useCallback(async (post) => {
    const id = String(post?.id || '');
    if (!id) return;
    setCommentModalPost(post);
    setCommentList([]);
    setCommentBusy(true);
    try {
      const list = await feedListPostComments(id, 120);
      setCommentList(Array.isArray(list) ? list : []);
    } catch {
      setCommentList([]);
    } finally {
      setCommentBusy(false);
    }
  }, []);

  const sendComment = useCallback(async () => {
    const postId = String(commentModalPost?.id || '');
    const text = String(commentText || '').trim();
    if (!postId || !text || commentBusy) return;
    setCommentBusy(true);
    try {
      const row = await feedAddPostComment(postId, text);
      setCommentList((prev) => [...prev, row]);
      setCommentText('');
      setPostCommentCountMap((m) => ({ ...m, [postId]: (Number(m[postId]) || 0) + 1 }));
      emitFeedMediaUpdated({ postId });
    } catch {
      /* */
    } finally {
      setCommentBusy(false);
    }
  }, [commentModalPost?.id, commentText, commentBusy]);

  const sendPostToFriend = useCallback(async (post, asRoute = false) => {
    if (!hasMessageApiToken()) {
      Alert.alert('', ft(language, 'storyNeedLogin'));
      return;
    }
    const friends = await socialListMutuals();
    const rows = Array.isArray(friends) ? friends.slice(0, 8) : [];
    if (!rows.length) {
      Alert.alert('', ft(language, 'postNoFriendsToShare'));
      return;
    }
    const title = asRoute ? ft(language, 'routeToFriend') : ft(language, 'postShareToFriend');
    Alert.alert(
      title,
      '',
      rows.map((u) => ({
        text: `@${u.username || 'user'}`,
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
    () =>
      trayStories.filter(
        (s) => String(s.user_id) === viewerUserId || !s.seen_by_viewer,
      ),
    [trayStories, viewerUserId],
  );

  const storyItems = useMemo(() => {
    const rows = [{ type: 'add', key: 'add' }];
    if (userStory?.uri && !trayStoriesFiltered.some((s) => String(s.user_id) === viewerUserId)) {
      rows.push({ type: 'local', key: 'local', uri: userStory.uri });
    }
    trayStoriesFiltered.forEach((s) => {
      rows.push({ ...s, type: 'tray', key: s.id });
    });
    return rows;
  }, [userStory, trayStoriesFiltered, viewerUserId]);

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
            paddingBottom: insets.bottom + 24 + lightTabBarExtraScrollPadding(),
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
        ListHeaderComponent={
          <>
        <Text style={[styles.sectionTitle, { color: textMain }]}>{ft(language, 'stories')}</Text>
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
                  <View style={[styles.storyCreateBorder, { borderColor: accent }]} />
                  <Ionicons name="add" size={32} color={accent} />
                </Pressable>
              );
            }
            if (item.type === 'local') {
              return (
                <Pressable
                  style={({ pressed }) => [styles.storyCard, pressed && { opacity: 0.88 }]}
                  onPress={openLocalStories}
                >
                  <Image source={{ uri: item.uri }} style={styles.storyImage} resizeMode="cover" />
                  <View
                    style={[
                      styles.storyAvatarWrap,
                      storyAvatarRingStyle(
                        {
                          user_id: user?.id,
                          view_count: 0,
                          seen_by_viewer: false,
                        },
                        user?.id,
                        isLight,
                      ),
                    ]}
                  >
                    <Image source={AVATAR} style={styles.storyAvatar} resizeMode="cover" />
                  </View>
                </Pressable>
              );
            }
            const row = item;
            if (item.type !== 'tray') return null;
            return (
              <Pressable
                style={({ pressed }) => [styles.storyCard, pressed && { opacity: 0.85 }]}
                onPress={() => openStoryForUser(row)}
              >
                <Image
                  source={{ uri: resolveFeedMediaUrl(row.media_url) }}
                  style={styles.storyImage}
                  resizeMode="cover"
                />
                <View style={[styles.storyAvatarWrap, storyAvatarRingStyle(row, user?.id, isLight)]}>
                  {row.avatar_url ? (
                    <Image source={{ uri: row.avatar_url }} style={styles.storyAvatar} resizeMode="cover" />
                  ) : (
                    <Image source={AVATAR} style={styles.storyAvatar} resizeMode="cover" />
                  )}
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
        renderItem={({ item: post }) => (
          <View
            style={[
              styles.postCard,
              {
                backgroundColor: isLight ? CARD_LIGHT : CARD_DARK,
                borderColor: isLight ? 'rgba(30,30,30,0.06)' : '#2A2A2A',
              },
            ]}
          >
            <View style={styles.postHead}>
              {post.avatarUrl ? (
                <Image source={{ uri: post.avatarUrl }} style={styles.postAvatar} />
              ) : (
                <Image source={AVATAR} style={styles.postAvatar} />
              )}
              <View style={styles.postHeadText}>
                <Text style={[styles.postName, { color: textMain }]}>{post.name}</Text>
                <Text style={[styles.postPlace, { color: textMuted }]} numberOfLines={2}>
                  {post.route_plan?.regionTitleUk || post.route_plan?.regionTitleEn
                    ? `${ft(language, 'routeLine')}: ${routeRegionTitle(language, post.route_plan)}`
                    : post.place}
                </Text>
              </View>
              <Pressable hitSlop={8} style={({ pressed }) => pressed && styles.pressedIOS}>
                <Ionicons name="ellipsis-vertical" size={18} color={textMuted} />
              </Pressable>
            </View>
            <MemoPostMediaCarousel post={post} accent={accent} />
            <View style={styles.postActions}>
              <View style={styles.postActionsLeft}>
                <Pressable onPress={() => toggleLike(post)} style={styles.actionPress}>
                  <Ionicons
                    name={postLikeMap[String(post.id)] ? 'heart' : 'heart-outline'}
                    size={22}
                    color={postLikeMap[String(post.id)] ? '#FF4D6A' : textMain}
                    style={styles.actionIcon}
                  />
                  <Text style={[styles.actionCount, { color: textMuted }]}>
                    {Number(postLikeCountMap[String(post.id)]) || 0}
                  </Text>
                </Pressable>
                <Pressable onPress={() => openComments(post)} style={styles.actionPress}>
                  <Ionicons name="chatbubble-outline" size={20} color={textMain} style={styles.actionIcon} />
                  <Text style={[styles.actionCount, { color: textMuted }]}>
                    {Number(postCommentCountMap[String(post.id)]) || 0}
                  </Text>
                </Pressable>
                <Pressable onPress={() => sendPostToFriend(post, false)} style={styles.actionPress}>
                  <Ionicons name="paper-plane-outline" size={20} color={textMain} />
                </Pressable>
              </View>
              <View style={styles.postActionsRight}>
                <Pressable
                  onPress={() => sendPostToFriend(post, true)}
                  style={({ pressed }) => [
                    styles.routeBtn,
                    post.route_plan ? styles.routeBtnLight : styles.routeBtnDark,
                    { opacity: pressed ? 0.88 : 1 },
                  ]}
                >
                  <Text
                    style={[
                      styles.routeBtnText,
                      post.route_plan ? styles.routeBtnTextOnLight : styles.routeBtnTextOnDark,
                    ]}
                  >
                    {ft(language, 'routeToFriend')}
                  </Text>
                </Pressable>
              </View>
            </View>
            {post.caption ? (
              <Text style={[styles.postCaption, { color: textMain }]} numberOfLines={6}>
                <Text style={styles.postCaptionAuthor}>{post.name}: </Text>
                {post.caption}
              </Text>
            ) : null}
          </View>
        )}
      />
      </RenderProfiler>
      <Modal visible={!!commentModalPost} transparent animationType="slide" onRequestClose={() => setCommentModalPost(null)}>
        <View style={styles.commentsModalBg}>
          <View style={[styles.commentsModalCard, { backgroundColor: isLight ? '#FFFFFF' : '#1A1A1A' }]}>
            <Text style={[styles.commentsModalTitle, { color: textMain }]}>{ft(language, 'postCommentsTitle')}</Text>
            {commentBusy && !commentList.length ? (
              <ActivityIndicator color={accent} style={{ marginVertical: 16 }} />
            ) : (
              <ScrollView style={{ maxHeight: 260 }}>
                {commentList.map((c) => (
                  <View key={String(c.id)} style={styles.commentRow}>
                    <Text style={[styles.commentAuthor, { color: textMain }]}>@{c.username || 'user'}</Text>
                    <Text style={[styles.commentText, { color: textMuted }]}>{c.content}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
            <View style={styles.commentComposer}>
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder={ft(language, 'postCommentPlaceholder')}
                placeholderTextColor={textMuted}
                style={[
                  styles.commentInput,
                  { color: textMain, borderColor: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.18)' },
                ]}
              />
              <Pressable onPress={sendComment} style={[styles.commentSend, { backgroundColor: accent }]}>
                <Text style={{ color: onAccentButtonText(isLight), fontWeight: '700' }}>{ft(language, 'storySend')}</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => setCommentModalPost(null)} style={styles.commentClose}>
              <Text style={{ color: textMuted }}>{ft(language, 'storyClose')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  feedHeaderWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
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
  addCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  scrollContent: { paddingHorizontal: 18, paddingTop: 16 },
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
  storiesRow: { gap: 12, paddingBottom: 8, paddingRight: 8 },
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
  storyImage: { width: '100%', height: '100%' },
  storyAvatarWrap: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    backgroundColor: '#444',
  },
  storyAvatar: { width: '100%', height: '100%' },
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
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  postActionsLeft: { flexDirection: 'row', alignItems: 'center' },
  postActionsRight: { flexDirection: 'row', alignItems: 'center' },
  actionPress: { flexDirection: 'row', alignItems: 'center', marginRight: 10 },
  actionCount: { fontSize: 12, marginLeft: 4, marginRight: 4 },
  actionIcon: { marginRight: 14 },
  routeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    marginLeft: 8,
  },
  routeBtnDark: {
    backgroundColor: '#0F1F4A',
  },
  routeBtnLight: {
    backgroundColor: '#F2F2EA',
  },
  routeBtnText: { fontSize: 12, fontWeight: '600' },
  routeBtnTextOnDark: { color: '#FFFFFF' },
  routeBtnTextOnLight: { color: '#1E1E1E' },
  postCaption: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    fontSize: 13,
    lineHeight: 18,
  },
  postCaptionAuthor: { fontWeight: '700' },
  commentsModalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  commentsModalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 14,
    paddingBottom: 24,
  },
  commentsModalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
  commentRow: { paddingVertical: 7 },
  commentAuthor: { fontSize: 13, fontWeight: '700' },
  commentText: { fontSize: 13, marginTop: 2 },
  commentComposer: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
  commentInput: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  commentSend: {
    minHeight: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  commentClose: { alignItems: 'center', marginTop: 12 },
});
