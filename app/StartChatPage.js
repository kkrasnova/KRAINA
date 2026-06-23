import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { getAppTheme, resolveAppTheme } from './themeStorage';
import { useSyncedAppLanguage } from './useAppLanguage';
import { brandFontSans } from './brandFont';
import { pf } from './profileI18n';
import { st } from './chatsI18n';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { accentForTheme } from './themeAccent';
import {
  ensureMessageApiReady,
  hasMessageApiToken,
  messagesOpenThread,
  socialListMutuals,
} from './messageApi';
import { socialPeekCachedSearchProfiles, socialSearchProfiles } from './socialApi';
import { errorToUserText } from './errorText';
import { peerDisplayNameFromMeta, peerUsernameFromMeta } from './chatPeerDisplay';
import { readMutualsCache, writeMutualsCache, warmChatThreadCache } from './chatsDataPrefetch';
import {
  SocialPeopleSearchBar,
  SocialPersonRow,
  SocialPeopleEmptyState,
  socialPeopleListColors,
  socialPersonDisplayName,
} from './socialPeopleListUi';

export default function StartChatPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const langUk = language.split(/[-_]/)[0].toLowerCase() === 'uk';
  const user = route?.params?.user;
  const [appTheme, setAppTheme] = useState(resolveAppTheme(route?.params?.appTheme));
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [mutuals, setMutuals] = useState(() => readMutualsCache(user) || []);
  const [searchHits, setSearchHits] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const searchDebounceRef = useRef(null);
  const searchSeqRef = useRef(0);
  const myUserId = String(user?.id || '');

  const filterSearchHits = useCallback(
    (rows) =>
      (Array.isArray(rows) ? rows : []).filter((hit) => String(hit.user_id) !== myUserId),
    [myUserId],
  );

  const shell = useMemo(
    () => ({
      user,
      language,
      ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
      appTheme: appTheme === 'light' ? 'light' : 'dark',
    }),
    [user, language, route?.params?.countryId, appTheme],
  );

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

  const loadMutuals = useCallback(async () => {
    try {
      const ok = await ensureMessageApiReady(user);
      if (!ok) {
        setMutuals([]);
        return;
      }
      const list = await socialListMutuals();
      const next = Array.isArray(list) ? list : [];
      setMutuals(next);
      writeMutualsCache(user, next);
    } catch {
      setMutuals([]);
    }
  }, [user]);

  const ensureReady = useCallback(async () => {
    if (hasMessageApiToken()) return true;
    return ensureMessageApiReady(user);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void ensureReady();
      void loadMutuals();
    }, [ensureReady, loadMutuals]),
  );

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const raw = q.trim().replace(/^@/, '');
    if (raw.length < 1) {
      setSearchHits([]);
      setSearchBusy(false);
      return;
    }

    const cached = filterSearchHits(socialPeekCachedSearchProfiles(raw, 24));
    if (cached.length) setSearchHits(cached);

    const seq = searchSeqRef.current + 1;
    searchSeqRef.current = seq;
    searchDebounceRef.current = setTimeout(async () => {
      setSearchBusy(true);
      try {
        const rows = await socialSearchProfiles(raw, 24);
        if (searchSeqRef.current !== seq) return;
        setSearchHits(filterSearchHits(rows));
      } catch {
        if (searchSeqRef.current !== seq) return;
        if (!cached.length) setSearchHits([]);
      } finally {
        if (searchSeqRef.current === seq) setSearchBusy(false);
      }
    }, 80);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [q, filterSearchHits]);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const { textMain, muted, border } = socialPeopleListColors(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;

  const navigateToThread = useCallback(
    async (meta, extra = {}) => {
      const peerLabel = peerUsernameFromMeta(meta);
      await warmChatThreadCache(user, meta.id, langUk, true, {
        peerName: peerLabel,
        peerDisplayName: peerDisplayNameFromMeta(meta) || peerLabel,
        peerUsername: peerLabel,
        peerAvatarUrl: meta.peer_avatar_url || extra.avatarUrl || '',
        pendingForMe: !!meta.pending_for_me,
      });
      navigation.replace('ChatThread', {
        ...shell,
        threadId: meta.id,
        peerName: peerLabel,
        peerDisplayName: peerDisplayNameFromMeta(meta) || peerLabel,
        peerUsername: peerLabel,
        peerAvatarUrl: meta.peer_avatar_url || extra.avatarUrl || '',
        peerUserId: String(meta.peer_user_id || extra.userId || ''),
        useMessageApi: true,
        pendingForMe: !!meta.pending_for_me,
      });
    },
    [navigation, shell, user, langUk],
  );

  const openChatFromHit = useCallback(
    async (hit) => {
      const ok = await ensureReady();
      if (!ok) {
        Alert.alert('', st(language, 'needBackendLogin'));
        return;
      }
      if (busy) return;
      setBusy(true);
      try {
        const meta = await messagesOpenThread({
          peerUserId: String(hit.user_id),
          peerUsername: String(hit.username || '').replace(/^@/, ''),
        });
        navigateToThread(meta, {
          avatarUrl: hit.avatar_url,
          userId: hit.user_id,
        });
      } catch (e) {
        Alert.alert('', errorToUserText(e, language));
      } finally {
        setBusy(false);
      }
    },
    [ensureReady, language, navigateToThread, busy],
  );

  const displayRows = useMemo(() => {
    const searching = q.trim().length >= 1;
    const source = searching ? searchHits : mutuals;
    return (Array.isArray(source) ? source : []).map((hit) => ({
      id: String(hit.user_id),
      name: socialPersonDisplayName(hit),
      avatarUrl: hit.avatar_url,
      raw: hit,
    }));
  }, [q, searchHits, mutuals]);

  const listEmpty = useMemo(() => {
    if (q.trim() && !searchBusy && displayRows.length === 0) {
      return (
        <SocialPeopleEmptyState
          icon="search-outline"
          title={st(language, 'globalSearchEmpty')}
          isLight={isLight}
          textMain={textMain}
          muted={muted}
        />
      );
    }
    if (!q.trim() && mutuals.length === 0) {
      return (
        <SocialPeopleEmptyState
          icon="people-outline"
          title={st(language, 'noMutualFriendsHint')}
          isLight={isLight}
          textMain={textMain}
          muted={muted}
        />
      );
    }
    return null;
  }, [q, searchBusy, displayRows.length, mutuals.length, language, isLight, textMain, muted]);

  const headerRight = (
    <Pressable
      onPress={() => navigation.navigate('ProfileFriends', shell)}
      hitSlop={12}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, padding: 4 }]}
      accessibilityRole="button"
      accessibilityLabel={langUk ? 'Керувати друзями' : 'Manage friends'}
    >
      <Ionicons name="create-outline" size={24} color={isLight ? '#1E1E1E' : '#FFFFFF'} />
    </Pressable>
  );

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        showBrandLogo
        rightSlot={headerRight}
        hideSendButton
      />
      <SocialPeopleSearchBar
        value={q}
        onChangeText={setQ}
        placeholder={pf(language, 'search')}
        isLight={isLight}
        accent={accent}
        textMain={textMain}
        muted={muted}
        searchBusy={searchBusy}
      />
      {busy ? (
        <Text style={[styles.busyHint, brandFontSans, { color: muted }]}>
          {st(language, 'globalSearchBusy')}
        </Text>
      ) : null}
      <FlashList
        data={displayRows}
        keyExtractor={(item) => item.id}
        estimatedItemSize={72}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: lightTabBarScrollContentPadding(insets.bottom, 20),
        }}
        ListEmptyComponent={listEmpty}
        renderItem={({ item, index }) => (
          <SocialPersonRow
            avatarUrl={item.avatarUrl}
            displayName={item.name}
            onPress={() => void openChatFromHit(item.raw)}
            isLight={isLight}
            textMain={textMain}
            border={border}
            isLast={index === displayRows.length - 1}
            ripple={ripple}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  busyHint: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 4,
  },
});
