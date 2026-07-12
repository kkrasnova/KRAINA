import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  Modal,
  Platform,
  Alert,
  useWindowDimensions,
  DeviceEventEmitter,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Video, ResizeMode } from './expoAvCompat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { getAppTheme, resolveAppTheme } from './themeStorage';
import { accentForTheme } from './themeAccent';
import { useSyncedAppLanguage } from './useAppLanguage';

import { pf } from './profileI18n';
import { ft } from './feedI18n';
import {
  getPostLikeState,
  togglePostLike,
  getPostCaption,
  getProfileDisplayName,
  POST_ID,
} from './profileStorage';
import {
  ensureFeedSocialReady,
  feedListMyPosts,
  feedListUserPosts,
  feedPatchPostArchive,
  feedTogglePostLike,
} from './feedApi';
import { deleteFeedPublication } from './feedPublicationDelete';
import { hasBackendSession } from './backendAuthApi';
import { isLocalFeedPostId, isServerFeedPostId, resolveBackendFeedPostId } from './feedPostSyncBridge';
import { getUserFeedPosts, resolveFeedLocalUser } from './feedLocalStorage';
import {
  getLocalFeedPostComments,
  getLocalFeedPostLikeState,
  resolveFeedPostLikeStateFromAliases,
  setLocalFeedPostLikeState,
  toggleLocalFeedPostLike,
} from './feedLocalInteractions';
import { resolveFeedMediaUrl } from './feedMediaUrl';
import { pickBestGridUri } from './profilePostsGrid';
import ProfileAvatarCircle, { useViewerProfileAvatarUri } from './ProfileAvatarCircle';
import { useAuthStore } from './auth/authStore';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import { emitFeedMediaUpdated, KRAINA_FEED_MEDIA_UPDATED } from './feedSyncEvents';
import { peekPostLikeState } from './feedInteractionHotCache';
import { errorToUserText } from './errorText';

const POST_IMG = require('./assets/kling_20260405_IMAGE____________5495_1.webp');

function normalizeLoadedFeedPost(post) {
  if (!post) return null;
  const raw = Array.isArray(post.media_urls) ? post.media_urls : [];
  const media_urls = raw.map((u) => resolveFeedMediaUrl(String(u))).filter(Boolean);
  return {
    ...post,
    media_urls,
    avatar_url: post.avatar_url ? resolveFeedMediaUrl(String(post.avatar_url)) : null,
  };
}

function formatPostAge(iso, language, langUk) {
  if (!iso) return '';
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const diff = Date.now() - ms;
  const h = Math.floor(diff / 3600000);
  if (h < 1) return langUk ? 'щойно' : 'just now';
  if (h < 24) return `${h} ${pf(language, 'hoursAgo')}`;
  const d = Math.floor(h / 24);
  return `${d} ${langUk ? 'дн.' : 'd'}`;
}

function readInitialLikes(postId, routeParams = {}) {
  const pid = String(postId || '');
  const ids = [pid, routeParams?.backendPostId].filter(Boolean);
  const hot = peekPostLikeState(ids);
  if (hot.has) return { liked: hot.liked, count: hot.likes_count };
  if (routeParams?.liked != null) {
    return {
      liked: !!routeParams.liked,
      count: Math.max(0, Number(routeParams.likesCount ?? routeParams.likes_count) || 0),
    };
  }
  return { liked: false, count: 0 };
}

const CARD_H_MARGIN = 16;
const DEFAULT_MEDIA_ASPECT = 4 / 5;
const MIN_MEDIA_ASPECT = 0.72;
const MAX_MEDIA_ASPECT = 1.78;

function clampMediaAspect(ratio) {
  const n = Number(ratio);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MEDIA_ASPECT;
  return Math.max(MIN_MEDIA_ASPECT, Math.min(n, MAX_MEDIA_ASPECT));
}

