import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions,
  RefreshControl,
  DeviceEventEmitter,
  Modal,
  TextInput,
  FlatList,
} from 'react-native';
import RemotePhoto from './RemotePhoto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { useAppTheme } from './useAppTheme';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';
import { pf } from './profileI18n';
import { accentForTheme, onAccentButtonText, ACCENT_BLUE, ACCENT_LEMON } from './themeAccent';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import {
  socialGetPublicProfile,
  socialGetPublicProfileFull,
  socialGetCachedPublicProfileFull,
  socialFollowUsername,
  socialUnfollowUsername,
  mapSocialListRowToProfile,
} from './socialApi';
import {
  feedListProfileUserPosts,
  feedListStoriesForUser,
  hasFeedApiToken,
  ensureFeedApiReady,
  feedTogglePostLike,
  feedListPostComments,
  feedAddPostComment,
} from './feedApi';
import { messagesOpenThread, messagesSendText, hasMessageApiToken } from './messageApi';
import { useAuthStore } from './auth/authStore';
import { KRAINA_FEED_MEDIA_UPDATED } from './feedSyncEvents';
import { KRAINA_SOCIAL_FOLLOW_CHANGED, KRAINA_SOCIAL_GRAPH_CHANGED, socialFollowMatches, isPlaceholderSocialUsername, SOCIAL_SYNC_TTL_MS } from './socialFollowSyncEvents';
import { resolveFeedMediaUrl, pickFirstFeedMediaUrl } from './feedMediaUrl';
import { apiPostToGridRow } from './profilePostsGrid';
import { storyAvatarRingStyle, storiesHasUnviewed } from './storyTrayUtils';
import { errorToUserText } from './errorText';
import {
  peerDisplayNameFromMeta,
  peerUsernameFromMeta,
} from './chatPeerDisplay';
import ProfileAvatarCircle from './ProfileAvatarCircle';
import { brandFontHeadMedium, brandFontSans, brandFontSansSemibold } from './brandFont';

const GRID_GAP = 1;
const COLS = 3;
const W = Dimensions.get('window').width;
const CELL = (W - GRID_GAP * (COLS - 1) - 6) / COLS;

let profilePageCache = {};
const PROFILE_PAGE_CACHE_TTL = SOCIAL_SYNC_TTL_MS;

function profileCacheKey(username) {
  return `profile__${String(username || '').trim()}`;
}

function resolveSeedProfile(route, targetUsername) {
  const fromFull = route?.params?.preloadedFull?.profile;
  if (fromFull) return fromFull;
  const row = route?.params?.preloadedProfile;
  if (row) return mapSocialListRowToProfile(row, targetUsername);
  const cachedFull = socialGetCachedPublicProfileFull(targetUsername, 80);
  if (cachedFull?.profile) return cachedFull.profile;
  const cached = profilePageCache[profileCacheKey(targetUsername)];
  if (cached?.profile) return cached.profile;
  return null;
}

