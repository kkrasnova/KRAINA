import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FlashList } from '@shopify/flash-list';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Platform,
  Alert,
  DeviceEventEmitter,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from './useAppTheme';
import { useSyncedAppLanguage } from './useAppLanguage';

import { RenderProfiler } from './performanceMetrics';
import { st, formatChatTime } from './chatsI18n';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import { getChatsTheme } from './chatsTheme';
import ProfileAvatarCircle from './ProfileAvatarCircle';
import { resolveFeedMediaUrl } from './feedMediaUrl';
import { brandFontHeadMedium, brandFontSans, brandFontSansSemibold } from './brandFont';
import PddHeaderWordmark from './PddHeaderWordmark';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import ChatSwipeRow from './ChatSwipeRow';
import { deleteThread, chatUserKey, getThreads } from './chatService';
import { isBackendJwt } from './backendAuthApi';
import { useAuthStore } from './auth/authStore';
import {
  ensureMessageApiReady,
  messagesListThreads,
  messagesAcceptThread,
} from './messageApi';
import { recoverGoogleBackendSessionInteractive } from './syncBackendSessionBridge';
import { hasGoogleConfig } from './authConfig';
import { errorToUserText } from './errorText';
import {
  chatsCacheKey,
  hasChatsCache,
  readChatsCache,
  writeChatsCache,
  clearThreadUnreadInCache,
  CHATS_CACHE_UPDATED,
  seedChatsCachesIfMissing,
} from './chatsThreadsCache';
import {
  WS_EVENT_NEW_MESSAGE,
  WS_EVENT_THREAD_UPDATED,
  WS_EVENT_THREAD_DELETED,
  WS_EVENT_CONNECTED,
  WS_EVENT_DISCONNECTED,
  connectChatWebSocket,
  isWsConnected,
} from './chatRealtime';
import { warmChatThreadCache, applyWsMessageToThreadList, mapInboxThreadRow, warmMutualsCache, warmChatsInboxCache } from './chatsDataPrefetch';
import { logError, getErrorLog, clearErrorLog, formatErrorEntry } from './errorLogger';
import { isPlaceholderSocialUsername, normalizeSocialUsername } from './socialFollowSyncEvents';

const HIDDEN_THREADS_PREFIX = '@kraina_hidden_threads_v1:';