export default function ProfilePostDetailPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const language = useSyncedAppLanguage(route, 'uk');
  const langUk = language.split(/[-_]/)[0].toLowerCase() === 'uk';
  const postId = route?.params?.postId;
  const routeCover = route?.params?.coverUrl;
  const peerUsername = String(route?.params?.peerUsername || '').trim();
  const routeAuthorName = String(route?.params?.authorName || '').trim();
  const routePeerAvatar = route?.params?.peerAvatarUrl
    ? resolveFeedMediaUrl(String(route.params.peerAvatarUrl))
    : '';
  const routeUser = route?.params?.user || {};
  const authUser = useAuthStore((s) => s.user);
  const profileMeUserId = useAuthStore((s) => s.profileMe?.profile?.user_id);
  const profileMeDisplayName = useAuthStore((s) => {
    const dn = s.profileMe?.profile?.display_name;
    return dn != null && String(dn).trim() ? String(dn).trim() : '';
  });
  const feedLocalUser = useMemo(
    () => resolveFeedLocalUser(routeUser, { authUser, profileUserId: profileMeUserId }),
    [routeUser, authUser, profileMeUserId],
  );
  const user = feedLocalUser || routeUser;
  const viewerAvatarUri = useViewerProfileAvatarUri(user);

  const [likes, setLikes] = useState(() => readInitialLikes(postId, route?.params));
  const [caption, setCaption] = useState('');
  const [author, setAuthor] = useState(routeAuthorName);
  const [placeLine, setPlaceLine] = useState('');
  const [postedAt, setPostedAt] = useState(null);
  const [feedPost, setFeedPost] = useState(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [menu, setMenu] = useState(false);
  const [appTheme, setAppTheme] = useState(resolveAppTheme(route?.params?.appTheme));
  const [menuBusy, setMenuBusy] = useState(false);
  const [mediaAspect, setMediaAspect] = useState(DEFAULT_MEDIA_ASPECT);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#727272' : '#A8A8A8';
  const cardBg = isLight ? '#FFF' : '#1A1A1A';

  const resolvedRouteCover = routeCover ? resolveFeedMediaUrl(String(routeCover)) : '';
  const mediaUrls = useMemo(() => {
    const raw = Array.isArray(feedPost?.media_urls) ? feedPost.media_urls : [];
    return raw.map((u) => resolveFeedMediaUrl(String(u))).filter(Boolean);
  }, [feedPost]);
  const coverUrl = useMemo(
    () => pickBestGridUri(resolvedRouteCover, mediaUrls[0] || '') || resolvedRouteCover || mediaUrls[0] || '',
    [resolvedRouteCover, mediaUrls],
  );
  const cardW = Math.max(1, Math.round(screenW - CARD_H_MARGIN * 2));
  const slideAspect = clampMediaAspect(mediaAspect);
  const slideStyle = useMemo(
    () => [styles.postImg, { width: cardW, aspectRatio: slideAspect }],
    [cardW, slideAspect],
  );
  const onMediaLoad = useCallback((e) => {
    const { width, height } = e?.source || {};
    if (width > 0 && height > 0) setMediaAspect(clampMediaAspect(width / height));
  }, []);
  const postAvatarUri = useMemo(() => {
    if (peerUsername) {
      const fromPost = feedPost?.avatar_url ? resolveFeedMediaUrl(String(feedPost.avatar_url)) : '';
      return fromPost || routePeerAvatar || '';
    }
    return viewerAvatarUri || '';
  }, [peerUsername, feedPost?.avatar_url, routePeerAvatar, viewerAvatarUri]);
  const canArchive =
    !peerUsername &&
    hasBackendSession() &&
    feedPost != null &&
    postId != null &&
    isServerFeedPostId(String(postId)) &&
    String(postId) !== POST_ID;
  const canDeletePost =
    !peerUsername &&
    postId != null &&
    String(postId).trim() !== '' &&
    String(postId) !== POST_ID;

  const onDeletePost = useCallback(() => {
    if (!canDeletePost || menuBusy) return;
    Alert.alert(pf(language, 'deletePostConfirmTitle'), pf(language, 'deletePostConfirmBody'), [
      { text: pf(language, 'cancel'), style: 'cancel' },
      {
        text: pf(language, 'paramDelete'),
        style: 'destructive',
        onPress: async () => {
          setMenuBusy(true);
          try {
            if (hasBackendSession()) {
              await useAuthStore.getState().refreshSession().catch(() => {});
            }
            await deleteFeedPublication(user, String(postId));
            navigation.goBack();
          } catch (e) {
            Alert.alert('', errorToUserText(e, language) || pf(language, 'deletePostFailed'));
          } finally {
            setMenuBusy(false);
          }
        },
      },
    ]);
  }, [canDeletePost, menuBusy, language, user, postId, navigation]);

  const shell = {
    user,
    language,
    ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
    appTheme,
    ...(postId != null ? { postId } : {}),
    ...(coverUrl ? { coverUrl } : {}),
  };

  const reload = useCallback(async () => {
    const t = await getAppTheme();
    setAppTheme(t === 'light' ? 'light' : 'dark');

    await useAuthStore.getState().hydrate();
    await ensureFeedSocialReady(user);
    if (hasBackendSession()) {
      try {
        await useAuthStore.getState().loadProfileMeIfStale();
      } catch {
        /* */
      }
    }

    const pid = postId;
    const useFeed =
      hasBackendSession() &&
      pid != null &&
      isServerFeedPostId(String(pid)) &&
      String(pid) !== POST_ID;

    let loaded = null;
    if (useFeed) {
      try {
        const posts = await feedListMyPosts(80);
        const found = (Array.isArray(posts) ? posts : []).find((p) => String(p.id) === String(pid)) || null;
        loaded = normalizeLoadedFeedPost(found);
      } catch {
        loaded = null;
      }
    }
    if (!loaded && pid && isLocalFeedPostId(pid)) {
      try {
        const locals = await getUserFeedPosts(user);
        const local = (Array.isArray(locals) ? locals : []).find((p) => String(p.id) === String(pid));
        if (local) {
          const media_urls = (Array.isArray(local.uris) ? local.uris : local.uri ? [local.uri] : [])
            .map((u) => resolveFeedMediaUrl(u))
            .filter(Boolean);
          const localId = String(local.id);
          const [likeState, localComments] = await Promise.all([
            getLocalFeedPostLikeState(user, localId),
            getLocalFeedPostComments(user, localId),
          ]);
          loaded = {
            id: localId,
            media_urls,
            content_text: local.caption || '',
            place_label: local.place || '',
            created_at: local.createdAt ? new Date(local.createdAt).toISOString() : null,
            likes_count: Number(likeState.likes_count) || 0,
            liked_by_viewer: !!likeState.liked,
            comments_count: Array.isArray(localComments) ? localComments.length : 0,
          };
        }
      } catch {
        /* */
      }
    }

    if (!loaded && pid) {
      const backendId = await resolveBackendFeedPostId(pid, { user });
      if (isServerFeedPostId(backendId) && backendId !== String(pid)) {
        try {
          const posts = await feedListMyPosts(80);
          const found =
            (Array.isArray(posts) ? posts : []).find((p) => String(p.id) === String(backendId)) || null;
          if (found) loaded = normalizeLoadedFeedPost(found);
        } catch {
          /* */
        }
      }
    }
    if (!loaded && peerUsername && pid) {
      try {
        const posts = await feedListUserPosts(peerUsername, 80);
        const found =
          (Array.isArray(posts) ? posts : []).find((p) => String(p.id) === String(pid)) || null;
        if (found) loaded = normalizeLoadedFeedPost(found);
      } catch {
        /* */
      }
    }

    setFeedPost(loaded);
    setMediaIndex(0);

    if (loaded) {
      const capDefault = loaded.content_text || pf(language, 'postCaption');
      setCaption(await getPostCaption(pid, capDefault));
      setPlaceLine(loaded.place_label || '');
      setPostedAt(loaded.created_at || null);
      const uname = (loaded.username || '').replace(/^@/, '');
      if (peerUsername) {
        const display =
          String(loaded.display_name || routeAuthorName || uname || peerUsername).trim() || peerUsername;
        setAuthor(display);
      } else {
        const display = await getProfileDisplayName(user?.name || user?.email || uname || '');
        const label = uname || display;
        setAuthor((label.split(/\s+/)[0] || label).trim() || '—');
      }
    } else if (useFeed) {
      setCaption(await getPostCaption(pid, pf(language, 'postCaption')));
      setPlaceLine('');
      setPostedAt(null);
      const n = await getProfileDisplayName(user?.name || user?.email || '');
      const short = n.split(/\s+/)[0] || n || '—';
      setAuthor(short);
    } else {
      const cap = await getPostCaption(pid, pf(language, 'postCaption'));
      setCaption(cap);
      const n = await getProfileDisplayName(user?.name || user?.email || '');
      const short = n.split(/\s+/)[0] || n || '—';
      setAuthor(short);
      setPlaceLine('');
      setPostedAt(null);
    }

    const backendId = await resolveBackendFeedPostId(pid, { user });
    const aliasIds = [...new Set([String(pid || ''), String(backendId || '')].filter(Boolean))];
    const hot = peekPostLikeState(aliasIds);
    const mergedLikes = await resolveFeedPostLikeStateFromAliases(user, aliasIds, loaded || null);
    const nextLikes = hot.has
      ? { liked: hot.liked, count: hot.likes_count }
      : {
          liked: mergedLikes.liked || !!loaded?.liked_by_viewer,
          count: Math.max(
            mergedLikes.likes_count,
            Number(loaded?.likes_count) || 0,
          ),
        };
    setLikes((prev) => {
      if (hot.has) return { liked: hot.liked, count: hot.likes_count };
      return {
        liked: nextLikes.liked || prev.liked,
        count: Math.max(nextLikes.count, prev.count),
      };
    });
  }, [language, postId, user, langUk, peerUsername, routeAuthorName]);

  useEffect(() => {
    setMediaAspect(DEFAULT_MEDIA_ASPECT);
  }, [postId, coverUrl, mediaUrls.join('|')]);

  useEffect(() => {
    const next = readInitialLikes(postId, route?.params);
    if (next.liked || next.count) setLikes((prev) => ({
      liked: next.liked || prev.liked,
      count: Math.max(next.count, prev.count),
    }));
  }, [postId, route?.params?.liked, route?.params?.likesCount, route?.params?.likes_count]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  useEffect(() => {
    const pid = String(postId || '');
    if (!pid) return undefined;
    const sub = DeviceEventEmitter.addListener(KRAINA_FEED_MEDIA_UPDATED, (payload) => {
      if (payload?.kind && payload.kind !== 'interaction') return;
      if (payload.liked == null && payload.likes_count == null) return;
      void (async () => {
        const eventIds = new Set(
          [payload?.postId, payload?.localPostId].map((v) => String(v || '')).filter(Boolean),
        );
        const backendId = await resolveBackendFeedPostId(pid, { user });
        const profileIds = new Set([pid, backendId].filter(Boolean));
        const matches = [...profileIds].some((id) => eventIds.has(id));
        if (!matches) return;
        setLikes((prev) => ({
          liked: payload.liked != null ? !!payload.liked : prev.liked,
          count:
            payload.likes_count != null
              ? Math.max(0, Number(payload.likes_count) || 0)
              : prev.count,
        }));
      })();
    });
    return () => sub.remove();
  }, [postId, user]);

  const onLike = async () => {
    const pid = String(postId || '');
    const useFeed =
      hasBackendSession() && pid && isServerFeedPostId(pid) && pid !== POST_ID;
    if (useFeed) {
      try {
        const out = await feedTogglePostLike(pid);
        const next = { liked: !!out.liked, count: Number(out.likes_count) || 0 };
        setLikes(next);
        await setLocalFeedPostLikeState(user, pid, { liked: next.liked, likes_count: next.count });
        emitFeedMediaUpdated({
          kind: 'interaction',
          postId: pid,
          liked: next.liked,
          likes_count: next.count,
        });
      } catch (e) {
        Alert.alert('', errorToUserText(e, language) || ft(language, 'feedActionFailed'));
      }
      return;
    }
    if (isLocalFeedPostId(pid)) {
      const prev = likes;
      const optimistic = prev.liked
        ? { liked: false, count: Math.max(0, prev.count - 1) }
        : { liked: true, count: prev.count + 1 };
      setLikes(optimistic);
      try {
        const out = await toggleLocalFeedPostLike(user, pid);
        const next = { liked: !!out.liked, count: Number(out.likes_count) || 0 };
        setLikes(next);
        await setLocalFeedPostLikeState(user, pid, { liked: next.liked, likes_count: next.count });
        emitFeedMediaUpdated({
          kind: 'interaction',
          postId: pid,
          liked: next.liked,
          likes_count: next.count,
        });
        void (async () => {
          try {
            const backendId = await resolveBackendFeedPostId(pid, { user });
            if (!isServerFeedPostId(backendId)) return;
            const serverOut = await feedTogglePostLike(backendId);
            const synced = { liked: !!serverOut.liked, count: Number(serverOut.likes_count) || 0 };
            setLikes(synced);
            await setLocalFeedPostLikeState(user, backendId, {
              liked: synced.liked,
              likes_count: synced.count,
            });
            emitFeedMediaUpdated({
              kind: 'interaction',
              postId: backendId,
              localPostId: pid,
              liked: synced.liked,
              likes_count: synced.count,
            });
          } catch {
            /* локальний лайк уже збережено */
          }
        })();
      } catch (e) {
        setLikes(prev);
        Alert.alert('', errorToUserText(e, language) || ft(language, 'feedActionFailed'));
      }
      return;
    }
    setLikes(await togglePostLike(postId));
  };

  const param = (label, icon, onPress, danger) => (
    <Pressable
      key={label}
      style={({ pressed }) => [
        styles.menuRow,
        {
          borderBottomColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)',
        },
        pressed && { opacity: 0.75 },
      ]}
      onPress={() => {
        setMenu(false);
        onPress();
      }}
    >
      <Ionicons name={icon} size={22} color={danger ? '#EB4335' : textMain} style={{ width: 28 }} />
      <Text style={[styles.menuLabel, { color: textMain }, danger && { color: '#EB4335' }]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        centerSubtitle={pf(language, 'postDetailHeader')}
        hideSendButton
      />
      <ScrollView
        contentContainerStyle={{
          paddingBottom: lightTabBarScrollContentPadding(insets.bottom, 20),
        }}
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
      >
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <View style={styles.postHead}>
            <ProfileAvatarCircle uri={postAvatarUri || ''} size={40} isLight={isLight} style={styles.smAvatar} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.postName, { color: textMain }]}>{author}</Text>
              {placeLine ? (
                <Text style={[styles.postLoc, { color: textMuted }]} numberOfLines={1}>
                  {placeLine}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={() => setMenu(true)} hitSlop={12}>
              <Ionicons name="ellipsis-vertical" size={20} color={textMain} />
            </Pressable>
          </View>
          {mediaUrls.length > 1 ? (
            <View>
              <FlatList
                data={mediaUrls}
                horizontal
                pagingEnabled
                keyExtractor={(it, i) => `${i}_${it}`}
                showsHorizontalScrollIndicator={false}
                getItemLayout={(_, index) => ({ length: cardW, offset: cardW * index, index })}
                onMomentumScrollEnd={(e) => {
                  const w = e?.nativeEvent?.layoutMeasurement?.width || cardW;
                  const x = e?.nativeEvent?.contentOffset?.x || 0;
                  const idx = Math.max(0, Math.min(mediaUrls.length - 1, Math.round(x / w)));
                  setMediaIndex(idx);
                }}
                maxToRenderPerBatch={3}
                windowSize={3}
                removeClippedSubviews={Platform.OS === 'android'}
                initialNumToRender={3}
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
                    <ExpoImage
                      source={{ uri: u }}
                      style={slideStyle}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={120}
                      onLoad={onMediaLoad}
                    />
                  );
                }}
              />
              <View style={styles.mediaDots}>
                {mediaUrls.map((_, i) => (
                  <View
                    key={`pd_${i}`}
                    style={[styles.mediaDot, i === mediaIndex ? { backgroundColor: accent, opacity: 1 } : null]}
                  />
                ))}
              </View>
            </View>
          ) : coverUrl ? (
            <ExpoImage
              source={{ uri: coverUrl }}
              style={slideStyle}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={120}
              onLoad={onMediaLoad}
            />
          ) : (
            <ExpoImage
              source={POST_IMG}
              style={slideStyle}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={0}
            />
          )}
          <View style={styles.actions}>
            <View style={styles.actionsLeft}>
              <Pressable onPress={onLike} hitSlop={8}>
                <Ionicons
                  name={likes.liked ? 'heart' : 'heart-outline'}
                  size={24}
                  color={likes.liked ? '#EB4335' : textMain}
                />
              </Pressable>
              <Pressable
                onPress={() =>
                  navigation.navigate('ProfileComments', {
                    ...shell,
                    useBackendComments:
                      hasBackendSession() &&
                      postId != null &&
                      isServerFeedPostId(String(postId)) &&
                      String(postId) !== POST_ID,
                  })
                }
                hitSlop={8}
                style={{ marginLeft: 16 }}
              >
                <Ionicons name="chatbubble-outline" size={22} color={textMain} />
              </Pressable>
              <Pressable hitSlop={8} style={{ marginLeft: 16 }} onPress={() => Alert.alert('', pf(language, 'comingSoon'))}>
                <Ionicons name="paper-plane-outline" size={22} color={textMain} />
              </Pressable>
            </View>
            <View style={styles.actionsRight}>
              <Pressable hitSlop={8} onPress={() => Alert.alert('', pf(language, 'comingSoon'))}>
                <Ionicons name="bookmark-outline" size={24} color={textMain} />
              </Pressable>
              <Pressable
                style={[
                  styles.routeBtn,
                  { backgroundColor: isLight ? '#0F1F4A' : accent },
                ]}
                onPress={() => navigation.navigate('RouteFinder', shell)}
              >
                <Text
                  style={[
                    styles.routeBtnText,
                    { color: isLight ? '#FFF' : '#1E1E1E' },
                  ]}
                >
                  {pf(language, 'route')}
                </Text>
                <Ionicons name="arrow-forward" size={14} color={isLight ? '#FFF' : '#1E1E1E'} />
              </Pressable>
            </View>
          </View>
          <Text style={[styles.likeLine, { color: textMain }]}>
            {pf(language, 'likedBy')} <Text style={styles.bold}>{likes.count}</Text>
          </Text>
          {caption ? (
            <Text style={[styles.caption, { color: textMain }]}>
              <Text style={styles.bold}>{author}: </Text>
              {caption}
            </Text>
          ) : null}
          <Text style={[styles.time, { color: isLight ? '#999' : '#777' }]}>
            {postedAt ? formatPostAge(postedAt, language, langUk) : `2 ${pf(language, 'hoursAgo')}`}
          </Text>
        </View>
      </ScrollView>

      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMenu(false)} />
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + 20,
              backgroundColor: isLight ? LIGHT_BAR_BG : '#252525',
            },
          ]}
        >
          <View style={styles.sheetHandle} />
          <Text style={[styles.sheetTitle, { color: textMain }]}>{pf(language, 'parameters')}</Text>
          {!peerUsername
            ? param(pf(language, 'paramEdit'), 'create-outline', () =>
                navigation.navigate('ProfileEditPublication', shell),
              )
            : null}
          {canArchive
            ? param(pf(language, 'archivePost'), 'archive-outline', () =>
                Alert.alert('', pf(language, 'archivePost'), [
                  { text: pf(language, 'cancel'), style: 'cancel' },
                  {
                    text: pf(language, 'save'),
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await feedPatchPostArchive(String(postId), true);
                        Alert.alert('', pf(language, 'postArchived'));
                        navigation.goBack();
                      } catch (e) {
                        Alert.alert('', errorToUserText(e, language));
                      }
                    },
                  },
                ]),
              )
            : null}
          {param(pf(language, 'paramMessage'), 'paper-plane-outline', () =>
            navigation.navigate('Chats', shell),
          )}
          {param(pf(language, 'paramSave'), 'bookmark-outline', () => Alert.alert('', pf(language, 'comingSoon')))}
          {param(pf(language, 'paramLikes'), 'heart-outline', () => navigation.navigate('ProfileLikes', shell))}
          {param(pf(language, 'paramNoComments'), 'ban-outline', () => Alert.alert('', pf(language, 'comingSoon')))}
          {param(pf(language, 'paramSharePost'), 'share-social-outline', () => Alert.alert('', pf(language, 'comingSoon')))}
          {param(pf(language, 'paramShareLoc'), 'location-outline', () => Alert.alert('', pf(language, 'comingSoon')))}
          {canDeletePost ? param(pf(language, 'paramDelete'), 'trash-outline', onDeletePost, true) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  card: {
    marginHorizontal: CARD_H_MARGIN,
    marginTop: 8,
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
    }),
  },
  postHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  smAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginRight: 10,
  },
  postName: { fontSize: 15, fontWeight: '700' },
  postLoc: { fontSize: 13, marginTop: 2 },
  postImg: { backgroundColor: '#F0F0F0' },
  mediaDots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  mediaDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.72)',
    opacity: 0.55,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionsLeft: { flexDirection: 'row', alignItems: 'center' },
  actionsRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  routeBtnText: { fontSize: 13, fontWeight: '600' },
  likeLine: { fontSize: 14, paddingHorizontal: 14, marginBottom: 6 },
  bold: { fontWeight: '700' },
  caption: { fontSize: 14, lineHeight: 20, paddingHorizontal: 14 },
  time: { fontSize: 12, paddingHorizontal: 14, marginTop: 8, marginBottom: 14 },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuLabel: { fontSize: 16, marginLeft: 8 },
});
