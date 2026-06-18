import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { getAppTheme } from './themeStorage';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';
import { pf } from './profileI18n';
import { accentForTheme, onAccentButtonText, ACCENT_BLUE, ACCENT_LEMON } from './themeAccent';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import {
  socialGetPublicProfile,
  socialGetPublicProfileFull,
  socialFollowUsername,
  socialUnfollowUsername,
} from './socialApi';
import {
  feedListUserPosts,
  feedListStoriesForUser,
  hasFeedApiToken,
  feedTogglePostLike,
  feedListPostComments,
  feedAddPostComment,
} from './feedApi';
import { messagesOpenThread, messagesSendText, hasMessageApiToken } from './messageApi';
import { useAuthStore } from './auth/authStore';
import { KRAINA_FEED_MEDIA_UPDATED } from './feedSyncEvents';
import { resolveFeedMediaUrl } from './feedMediaUrl';
import { errorToUserText } from './errorText';
import {
  peerDisplayNameFromMeta,
  peerUsernameFromMeta,
} from './chatPeerDisplay';

const GRID_GAP = 1;
const COLS = 3;
const W = Dimensions.get('window').width;
const CELL = (W - GRID_GAP * (COLS - 1) - 6) / COLS;

function formatPostAge(iso, lang) {
  const d = new Date(String(iso || ''));
  if (Number.isNaN(d.getTime())) return '';
  const diffH = (Date.now() - d.getTime()) / 3600000;
  const langUk = String(lang || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  if (diffH < 1) return langUk ? 'щойно' : 'just now';
  if (diffH < 24) return `${Math.floor(diffH)} ${langUk ? 'год' : 'h'}`;
  return `${Math.floor(diffH / 24)} ${langUk ? 'дн.' : 'd'}`;
}

export default function SocialUserProfilePage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const user = route?.params?.user || {};
  const countryId = route?.params?.countryId;
  const targetUsername = String(route?.params?.username || '').trim();
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [peerStories, setPeerStories] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [feedSyncHint, setFeedSyncHint] = useState('');
  const profilePageCache = useRef({});
  const PROFILE_PAGE_CACHE_TTL = 120000;

  const [postModal, setPostModal] = useState(null);
  const [likeMap, setLikeMap] = useState({});
  const [likeCountMap, setLikeCountMap] = useState({});
  const [commentCountMap, setCommentCountMap] = useState({});
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [postModalBusy, setPostModalBusy] = useState(false);
  const [postMediaIndex, setPostMediaIndex] = useState(0);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const muted = isLight ? '#5C5C5C' : '#9A9A9A';
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const cardBg = isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)';
  const border = isLight ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.12)';
  const heroBg = isLight ? 'rgba(2,18,235,0.05)' : 'rgba(255,255,255,0.07)';
  const heroBorder = isLight ? 'rgba(2,18,235,0.14)' : 'rgba(255,255,255,0.14)';

  const shell = {
    user,
    language,
    ...(countryId != null ? { countryId } : {}),
    appTheme,
  };

  const reload = useCallback(
    async (silent = false, force = false) => {
      const t = await getAppTheme();
      setAppTheme(t === 'light' ? 'light' : 'dark');
      if (!targetUsername) {
        setLoading(false);
        return;
      }
      const cacheKey = `profile__${targetUsername}`;
      const cached = profilePageCache.current[cacheKey];
      const cacheFresh = cached && Date.now() - cached.at < PROFILE_PAGE_CACHE_TTL;

      // Fresh cache — use it, skip revalidation
      if (!force && cacheFresh) {
        if (__DEV__) console.log(`[Cache] SocialUserProfile HIT fresh @${targetUsername} age=${Date.now() - cached.at}ms`);
        setProfile(cached.profile);
        setPosts(cached.posts);
        setPeerStories(cached.peerStories);
        setFriends(cached.friends);
        setFeedSyncHint(cached.feedSyncHint);
        setLoading(false);
        return;
      }

      // Stale cache — show immediately, revalidate in background (no spinner)
      if (!force && cached) {
        if (__DEV__) console.log(`[Cache] SocialUserProfile STALE hit @${targetUsername} age=${Date.now() - cached.at}ms — background revalidation`);
        setProfile(cached.profile);
        setPosts(cached.posts);
        setPeerStories(cached.peerStories);
        setFriends(cached.friends);
        setFeedSyncHint(cached.feedSyncHint);
        setLoading(false);
      } else if (__DEV__ && !cached) {
        console.log(`[Cache] SocialUserProfile MISS @${targetUsername}`);
      }
      if (__DEV__ && force && cached) {
        console.log(`[Cache] SocialUserProfile FORCE refresh @${targetUsername} age=${Date.now() - cached.at}ms`);
      }

      const needsSpinner = force || !cached;
      if (needsSpinner) {
        if (silent) setRefreshing(true);
        else setLoading(true);
      }
      try {
        const full = await socialGetPublicProfileFull(targetUsername, 80).catch(() => null);
        const p = full?.profile || (await socialGetPublicProfile(targetUsername));
        setProfile(p);
        setFriends(Array.isArray(full?.friends) ? full.friends : []);

        await useAuthStore.getState().hydrate();
        if (!useAuthStore.getState().accessToken) {
          await useAuthStore.getState().refreshSession().catch(() => {});
        }

        const grid = await feedListUserPosts(targetUsername, 60);
        setPosts(Array.isArray(grid) ? grid : []);

        let stories = [];
        if (p?.user_id && hasFeedApiToken()) {
          try {
            const sl = await feedListStoriesForUser(String(p.user_id));
            if (Array.isArray(sl) && sl.length) stories = sl;
          } catch {
            stories = [];
          }
        }
        setPeerStories(stories);
        let hint = '';
        if (!hasFeedApiToken()) {
          hint = language === 'uk' ? 'Увійдіть у бекенд-акаунт, щоб бачити публікації й сторіс' : 'Sign in to backend account to see posts and stories';
        }
        setFeedSyncHint(hint);

        profilePageCache.current[cacheKey] = {
          at: Date.now(),
          profile: p,
          posts: grid,
          peerStories: stories,
          friends: full?.friends || [],
          feedSyncHint: hint,
        };
      } catch (e) {
        if (!cached) {
          setProfile(null);
          setPosts([]);
          setPeerStories([]);
          setFriends([]);
        }
        if (__DEV__) console.warn('[SocialUserProfile]', e?.message);
      } finally {
        if (needsSpinner) {
          if (silent) setRefreshing(false);
          else setLoading(false);
        }
      }
    },
    [targetUsername, language],
  );

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_FEED_MEDIA_UPDATED, () => {
      profilePageCache.current = {};
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
      if (prevFollowing) await socialUnfollowUsername(profile.username);
      else await socialFollowUsername(profile.username);
      profilePageCache.current = {};
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
  const peerNewestStoryId =
    hasPeerStories && peerStories[peerStories.length - 1]?.id
      ? String(peerStories[peerStories.length - 1].id)
      : null;

  const openPeerStories = () => {
    if (!profile?.user_id || !peerNewestStoryId) return;
    navigation.navigate('FeedStoryViewer', {
      ...shell,
      userId: String(profile.user_id),
      storyId: peerNewestStoryId,
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
        useMessageApi: true,
        pendingForMe: !!meta.pending_for_me,
      });
    } catch (e) {
      Alert.alert('', errorToUserText(e, language));
    }
  };

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
        feedListUserPosts(targetUsername, 80),
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
  }, [targetUsername]);

  const openPost = useCallback(async (post) => {
    setPostModal(post);
    setPostMediaIndex(0);
    setComments([]);
    setCommentBusy(true);
    try {
      await refreshModalPost(post?.id, true);
    } finally {
      setCommentBusy(false);
    }
  }, [refreshModalPost]);

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
        lightBarBackgroundColor={isLight ? '#FFFFFF' : undefined}
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
            paddingBottom: insets.bottom + lightTabBarExtraScrollPadding() + 24,
          }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void reload(true, true)} tintColor={accent} />
          }
          {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
        >
          <View style={styles.headWrap}>
            <View style={[styles.profileHero, { backgroundColor: heroBg, borderColor: heroBorder }]}>
              <Ionicons name="person-circle-outline" size={18} color={isLight ? '#0212EB' : '#E1FF00'} />
              <Text style={[styles.profileHeroText, { color: muted }]}>
                {language === 'uk' ? 'Профіль користувача' : 'User profile'}
              </Text>
            </View>
            <View style={[styles.headCard, { backgroundColor: cardBg, borderColor: border }]}>
              <View style={styles.head}>
                {hasPeerStories ? (
                  <Pressable
                    onPress={openPeerStories}
                    style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
                    accessibilityRole="button"
                  >
                    <View
                      style={[
                        styles.avatarRingWrap,
                        { borderColor: isLight ? ACCENT_BLUE : ACCENT_LEMON },
                      ]}
                    >
                      {profile.avatar_url ? (
                        <Image source={{ uri: resolveFeedMediaUrl(profile.avatar_url) }} style={styles.avatarRingInner} resizeMode="cover" />
                      ) : (
                        <View
                          style={[styles.avatarRingInner, { backgroundColor: isLight ? '#E0E0DC' : '#333' }]}
                        />
                      )}
                    </View>
                  </Pressable>
                ) : profile.avatar_url ? (
                  <Image source={{ uri: resolveFeedMediaUrl(profile.avatar_url) }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: isLight ? '#E0E0DC' : '#333' }]} />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.name, { color: textMain }]}>
                    {profile.display_name || `@${profile.username}`}
                  </Text>
                  <Text style={[styles.username, { color: muted }]}>@{profile.username}</Text>
                  {profile.location_label ? (
                    <Text style={[styles.location, { color: muted }]}>{profile.location_label}</Text>
                  ) : null}
                  {profile.bio ? (
                    <Text style={[styles.bio, { color: textMain }]}>{profile.bio}</Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.countersRow}>
                <View style={styles.counterItem}>
                  <Text style={[styles.counterNum, { color: textMain }]}>{posts.length}</Text>
                  <Text style={[styles.counterLabel, { color: muted }]}>{pf(language, 'userPosts')}</Text>
                </View>
                <Pressable style={styles.counterItem} onPress={() => openConnections('friends')}>
                  <Text style={[styles.counterNum, { color: textMain }]}>{friends.length}</Text>
                  <Text style={[styles.counterLabel, { color: muted }]}>{pf(language, 'friends')}</Text>
                </Pressable>
                <Pressable style={styles.counterItem} onPress={() => openConnections('followers')}>
                  <Text style={[styles.counterNum, { color: textMain }]}>{profile.followers_count ?? 0}</Text>
                  <Text style={[styles.counterLabel, { color: muted }]}>{pf(language, 'followers')}</Text>
                </Pressable>
                <Pressable style={styles.counterItem} onPress={() => openConnections('following')}>
                  <Text style={[styles.counterNum, { color: textMain }]}>{profile.following_count ?? 0}</Text>
                  <Text style={[styles.counterLabel, { color: muted }]}>{pf(language, 'following')}</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {profile.user_id && user?.id && String(profile.user_id) !== String(user.id) ? (
            <View style={styles.actionsWrap}>
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
                  <Text style={[styles.btnText, { color: onAccentButtonText(isLight) }]}>
                    {profile.is_following ? pf(language, 'unfollow') : pf(language, 'follow')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onMessage}
                  style={({ pressed }) => [
                    styles.btnOutline,
                    { borderColor: accent, opacity: pressed ? 0.88 : 1 },
                  ]}
                  android_ripple={ripple}
                >
                  <Text style={[styles.btnOutlineText, { color: accent }]}>{pf(language, 'messageUser')}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <Text style={[styles.sectionTitle, styles.postsTitle, { color: textMain }]}>{pf(language, 'userPosts')}</Text>
          {feedSyncHint ? (
            <Text style={[styles.syncHint, { color: muted }]}>{feedSyncHint}</Text>
          ) : null}
          {posts.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor: border }]}>
              <Ionicons name="images-outline" size={24} color={muted} />
              <Text style={[styles.emptyText, { color: muted }]}>{pf(language, 'noPosts')}</Text>
            </View>
          ) : (
            <View style={[styles.grid, { gap: GRID_GAP }]}>
              {posts.map((p) => {
                const uri = resolveFeedMediaUrl((p.media_urls && p.media_urls[0]) || '');
                const mediaCount = Array.isArray(p.media_urls) ? p.media_urls.length : 0;
                const isVideo = /\.(mp4|mov)(\?|$)/i.test(String(uri));
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => openPost(p)}
                    style={{ width: CELL, height: CELL, borderRadius: 3, overflow: 'hidden' }}
                  >
                    {uri ? (
                      <Image source={{ uri }} style={styles.cellImg} resizeMode="cover" />
                    ) : (
                      <View style={[styles.cellImg, { backgroundColor: '#333' }]} />
                    )}
                    {isVideo ? (
                      <View style={styles.badgeVideo}>
                        <Ionicons name="play" size={12} color="#FFFFFF" />
                      </View>
                    ) : null}
                    {mediaCount > 1 ? (
                      <View style={styles.badgeStack}>
                        <Ionicons name="images-outline" size={12} color="#FFFFFF" />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
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
                  {profile?.avatar_url ? (
                    <Image source={{ uri: resolveFeedMediaUrl(profile.avatar_url) }} style={styles.modalAvatar} />
                  ) : (
                    <View style={[styles.modalAvatar, { backgroundColor: isLight ? '#E0E0DC' : '#333' }]} />
                  )}
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
                      removeClippedSubviews={Platform.OS === 'android'}
                      initialNumToRender={3}
                      onMomentumScrollEnd={(e) => {
                        const w = e?.nativeEvent?.layoutMeasurement?.width || 1;
                        const x = e?.nativeEvent?.contentOffset?.x || 0;
                        const idx = Math.max(0, Math.min(postModal.media_urls.length - 1, Math.round(x / w)));
                        setPostMediaIndex(idx);
                      }}
                      renderItem={({ item }) => (
                        <Image
                          source={{ uri: resolveFeedMediaUrl(String(item || '')) }}
                          style={styles.modalImage}
                          resizeMode="cover"
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
                  <Image
                    source={{ uri: resolveFeedMediaUrl((postModal.media_urls && postModal.media_urls[0]) || '') }}
                    style={styles.modalImage}
                    resizeMode="cover"
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
  profileHero: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileHeroText: { fontSize: 13, fontWeight: '600' },
  headCard: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarRingWrap: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarRingInner: { width: 72, height: 72, borderRadius: 36 },
  name: { fontSize: 20, fontWeight: '700' },
  username: { fontSize: 13, marginTop: 2, fontWeight: '600' },
  location: { fontSize: 13, marginTop: 3 },
  bio: { fontSize: 14, marginTop: 8, lineHeight: 20 },
  countersRow: { flexDirection: 'row', marginTop: 12 },
  counterItem: { flex: 1, alignItems: 'center' },
  counterNum: { fontSize: 18, fontWeight: '800' },
  counterLabel: { fontSize: 12, marginTop: 2 },
  actionsWrap: { paddingHorizontal: 16, marginTop: 12 },
  actions: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnText: { fontWeight: '700', fontSize: 15 },
  btnOutline: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  btnOutlineText: { fontWeight: '700', fontSize: 15 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginTop: 18 },
  postsTitle: { marginHorizontal: 16, marginTop: 22 },
  syncHint: { marginTop: 6, marginHorizontal: 16, fontSize: 12.5 },
  emptyCard: {
    marginTop: 10,
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: { fontSize: 14 },
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
  modalAvatar: { width: 36, height: 36, borderRadius: 18 },
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
