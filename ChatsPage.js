import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  Platform,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getAppTheme } from './themeStorage';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { st, formatChatTime } from './chatsI18n';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { accentForTheme } from './themeAccent';
import PddHeaderWordmark from './PddHeaderWordmark';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import ChatSwipeRow from './ChatSwipeRow';
import { getThreads, deleteThread, chatUserKey } from './chatService';
import { hasMessageApiToken, messagesListThreads } from './messageApi';

const APP_SCREEN_BG = '#000000';
const LIGHT_BAR_BG = '#F2F2EA';
const HIDDEN_THREADS_PREFIX = '@kraina_hidden_threads_v1:';

export default function ChatsPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const langUk = language.split(/[-_]/)[0].toLowerCase() === 'uk';
  const user = route?.params?.user;
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  const [q, setQ] = useState('');
  const [threads, setThreads] = useState([]);
  const [folder, setFolder] = useState('inbox');
  const [hiddenIds, setHiddenIds] = useState(() => new Set());

  const hiddenKey = useMemo(() => {
    const who = chatUserKey(user);
    const apiMode = hasMessageApiToken() ? 'api' : 'local';
    return `${HIDDEN_THREADS_PREFIX}${who}:${apiMode}:${folder}`;
  }, [user, folder]);

  const loadHidden = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(hiddenKey);
      if (!raw) {
        setHiddenIds(new Set());
        return;
      }
      const arr = JSON.parse(raw);
      setHiddenIds(new Set(Array.isArray(arr) ? arr.map(String) : []));
    } catch {
      setHiddenIds(new Set());
    }
  }, [hiddenKey]);

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

  const reload = useCallback(async () => {
    const t = await getAppTheme();
    setAppTheme(t === 'light' ? 'light' : 'dark');
    const api = hasMessageApiToken();
    if (api) {
      try {
        const f = folder === 'requests' ? 'requests' : 'inbox';
        const list = await messagesListThreads(f);
        const mapped = list.map((row) => ({
          id: row.id,
          peerName: row.peer_username?.startsWith('@')
            ? row.peer_username
            : `@${row.peer_username}`,
          peerAvatarUri: row.peer_avatar_url,
          lastMessagePreview: row.last_content || '',
          lastAt: row.last_sent_at ? new Date(row.last_sent_at).getTime() : 0,
          unreadCount: row.unread_count || 0,
          useMessageApi: true,
          pendingForMe: row.pending_for_me,
        }));
        mapped.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
        setThreads(mapped.filter((t) => !hiddenIds.has(String(t.id))));
      } catch (e) {
        if (__DEV__) console.warn('[ChatsPage] api threads', e?.message);
        const list = await getThreads(user, langUk);
        setThreads(
          [...list]
            .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0))
            .filter((t) => !hiddenIds.has(String(t.id))),
        );
      }
    } else {
      const list = await getThreads(user, langUk);
      setThreads(
        [...list]
          .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0))
          .filter((t) => !hiddenIds.has(String(t.id))),
      );
    }
  }, [user, langUk, folder, hiddenIds]);

  useFocusEffect(
    useCallback(() => {
      void loadHidden();
      reload();
      if (hasMessageApiToken()) {
        const timer = setInterval(() => {
          void reload();
        }, 4000);
        return () => clearInterval(timer);
      }
      return undefined;
    }, [reload, loadHidden]),
  );

  useEffect(() => {
    void loadHidden();
  }, [loadHidden]);

  useEffect(() => {
    let c = false;
    (async () => {
      const t = await getAppTheme();
      if (!c) setAppTheme(t === 'light' ? 'light' : 'dark');
    })();
    return () => {
      c = true;
    };
  }, []);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const bg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#5C5C5C' : '#8E8E93';
  const searchBg = isLight ? 'rgba(0,0,0,0.06)' : '#2C2C2E';
  const showServerTabs = hasMessageApiToken();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return threads;
    return threads.filter(
      (th) =>
        (th.peerName || '').toLowerCase().includes(s) ||
        (th.lastMessagePreview || '').toLowerCase().includes(s),
    );
  }, [threads, q]);

  const onCompose = useCallback(() => {
    if (hasMessageApiToken()) {
      navigation.navigate('StartChat', shell);
    } else {
      navigation.navigate('ProfileFriends', { ...shell, forChatPick: true });
    }
  }, [navigation, shell]);

  const onOpenThread = useCallback(
    (item) => {
      navigation.navigate('ChatThread', {
        ...shell,
        threadId: item.id,
        peerName: item.peerName,
        peerAvatarUrl: item.peerAvatarUri || '',
        ...(item.useMessageApi
          ? { useMessageApi: true, pendingForMe: !!item.pendingForMe }
          : {}),
      });
    },
    [navigation, shell],
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

  const renderItem = useCallback(
    ({ item }) => {
      const avatarUri =
        item.peerAvatarUri && (item.peerAvatarUri.startsWith('http') || item.peerAvatarUri.startsWith('file'))
          ? item.peerAvatarUri
          : null;
      const rowInner = (
        <Pressable
          onPress={() => onOpenThread(item)}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: bg,
              borderBottomColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
            },
            pressed && { opacity: 0.92 },
          ]}
          android_ripple={ripple}
        >
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View
              style={[
                styles.avatar,
                { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)' },
              ]}
            />
          )}
          <View style={styles.rowBody}>
            <View style={styles.rowTop}>
              <Text style={[styles.peerName, { color: textMain }]} numberOfLines={1}>
                {item.peerName}
              </Text>
              <Text style={[styles.time, { color: textMuted }]}>
                {item.lastAt ? formatChatTime(item.lastAt, language) : ''}
              </Text>
            </View>
            {q.trim() ? null : (
              <Text style={[styles.preview, { color: textMuted }]} numberOfLines={1}>
                {item.lastMessagePreview || '—'}
              </Text>
            )}
          </View>
          {(item.unreadCount || 0) > 0 ? <View style={[styles.dot, { backgroundColor: accent }]} /> : null}
        </Pressable>
      );

      return (
        <ChatSwipeRow onDelete={() => onDeleteThread(item)} deleteLabel={st(language, 'delete')}>
          {rowInner}
        </ChatSwipeRow>
      );
    },
    [accent, bg, isLight, language, onDeleteThread, onOpenThread, q, ripple, textMain, textMuted],
  );

  const footerText = showServerTabs ? st(language, 'backendChatsNote') : st(language, 'cloudSyncNote');

  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
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
            style={[styles.tab, folder === 'inbox' && { borderBottomColor: accent, borderBottomWidth: 2 }]}
          >
            <Text style={[styles.tabText, { color: folder === 'inbox' ? textMain : textMuted }]}>
              {st(language, 'inboxTab')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setFolder('requests')}
            style={[styles.tab, folder === 'requests' && { borderBottomColor: accent, borderBottomWidth: 2 }]}
          >
            <Text style={[styles.tabText, { color: folder === 'requests' ? textMain : textMuted }]}>
              {st(language, 'requestsTab')}
            </Text>
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

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListFooterComponent={<Text style={[styles.footerNote, { color: textMuted }]}>{footerText}</Text>}
        contentContainerStyle={{
          paddingBottom: insets.bottom + lightTabBarExtraScrollPadding() + 24,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
      />
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
  tabText: { fontSize: 15, fontWeight: '700' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  peerName: { flex: 1, fontSize: 16, fontWeight: '700', marginRight: 8 },
  time: { fontSize: 13 },
  preview: { fontSize: 14, marginTop: 4 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 8,
  },
  footerNote: {
    fontSize: 11,
    lineHeight: 15,
    paddingHorizontal: 20,
    paddingTop: 20,
    textAlign: 'center',
  },
});