function formatPostAge(iso, lang) {
  const d = new Date(String(iso || ''));
  if (Number.isNaN(d.getTime())) return '';
  const diffH = (Date.now() - d.getTime()) / 3600000;
  const langUk = String(lang || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  if (diffH < 1) return langUk ? 'щойно' : 'just now';
  if (diffH < 24) return `${Math.floor(diffH)} ${langUk ? 'год' : 'h'}`;
  return `${Math.floor(diffH / 24)} ${langUk ? 'дн.' : 'd'}`;
}

function formatBirthLabel(iso, lang) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  const langUk = String(lang || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  if (langUk) return `${d}.${m}.${y}`;
  return `${m}/${d}/${y}`;
}

function profileFeedUsername(profile, fallbackUsername) {
  return String(profile?.username || fallbackUsername || '')
    .replace(/^@/, '')
    .trim();
}

function resolveSeedPosts(route, seedCache) {
  const fromFull = route?.params?.preloadedFull?.posts;
  if (Array.isArray(fromFull) && fromFull.length) return fromFull;
  if (Array.isArray(seedCache?.posts) && seedCache.posts.length) return seedCache.posts;
  return [];
}

function resolveSeedStories(route, seedCache) {
  const fromFull = route?.params?.preloadedFull?.stories;
  if (Array.isArray(fromFull) && fromFull.length) return fromFull;
  if (Array.isArray(seedCache?.peerStories) && seedCache.peerStories.length) return seedCache.peerStories;
  return [];
}

export default function SocialUserProfilePage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const user = route?.params?.user || {};
  const countryId = route?.params?.countryId;
  const targetUsername = String(route?.params?.username || '').trim();
  const seedProfileRef = useRef(null);
  if (seedProfileRef.current === null) {
    seedProfileRef.current = resolveSeedProfile(route, targetUsername);
  }
  const seedProfile = seedProfileRef.current;
  const seedCache = profilePageCache[profileCacheKey(targetUsername)];
  const { appTheme, isLight } = useAppTheme(route?.params?.appTheme, route);
  const [profile, setProfile] = useState(seedProfile);
  const [posts, setPosts] = useState(() => resolveSeedPosts(route, seedCache));
  const [peerStories, setPeerStories] = useState(() => resolveSeedStories(route, seedCache));
  const [loading, setLoading] = useState(!seedProfile);
  const [refreshing, setRefreshing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [feedSyncHint, setFeedSyncHint] = useState(seedCache?.feedSyncHint || '');

  const [postModal, setPostModal] = useState(null);
  const [likeMap, setLikeMap] = useState({});
  const [likeCountMap, setLikeCountMap] = useState({});
  const [commentCountMap, setCommentCountMap] = useState({});
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [postModalBusy, setPostModalBusy] = useState(false);
  const [postMediaIndex, setPostMediaIndex] = useState(0);

  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const muted = isLight ? '#5C5C5C' : '#9A9A9A';
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const cardBg = isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)';
  const border = isLight ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.12)';
  const textStatLabel = isLight ? '#5C5C5C' : '#9A9A9A';

  const shell = {
    user,
    language,
    ...(countryId != null ? { countryId } : {}),
    appTheme,
  };

  const reload = useCallback(
    async (silent = false, force = false) => {
      if (!targetUsername) {
        setLoading(false);
        return;
      }
      const cacheKey = profileCacheKey(targetUsername);
      const cached = profilePageCache[cacheKey];
      const cacheFresh = cached && Date.now() - cached.at < PROFILE_PAGE_CACHE_TTL;
      const instantProfile = cached?.profile || seedProfile;

      // Fresh cache — show immediately, still revalidate feed below
      if (!force && cacheFresh) {
        if (__DEV__) console.log(`[Cache] SocialUserProfile HIT fresh @${targetUsername} age=${Date.now() - cached.at}ms`);
        setProfile(cached.profile);
        if (Array.isArray(cached.posts) && cached.posts.length) setPosts(cached.posts);
        if (Array.isArray(cached.peerStories) && cached.peerStories.length) setPeerStories(cached.peerStories);
        setFeedSyncHint(cached.feedSyncHint);
        setLoading(false);
      } else if (!force && instantProfile) {
        if (__DEV__) {
          console.log(
            `[Cache] SocialUserProfile instant @${targetUsername}` +
              (cached ? ` age=${Date.now() - cached.at}ms` : ' from route seed'),
          );
        }
        setProfile(instantProfile);
        if (cached) {
          if (Array.isArray(cached.posts) && cached.posts.length) setPosts(cached.posts);
          if (Array.isArray(cached.peerStories) && cached.peerStories.length) setPeerStories(cached.peerStories);
          setFeedSyncHint(cached.feedSyncHint);
        }
        setLoading(false);
      } else if (__DEV__ && !cached && !instantProfile) {
        console.log(`[Cache] SocialUserProfile MISS @${targetUsername}`);
      }
      if (__DEV__ && force && cached) {
        console.log(`[Cache] SocialUserProfile FORCE refresh @${targetUsername} age=${Date.now() - cached.at}ms`);
      }

      const needsSpinner = !instantProfile;
      if (needsSpinner) {
        if (silent) setRefreshing(true);
        else setLoading(true);
      }

      let resolvedProfile = instantProfile || null;
      let bundledPosts = null;
      let bundledStories = null;
      let notFound = false;
      try {
        const full = await socialGetPublicProfileFull(targetUsername, 80).catch(() => null);
        if (full?.profile) {
          resolvedProfile = full.profile;
          if (Array.isArray(full.posts)) bundledPosts = full.posts;
          if (Array.isArray(full.stories)) bundledStories = full.stories;
        } else {
          try {
            resolvedProfile = await socialGetPublicProfile(targetUsername);
          } catch (e) {
            if (String(e?.message || '') === 'profile_not_found') notFound = true;
          }
        }

        if (notFound) {
          setProfile(null);
          setPosts([]);
          setPeerStories([]);
          setFeedSyncHint('');
          delete profilePageCache[cacheKey];
        } else if (resolvedProfile) {
          setProfile(resolvedProfile);
        } else if (!instantProfile) {
          setProfile(null);
        }
      } catch (e) {
        if (!instantProfile) {
          setProfile(null);
          setPosts([]);
          setPeerStories([]);
        }
        if (__DEV__) console.warn('[SocialUserProfile]', e?.message);
      } finally {
        if (needsSpinner) {
          if (silent) setRefreshing(false);
          else setLoading(false);
        }
      }

      if (notFound || !resolvedProfile) return;

      let nextPosts = Array.isArray(bundledPosts) ? bundledPosts : [];
      let nextStories = Array.isArray(bundledStories) ? bundledStories : [];

      if (Array.isArray(nextPosts) && nextPosts.length) {
        setPosts(nextPosts);
      }
      if (Array.isArray(nextStories) && nextStories.length) {
        setPeerStories(nextStories);
      }

      try {
        await ensureFeedApiReady(user);
        if (!useAuthStore.getState().accessToken) {
          await useAuthStore.getState().refreshSession().catch(() => {});
        }

        const feedUsername = profileFeedUsername(resolvedProfile, targetUsername);
        const ownerUserId = resolvedProfile?.user_id ? String(resolvedProfile.user_id) : '';
        if (feedUsername || ownerUserId) {
          const grid = await feedListProfileUserPosts(feedUsername, ownerUserId, 60);
          if (Array.isArray(grid) && grid.length) {
            nextPosts = grid;
          }
        }

        if (resolvedProfile?.user_id && hasFeedApiToken()) {
          try {
            const sl = await feedListStoriesForUser(String(resolvedProfile.user_id));
            if (Array.isArray(sl) && sl.length) nextStories = sl;
          } catch {
            /* keep bundled stories */
          }
        }

        setPosts(nextPosts);
        setPeerStories(nextStories);
        let hint = '';
        if (!hasFeedApiToken() && !nextPosts.length) {
          hint = language === 'uk' ? 'Увійдіть у бекенд-акаунт, щоб бачити публікації й сторіс' : 'Sign in to backend account to see posts and stories';
        }
        setFeedSyncHint(hint);

        profilePageCache[cacheKey] = {
          at: Date.now(),
          profile: resolvedProfile,
          posts: nextPosts,
          peerStories: nextStories,
          feedSyncHint: hint,
        };
      } catch (e) {
        if (__DEV__) console.warn('[SocialUserProfile] feed', e?.message);
        if (nextPosts.length) setPosts(nextPosts);
        if (nextStories.length) setPeerStories(nextStories);
      }
    },
    [targetUsername, language, seedProfile, user],
  );

  useFocusEffect(
    useCallback(() => {
      if (isPlaceholderSocialUsername(targetUsername)) {
        navigation.goBack();
        return undefined;
      }
      void reload();
      return undefined;
    }, [reload, targetUsername, navigation]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_FEED_MEDIA_UPDATED, (payload) => {
      const updatedUserId = payload?.userId ? String(payload.userId) : '';
      const profileUserId = profile?.user_id ? String(profile.user_id) : '';
      if (updatedUserId && profileUserId && updatedUserId !== profileUserId && !payload?.postId) {
        return;
      }
      profilePageCache = {};
      void reload(true, true);
    });
    return () => sub.remove();
  }, [reload, profile?.user_id]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_SOCIAL_FOLLOW_CHANGED, (payload) => {
      const matches =
        socialFollowMatches(payload, profile?.username, profile?.user_id) ||
        socialFollowMatches(payload, targetUsername, profile?.user_id);
      setProfile((p) => {
        if (!p || !socialFollowMatches(payload, p.username, p.user_id)) return p;
        return { ...p, is_following: !!payload.is_following };
      });
      profilePageCache = {};
      if (matches) void reload(true, true);
    });
    return () => sub.remove();
  }, [reload, profile?.username, profile?.user_id, targetUsername]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_SOCIAL_GRAPH_CHANGED, () => {
      profilePageCache = {};
      void reload(true, true);
    });
    return () => sub.remove();
  }, [reload]);

  const onToggleFollow = async () => {
    if (!profile || followBusy) return;
    const prevFollowing = !!profile.is_following;
    setFollowBusy(true);
    // Оптимістичне оновлення — кнопка реагує миттєво
    setProfile((p) => (p ? { ...p, is_following: !prevFollowing } : p));
    try {
      const followOpts = { user_id: profile.user_id };
      if (prevFollowing) await socialUnfollowUsername(profile.username, followOpts);
      else await socialFollowUsername(profile.username, followOpts);
      profilePageCache = {};
      await reload(true, true);
    } catch (e) {
      // Відкочуємо оптимістичне оновлення
      setProfile((p) => (p ? { ...p, is_following: prevFollowing } : p));
      Alert.alert('', errorToUserText(e, language));
    } finally {
      setFollowBusy(false);
    }
  };

  const hasPeerStories = peerStories.length > 0;
  const peerStoriesHasUnviewed = storiesHasUnviewed(peerStories, { isAuthor: false });

  const openPeerStories = () => {
    if (!profile?.user_id || !hasPeerStories) return;
    navigation.navigate('FeedStoryViewer', {
      ...shell,
      userId: String(profile.user_id),
      fromProfile: true,
      prefetchedStories: peerStories,
      authorUsername: profile.username || '',
      ...(profile.display_name && String(profile.display_name).trim()
        ? { authorDisplayName: String(profile.display_name).trim() }
        : {}),
      authorAvatarUrl: resolveFeedMediaUrl(profile.avatar_url || '') || null,
    });
  };

  const openConnections = (kind) => {
    if (!profile?.username) return;
    navigation.navigate('SocialConnections', {
      ...shell,
      username: profile.username,
      kind,
    });
  };

  const onMessage = async () => {
    if (!profile || !hasMessageApiToken()) {
      Alert.alert('', pf(language, 'needBackendSocial'));
      return;
    }
    try {
      const meta = await messagesOpenThread({ peerUserId: profile.user_id });
      navigation.navigate('ChatThread', {
        ...shell,
        threadId: meta.id,
        peerName: peerUsernameFromMeta(meta),
        peerDisplayName: peerDisplayNameFromMeta(meta) || profile.display_name || profile.username,
        peerUsername: peerUsernameFromMeta(meta),
        peerAvatarUrl: resolveFeedMediaUrl(profile.avatar_url || meta.peer_avatar_url || '') || '',
        peerUserId: String(meta.peer_user_id || profile.user_id),
        useMessageApi: true,
        pendingForMe: !!meta.pending_for_me,
      });
    } catch (e) {
      Alert.alert('', errorToUserText(e, language));
    }
  };

  const profileGridItems = useMemo(
    () => posts.map((p) => apiPostToGridRow(p, [], null)).filter(Boolean),
    [posts],
  );

  useEffect(() => {
    const l = {};
    const lc = {};
    const cc = {};
    posts.forEach((p) => {
      const id = String(p.id);
      l[id] = !!p.liked_by_viewer;
      lc[id] = Number(p.likes_count) || 0;
      cc[id] = Number(p.comments_count) || 0;
    });
    setLikeMap(l);
    setLikeCountMap(lc);
    setCommentCountMap(cc);
  }, [posts]);

  const refreshModalPost = useCallback(async (postId, withSpinner = false) => {
    const id = String(postId || '');
    if (!id) return;
    if (withSpinner) setPostModalBusy(true);
    try {
      const [latestPosts, rows] = await Promise.all([
        feedListProfileUserPosts(
          profileFeedUsername(profile, targetUsername),
          profile?.user_id ? String(profile.user_id) : '',
          80,
        ),
        feedListPostComments(id, 120),
      ]);
      const latest = (Array.isArray(latestPosts) ? latestPosts : []).find((p) => String(p.id) === id) || null;
      if (latest) {
        setPostModal(latest);
        setLikeMap((m) => ({ ...m, [id]: !!latest.liked_by_viewer }));
        setLikeCountMap((m) => ({ ...m, [id]: Number(latest.likes_count) || 0 }));
        setCommentCountMap((m) => ({ ...m, [id]: Number(latest.comments_count) || 0 }));
      }
      setComments(Array.isArray(rows) ? rows : []);
    } catch {
      if (withSpinner) setComments([]);
    } finally {
      if (withSpinner) setPostModalBusy(false);
    }
  }, [targetUsername, profile]);

  const openPost = useCallback((post) => {
    const uri = pickFirstFeedMediaUrl(post);
    navigation.navigate('ProfilePostDetail', {
      ...shell,
      postId: post.id,
      coverUrl: uri,
      peerUsername: targetUsername,
      authorName: profile?.display_name || profile?.username || targetUsername,
      peerAvatarUrl: resolveFeedMediaUrl(profile?.avatar_url || '') || null,
      liked: !!post.liked_by_viewer,
      likesCount: Number(post.likes_count) || 0,
    });
  }, [navigation, shell, targetUsername, profile?.display_name, profile?.username, profile?.avatar_url]);

  // Post modal refreshes on open — no background polling

  const toggleLike = useCallback(async (post) => {
    const id = String(post?.id || '');
    if (!id) return;
    const prev = !!likeMap[id];
    const prevCount = Number(likeCountMap[id]) || 0;
    setLikeMap((m) => ({ ...m, [id]: !prev }));
    setLikeCountMap((m) => ({ ...m, [id]: prev ? Math.max(0, prevCount - 1) : prevCount + 1 }));
    try {
      const out = await feedTogglePostLike(id);
      setLikeMap((m) => ({ ...m, [id]: !!out.liked }));
      setLikeCountMap((m) => ({ ...m, [id]: Number(out.likes_count) || 0 }));
      DeviceEventEmitter.emit(KRAINA_FEED_MEDIA_UPDATED, { postId: id });
      setPostModal((prev) =>
        prev && String(prev.id) === id
          ? { ...prev, liked_by_viewer: !!out.liked, likes_count: Number(out.likes_count) || 0 }
          : prev,
      );
    } catch {
      setLikeMap((m) => ({ ...m, [id]: prev }));
      setLikeCountMap((m) => ({ ...m, [id]: prevCount }));
    }
  }, [likeMap, likeCountMap]);

  const sendComment = useCallback(async () => {
    const postId = String(postModal?.id || '');
    const text = String(commentText || '').trim();
    if (!postId || !text || commentBusy) return;
    setCommentBusy(true);
    try {
      const row = await feedAddPostComment(postId, text);
      setComments((prev) => [...prev, row]);
      setCommentText('');
      setCommentCountMap((m) => ({ ...m, [postId]: (Number(m[postId]) || 0) + 1 }));
      DeviceEventEmitter.emit(KRAINA_FEED_MEDIA_UPDATED, { postId });
      setPostModal((prev) =>
        prev && String(prev.id) === postId
          ? { ...prev, comments_count: (Number(prev.comments_count) || 0) + 1 }
          : prev,
      );
    } catch {
      /* */
    } finally {
      setCommentBusy(false);
    }
  }, [postModal?.id, commentText, commentBusy]);

  const sendPostToDm = useCallback(async () => {
    if (!postModal || !profile?.user_id || !hasMessageApiToken()) return;
    try {
      const meta = await messagesOpenThread({ peerUserId: profile.user_id });
      const first = Array.isArray(postModal.media_urls) ? String(postModal.media_urls[0] || '') : '';
      const txt = [postModal.content_text || '', first].filter(Boolean).join('\n');
      await messagesSendText(meta.id, txt || 'Post');
      Alert.alert('', language === 'uk' ? 'Надіслано у повідомлення' : 'Sent in messages');
    } catch {
      /* */
    }
  }, [postModal, profile?.user_id, language]);

  if (!targetUsername) {
    return (
      <View style={[styles.center, { backgroundColor: screenBg }]}>
        <Text style={{ color: textMain }}>-</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        replaceCenterTitle={`@${targetUsername}`}
        hideSendButton
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={accent} />
        </View>
      ) : !profile ? (
        <View style={[styles.center, { paddingHorizontal: 28 }]}>
          <Ionicons name="person-remove-outline" size={40} color={muted} />
          <Text style={{ color: muted, fontSize: 16, fontWeight: '600', marginTop: 12, textAlign: 'center' }}>
            {language === 'uk' ? 'Користувача не знайдено' : 'User not found'}
          </Text>
          <Text style={{ color: muted, fontSize: 13, marginTop: 6, textAlign: 'center' }}>
            {language === 'uk' ? 'Можливо, профіль видалено або юзернейм неправильний' : 'Profile may have been deleted or the username is incorrect'}
          </Text>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: accent, marginTop: 20, paddingHorizontal: 32, opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <Text style={{ color: onAccentButtonText(isLight), fontWeight: '700', fontSize: 15 }}>
              {language === 'uk' ? 'Назад' : 'Go Back'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingBottom: lightTabBarScrollContentPadding(insets.bottom, 24),
          }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void reload(true, true)} tintColor={accent} />
          }
          {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
        >
          <View style={styles.headWrap}>
            <View style={[styles.headCard, { backgroundColor: cardBg, borderColor: border }]}>
              <View style={styles.headRow}>
                <View style={styles.avatarCol}>
                  {hasPeerStories ? (
                    <Pressable
                      onPress={openPeerStories}
                      style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}
                      accessibilityRole="button"
                    >
                      <View
                        style={[
                          styles.avatarOuter,
                          storyAvatarRingStyle({
                            hasStories: true,
                            hasUnviewed: peerStoriesHasUnviewed,
                            isLight,
                          }),
                        ]}
                      >
                        <ProfileAvatarCircle
                          uri={resolveFeedMediaUrl(profile.avatar_url)}
                          size={82}
                          isLight={isLight}
                        />
                      </View>
                    </Pressable>
                  ) : (
                    <View style={[styles.avatarOuter, { borderWidth: 0 }]}>
                      <ProfileAvatarCircle
                        uri={resolveFeedMediaUrl(profile.avatar_url)}
                        size={82}
                        isLight={isLight}
                      />
                    </View>
                  )}
                </View>
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={[styles.statNum, brandFontSansSemibold, { color: textMain }]}>
                      {Math.max(profileGridItems.length, posts.length)}
                    </Text>
                    <Text style={[styles.statLabel, brandFontSans, { color: textStatLabel }]} numberOfLines={1}>
                      {pf(language, 'userPosts')}
                    </Text>
                  </View>
                  <Pressable style={styles.statItem} onPress={() => openConnections('followers')}>
                    <Text style={[styles.statNum, brandFontSansSemibold, { color: textMain }]}>{profile.followers_count ?? 0}</Text>
                    <Text style={[styles.statLabel, brandFontSans, { color: textStatLabel }]} numberOfLines={1}>
                      {pf(language, 'followers')}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.statItem} onPress={() => openConnections('following')}>
                    <Text style={[styles.statNum, brandFontSansSemibold, { color: textMain }]}>{profile.following_count ?? 0}</Text>
                    <Text style={[styles.statLabel, brandFontSans, { color: textStatLabel }]} numberOfLines={1}>
                      {pf(language, 'following')}
                    </Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.headText}>
                <Text style={[styles.name, brandFontHeadMedium, { color: textMain }]}>
                  {profile.display_name || `@${profile.username}`}
                </Text>
                <Text style={[styles.username, brandFontSans, { color: muted }]}>@{profile.username}</Text>
                {profile.location_label ? (
                  <Text style={[styles.location, brandFontSans, { color: muted }]}>{profile.location_label}</Text>
                ) : null}
                {profile.birth_date ? (
                  <Text style={[styles.location, brandFontSans, { color: muted }]}>
                    {formatBirthLabel(profile.birth_date, language)}
                  </Text>
                ) : null}
                {profile.bio ? (
                  <Text style={[styles.bio, brandFontSans, { color: muted }]} numberOfLines={3}>
                    {profile.bio}
                  </Text>
                ) : null}
              </View>

              {profile.user_id && user?.id && String(profile.user_id) !== String(user.id) ? (
                <View style={styles.actions}>
                  <Pressable
                    onPress={onToggleFollow}
                    disabled={followBusy}
                    style={({ pressed }) => [
                      styles.btn,
                      { backgroundColor: accent, opacity: pressed || followBusy ? 0.88 : 1 },
                    ]}
                    android_ripple={rippleOnDarkSurface}
                  >
                    <Ionicons
                      name={profile.is_following ? 'person-remove-outline' : 'person-add-outline'}
                      size={18}
                      color={onAccentButtonText(isLight)}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.btnText, brandFontSansSemibold, { color: onAccentButtonText(isLight) }]}>
                      {profile.is_following ? pf(language, 'unfollow') : pf(language, 'follow')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={onMessage}
                    style={({ pressed }) => [
                      styles.btnOutline,
                      { borderColor: isLight ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.2)', opacity: pressed ? 0.88 : 1 },
                    ]}
                    android_ripple={ripple}
                  >
                    <Ionicons name="chatbubble-outline" size={17} color={textMain} style={{ marginRight: 6 }} />
                    <Text style={[styles.btnOutlineText, brandFontSansSemibold, { color: textMain }]}>{pf(language, 'messageUser')}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>

          <View style={[styles.postsSection, { borderColor: border }]}>
            <Text style={[styles.sectionTitle, brandFontSansSemibold, { color: textMain }]}>{pf(language, 'userPosts')}</Text>
          </View>
          {feedSyncHint ? (
            <Text style={[styles.syncHint, brandFontSans, { color: muted }]}>{feedSyncHint}</Text>
          ) : null}
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
                    {language === 'uk' ? 'Стрічка' : 'Feed'}
                  </Text>
                </View>
                <Text style={styles.emptyStickerEmoji} allowFontScaling={false}>
                  📷
                </Text>
              </View>
              <Text style={[styles.emptyPostsTitle, brandFontHeadMedium, { color: textMain }]}>
                {pf(language, 'userPostsEmptyTitle')}
              </Text>
              <Text style={[styles.emptyPostsBody, brandFontSans, { color: muted }]}>
                {pf(language, 'userPostsEmptySubtitle')}
              </Text>
            </View>
          ) : (
            <View style={[styles.grid, { gap: GRID_GAP }]}>
              {profileGridItems.map((it) => (
                  <Pressable
                    key={it.id}
                    onPress={() => {
                      const post = posts.find((p) => String(p.id) === String(it.id));
                      if (post) openPost(post);
                    }}
                    style={{ width: CELL, height: CELL, borderRadius: 3, overflow: 'hidden' }}
                  >
                    {it.uri ? (
                      <RemotePhoto
                        source={{ uri: it.uri }}
                        style={styles.cellImg}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        recyclingKey={String(it.id)}
                        transition={120}
                        iconSize={20}
                      />
                    ) : (
                      <View style={[styles.cellImg, { backgroundColor: '#333' }]} />
                    )}
                    {it.isVideo ? (
                      <View style={styles.badgeVideo}>
                        <Ionicons name="play" size={12} color="#FFFFFF" />
                      </View>
                    ) : null}
                    {(it.mediaCount || 1) > 1 ? (
                      <View style={styles.badgeStack}>
                        <Ionicons name="images-outline" size={12} color="#FFFFFF" />
                      </View>
                    ) : null}
                  </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
      <Modal visible={!!postModal} transparent animationType="slide" onRequestClose={() => setPostModal(null)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { backgroundColor: isLight ? '#FFFFFF' : '#1A1A1A' }]}>
            {postModal ? (
              <>
                <View style={styles.modalHead}>
                  <ProfileAvatarCircle
                    uri={resolveFeedMediaUrl(profile?.avatar_url || '')}
                    size={36}
                    isLight={isLight}
                    style={styles.modalAvatar}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modalAuthor, { color: textMain }]}>
                      {profile?.display_name || `@${profile?.username || 'user'}`}
                    </Text>
                    <Text style={[styles.modalMeta, { color: muted }]}>
                      {postModal.place_label || '—'} · {formatPostAge(postModal.created_at, language)}
                    </Text>
                  </View>
                </View>
                {postModalBusy ? (
                  <View style={[styles.modalImage, styles.modalImageBusy]}>
                    <ActivityIndicator color={accent} />
                  </View>
                ) : Array.isArray(postModal.media_urls) && postModal.media_urls.length > 1 ? (
                  <View>
                    <FlatList
                      data={postModal.media_urls}
                      horizontal
                      pagingEnabled
                      keyExtractor={(it, i) => `${i}_${it}`}
                      showsHorizontalScrollIndicator={false}
                      maxToRenderPerBatch={3}
                      windowSize={3}
                      removeClippedSubviews={false}
                      initialNumToRender={3}
                      onMomentumScrollEnd={(e) => {
                        const w = e?.nativeEvent?.layoutMeasurement?.width || 1;
                        const x = e?.nativeEvent?.contentOffset?.x || 0;
                        const idx = Math.max(0, Math.min(postModal.media_urls.length - 1, Math.round(x / w)));
                        setPostMediaIndex(idx);
                      }}
                      renderItem={({ item }) => (
                        <RemotePhoto
                          source={{ uri: resolveFeedMediaUrl(String(item || '')) }}
                          style={styles.modalImage}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                        />
                      )}
                    />
                    <View style={styles.modalDots}>
                      {postModal.media_urls.map((_, i) => (
                        <View key={`md_${i}`} style={[styles.modalDot, i === postMediaIndex && { backgroundColor: accent, opacity: 1 }]} />
                      ))}
                    </View>
                  </View>
                ) : (
                  <RemotePhoto
                    source={{ uri: pickFirstFeedMediaUrl(postModal) }}
                    style={styles.modalImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                )}
                <View style={styles.modalActions}>
                  <Pressable onPress={() => toggleLike(postModal)} style={styles.modalActionBtn}>
                    <Ionicons
                      name={likeMap[String(postModal.id)] ? 'heart' : 'heart-outline'}
                      size={22}
                      color={likeMap[String(postModal.id)] ? '#FF4D6A' : textMain}
                    />
                    <Text style={[styles.modalActionTxt, { color: muted }]}>{Number(likeCountMap[String(postModal.id)]) || 0}</Text>
                  </Pressable>
                  <View style={styles.modalActionBtn}>
                    <Ionicons name="chatbubble-outline" size={20} color={textMain} />
                    <Text style={[styles.modalActionTxt, { color: muted }]}>{Number(commentCountMap[String(postModal.id)]) || 0}</Text>
                  </View>
                  <Pressable onPress={sendPostToDm} style={styles.modalActionBtn}>
                    <Ionicons name="paper-plane-outline" size={20} color={textMain} />
                  </Pressable>
                </View>
                {postModal.content_text ? (
                  <Text style={[styles.modalCaption, { color: textMain }]}>{postModal.content_text}</Text>
                ) : null}
                <ScrollView style={{ maxHeight: 180 }}>
                  {commentBusy && !comments.length ? <ActivityIndicator color={accent} style={{ marginVertical: 12 }} /> : null}
                  {comments.map((c) => (
                    <View key={String(c.id)} style={styles.commentRow}>
                      <Text style={[styles.commentUser, { color: textMain }]}>@{c.username || 'user'}</Text>
                      <Text style={[styles.commentBody, { color: muted }]}>{c.content}</Text>
                    </View>
                  ))}
                </ScrollView>
                <View style={styles.commentComposer}>
                  <TextInput
                    value={commentText}
                    onChangeText={setCommentText}
                    placeholder={language === 'uk' ? 'Напишіть коментар…' : 'Write a comment…'}
                    placeholderTextColor={muted}
                    style={[styles.commentInput, { color: textMain, borderColor: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.18)' }]}
                  />
                  <Pressable onPress={sendComment} style={[styles.commentSend, { backgroundColor: accent }]}>
                    <Text style={{ color: onAccentButtonText(isLight), fontWeight: '700' }}>
                      {language === 'uk' ? 'Надіслати' : 'Send'}
                    </Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => setPostModal(null)} style={styles.modalClose}>
                  <Text style={{ color: muted }}>{language === 'uk' ? 'Закрити' : 'Close'}</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headWrap: { paddingHorizontal: 16, paddingTop: 14 },
  headCard: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  avatarCol: { marginRight: 16, alignItems: 'stretch' },
  avatarOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignSelf: 'center',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: { marginTop: 12 },
  name: { fontSize: 20, fontWeight: '700' },
  username: { fontSize: 14, marginTop: 2 },
  location: { fontSize: 14, marginTop: 4 },
  bio: { fontSize: 14, marginTop: 8, lineHeight: 20 },
  statsRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', minWidth: 0 },
  statItem: { flex: 1, alignItems: 'center', minWidth: 0, paddingHorizontal: 2 },
  statNum: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 12, marginTop: 2, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontWeight: '700', fontSize: 15 },
  btnOutline: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'transparent',
  },
  btnOutlineText: { fontWeight: '700', fontSize: 15 },
  postsSection: {
    marginTop: 20,
    marginHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  syncHint: { marginTop: 6, marginHorizontal: 16, fontSize: 12.5 },
  emptyPostsWrap: {
    marginTop: 12,
    marginHorizontal: 16,
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
  emptyPostsBody: { fontSize: 15, lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, paddingHorizontal: 3 },
  cellImg: { width: '100%', height: '100%', borderRadius: 4 },
  badgeVideo: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  badgeStack: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 14,
    paddingBottom: 22,
  },
  modalHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  modalAvatar: { marginRight: 10 },
  modalAuthor: { fontSize: 14, fontWeight: '700' },
  modalMeta: { fontSize: 12, marginTop: 1 },
  modalImage: { width: '100%', aspectRatio: 1, borderRadius: 12, marginBottom: 10, backgroundColor: '#222' },
  modalImageBusy: { alignItems: 'center', justifyContent: 'center' },
  modalDots: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  modalDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.75)',
    opacity: 0.55,
  },
  modalActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  modalActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalActionTxt: { fontSize: 12 },
  modalCaption: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  commentRow: { paddingVertical: 6 },
  commentUser: { fontSize: 13, fontWeight: '700' },
  commentBody: { fontSize: 13, marginTop: 2 },
  commentComposer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  commentInput: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10 },
  commentSend: { minHeight: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 },
  modalClose: { alignItems: 'center', marginTop: 10 },
});
