import { resolveAppTheme } from './themeStorage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  FlatList,
  ScrollView,
  Modal,
  useWindowDimensions,
  ActivityIndicator,
  Share,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StatusBar,
  PanResponder,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, ResizeMode } from './expoAvCompat';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSyncedAppLanguage } from './useAppLanguage';

import { ft } from './feedI18n';
import {
  feedListStoriesForUser,
  feedRecordStoryView,
  feedGetStoryStats,
  feedToggleStoryLike,
  feedDeleteStory,
  hasFeedApiToken,
} from './feedApi';
import { getUserFeedStories, getLikedStoryIds, toggleFeedStoryLike, removeUserFeedStory, markOwnStoryViewed, enrichOwnStoriesWithViewed } from './feedLocalStorage';
import { hasMessageApiToken, messagesOpenThread, messagesSendText } from './messageApi';
import { ApiError } from './auth/types';
import { ACCENT_BLUE, ACCENT_LEMON, accentForTheme, onAccentButtonText } from './themeAccent';
import { resolveFeedMediaUrl } from './feedMediaUrl';
import { emitFeedMediaUpdated } from './feedSyncEvents';
import { useAuthStore } from './auth/authStore';

const STORY_SLIDE_MS = 7000;
const SHEET_EXPANDED_EXTRA = 228;
const SHEET_HANDLE_AREA = 26;
const SHEET_ACTIONS_ROW = 56;
const SHEET_COLLAPSED_CORE = SHEET_HANDLE_AREA + SHEET_ACTIONS_ROW;