function ChatsSearchBar({ value, onChangeText, placeholder, isLight, accent, textMain, textMuted, border, theme }) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.searchWrap,
        {
          backgroundColor: theme.searchBg,
          borderColor: focused ? accent : 'transparent',
          borderWidth: focused ? 1 : 0,
        },
      ]}
    >
      <Ionicons name="search" size={20} color={focused ? accent : textMuted} style={{ marginRight: 10 }} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={textMuted}
        style={[styles.searchInput, brandFontSans, { color: textMain }]}
      />
      {value.trim() ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear">
          <Ionicons name="close-circle" size={20} color={textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ChatListAvatar({ uri, isLight }) {
  return (
    <View style={styles.avatarWrap}>
      <ProfileAvatarCircle uri={uri || ''} size={56} isLight={isLight} />
    </View>
  );
}

function ChatsEmptyIllustration({ accent, isLight, folder }) {
  const iconName = folder === 'requests' ? 'mail-unread-outline' : 'chatbubbles-outline';
  return (
    <View style={[styles.emptyIconCore, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)' }]}>
      <Ionicons name={iconName} size={32} color={accent} />
    </View>
  );
}

export default function ChatsPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const langUk = language.split(/[-_]/)[0].toLowerCase() === 'uk';
  const user = route?.params?.user;
  const { appTheme } = useAppTheme(route?.params?.appTheme);
  const [q, setQ] = useState('');
  const [threads, setThreads] = useState(() => {
    seedChatsCachesIfMissing(user, langUk);
    return readChatsCache(chatsCacheKey(user, 'inbox', langUk))?.threads ?? [];
  });
  const [folder, setFolder] = useState('inbox');
  const folderRef = useRef('inbox');
  folderRef.current = folder;
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const hiddenIdsRef = useRef(hiddenIds);
  hiddenIdsRef.current = hiddenIds;
  const reloadSeqRef = useRef(0);
  const threadUpdatedTimerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [requestCount, setRequestCount] = useState(() => {
    seedChatsCachesIfMissing(user, langUk);
    return readChatsCache(chatsCacheKey(user, 'inbox', langUk))?.requestCount ?? 0;
  });

  const [acceptBusyId, setAcceptBusyId] = useState(null);
  const [sessionRecovering, setSessionRecovering] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [errorLogEntries, setErrorLogEntries] = useState([]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const authUserId = useAuthStore((s) => s.user?.id);
  const showServerTabs = useMemo(
    () => isBackendJwt(accessToken) && !!authUserId,
    [accessToken, authUserId],
  );

  const hiddenKey = useMemo(() => {
    const who = chatUserKey(user);
    const apiMode = showServerTabs ? 'api' : 'local';
    return `${HIDDEN_THREADS_PREFIX}${who}:${apiMode}:${folder}`;
  }, [user, folder, showServerTabs]);

  const applyHiddenIds = useCallback((nextSet) => {
    setHiddenIds((prev) => {
      if (prev.size === nextSet.size && [...prev].every((id) => nextSet.has(id))) {
        return prev;
      }
      return nextSet;
    });
  }, []);

  const loadHidden = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(hiddenKey);
      if (!raw) {
        applyHiddenIds(new Set());
        return;
      }
      const arr = JSON.parse(raw);
      applyHiddenIds(new Set(Array.isArray(arr) ? arr.map(String) : []));
    } catch {
      applyHiddenIds(new Set());
    }
  }, [hiddenKey, applyHiddenIds]);

  const saveHidden = useCallback(async (setObj) => {
    try {
      await AsyncStorage.setItem(hiddenKey, JSON.stringify([...setObj]));
    } catch {
      /* */
    }
  }, [hiddenKey]);

  const shell = useMemo(
    () => ({
      user,
      language,
      ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
      appTheme: appTheme === 'light' ? 'light' : 'dark',
    }),
    [user, language, route?.params?.countryId, appTheme],
  );

  const applyFolderCache = useCallback(
    (targetFolder) => {
      const cacheKey = chatsCacheKey(user, targetFolder, langUk);
      if (!hasChatsCache(cacheKey)) return false;
      const cached = readChatsCache(cacheKey);
      setThreads(cached.threads);
      if (targetFolder === 'inbox') setRequestCount(cached.requestCount);
      setLoading(false);
      return true;
    },
    [user, langUk],
  );

  const reload = useCallback(async ({ showBlockingLoader = false, folder: folderOverride } = {}) => {
    const activeFolder = folderOverride ?? folderRef.current;
    const seq = ++reloadSeqRef.current;
    const cacheKey = chatsCacheKey(user, activeFolder, langUk);
    if (showBlockingLoader && !hasChatsCache(cacheKey)) {
      setLoading(true);
    }
    try {
      const api = showServerTabs;
      let nextThreads = [];
      let nextRequestCount = 0;
      let prefetchedRequests = null;
      if (api) {
        try {
          const f = activeFolder === 'requests' ? 'requests' : 'inbox';
          const [list, reqList] = await Promise.all([
            messagesListThreads(f, langUk),
            activeFolder === 'inbox' ? messagesListThreads('requests', langUk).catch(() => []) : Promise.resolve([]),
          ]);
          if (seq !== reloadSeqRef.current) return;
          if (activeFolder === 'inbox') {
            nextRequestCount = Array.isArray(reqList) ? reqList.length : 0;
            if (folderRef.current === 'inbox') setRequestCount(nextRequestCount);
            prefetchedRequests = Array.isArray(reqList) ? reqList : [];
          }
          const mapped = list.map((row) => mapInboxThreadRow(row));
          mapped.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
          const hidden = hiddenIdsRef.current;
          nextThreads = mapped.filter((th) => !hidden.has(String(th.id)));
        } catch (e) {
          if (__DEV__) console.warn('[ChatsPage] api threads', e?.message);
          const list = await getThreads(user, langUk);
          nextThreads = [...list]
            .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0))
            .filter((th) => !hiddenIdsRef.current.has(String(th.id)));
        }
      } else {
        const list = await getThreads(user, langUk);
        nextThreads = [...list]
          .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0))
          .filter((th) => !hiddenIdsRef.current.has(String(th.id)));
        nextRequestCount = 0;
        setRequestCount(0);
      }
      if (seq !== reloadSeqRef.current) return;
      const inboxCache = readChatsCache(chatsCacheKey(user, 'inbox', langUk));
      writeChatsCache(
        cacheKey,
        nextThreads,
        activeFolder === 'inbox' ? nextRequestCount : inboxCache?.requestCount ?? 0,
        { user, langUk },
      );
      if (prefetchedRequests) {
        const hidden = hiddenIdsRef.current;
        const reqMapped = prefetchedRequests.map((row) => mapInboxThreadRow(row));
        reqMapped.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
        const reqThreads = reqMapped.filter((th) => !hidden.has(String(th.id)));
        writeChatsCache(chatsCacheKey(user, 'requests', langUk), reqThreads, nextRequestCount, { user, langUk });
      }
      if (activeFolder === folderRef.current) {
        setThreads(nextThreads);
      }
    } finally {
      if (seq === reloadSeqRef.current && activeFolder === folderRef.current) {
        setLoading(false);
      }
    }
  }, [user, langUk, showServerTabs]);

  const switchFolder = useCallback(
    (nextFolder) => {
      if (nextFolder === folderRef.current) return;
      seedChatsCachesIfMissing(user, langUk);
      const hasCache = applyFolderCache(nextFolder);
      if (!hasCache) {
        setThreads([]);
      }
      setFolder(nextFolder);
      setQ('');
      void reload({ folder: nextFolder });
    },
    [applyFolderCache, reload, user, langUk],
  );

  const recoverBackendSession = useCallback(async () => {
    if (showServerTabs) return true;
    setSessionRecovering(true);
    try {
      const ok = await ensureMessageApiReady(user);
      if (ok && authUserId) {
        void connectChatWebSocket(String(authUserId)).catch(() => {});
      }
      return ok;
    } finally {
      setSessionRecovering(false);
    }
  }, [showServerTabs, user, authUserId]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('kraina_backend_session_merged_v1', () => {
      void reload();
    });
    return () => sub.remove();
  }, [reload]);

  useEffect(() => {
    void warmMutualsCache(user);
  }, [user?.id, user?.firebaseUid, user?.email]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      seedChatsCachesIfMissing(user, langUk);
      applyFolderCache(folderRef.current);
      void warmChatsInboxCache(user, langUk).catch(() => {});
      void (async () => {
        await loadHidden();
        if (cancelled) return;
        if (!showServerTabs) {
          void recoverBackendSession();
        }
        void reload({ showBlockingLoader: false });
      })();
      return () => {
        cancelled = true;
        reloadSeqRef.current += 1;
      };
    }, [reload, loadHidden, applyFolderCache, showServerTabs, recoverBackendSession, user, langUk]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(CHATS_CACHE_UPDATED, ({ key }) => {
      const currentKey = chatsCacheKey(user, folderRef.current, langUk);
      if (key !== currentKey) return;
      applyFolderCache(folderRef.current);
    });
    return () => sub.remove();
  }, [user, langUk, applyFolderCache]);

  // ─── WebSocket connection & real-time updates ───────────────────────────

  useEffect(() => {
    if (!showServerTabs) return;

    const subs = [
      DeviceEventEmitter.addListener(WS_EVENT_NEW_MESSAGE, (data) => {
        const cacheKey = chatsCacheKey(user, folder, langUk);
        let needsReload = false;
        setThreads((prev) => {
          const next = applyWsMessageToThreadList(prev, data, {
            currentUserId: authUserId,
            langUk,
            hiddenIds: hiddenIdsRef.current,
          });
          if (!next) {
            needsReload = true;
            return prev;
          }
          const inboxCache = readChatsCache(chatsCacheKey(user, 'inbox', langUk));
          writeChatsCache(cacheKey, next, folder === 'inbox' ? requestCount : inboxCache?.requestCount ?? 0, {
            user,
            langUk,
          });
          return next;
        });
        if (needsReload) void reload();
      }),

      DeviceEventEmitter.addListener(WS_EVENT_THREAD_UPDATED, () => {
        if (threadUpdatedTimerRef.current) clearTimeout(threadUpdatedTimerRef.current);
        threadUpdatedTimerRef.current = setTimeout(() => {
          threadUpdatedTimerRef.current = null;
          void reload();
        }, 600);
      }),

      DeviceEventEmitter.addListener(WS_EVENT_THREAD_DELETED, (data) => {
        if (data.threadId) {
          setThreads((prev) => prev.filter((t) => String(t.id) !== data.threadId));
        } else {
          void reload();
        }
      }),
    ];

    return () => {
      if (threadUpdatedTimerRef.current) {
        clearTimeout(threadUpdatedTimerRef.current);
        threadUpdatedTimerRef.current = null;
      }
      for (const sub of subs) sub.remove();
    };
  }, [showServerTabs, reload, user, folder, langUk, authUserId, requestCount]);

  useFocusEffect(
    useCallback(() => {
      if (!showServerTabs) return undefined;
      let timer = null;
      const startFallbackPoll = () => {
        if (timer) return;
        timer = setInterval(() => {
          if (!isWsConnected()) void reload();
        }, 12000);
      };
      if (!isWsConnected()) startFallbackPoll();
      const onConnected = DeviceEventEmitter.addListener(WS_EVENT_CONNECTED, () => {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      });
      const onDisconnected = DeviceEventEmitter.addListener(WS_EVENT_DISCONNECTED, () => {
        startFallbackPoll();
      });
      return () => {
        if (timer) clearInterval(timer);
        onConnected.remove();
        onDisconnected.remove();
      };
    }, [reload, showServerTabs]),
  );

  useEffect(() => {
    if (hiddenIds.size === 0) return;
    void reload();
  }, [hiddenIds, reload]);

  const prevShowServerTabsRef = useRef(showServerTabs);
  useEffect(() => {
    if (prevShowServerTabsRef.current === showServerTabs) return;
    prevShowServerTabsRef.current = showServerTabs;
    void reload();
  }, [showServerTabs, reload]);

  const isLight = appTheme === 'light';
  const theme = getChatsTheme(isLight);
  const { accent, bg, textMain, textMuted, border, borderSubtle, segmentBg, segmentActive, onAccent } =
    theme;
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;



  const filtered = useMemo(() => {
    const visible = threads.filter((th) => {
      const un = normalizeSocialUsername(th.peerUsername || th.peerName);
      return !isPlaceholderSocialUsername(un);
    });
    const s = q.trim().toLowerCase();
    if (!s) return visible;
    return visible.filter(
      (th) =>
        (th.peerName || '').toLowerCase().includes(s) ||
        (th.lastMessagePreview || '').toLowerCase().includes(s),
    );
  }, [threads, q]);

  const onCompose = useCallback(async () => {
    if (!showServerTabs) {
      const ok = await recoverBackendSession();
      if (!ok) {
        Alert.alert('', st(language, 'needBackendLogin'), [
          { text: 'OK', style: 'cancel' },
          {
            text: st(language, 'reauthForChatsCta'),
            onPress: () => {
              navigation.navigate('ThirdPage', {
                language,
                reauthForChats: true,
                reauthEmail: user?.email || '',
              });
            },
          },
        ]);
        return;
      }
    }
    navigation.navigate('StartChat', shell);
  }, [navigation, shell, language, showServerTabs, recoverBackendSession, user?.email]);

  const loadErrorLog = useCallback(async () => {
    try {
      const entries = await getErrorLog();
      setErrorLogEntries(entries);
    } catch { /* */ }
  }, []);

  const onShowDebug = useCallback(async () => {
    await loadErrorLog();
    setShowDebug(true);
  }, [loadErrorLog]);

  const onHideDebug = useCallback(() => {
    setShowDebug(false);
  }, []);

  const onClearErrorLog = useCallback(async () => {
    await clearErrorLog();
    setErrorLogEntries([]);
  }, []);

  const onRetryConnect = useCallback(async () => {
    let ok = await recoverBackendSession();
    const isGoogleUser = String(user?.provider || '').toLowerCase() === 'google';
    if (!ok && isGoogleUser && hasGoogleConfig) {
      ok = await recoverGoogleBackendSessionInteractive(user);
    }
    if (ok) {
      void reload({ showBlockingLoader: true });
      return;
    }
    Alert.alert('', st(language, 'needBackendLogin'), [
      { text: 'OK', style: 'cancel' },
      {
        text: isGoogleUser && hasGoogleConfig
          ? st(language, 'reauthGoogleForChatsCta')
          : st(language, 'reauthForChatsCta'),
        onPress: () => {
          if (isGoogleUser && hasGoogleConfig) {
            void (async () => {
              const recovered = await recoverGoogleBackendSessionInteractive(user);
              if (recovered) void reload({ showBlockingLoader: true });
            })();
            return;
          }
          navigation.navigate('ThirdPage', {
            language,
            reauthForChats: true,
            reauthEmail: user?.email || '',
          });
        },
      },
      { text: st(language, 'parameters'), onPress: onShowDebug },
    ]);
  }, [recoverBackendSession, reload, language, navigation, user, onShowDebug]);

  // ─── Error log auto-capture when showServerTabs flips ───────────────────
  useEffect(() => {
    if (!showServerTabs && authUserId) {
      logError('chat_list', 'Chat page loaded without backend session', {
        hasAccessToken: !!accessToken,
        hasUser: !!authUserId,
        userProvider: user?.provider,
      });
    }
  }, [showServerTabs, authUserId]);

  const prefetchThreadMessages = useCallback(
    (item) => {
      void warmChatThreadCache(user, item.id, langUk, !!item.useMessageApi, {
        peerName: item.peerUsername || item.peerName,
        peerDisplayName: item.peerDisplayName || item.peerName,
        peerUsername: item.peerUsername || '',
        peerAvatarUrl: item.peerAvatarUri || '',
        pendingForMe: !!item.pendingForMe,
      });
    },
    [user, langUk],
  );

  const onOpenThread = useCallback(
    async (item) => {
      if (item.useMessageApi) {
        clearThreadUnreadInCache(user, item.id, langUk);
        setThreads((prev) =>
          prev.map((th) =>
            String(th.id) === String(item.id) ? { ...th, unreadCount: 0 } : th,
          ),
        );
      }
      await warmChatThreadCache(user, item.id, langUk, !!item.useMessageApi, {
        peerName: item.peerUsername || item.peerName,
        peerDisplayName: item.peerDisplayName || item.peerName,
        peerUsername: item.peerUsername || '',
        peerAvatarUrl: item.peerAvatarUri || '',
        pendingForMe: !!item.pendingForMe,
      });
      navigation.navigate('ChatThread', {
        ...shell,
        threadId: item.id,
        peerName: item.peerDisplayName || item.peerName,
        peerDisplayName: item.peerDisplayName || item.peerName,
        peerUsername: item.peerUsername || '',
        peerAvatarUrl: item.peerAvatarUri || '',
        ...(item.useMessageApi
          ? {
              useMessageApi: true,
              pendingForMe: !!item.pendingForMe,
              ...(item.peerUserId ? { peerUserId: String(item.peerUserId) } : {}),
            }
          : {}),
      });
    },
    [navigation, shell, user, langUk],
  );

  const onDeleteThread = useCallback(
    async (item) => {
      const id = String(item?.id || '');
      if (!id) return;
      if (!item?.useMessageApi) {
        await deleteThread(user, id, langUk);
        reload();
        return;
      }
      const next = new Set(hiddenIds);
      next.add(id);
      setHiddenIds(next);
      await saveHidden(next);
      setThreads((prev) => prev.filter((t) => String(t.id) !== id));
      const activeFolder = folderRef.current;
      const cacheKey = chatsCacheKey(user, activeFolder, langUk);
      const cached = readChatsCache(cacheKey);
      if (cached) {
        const nextThreads = cached.threads.filter((t) => String(t.id) !== id);
        let nextReqCount = cached.requestCount;
        if (activeFolder === 'requests' && item.pendingForMe) {
          nextReqCount = Math.max(0, nextReqCount - 1);
        }
        writeChatsCache(cacheKey, nextThreads, nextReqCount, { user, langUk });
        if (activeFolder === 'requests') {
          const inboxKey = chatsCacheKey(user, 'inbox', langUk);
          const inboxCache = readChatsCache(inboxKey);
          if (inboxCache) {
            writeChatsCache(inboxKey, inboxCache.threads, nextReqCount, { user, langUk });
          }
        }
      }
    },
    [user, langUk, reload, hiddenIds, saveHidden],
  );

  const onAcceptRequest = useCallback(
    async (item) => {
      const id = String(item?.id || '');
      if (!id || acceptBusyId) return;
      setAcceptBusyId(id);
      try {
        await messagesAcceptThread(id);
        if (folder === 'requests') {
          setThreads((prev) => prev.filter((t) => String(t.id) !== id));
          setRequestCount((c) => Math.max(0, c - 1));
        } else {
          reload();
        }
      } catch (e) {
        Alert.alert('', errorToUserText(e, language));
      } finally {
        setAcceptBusyId(null);
      }
    },
    [acceptBusyId, folder, language, reload],
  );

  const renderItem = useCallback(
    ({ item }) => {
      const avatarUri = resolveFeedMediaUrl(item.peerAvatarUri || '');
      const isRequest = folder === 'requests' && item.pendingForMe;
      const unread = (item.unreadCount || 0) > 0 && !isRequest;
      const rowInner = (
        <Pressable
          onPressIn={() => prefetchThreadMessages(item)}
          onPress={() => void onOpenThread(item)}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: isLight ? theme.surface : 'transparent',
              borderBottomColor: borderSubtle,
            },
            pressed && { opacity: 0.6 },
          ]}
          android_ripple={ripple}
        >
          <ChatListAvatar uri={avatarUri} isLight={isLight} />
          <View style={styles.rowBody}>
            <View style={styles.rowTop}>
              <Text
                style={[
                  styles.peerName,
                  brandFontSansSemibold,
                  { color: textMain, fontWeight: unread ? '700' : '600' },
                ]}
                numberOfLines={1}
              >
                {item.peerDisplayName || item.peerName}
              </Text>
              <Text style={[styles.time, brandFontSans, { color: textMuted }]}>
                {item.lastAt ? formatChatTime(item.lastAt, language) : ''}
              </Text>
            </View>
            {!q.trim() ? (
            <View style={styles.previewRow}>
              {item.lastFromMe ? (
                <Ionicons
                  name={item.lastIsRead ? 'checkmark-done' : 'checkmark'}
                  size={14}
                  color={item.lastIsRead ? '#53D769' : textMuted}
                  style={{ marginRight: 4, marginTop: 2 }}
                />
              ) : null}
              <Text
                style={[
                  styles.preview,
                  brandFontSans,
                  { color: unread ? textMain : textMuted, fontWeight: unread ? '500' : '400' },
                ]}
                numberOfLines={1}
              >
                {item.lastMessagePreview || '—'}
              </Text>
            </View>
          ) : null}
            {isRequest ? (
              <View style={styles.requestActions}>
                <Pressable
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    void onAcceptRequest(item);
                  }}
                  disabled={acceptBusyId === String(item.id)}
                  style={({ pressed }) => [
                    styles.acceptChip,
                    { backgroundColor: accent, opacity: acceptBusyId === String(item.id) ? 0.55 : pressed ? 0.88 : 1 },
                  ]}
                >
                  <Text style={[styles.acceptChipText, { color: onAccent }]}>{st(language, 'acceptRequest')}</Text>
                </Pressable>
                <Pressable
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    void onDeleteThread(item);
                  }}
                  style={({ pressed }) => [styles.declineChip, pressed && { opacity: 0.7 }]}
                >
                  <Text style={[styles.declineChipText, { color: textMuted }]}>{st(language, 'declineRequest')}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          {unread ? (
            <View style={[styles.unreadBadge, { backgroundColor: accent }]}>
              <Text style={[styles.unreadBadgeText, { color: onAccent }]}>
                {(item.unreadCount || 0) > 99 ? '99+' : String(item.unreadCount || 1)}
              </Text>
            </View>
          ) : null}
        </Pressable>
      );

      return (
        <ChatSwipeRow onDelete={() => onDeleteThread(item)} deleteLabel={st(language, 'delete')}>
          {rowInner}
        </ChatSwipeRow>
      );
    },
    [
      accent,
      acceptBusyId,
      borderSubtle,
      folder,
      isLight,
      language,
      onAccent,
      onAcceptRequest,
      onDeleteThread,
      onOpenThread,
      prefetchThreadMessages,
      q,
      ripple,
      textMain,
      textMuted,
      theme,
    ],
  );

  const emptyTitle = sessionRecovering
    ? st(language, 'connectingChats')
    : !showServerTabs
      ? st(language, 'needBackendLogin')
      : folder === 'requests'
        ? st(language, 'emptyRequestsTitle')
        : st(language, 'emptyInboxTitle');
  const emptyBody = sessionRecovering
    ? ''
    : !showServerTabs
      ? st(language, 'connectChatsHint')
      : folder === 'requests'
        ? st(language, 'emptyRequestsBody')
        : st(language, 'emptyInboxBody');

  const listEmpty = (
    <View style={styles.emptyWrap}>
      <ChatsEmptyIllustration accent={accent} isLight={isLight} folder={folder} />
      <Text style={[styles.emptyTitle, brandFontHeadMedium, { color: textMain }]}>{emptyTitle}</Text>
      {emptyBody ? (
        <Text style={[styles.emptyBody, brandFontSans, { color: textMuted }]}>{emptyBody}</Text>
      ) : null}
      {!showServerTabs && !sessionRecovering ? (
        <Pressable
          onPress={onRetryConnect}
          style={({ pressed }) => [
            styles.emptyCta,
            { backgroundColor: accent, opacity: pressed ? 0.9 : 1 },
          ]}
          android_ripple={ripple}
        >
          <Ionicons name="refresh-outline" size={18} color={onAccent} style={{ marginRight: 8 }} />
          <Text style={[styles.emptyCtaText, brandFontSansSemibold, { color: onAccent }]}>{st(language, 'connectChatsRetry')}</Text>
        </Pressable>
      ) : null}
      {folder === 'inbox' && showServerTabs ? (
        <Pressable
          onPress={onCompose}
          style={({ pressed }) => [
            styles.emptyCta,
            { backgroundColor: accent, opacity: pressed ? 0.9 : 1 },
          ]}
          android_ripple={ripple}
        >
          <Ionicons name="create-outline" size={18} color={onAccent} style={{ marginRight: 8 }} />
          <Text style={[styles.emptyCtaText, brandFontSansSemibold, { color: onAccent }]}>{st(language, 'newChatCta')}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const listHeader = null;
  const tabBottomPad = lightTabBarScrollContentPadding(insets.bottom, 24);
  const showEmpty =
    filtered.length === 0 &&
    !loading &&
    !(folder === 'requests' && requestCount > 0);

  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 6 },
        ]}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.headerSide}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={28} color={textMain} />
        </Pressable>
        <View style={styles.brandSlot}>
          <PddHeaderWordmark isLight={isLight} fontSize={isLight ? 20 : 21} />
        </View>
        {!showServerTabs ? (
          <Pressable onPress={onShowDebug} hitSlop={12} style={styles.headerSide} accessibilityRole="button" accessibilityLabel="Debug">
            <Ionicons name="bug-outline" size={22} color={textMuted} />
          </Pressable>
        ) : (
          <Pressable
            onPress={onCompose}
            hitSlop={12}
            style={styles.headerSide}
            accessibilityRole="button"
            accessibilityLabel={st(language, 'composeSearchA11y')}
          >
            <Ionicons name="create-outline" size={26} color={accent} />
          </Pressable>
        )}
      </View>

      {showServerTabs ? (
        <View style={styles.tabSegmentWrap}>
          <View style={[styles.tabSegment, { backgroundColor: segmentBg }]}>
            <Pressable
              onPress={() => switchFolder('inbox')}
              style={[
                styles.tabSegmentBtn,
                folder === 'inbox' && [
                  styles.tabSegmentBtnActive,
                  { backgroundColor: segmentActive },
                ],
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  brandFontSansSemibold,
                  { color: folder === 'inbox' ? textMain : textMuted, fontWeight: folder === 'inbox' ? '700' : '500' },
                ]}
              >
                {st(language, 'inboxTab')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => switchFolder('requests')}
              style={[
                styles.tabSegmentBtn,
                folder === 'requests' && [
                  styles.tabSegmentBtnActive,
                  { backgroundColor: segmentActive },
                ],
              ]}
            >
              <View style={styles.tabLabelRow}>
                <Text
                  style={[
                    styles.tabText,
                    brandFontSansSemibold,
                    {
                      color: folder === 'requests' ? textMain : textMuted,
                      fontWeight: folder === 'requests' ? '700' : '500',
                    },
                  ]}
                >
                  {st(language, 'requestsTab')}
                </Text>
                {requestCount > 0 ? (
                  <View style={[styles.tabBadge, { backgroundColor: accent }]}>
                    <Text style={[styles.tabBadgeText, { color: onAccent }]}>
                      {requestCount > 99 ? '99+' : requestCount}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          </View>
        </View>
      ) : null}

      <ChatsSearchBar
        value={q}
        onChangeText={setQ}
        placeholder={st(language, 'searchPlaceholder')}
        isLight={isLight}
        accent={accent}
        textMain={textMain}
        textMuted={textMuted}
        border={theme.border}
        theme={theme}
      />

      <RenderProfiler id="ChatsPage">
      <FlashList
        style={{ flex: 1, backgroundColor: 'transparent' }}
        data={filtered}
        extraData={folder}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        estimatedItemSize={72}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={showEmpty ? listEmpty : null}
        contentContainerStyle={{
          paddingBottom: tabBottomPad,
          paddingTop: 0,
          flexGrow: showEmpty ? 1 : 0,
        }}
        keyboardShouldPersistTaps="handled"
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
      />
      </RenderProfiler>

      {showDebug ? (
        <View style={[styles.debugPanel, { backgroundColor: isLight ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.92)' }]}>
          <View style={styles.debugHeader}>
            <Text style={[styles.debugTitle, { color: accent }]}>Error Log</Text>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Pressable onPress={onClearErrorLog} hitSlop={8}>
                <Text style={{ color: '#FF453A', fontSize: 13, fontWeight: '600' }}>Clear</Text>
              </Pressable>
              <Pressable onPress={onHideDebug} hitSlop={8}>
                <Ionicons name="close" size={20} color={textMain} />
              </Pressable>
            </View>
          </View>
          {errorLogEntries.length === 0 ? (
            <Text style={[styles.debugEmpty, { color: textMuted }]}>No errors logged yet</Text>
          ) : (
            <View style={styles.debugList}>
              {errorLogEntries.slice().reverse().map((entry, i) => (
                <View key={`err-${i}`} style={styles.debugEntry}>
                  <Text style={[styles.debugEntryText, { color: isLight ? '#1E1E1E' : '#F2F2EA' }]}>
                    {formatErrorEntry(entry)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 0,
    paddingBottom: 8,
    paddingHorizontal: 8,
  },
  headerSide: {
    width: 48,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerComposeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  brandSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  tabSegmentWrap: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 2,
  },
  tabSegment: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
  },
  tabSegmentBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabSegmentBtnActive: {},
  tabLabelRow: { flexDirection: 'row', alignItems: 'center' },
  tabText: { fontSize: 15, fontWeight: '600' },
  tabBadge: {
    marginLeft: 6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: { fontSize: 11, fontWeight: '800' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 16, padding: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  peerName: { flex: 1, fontSize: 16, fontWeight: '600', marginRight: 8 },
  time: { fontSize: 13 },
  preview: { fontSize: 15, lineHeight: 20 },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 3,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  unreadBadgeText: { fontSize: 11, fontWeight: '700' },
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  },
  acceptChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  acceptChipText: { fontSize: 13, fontWeight: '800', color: '#1E1E1E' },
  declineChip: { paddingVertical: 8, paddingHorizontal: 4 },
  declineChipText: { fontSize: 13, fontWeight: '600' },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingTop: 32,
    minHeight: 360,
  },
  emptyIconCore: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  emptyBody: { fontSize: 15, lineHeight: 23, textAlign: 'center', marginBottom: 28, maxWidth: 300 },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 14,
    minWidth: 200,
    justifyContent: 'center',
  },
  emptyCtaText: { fontSize: 15, fontWeight: '700' },
  debugPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    paddingHorizontal: 16,
    paddingTop: 60,
  },
  debugHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  debugTitle: { fontSize: 18, fontWeight: '800' },
  debugEmpty: { fontSize: 14, textAlign: 'center', marginTop: 20 },
  debugList: { flex: 1 },
  debugEntry: {
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
  },
  debugEntryText: { fontSize: 11, lineHeight: 15, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  debugCloseBtn: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  debugCloseBtnText: { fontSize: 15, fontWeight: '800', color: '#1E1E1E' },

  footerNote: {
    fontSize: 11,
    lineHeight: 15,
    paddingHorizontal: 20,
    paddingTop: 20,
    textAlign: 'center',
  },
});
