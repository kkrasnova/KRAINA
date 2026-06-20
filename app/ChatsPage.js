import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FlashList } from '@shopify/flash-list';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getAppTheme } from './themeStorage';
import { useSyncedAppLanguage } from './useAppLanguage';

import { RenderProfiler } from './performanceMetrics';
import { st, formatChatTime } from './chatsI18n';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { accentForTheme } from './themeAccent';
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
import { errorToUserText } from './errorText';
import { chatsCacheKey, readChatsCache, writeChatsCache } from './chatsThreadsCache';
import { warmChatThreadCache } from './chatsDataPrefetch';
import {
  peerAvatarUriFromMeta,
  peerDisplayNameFromMeta,
  peerUsernameFromMeta,
} from './chatPeerDisplay';

const APP_SCREEN_BG = '#000000';
const LIGHT_BAR_BG = '#F2F2EA';
const HIDDEN_THREADS_PREFIX = '@kraina_hidden_threads_v1:';

function peerInitial(name) {
  const s = String(name || '').replace(/^@/, '').trim();
  return s ? s.charAt(0).toUpperCase() : '?';
}

export default function ChatsPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const langUk = language.split(/[-_]/)[0].toLowerCase() === 'uk';
  const user = route?.params?.user;
  const initialCacheKey = chatsCacheKey(user, 'inbox', langUk);
  const initialCache = readChatsCache(initialCacheKey);
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  const [q, setQ] = useState('');
  const [threads, setThreads] = useState(() => initialCache?.threads ?? []);
  const [folder, setFolder] = useState('inbox');
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const hiddenIdsRef = useRef(hiddenIds);
  hiddenIdsRef.current = hiddenIds;
  const reloadSeqRef = useRef(0);
  const [loading, setLoading] = useState(() => !(initialCache?.threads?.length > 0));
  const [requestCount, setRequestCount] = useState(() => initialCache?.requestCount ?? 0);
  const [acceptBusyId, setAcceptBusyId] = useState(null);
  const [sessionRecovering, setSessionRecovering] = useState(false);
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

  const reload = useCallback(async ({ showBlockingLoader = false } = {}) => {
    const seq = ++reloadSeqRef.current;
    const cacheKey = chatsCacheKey(user, folder, langUk);
    if (showBlockingLoader && !readChatsCache(cacheKey)?.threads?.length) {
      setLoading(true);
    }
    try {
      const t = await getAppTheme();
      if (seq !== reloadSeqRef.current) return;
      setAppTheme(t === 'light' ? 'light' : 'dark');
      const api = showServerTabs;
      let nextThreads = [];
      let nextRequestCount = 0;
      if (api) {
        try {
          const f = folder === 'requests' ? 'requests' : 'inbox';
          const [list, reqList] = await Promise.all([
            messagesListThreads(f, langUk),
            folder === 'inbox' ? messagesListThreads('requests', langUk).catch(() => []) : Promise.resolve([]),
          ]);
          if (seq !== reloadSeqRef.current) return;
          if (folder === 'inbox') {
            nextRequestCount = Array.isArray(reqList) ? reqList.length : 0;
            setRequestCount(nextRequestCount);
          }
          const mapped = list.map((row) => ({
            id: row.id,
            peerUserId: row.peer_user_id,
            peerName: peerUsernameFromMeta(row),
            peerDisplayName: peerDisplayNameFromMeta(row),
            peerUsername: peerUsernameFromMeta(row),
            peerAvatarUri: peerAvatarUriFromMeta(row),
            lastMessagePreview: row.last_content || '',
            lastAt: row.last_sent_at ? new Date(row.last_sent_at).getTime() : 0,
            unreadCount: row.unread_count || 0,
            useMessageApi: true,
            pendingForMe: row.pending_for_me,
          }));
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
      setThreads(nextThreads);
      const inboxCache = readChatsCache(chatsCacheKey(user, 'inbox', langUk));
      writeChatsCache(
        cacheKey,
        nextThreads,
        folder === 'inbox' ? nextRequestCount : inboxCache?.requestCount ?? 0,
      );
    } finally {
      if (seq === reloadSeqRef.current) {
        setLoading(false);
      }
    }
  }, [user, langUk, folder, showServerTabs]);

  const recoverBackendSession = useCallback(async () => {
    if (showServerTabs) return true;
    setSessionRecovering(true);
    try {
      return await ensureMessageApiReady(user);
    } finally {
      setSessionRecovering(false);
    }
  }, [showServerTabs, user]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('kraina_backend_session_merged_v1', () => {
      void reload();
    });
    return () => sub.remove();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        await loadHidden();
        if (cancelled) return;
        if (!showServerTabs) {
          await recoverBackendSession();
          if (cancelled) return;
        }
        const cacheKey = chatsCacheKey(user, folder, langUk);
        const cached = readChatsCache(cacheKey);
        if (cached?.threads?.length) {
          setThreads(cached.threads);
          if (folder === 'inbox') setRequestCount(cached.requestCount);
          setLoading(false);
        }
        void reload({ showBlockingLoader: !cached?.threads?.length });
      })();
      return () => {
        cancelled = true;
        reloadSeqRef.current += 1;
      };
    }, [reload, loadHidden, user, folder, langUk, showServerTabs, recoverBackendSession]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!showServerTabs) return undefined;
      const timer = setInterval(() => {
        void reload();
      }, 4000);
      return () => clearInterval(timer);
    }, [reload, showServerTabs]),
  );

  useEffect(() => {
    if (hiddenIds.size === 0) return;
    void reload();
  }, [hiddenIds, reload]);

  useEffect(() => {
    void reload();
  }, [showServerTabs, reload]);

  useEffect(() => {
    const cacheKey = chatsCacheKey(user, folder, langUk);
    const cached = readChatsCache(cacheKey);
    if (cached?.threads?.length) {
      setThreads(cached.threads);
      if (folder === 'inbox') setRequestCount(cached.requestCount);
      setLoading(false);
    } else {
      setThreads([]);
      setLoading(true);
    }
  }, [folder, user, langUk]);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const bg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#5C5C5C' : '#8E8E93';
  const searchBg = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return threads;
    return threads.filter(
      (th) =>
        (th.peerName || '').toLowerCase().includes(s) ||
        (th.lastMessagePreview || '').toLowerCase().includes(s),
    );
  }, [threads, q]);

  const onCompose = useCallback(async () => {
    if (!showServerTabs) {
      const ok = await recoverBackendSession();
      if (!ok) {
        Alert.alert('', st(language, 'needBackendLogin'));
        navigation.navigate('ProfileFriends', { ...shell, forChatPick: true });
        return;
      }
    }
    navigation.navigate('StartChat', shell);
  }, [navigation, shell, language, showServerTabs, recoverBackendSession]);

  const onRetryConnect = useCallback(async () => {
    const ok = await recoverBackendSession();
    if (ok) {
      void reload({ showBlockingLoader: true });
      return;
    }
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
  }, [recoverBackendSession, reload, language, navigation, user?.email]);

  const onOpenThread = useCallback(
    (item) => {
      void warmChatThreadCache(user, item.id, langUk, !!item.useMessageApi, {
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
      const avatarUri =
        item.peerAvatarUri && (item.peerAvatarUri.startsWith('http') || item.peerAvatarUri.startsWith('file'))
          ? item.peerAvatarUri
          : null;
      const isRequest = folder === 'requests' && item.pendingForMe;
      const rowInner = (
        <Pressable
          onPress={() => onOpenThread(item)}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: isLight ? 'transparent' : 'transparent',
              borderBottomColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
            },
            pressed && { opacity: 0.88 },
          ]}
          android_ripple={ripple}
        >
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.14)' }]}>
              <Text style={[styles.avatarLetter, { color: isLight ? '#1E1E1E' : '#FFFFFF' }]}>
                {peerInitial(item.peerName)}
              </Text>
            </View>
          )}
          <View style={styles.rowBody}>
            <View style={styles.rowTop}>
              <Text style={[styles.peerName, { color: textMain }]} numberOfLines={1}>
                {item.peerDisplayName || item.peerName}
              </Text>
              <Text style={[styles.time, { color: textMuted }]}>
                {item.lastAt ? formatChatTime(item.lastAt, language) : ''}
              </Text>
            </View>
            {!q.trim() ? (
              <Text style={[styles.preview, { color: textMuted }]} numberOfLines={1}>
                {item.lastMessagePreview || '—'}
              </Text>
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
                  <Text style={styles.acceptChipText}>{st(language, 'acceptRequest')}</Text>
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
          {(item.unreadCount || 0) > 0 && !isRequest ? (
            <View style={[styles.dot, { backgroundColor: accent }]} />
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
      folder,
      isLight,
      language,
      onAcceptRequest,
      onDeleteThread,
      onOpenThread,
      q,
      ripple,
      textMain,
      textMuted,
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

  const listEmpty =
    (loading || sessionRecovering) && threads.length === 0 ? (
    <View style={styles.emptyWrap}>
      <ActivityIndicator color={accent} size="large" />
    </View>
  ) : (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyIcon, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)' }]}>
        <Ionicons
          name={folder === 'requests' ? 'mail-unread-outline' : 'chatbubbles-outline'}
          size={36}
          color={isLight ? '#1E1E1E' : accent}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: textMain }]}>{emptyTitle}</Text>
      <Text style={[styles.emptyBody, { color: textMuted }]}>{emptyBody}</Text>
      {!showServerTabs && !sessionRecovering ? (
        <Pressable
          onPress={onRetryConnect}
          style={({ pressed }) => [
            styles.emptyCta,
            { backgroundColor: accent, opacity: pressed ? 0.9 : 1 },
          ]}
          android_ripple={ripple}
        >
          <Ionicons name="refresh-outline" size={18} color="#1E1E1E" style={{ marginRight: 8 }} />
          <Text style={styles.emptyCtaText}>{st(language, 'connectChatsRetry')}</Text>
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
          <Ionicons name="create-outline" size={18} color="#1E1E1E" style={{ marginRight: 8 }} />
          <Text style={styles.emptyCtaText}>{st(language, 'newChatCta')}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const footerText = showServerTabs ? st(language, 'backendChatsNote') : st(language, 'cloudSyncNote');

  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
      {!isLight ? (
        <LinearGradient
          colors={['rgba(225,255,0,0.14)', 'rgba(225,255,0,0.03)', 'transparent']}
          start={{ x: 0, y: 0.3 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}

      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 6, borderBottomColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' },
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
        <Pressable onPress={onCompose} hitSlop={12} style={styles.headerSide} accessibilityRole="button">
          <Ionicons name="create-outline" size={26} color={textMain} />
        </Pressable>
      </View>

      {showServerTabs ? (
        <View style={[styles.tabs, { borderBottomColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }]}>
          <Pressable
            onPress={() => setFolder('inbox')}
            style={[styles.tab, folder === 'inbox' && { borderBottomColor: accent, borderBottomWidth: 3 }]}
          >
            <Text style={[styles.tabText, { color: folder === 'inbox' ? textMain : textMuted }]}>
              {st(language, 'inboxTab')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setFolder('requests')}
            style={[styles.tab, folder === 'requests' && { borderBottomColor: accent, borderBottomWidth: 3 }]}
          >
            <View style={styles.tabLabelRow}>
              <Text style={[styles.tabText, { color: folder === 'requests' ? textMain : textMuted }]}>
                {st(language, 'requestsTab')}
              </Text>
              {requestCount > 0 ? (
                <View style={[styles.tabBadge, { backgroundColor: accent }]}>
                  <Text style={styles.tabBadgeText}>{requestCount > 99 ? '99+' : requestCount}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.searchWrap, { backgroundColor: searchBg }]}>
        <Ionicons name="search-outline" size={20} color={textMuted} style={{ marginRight: 8 }} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={st(language, 'searchPlaceholder')}
          placeholderTextColor={textMuted}
          style={[styles.searchInput, { color: textMain }]}
        />
      </View>

      <RenderProfiler id="ChatsPage">
      <FlashList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        estimatedItemSize={78}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={
          filtered.length > 0 ? (
            <Text style={[styles.footerNote, { color: textMuted }]}>{footerText}</Text>
          ) : null
        }
        contentContainerStyle={{
          paddingBottom: insets.bottom + lightTabBarExtraScrollPadding() + 24,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
      />
      </RenderProfiler>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 10,
    paddingHorizontal: 8,
  },
  headerSide: {
    width: 48,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  tabLabelRow: { flexDirection: 'row', alignItems: 'center' },
  tabText: { fontSize: 15, fontWeight: '700' },
  tabBadge: {
    marginLeft: 6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: { fontSize: 11, fontWeight: '800', color: '#1E1E1E' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  searchInput: { flex: 1, fontSize: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 12,
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 20, fontWeight: '800' },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  peerName: { flex: 1, fontSize: 16, fontWeight: '700', marginRight: 8 },
  time: { fontSize: 13 },
  preview: { fontSize: 14, marginTop: 4, lineHeight: 19 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 8,
  },
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
    paddingHorizontal: 32,
    paddingTop: 48,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 20 },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyCtaText: { fontSize: 15, fontWeight: '800', color: '#1E1E1E' },
  footerNote: {
    fontSize: 11,
    lineHeight: 15,
    paddingHorizontal: 20,
    paddingTop: 20,
    textAlign: 'center',
  },
});