function storyCreatedMs(story) {
  const raw = story?.created_at ?? story?.createdAt ?? story?.created;
  if (!raw) return 0;
  if (typeof raw === 'number') return raw;
  if (raw && typeof raw.toMillis === 'function') return raw.toMillis();
  if (raw && typeof raw.seconds === 'number') {
    return raw.seconds * 1000 + Math.floor((Number(raw.nanoseconds) || 0) / 1000000);
  }
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortStoriesOldestFirst(list) {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    const ta = storyCreatedMs(a);
    const tb = storyCreatedMs(b);
    if (ta !== tb) return ta - tb;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

function pickViewerStartIndex(list, storyId) {
  if (storyId != null) {
    const byId = list.findIndex((s) => String(s?.id) === String(storyId));
    if (byId >= 0) return byId;
  }
  return 0;
}

/** Локальні історії (ще не на сервері або фонова синхронізація не встигла). */
async function loadLocalAuthorStoryRows(user, viewerId) {
  if (!user || !viewerId) return [];
  const rows = await getUserFeedStories(user);
  const pm = useAuthStore.getState().profileMe?.profile;
  const displayName =
    pm?.display_name != null && String(pm.display_name).trim()
      ? String(pm.display_name).trim()
      : user?.name && String(user.name).trim()
        ? String(user.name).trim()
        : '';
  const username =
    pm?.username != null && String(pm.username).trim()
      ? String(pm.username).trim()
      : (user.name || user.email || '').split('@')[0] || '';
  let list = (Array.isArray(rows) ? rows : []).map((r) => ({
    id: r.id,
    user_id: String(viewerId),
    media_url: r.uri,
    media_kind: /\.(mp4|mov)(\?|$)/i.test(String(r.uri)) ? 'video' : 'image',
    caption: r.caption || '',
    username,
    display_name: displayName || null,
    avatar_url: user.avatar || null,
    liked_by_viewer: false,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
  }));
  list = await enrichOwnStoriesWithViewed(user, list);
  return sortStoriesOldestFirst(list);
}

function formatStoryTime(iso, langUk) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffH = (Date.now() - d.getTime()) / 3600000;
  if (diffH < 1) return langUk ? 'щойно' : 'now';
  if (diffH < 24) {
    const h = Math.floor(diffH);
    return langUk ? `${h} год` : `${h}h`;
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function FeedStoryViewerPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const language = useSyncedAppLanguage(route, 'uk');
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const user = route?.params?.user || {};
  const authorId = route?.params?.userId;
  const initialStoryId = route?.params?.storyId;
  const useLocalStories = route?.params?.useLocalStories === true;
  const prefetchedStories = route?.params?.prefetchedStories;
  const paramAuthorUsername = route?.params?.authorUsername;
  const paramAuthorDisplayName = route?.params?.authorDisplayName;
  const paramAuthorAvatarUrl = route?.params?.authorAvatarUrl;
  const fromProfile = route?.params?.fromProfile === true;
  const profileMeUserId = useAuthStore((s) => s.profileMe?.profile?.user_id);
  const viewerId = profileMeUserId
    ? String(profileMeUserId)
    : user?.id
      ? String(user.id)
      : null;

  const isLight = (resolveAppTheme(route?.params?.appTheme)) === 'light';
  const progressAccent = isLight ? ACCENT_BLUE : ACCENT_LEMON;

  const shell = useMemo(
    () => ({
      user,
      language,
      ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
      appTheme: resolveAppTheme(route?.params?.appTheme),
    }),
    [user, language, route?.params?.countryId, route?.params?.appTheme],
  );

  const [stories, setStories] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statsOpen, setStatsOpen] = useState(false);
  const [viewers, setViewers] = useState([]);
  const [likers, setLikers] = useState([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsByStory, setStatsByStory] = useState({});
  const [replyBarText, setReplyBarText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [authorMenuOpen, setAuthorMenuOpen] = useState(false);
  const [likedMap, setLikedMap] = useState({});
  const [progress, setProgress] = useState(0);
  const [holdPaused, setHoldPaused] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [failedMediaIds, setFailedMediaIds] = useState(() => new Set());
  const [forceImageIds, setForceImageIds] = useState(() => new Set());
  const listRef = useRef(null);
  const timerRef = useRef(null);
  const progressRef = useRef(0);
  const slideIdForTimerRef = useRef(null);
  const resumeFromHoldRef = useRef(false);

  const isAuthor = useMemo(
    () => viewerId && authorId && String(authorId) === String(viewerId),
    [viewerId, authorId],
  );

  const profileMeDisplayName = useAuthStore((s) => {
    const dn = s.profileMe?.profile?.display_name;
    return dn != null && String(dn).trim() ? String(dn).trim() : '';
  });
  const profileMeUsername = useAuthStore((s) => {
    const u = s.profileMe?.profile?.username;
    return u != null && String(u).trim() ? String(u).trim() : '';
  });

  const bottomInset = Math.max(insets.bottom, 14);
  const sheetExpandAnim = useRef(new Animated.Value(0)).current;
  const sheetDragStart = useRef(0);

  const animateSheet = useCallback(
    (open) => {
      Animated.spring(sheetExpandAnim, {
        toValue: open ? 1 : 0,
        useNativeDriver: false,
        friction: 9,
        tension: 72,
      }).start(({ finished }) => {
        if (finished) setSheetExpanded(!!open);
      });
    },
    [sheetExpandAnim],
  );

  const toggleSheet = useCallback(() => {
    animateSheet(!sheetExpanded);
  }, [animateSheet, sheetExpanded]);

  const collapseSheet = useCallback(() => {
    animateSheet(false);
  }, [animateSheet]);

  const bottomBarReserve = bottomInset + SHEET_COLLAPSED_CORE + (sheetExpanded ? SHEET_EXPANDED_EXTRA : 0);

  const sheetPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          sheetExpandAnim.stopAnimation((v) => {
            sheetDragStart.current = v;
          });
        },
        onPanResponderMove: (_, g) => {
          const next = Math.min(1, Math.max(0, sheetDragStart.current - g.dy / SHEET_EXPANDED_EXTRA));
          sheetExpandAnim.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy < -48 || g.vy < -0.28) {
            animateSheet(true);
            return;
          }
          if (g.dy > 48 || g.vy > 0.28) {
            animateSheet(false);
            return;
          }
          sheetExpandAnim.stopAnimation((v) => {
            animateSheet(v > 0.42);
          });
        },
      }),
    [animateSheet, sheetExpandAnim],
  );

  const load = useCallback(async () => {
    if (!authorId) {
      navigation.goBack();
      return;
    }
    setLoading(true);
    const authorIsViewer = viewerId && String(authorId) === String(viewerId);
    try {
      if (Array.isArray(prefetchedStories) && prefetchedStories.length) {
        let list = prefetchedStories;
        if (authorIsViewer && user?.id) {
          list = await enrichOwnStoriesWithViewed(user, list);
        }
        list = sortStoriesOldestFirst(list);
        setStories(list);
        setFailedMediaIds(new Set());
        setForceImageIds(new Set());
        setIndex(pickViewerStartIndex(list, initialStoryId));
        setLoading(false);
        return;
      }

      if (useLocalStories && viewerId && authorIsViewer && user) {
        const list = await loadLocalAuthorStoryRows(user, viewerId);
        if (list.length) {
          setStories(list);
          setFailedMediaIds(new Set());
          setForceImageIds(new Set());
          setIndex(pickViewerStartIndex(list, initialStoryId));
          setLoading(false);
          return;
        }
        if (!hasFeedApiToken()) {
          setStories([]);
          setLoading(false);
          return;
        }
      }

      const apiList = await feedListStoriesForUser(String(authorId));
      if (Array.isArray(apiList) && apiList.length) {
        let list = apiList;
        if (authorIsViewer && user?.id) {
          list = await enrichOwnStoriesWithViewed(user, list);
        }
        list = sortStoriesOldestFirst(list);
        setStories(list);
        setFailedMediaIds(new Set());
        setForceImageIds(new Set());
        setIndex(pickViewerStartIndex(list, initialStoryId));
      } else if (authorIsViewer && user && viewerId) {
        const localList = await loadLocalAuthorStoryRows(user, viewerId);
        setStories(localList);
        setFailedMediaIds(new Set());
        setForceImageIds(new Set());
        setIndex(pickViewerStartIndex(localList, initialStoryId));
      } else {
        setStories([]);
      }
    } catch {
      if (authorIsViewer && user && viewerId) {
        try {
          const localList = await loadLocalAuthorStoryRows(user, viewerId);
          if (localList.length) {
            setStories(localList);
            setFailedMediaIds(new Set());
            setForceImageIds(new Set());
            setIndex(pickViewerStartIndex(localList, initialStoryId));
            return;
          }
        } catch {
          /* */
        }
      }
      setStories([]);
    } finally {
      setLoading(false);
    }
  }, [authorId, fromProfile, initialStoryId, navigation, prefetchedStories, useLocalStories, user, viewerId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isAuthor || !useAuthStore.getState().accessToken) return;
    void useAuthStore.getState().loadProfileMeIfStale();
  }, [isAuthor]);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', () => {
      if (authorId) {
        emitFeedMediaUpdated({ kind: 'story', userId: String(authorId) });
      }
    });
    return unsub;
  }, [navigation, authorId]);

  useEffect(() => {
    if (!stories.length || !user?.id) return;
    let cancelled = false;
    (async () => {
      const liked = await getLikedStoryIds(user);
      const next = {};
      stories.forEach((s) => {
        if (s.liked_by_viewer) next[s.id] = true;
        else if (liked.has(String(s.id))) next[s.id] = true;
      });
      if (!cancelled) setLikedMap(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [stories, user]);

  useEffect(() => {
    if (statsOpen || authorMenuOpen) collapseSheet();
  }, [statsOpen, authorMenuOpen, collapseSheet]);

  useEffect(() => {
    if (!stories.length || !listRef.current) return;
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index, animated: false });
      } catch {
        /* */
      }
    });
  }, [stories.length, index]);

  const current = stories[index];

  useEffect(() => {
    collapseSheet();
  }, [current?.id, collapseSheet]);

  const authorUsername = useMemo(() => {
    if (isAuthor && profileMeUsername) return profileMeUsername;
    const u = paramAuthorUsername || current?.username;
    if (!u) return '';
    return String(u).replace(/^@/, '').trim();
  }, [isAuthor, profileMeUsername, paramAuthorUsername, current?.username]);

  const authorDisplayName = useMemo(() => {
    if (isAuthor && profileMeDisplayName) return profileMeDisplayName;
    const fromParam = paramAuthorDisplayName && String(paramAuthorDisplayName).trim();
    if (fromParam) return fromParam;
    const fromStory = current?.display_name && String(current.display_name).trim();
    if (fromStory) return fromStory;
    return '';
  }, [isAuthor, profileMeDisplayName, paramAuthorDisplayName, current?.display_name]);

  const authorLine = useMemo(() => {
    if (authorDisplayName) return authorDisplayName;
    if (authorUsername) return `@${authorUsername}`;
    return '—';
  }, [authorDisplayName, authorUsername]);

  const authorAvatarUri = useMemo(() => {
    const raw = paramAuthorAvatarUrl || current?.avatar_url;
    if (!raw) return null;
    return resolveFeedMediaUrl(raw);
  }, [paramAuthorAvatarUrl, current?.avatar_url]);

  useEffect(() => {
    if (!current || !viewerId || useLocalStories) return;
    if (String(current.user_id) === viewerId) {
      void markOwnStoryViewed(user, current.id).then(() => {
        setStories((prev) =>
          prev.map((s) =>
            String(s.id) === String(current.id) ? { ...s, own_seen_by_viewer: true } : s,
          ),
        );
      });
      return;
    }
    feedRecordStoryView(current.id)
      .then(() => {
        setStories((prev) =>
          prev.map((s) =>
            String(s.id) === String(current.id) ? { ...s, seen_by_viewer: true } : s,
          ),
        );
      })
      .catch(() => {});
  }, [current, viewerId, useLocalStories, user]);

  const advanceSlide = useCallback(() => {
    if (!stories.length) return;
    if (index < stories.length - 1) {
      const ni = index + 1;
      setIndex(ni);
      try {
        listRef.current?.scrollToIndex({ index: ni, animated: true });
      } catch {
        /* */
      }
    } else {
      navigation.goBack();
    }
  }, [index, navigation, stories.length]);

  const goPrevSlide = useCallback(() => {
    if (!stories.length || index <= 0) return;
    const pi = index - 1;
    setIndex(pi);
    try {
      listRef.current?.scrollToIndex({ index: pi, animated: true });
    } catch {
      /* */
    }
  }, [index, stories.length]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const onStoryHoldIn = useCallback(() => {
    setHoldPaused(true);
  }, []);

  const onStoryHoldOut = useCallback(() => {
    resumeFromHoldRef.current = true;
    setHoldPaused(false);
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!current?.id || !stories.length) {
      slideIdForTimerRef.current = null;
      setProgress(0);
      return;
    }
    if (statsOpen || authorMenuOpen || holdPaused || sheetExpanded) {
      return;
    }

    let slideStartMs = Date.now();
    const isNewSlide = slideIdForTimerRef.current !== current.id;

    if (isNewSlide) {
      slideIdForTimerRef.current = current.id;
      resumeFromHoldRef.current = false;
      setProgress(0);
      progressRef.current = 0;
      slideStartMs = Date.now();
    } else if (resumeFromHoldRef.current) {
      resumeFromHoldRef.current = false;
      slideStartMs = Date.now() - progressRef.current * STORY_SLIDE_MS;
    } else {
      setProgress(0);
      progressRef.current = 0;
      slideStartMs = Date.now();
    }

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - slideStartMs;
      const p = Math.min(1, elapsed / STORY_SLIDE_MS);
      setProgress(p);
      if (p >= 1) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        advanceSlide();
      }
    }, 40);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [current?.id, stories.length, advanceSlide, statsOpen, authorMenuOpen, holdPaused, sheetExpanded]);

  const openStats = useCallback(async () => {
    if (!current || !isAuthor || useLocalStories || !hasFeedApiToken()) return;
    setStatsOpen(true);
    setStatsLoading(true);
    try {
      const pack = await feedGetStoryStats(current.id);
      setViewers(Array.isArray(pack.viewers) ? pack.viewers : []);
      setLikers(Array.isArray(pack.likers) ? pack.likers : []);
    } catch {
      setViewers([]);
      setLikers([]);
    } finally {
      setStatsLoading(false);
    }
  }, [current, isAuthor, useLocalStories]);

  const refreshCurrentStats = useCallback(
    async (forModal = false) => {
      if (!current || !isAuthor || useLocalStories || !hasFeedApiToken()) return;
      if (forModal) setStatsLoading(true);
      try {
        const pack = await feedGetStoryStats(current.id);
        const nextViewers = Array.isArray(pack.viewers) ? pack.viewers : [];
        const nextLikers = Array.isArray(pack.likers) ? pack.likers : [];
        setViewers(nextViewers);
        setLikers(nextLikers);
        setStatsByStory((prev) => ({
          ...prev,
          [String(current.id)]: {
            viewersCount: nextViewers.length,
            likersCount: nextLikers.length,
          },
        }));
      } catch {
        if (forModal) {
          setViewers([]);
          setLikers([]);
        }
      } finally {
        if (forModal) setStatsLoading(false);
      }
    },
    [current, isAuthor, useLocalStories],
  );

  useEffect(() => {
    if (!current || !isAuthor || useLocalStories || !hasFeedApiToken()) return;
    void refreshCurrentStats(false);
    const timer = setInterval(() => {
      void refreshCurrentStats(false);
    }, 5000);
    return () => clearInterval(timer);
  }, [current?.id, isAuthor, useLocalStories, refreshCurrentStats]);

  useEffect(() => {
    if (!statsOpen || !current || !isAuthor || useLocalStories || !hasFeedApiToken()) return;
    void refreshCurrentStats(true);
    const timer = setInterval(() => {
      void refreshCurrentStats(false);
    }, 3000);
    return () => clearInterval(timer);
  }, [statsOpen, current?.id, isAuthor, useLocalStories, refreshCurrentStats]);

  const statsSwipeEnabled =
    isAuthor &&
    !useLocalStories &&
    hasFeedApiToken() &&
    !!current &&
    !statsOpen &&
    !authorMenuOpen &&
    !holdPaused;

  const storySwipePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => {
          if (!statsSwipeEnabled) return false;
          return g.dy < -14 && Math.abs(g.dy) > Math.abs(g.dx) * 1.15;
        },
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_, g) => {
          if (!statsSwipeEnabled) return;
          if (g.dy < -56 || g.vy < -0.35) {
            void openStats();
          }
        },
      }),
    [statsSwipeEnabled, openStats],
  );

  const swipeCellProps = statsSwipeEnabled ? storySwipePan.panHandlers : {};
  const currentStoryStats = statsByStory[String(current?.id || '')] || { viewersCount: 0, likersCount: 0 };

  const onMomentumEnd = useCallback(
    (e) => {
      const x = e.nativeEvent.contentOffset.x;
      const i = Math.round(x / width);
      setIndex(Math.max(0, Math.min(i, stories.length - 1)));
    },
    [width, stories.length],
  );

  const onToggleLike = useCallback(async () => {
    if (!current || !user?.id) return;
    try {
      if (useLocalStories || !hasFeedApiToken()) {
        const liked = await toggleFeedStoryLike(user, current.id);
        setLikedMap((prev) => ({ ...prev, [current.id]: liked }));
        return;
      }
      const liked = await feedToggleStoryLike(current.id);
      setLikedMap((prev) => ({ ...prev, [current.id]: liked }));
    } catch {
      /* */
    }
  }, [current, user, useLocalStories]);

  const onShareStory = useCallback(async () => {
    if (!current?.media_url) return;
    const resolved = resolveFeedMediaUrl(current.media_url);
    const cap = (current.caption || '').trim();
    const msg = cap ? `${cap}\n${resolved}` : resolved;
    try {
      await Share.share({ message: msg, url: resolved });
    } catch {
      /* */
    }
  }, [current]);

  const deleteCurrentStory = useCallback(() => {
    if (!current?.id) return;
    Alert.alert(ft(language, 'storyDeleteConfirmTitle'), ft(language, 'storyDeleteConfirmBody'), [
      { text: ft(language, 'storyClose'), style: 'cancel' },
      {
        text: ft(language, 'storyMenuDelete'),
        style: 'destructive',
        onPress: async () => {
          try {
            if (useLocalStories) {
              await removeUserFeedStory(user, current.id);
            } else {
              await feedDeleteStory(current.id);
            }
            const next = stories.filter((s) => s.id !== current.id);
            if (!next.length) {
              navigation.goBack();
              return;
            }
            const newIndex = Math.min(index, next.length - 1);
            setStories(next);
            setIndex(newIndex);
            setFailedMediaIds(new Set());
            setForceImageIds(new Set());
            requestAnimationFrame(() => {
              try {
                listRef.current?.scrollToIndex({ index: newIndex, animated: false });
              } catch {
                /* */
              }
            });
          } catch {
            Alert.alert('', ft(language, 'storyDeleteFailed'));
          }
        },
      },
    ]);
  }, [current, index, language, navigation, stories, useLocalStories, user]);

  const closeAuthorMenu = useCallback(() => setAuthorMenuOpen(false), []);

  const openAuthorMenu = useCallback(() => {
    if (!isAuthor) return;
    setAuthorMenuOpen(true);
  }, [isAuthor]);

  const onAuthorMenuStats = useCallback(() => {
    setAuthorMenuOpen(false);
    requestAnimationFrame(() => {
      void openStats();
    });
  }, [openStats]);

  const onAuthorMenuDelete = useCallback(() => {
    setAuthorMenuOpen(false);
    requestAnimationFrame(() => {
      deleteCurrentStory();
    });
  }, [deleteCurrentStory]);

  const submitReply = useCallback(async () => {
    const text = replyBarText.trim();
    if (!text || !current?.user_id) return;
    if (isAuthor) {
      Alert.alert('', ft(language, 'storyCannotReplySelf'));
      return;
    }
    if (!hasMessageApiToken()) {
      Alert.alert('', ft(language, 'storyNeedLogin'));
      return;
    }
    setReplyBusy(true);
    try {
      const meta = await messagesOpenThread({ peerUserId: String(current.user_id) });
      const threadId = meta?.id;
      if (!threadId) throw new Error('no_thread');
      const raw = meta.peer_username || current.username || '';
      const peerLabel = raw.startsWith('@') ? raw : `@${String(raw || 'user').replace(/^@/, '')}`;
      const cap = (current.caption || '').trim();
      const resolved = resolveFeedMediaUrl(current.media_url);
      const storyAttachment = [
        `━━ ${ft(language, 'storyDmAttachmentTitle')} ━━`,
        `${ft(language, 'storyReplyStoryUrlLine')}: ${resolved}`,
        `${ft(language, 'storyReplyStoryIdLine')}: ${current.id}`,
        cap ? `${ft(language, 'storyReplyMessagePrefix').trim()}${cap}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      const DM_MAX = 2000;
      const attach =
        storyAttachment.length > DM_MAX
          ? `${storyAttachment.slice(0, DM_MAX - 32)}\n…`
          : storyAttachment;
      const combined = [attach, '', text].join('\n');
      if (combined.length <= DM_MAX) {
        await messagesSendText(threadId, combined);
      } else {
        await messagesSendText(threadId, attach);
        await messagesSendText(threadId, text.slice(0, DM_MAX));
      }
      setReplyBarText('');
      navigation.replace('ChatThread', {
        ...shell,
        threadId,
        peerName: peerLabel,
        peerAvatarUrl: resolveFeedMediaUrl(current?.avatar_url || '') || '',
        useMessageApi: true,
        pendingForMe: !!meta.pending_for_me,
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e?.message || '';
      Alert.alert('', msg || ft(language, 'storyReplyFailed'));
    } finally {
      setReplyBusy(false);
    }
  }, [replyBarText, current, isAuthor, language, navigation, shell]);

  const onMediaError = useCallback((storyId) => {
    setFailedMediaIds((prev) => new Set(prev).add(String(storyId)));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        {Platform.OS === 'android' ? <StatusBar barStyle="light-content" /> : null}
        <ActivityIndicator color={progressAccent} size="large" />
      </View>
    );
  }

  if (!stories.length) {
    return (
      <View style={styles.center}>
        {Platform.OS === 'android' ? <StatusBar barStyle="light-content" /> : null}
        <Text style={styles.empty}>{ft(language, 'storyEmpty')}</Text>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backTxt}>OK</Text>
        </Pressable>
      </View>
    );
  }

  const likedHere = !!likedMap[current?.id];
  const barAccent = accentForTheme(isLight);
  const onAccentTxt = onAccentButtonText(isLight);
  /** Без нативного аналізу кольору (Expo Go / без кастомної збірки): завжди світлий «хром» + градієнт зверху. */
  const storyChromeLight = false;
  const headerPrimary = storyChromeLight ? '#141414' : '#FFFFFF';
  const headerSecondary = storyChromeLight ? 'rgba(20,20,20,0.78)' : 'rgba(255,255,255,0.78)';
  const headerMuted = storyChromeLight ? 'rgba(20,20,20,0.58)' : 'rgba(255,255,255,0.55)';
  const headerIconBg = storyChromeLight ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.28)';
  const headerIconColor = storyChromeLight ? '#111111' : '#FFFFFF';
  const segTrackBg = storyChromeLight ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.28)';
  const headerNameShadow = storyChromeLight
    ? { textShadowColor: 'rgba(255,255,255,0.75)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 5 }
    : { textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 };
  /** Світле фото → темна нижня панель (не зливається); темне фото → світла панель */
  const useDarkComposer = storyChromeLight;
  const composerTint = useDarkComposer ? 'dark' : 'light';
  const composerBlurIntensity = useDarkComposer ? 56 : 40;
  const composerOverlay = useDarkComposer ? 'rgba(12,12,16,0.93)' : 'rgba(252,252,254,0.9)';
  const barInputColor = useDarkComposer ? '#F4F4F7' : '#141414';
  const barPhColor = useDarkComposer ? 'rgba(244,244,247,0.48)' : 'rgba(20,20,24,0.48)';
  const barInputBg = useDarkComposer ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.92)';
  const barInputBorder = useDarkComposer ? 'rgba(255,255,255,0.22)' : 'rgba(2, 18, 235, 0.14)';
  const barIconCircle = useDarkComposer ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)';
  const barIconColor = useDarkComposer ? '#F0F0F5' : '#1E1E1E';
  const barTopBorder = useDarkComposer ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)';

  const storyCaption = (current?.caption || '').trim();
  const sheetContentHeight = sheetExpandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SHEET_EXPANDED_EXTRA],
  });
  const sheetContentOpacity = sheetExpandAnim.interpolate({
    inputRange: [0, 0.18, 1],
    outputRange: [0, 0, 1],
  });
  const sheetBackdropOpacity = sheetExpandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.24],
  });
  const sheetMuted = useDarkComposer ? 'rgba(244,244,247,0.46)' : 'rgba(20,20,24,0.42)';
  const sheetText = useDarkComposer ? '#F4F4F7' : '#141418';
  const sheetHandleColor = useDarkComposer ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.14)';
  const sheetEmptyIconBg = useDarkComposer ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      keyboardShouldPersistTaps="handled"
    >
      {Platform.OS === 'android' ? (
        <StatusBar
          barStyle={storyChromeLight ? 'dark-content' : 'light-content'}
          translucent
          backgroundColor="transparent"
        />
      ) : null}
      <View style={styles.screen}>
        <FlatList
          ref={listRef}
          data={stories}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.flex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={onMomentumEnd}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              try {
                listRef.current?.scrollToIndex({ index: info.index, animated: false });
              } catch {
                /* */
              }
            }, 120);
          }}
          maxToRenderPerBatch={3}
          windowSize={3}
          removeClippedSubviews={Platform.OS === 'android'}
          initialNumToRender={3}
          renderItem={({ item }) => {
            const resolvedUri = resolveFeedMediaUrl(item.media_url);
            const forceImage = forceImageIds.has(String(item.id));
            const vid =
              !forceImage &&
              (item.media_kind === 'video' || /\.(mp4|mov)(\?|$)/i.test(String(item.media_url || '')));
            const failed = failedMediaIds.has(String(item.id));
            const isCurrentSlide = String(item.id) === String(current?.id);
            return (
              <View style={{ width, height, backgroundColor: '#0c0c0c' }} {...swipeCellProps}>
                <View style={StyleSheet.absoluteFill}>
                  {!failed && resolvedUri ? (
                    vid ? (
                      <Video
                        key={`${item.id}-v`}
                        source={{ uri: resolvedUri }}
                        style={StyleSheet.absoluteFill}
                        resizeMode={ResizeMode.COVER}
                        shouldPlay={isCurrentSlide && !holdPaused}
                        isLooping
                        isMuted
                        useNativeControls={false}
                        showPoster
                        onError={() => {
                          setForceImageIds((prev) => new Set(prev).add(String(item.id)));
                          setFailedMediaIds((prev) => {
                            const next = new Set(prev);
                            next.delete(String(item.id));
                            return next;
                          });
                        }}
                      />
                    ) : (
                      <Image
                        key={`${item.id}-i`}
                        source={{ uri: resolvedUri }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                        onError={() => onMediaError(item.id)}
                      />
                    )
                  ) : (
                    <View style={[StyleSheet.absoluteFill, styles.mediaErrorBox]}>
                      <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.35)" />
                      <Text style={styles.mediaErrorTxt}>{ft(language, 'storyMediaLoadError')}</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />

        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.68)', 'rgba(0,0,0,0.32)', 'transparent']}
          locations={[0, 0.42, 1]}
          style={[styles.storyTopScrim, { height: insets.top + 132 }]}
        />

        {stories.length > 1 ? (
          <View
            style={[
              styles.storyTapZones,
              {
                top: insets.top + 128,
                bottom: bottomBarReserve,
              },
            ]}
            pointerEvents="box-none"
          >
            <Pressable
              style={[styles.storyTapZoneSide, { width: Math.round(width * 0.22) }]}
              onPress={goPrevSlide}
              accessibilityRole="button"
              accessibilityLabel={langUk ? 'Попередня історія' : 'Previous story'}
            />
            <Pressable
              style={styles.storyTapZoneCenter}
              onPressIn={onStoryHoldIn}
              onPressOut={onStoryHoldOut}
              android_ripple={null}
              accessibilityRole="button"
              accessibilityLabel={langUk ? 'Утримуйте, щоб призупинити' : 'Hold to pause'}
            />
            <Pressable
              style={[styles.storyTapZoneSide, { width: Math.round(width * 0.32) }]}
              onPress={advanceSlide}
              accessibilityRole="button"
              accessibilityLabel={langUk ? 'Наступна історія' : 'Next story'}
            />
          </View>
        ) : (
          <View
            style={[
              styles.storyTapZones,
              {
                top: insets.top + 128,
                bottom: bottomBarReserve,
              },
            ]}
            pointerEvents="box-none"
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPressIn={onStoryHoldIn}
              onPressOut={onStoryHoldOut}
              android_ripple={null}
              accessibilityRole="button"
              accessibilityLabel={langUk ? 'Утримуйте, щоб призупинити' : 'Hold to pause'}
            />
          </View>
        )}

        <View
          style={[styles.topChrome, { paddingTop: insets.top + 8, paddingHorizontal: 12 }]}
          pointerEvents="box-none"
        >
          <View style={styles.progressWrap} pointerEvents="none">
            {stories.map((s, i) => {
              const fill = i < index ? 1 : i === index ? Math.max(0.008, progress) : 0;
              return (
                  <View key={s.id} style={styles.segOuter}>
                  <View style={[styles.segTrack, { backgroundColor: segTrackBg }]}>
                    <View
                      style={[
                        styles.segFill,
                        {
                          width: `${fill * 100}%`,
                          backgroundColor: progressAccent,
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.headerRow} pointerEvents="box-none">
            <View style={styles.headerLeft}>
              {authorAvatarUri ? (
                <Image source={{ uri: authorAvatarUri }} style={styles.headerAvatar} />
              ) : (
                <View style={[styles.headerAvatar, styles.headerAvatarPh]} />
              )}
              <View style={styles.headerTextCol}>
                <Text style={[styles.headerName, { color: headerPrimary }, headerNameShadow]} numberOfLines={1}>
                  {authorLine}
                </Text>
                <Text style={[styles.headerTime, { color: headerMuted }]}>
                  {formatStoryTime(current?.created_at, langUk)}
                </Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              {isAuthor ? (
                <Pressable
                  onPress={() => void openStats()}
                  hitSlop={12}
                  style={[styles.headerStatsBtn, { backgroundColor: headerIconBg }]}
                >
                  <Ionicons name="eye-outline" size={13} color={headerIconColor} />
                  <Text style={[styles.headerStatsTxt, { color: headerIconColor }]}>{currentStoryStats.viewersCount}</Text>
                  <Ionicons name="heart-outline" size={13} color={headerIconColor} style={{ marginLeft: 6 }} />
                  <Text style={[styles.headerStatsTxt, { color: headerIconColor }]}>{currentStoryStats.likersCount}</Text>
                </Pressable>
              ) : null}
              {isAuthor ? (
                <Pressable
                  onPress={openAuthorMenu}
                  hitSlop={12}
                  style={[styles.headerIconBtn, { backgroundColor: headerIconBg }]}
                >
                  <Ionicons name="ellipsis-horizontal" size={22} color={headerIconColor} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => navigation.goBack()}
                hitSlop={12}
                style={[styles.headerIconBtn, { backgroundColor: headerIconBg }]}
              >
                <Ionicons name="close" size={24} color={headerIconColor} />
              </Pressable>
            </View>
          </View>
        </View>

        {statsSwipeEnabled ? (
          <View
            style={[styles.swipeHintWrap, { bottom: Math.max(insets.bottom, 12) + 88 }]}
            pointerEvents="none"
          >
            <Ionicons
              name="chevron-up"
              size={18}
              color={storyChromeLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.6)'}
            />
            <Text
              style={[
                styles.swipeHintTxt,
                {
                  color: storyChromeLight ? 'rgba(0,0,0,0.52)' : 'rgba(255,255,255,0.62)',
                },
              ]}
            >
              {ft(language, 'storySwipeUpHint')}
            </Text>
          </View>
        ) : null}

        <Animated.View
          pointerEvents={sheetExpanded ? 'auto' : 'none'}
          style={[styles.sheetBackdrop, { opacity: sheetBackdropOpacity }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={collapseSheet} accessibilityRole="button" />
        </Animated.View>

        <View
          style={[
            styles.bottomBarShell,
            {
              borderTopColor: barTopBorder,
              paddingBottom: bottomInset,
            },
          ]}
        >
          <BlurView intensity={composerBlurIntensity} tint={composerTint} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: composerOverlay }]} />
          <Pressable
            onPress={toggleSheet}
            accessibilityRole="button"
            accessibilityLabel={ft(language, 'storySheetToggle')}
            style={styles.sheetHandleHit}
            {...sheetPan.panHandlers}
          >
            <View style={[styles.sheetHandleBar, { backgroundColor: sheetHandleColor }]} />
          </Pressable>
          <Animated.View
            style={[
              styles.sheetContent,
              {
                height: sheetContentHeight,
                opacity: sheetContentOpacity,
              },
            ]}
          >
            {storyCaption ? (
              <ScrollView
                style={styles.sheetScroll}
                contentContainerStyle={styles.sheetScrollInner}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={[styles.sheetCaptionLabel, { color: sheetMuted }]}>
                  {ft(language, 'storySheetCaptionLabel')}
                </Text>
                <Text style={[styles.sheetCaptionText, { color: sheetText }]}>{storyCaption}</Text>
              </ScrollView>
            ) : (
              <View style={styles.sheetEmptyWrap}>
                <View style={[styles.sheetEmptyIcon, { backgroundColor: sheetEmptyIconBg }]}>
                  <Ionicons name="chatbubble-ellipses-outline" size={26} color={sheetMuted} />
                </View>
                <Text style={[styles.sheetEmptyTxt, { color: sheetMuted }]}>{ft(language, 'storySheetEmpty')}</Text>
              </View>
            )}
          </Animated.View>
          <View style={styles.bottomBarInner}>
            {!isAuthor ? (
              <TextInput
                style={[
                  styles.pillInputXs,
                  {
                    color: barInputColor,
                    backgroundColor: barInputBg,
                    borderColor: barInputBorder,
                  },
                ]}
                placeholder={ft(language, 'storyReplyPlaceholder')}
                placeholderTextColor={barPhColor}
                value={replyBarText}
                onChangeText={setReplyBarText}
                multiline
                maxLength={2000}
                textAlignVertical="center"
                {...(Platform.OS === 'android' ? { importantForAutofill: 'no' } : {})}
                returnKeyType="default"
                blurOnSubmit={false}
                onSubmitEditing={submitReply}
              />
            ) : (
              <View style={styles.authorBarSpacer} />
            )}
            {!isAuthor ? (
              <Pressable
                accessibilityLabel={ft(language, 'storySend')}
                style={({ pressed }) => [
                  styles.roundFab,
                  {
                    backgroundColor: barAccent,
                    opacity: replyBusy || !replyBarText.trim() ? 0.38 : pressed ? 0.88 : 1,
                  },
                ]}
                onPress={submitReply}
                disabled={replyBusy || !replyBarText.trim()}
              >
                <Ionicons name="send" size={20} color={onAccentTxt} />
              </Pressable>
            ) : null}
            {!isAuthor ? (
            <Pressable
              accessibilityLabel={ft(language, 'storyLike')}
              onPress={onToggleLike}
              style={({ pressed }) => [
                styles.roundFabGhost,
                {
                  backgroundColor: likedHere ? 'rgba(255,77,106,0.22)' : barIconCircle,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Ionicons
                name={likedHere ? 'heart' : 'heart-outline'}
                size={24}
                color={likedHere ? '#FF4D6A' : barIconColor}
              />
            </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel={ft(language, 'storyShare')}
              onPress={onShareStory}
              style={({ pressed }) => [
                styles.roundFabGhost,
                { backgroundColor: barIconCircle, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Ionicons name="share-outline" size={23} color={barIconColor} />
            </Pressable>
          </View>
        </View>

        <Modal visible={authorMenuOpen} transparent animationType="fade" onRequestClose={closeAuthorMenu}>
          <View style={[styles.authorMenuOverlay, { paddingBottom: Math.max(insets.bottom, 10) + 6 }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeAuthorMenu} accessibilityRole="button" />
            <View style={[styles.authorMenuSheet, { width: Math.min(360, width - 24) }]}>
              <View
                style={[
                  styles.authorMenuGroup,
                  isLight ? styles.authorMenuGroupLight : styles.authorMenuGroupDark,
                ]}
              >
                {!useLocalStories && hasFeedApiToken() ? (
                  <>
                    <Pressable
                      onPress={onAuthorMenuStats}
                      style={({ pressed }) => [styles.authorMenuItem, pressed && styles.authorMenuItemPressed]}
                      android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
                    >
                      <Text
                        style={[
                          styles.authorMenuItemTxt,
                          { color: isLight ? '#1A1A22' : '#F7F7FA' },
                        ]}
                      >
                        {ft(language, 'storyMenuStats')}
                      </Text>
                    </Pressable>
                    <View
                      style={[
                        styles.authorMenuDivider,
                        { backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)' },
                      ]}
                    />
                  </>
                ) : null}
                <Pressable
                  onPress={onAuthorMenuDelete}
                  style={({ pressed }) => [styles.authorMenuItem, pressed && styles.authorMenuItemPressed]}
                  android_ripple={{ color: 'rgba(255,59,48,0.12)' }}
                >
                  <Text style={styles.authorMenuItemDanger}>{ft(language, 'storyMenuDelete')}</Text>
                </Pressable>
              </View>
              <Pressable
                onPress={closeAuthorMenu}
                style={({ pressed }) => [
                  styles.authorMenuGroup,
                  isLight ? styles.authorMenuGroupLight : styles.authorMenuGroupDark,
                  pressed && styles.authorMenuItemPressed,
                ]}
                android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
              >
                <Text
                  style={[
                    styles.authorMenuItemTxt,
                    styles.authorMenuCancelTxt,
                    { color: isLight ? '#1A1A22' : '#F7F7FA' },
                  ]}
                >
                  {ft(language, 'storyClose')}
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal visible={statsOpen} transparent animationType="slide" onRequestClose={() => setStatsOpen(false)}>
          <View style={styles.modalBg}>
            <View style={[styles.modalCard, { paddingBottom: insets.bottom + 16 }]}>
              <Text style={styles.modalTitle}>{ft(language, 'storyStats')}</Text>
              {statsLoading ? (
                <ActivityIndicator style={{ marginVertical: 20 }} />
              ) : (
                <ScrollView style={{ maxHeight: height * 0.52 }} keyboardShouldPersistTaps="handled">
                  <Text style={styles.sectionTitle}>{ft(language, 'storyLikersTitle')}</Text>
                  {!likers.length ? (
                    <Text style={styles.muted}>{ft(language, 'storyNoViews')}</Text>
                  ) : (
                    likers.map((v) => (
                      <View key={String(v.user_id)} style={styles.viewerRow}>
                        <Ionicons name="heart" size={14} color="#FF4D6A" style={{ marginRight: 6 }} />
                        {v.avatar_url ? (
                          <Image source={{ uri: resolveFeedMediaUrl(v.avatar_url) }} style={styles.viewerAva} />
                        ) : (
                          <View style={[styles.viewerAva, styles.viewerAvaPh]} />
                        )}
                        <Text style={styles.viewerName}>@{v.username || '—'}</Text>
                      </View>
                    ))
                  )}
                  <Text style={[styles.sectionTitle, { marginTop: 16 }]}>{ft(language, 'storyViewersTitle')}</Text>
                  {!viewers.length ? (
                    <Text style={styles.muted}>{ft(language, 'storyNoViews')}</Text>
                  ) : (
                    viewers.map((v) => (
                      <View key={String(v.viewer_id)} style={styles.viewerRow}>
                        {v.avatar_url ? (
                          <Image source={{ uri: resolveFeedMediaUrl(v.avatar_url) }} style={styles.viewerAva} />
                        ) : (
                          <View style={[styles.viewerAva, styles.viewerAvaPh]} />
                        )}
                        <Text style={styles.viewerName}>@{v.username || '—'}</Text>
                      </View>
                    ))
                  )}
                </ScrollView>
              )}
              <Pressable style={styles.modalClose} onPress={() => setStatsOpen(false)}>
                <Text style={styles.modalCloseTxt}>{ft(language, 'storyClose')}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { color: 'rgba(255,255,255,0.85)', fontSize: 16, textAlign: 'center' },
  backBtn: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#E1FF00', borderRadius: 12 },
  backTxt: { fontWeight: '700', color: '#101010' },
  storyTopScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 20,
  },
  /** Вузькі зони під шапкою: свайп по центру лишається для FlatList; краї — попередня / наступна історія. */
  storyTapZones: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    zIndex: 21,
  },
  storyTapZoneSide: {
    height: '100%',
  },
  storyTapZoneCenter: {
    flex: 1,
  },
  topChrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 22,
  },
  progressWrap: {
    flexDirection: 'row',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  segOuter: { flex: 1, marginHorizontal: 3 },
  segTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  segFill: {
    height: 4,
    borderRadius: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: '#333' },
  headerAvatarPh: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.2)' },
  headerTextCol: { flex: 1, minWidth: 0 },
  headerName: { fontSize: 15, fontWeight: '600', letterSpacing: -0.1 },
  headerUsername: { fontSize: 12, marginTop: 1, fontWeight: '600' },
  headerTime: { fontSize: 11, marginTop: 2, fontWeight: '500' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  headerStatsBtn: {
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  headerStatsTxt: { fontSize: 11, fontWeight: '700', marginLeft: 3 },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  captionOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  caption: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  captionMoreLink: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '800',
    opacity: 0.92,
    textDecorationLine: 'underline',
  },
  authorBarSpacer: { flex: 1, minWidth: 0 },
  mediaErrorBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#141414',
    padding: 24,
  },
  mediaErrorTxt: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  swipeHintWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 18,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  swipeHintTxt: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  bottomBarShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 19,
    overflow: 'hidden',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 4,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 18,
    backgroundColor: '#000',
  },
  sheetHandleHit: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  sheetHandleBar: {
    width: 42,
    height: 4,
    borderRadius: 2,
  },
  sheetContent: {
    overflow: 'hidden',
  },
  sheetScroll: {
    flex: 1,
  },
  sheetScrollInner: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  sheetCaptionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sheetCaptionText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
  sheetEmptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 8,
  },
  sheetEmptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  sheetEmptyTxt: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: -0.1,
  },
  bottomBarInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    gap: 10,
    minHeight: SHEET_ACTIONS_ROW,
  },
  pillInputXs: {
    flex: 1,
    minHeight: 48,
    maxHeight: 108,
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
    fontWeight: '500',
    borderWidth: 1,
  },
  roundFab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundFabGhost: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  sectionTitle: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  muted: { color: 'rgba(255,255,255,0.55)', marginVertical: 6 },
  viewerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  viewerAva: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  viewerAvaPh: { backgroundColor: '#444' },
  viewerName: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  modalClose: { marginTop: 8, alignItems: 'center', paddingVertical: 12 },
  modalCloseTxt: { color: '#E1FF00', fontWeight: '700', fontSize: 16 },
  authorMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.38)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  authorMenuSheet: {
    gap: 8,
    width: '100%',
  },
  authorMenuGroup: {
    borderRadius: 14,
    overflow: 'hidden',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.18,
          shadowRadius: 18,
        }
      : { elevation: 10 }),
  },
  authorMenuGroupLight: {
    backgroundColor: 'rgba(255,255,255,0.98)',
  },
  authorMenuGroupDark: {
    backgroundColor: 'rgba(28,28,34,0.96)',
  },
  authorMenuItem: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  authorMenuItemPressed: {
    opacity: 0.72,
  },
  authorMenuDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  authorMenuItemTxt: {
    fontSize: 17,
    fontWeight: '500',
    textAlign: 'center',
  },
  authorMenuItemDanger: {
    fontSize: 17,
    fontWeight: '500',
    color: '#FF3B30',
    textAlign: 'center',
  },
  authorMenuCancelTxt: {
    fontWeight: '600',
  },
});
