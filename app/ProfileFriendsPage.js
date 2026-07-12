import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { FlashList } from '@shopify/flash-list';
import { View, StyleSheet, Alert, RefreshControl, DeviceEventEmitter, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { useSyncedAppLanguage } from './useAppLanguage';
import { pf } from './profileI18n';
import { st } from './chatsI18n';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import { getFriends, setFriends } from './profileStorage';
import { hasMessageApiToken, messagesOpenThread, socialListMutuals } from './messageApi';
import {
  socialSearchProfiles,
  socialFollowUsername,
  socialUnfollowUsername,
} from './socialApi';
import {
  KRAINA_SOCIAL_FOLLOW_CHANGED,
  KRAINA_SOCIAL_GRAPH_CHANGED,
  socialFollowMatches,
  isNavigableSocialUsername,
} from './socialFollowSyncEvents';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { useAppTheme } from './useAppTheme';
import { accentForTheme } from './themeAccent';
import { errorToUserText } from './errorText';
import { readMutualsCache } from './chatsDataPrefetch';
import { peerDisplayNameFromMeta, peerUsernameFromMeta } from './chatPeerDisplay';
import {
  SocialPeopleSearchBar,
  SocialListActionBtn,
  SocialPersonRow,
  SocialPeopleEmptyState,
  socialPeopleListColors,
  socialPersonDisplayName,
} from './socialPeopleListUi';
import {
  openSocialUserProfile,
  prefetchSocialUserProfile,
  prefetchSocialUserProfileBundle,
} from './socialProfileNav';

export default function ProfileFriendsPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const forChatPick = route?.params?.forChatPick === true;
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [mutuals, setMutuals] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchHits, setSearchHits] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [followBusyMap, setFollowBusyMap] = useState({});
  const [followMap, setFollowMap] = useState({});
  const searchDebounceRef = useRef(null);
  const { appTheme, isLight } = useAppTheme(route?.params?.appTheme, route);
  const accent = accentForTheme(isLight);
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const { textMain, muted, border } = socialPeopleListColors(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;

  const shell = {
    user: route?.params?.user,
    language,
    ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
    appTheme,
  };

  const reload = useCallback(async (withSpinner = false) => {
    if (withSpinner) setRefreshing(true);
    try {
      const friends = getFriends();
      setList(Array.isArray(friends) ? friends : []);

      if (hasMessageApiToken()) {
        const cachedMutuals = readMutualsCache(shell.user);
        if (Array.isArray(cachedMutuals) && cachedMutuals.length) {
          setMutuals(cachedMutuals);
        } else {
          setMutuals([]);
        }

        const timeout = 1000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const m = await Promise.race([
            socialListMutuals(),
            new Promise((_, reject) => {
              controller.signal.addEventListener('abort', () => {
                reject(new Error('timeout_1s'));
              });
            }),
          ]);
          clearTimeout(timeoutId);
          if (Array.isArray(m) && m.length) setMutuals(m);
        } catch (e) {
          clearTimeout(timeoutId);
          if (__DEV__) console.log('[ProfileFriendsPage] backend load timeout/error:', e?.message);
          if (!Array.isArray(cachedMutuals) || !cachedMutuals.length) {
            setMutuals([]);
          }
        }
      } else {
        setMutuals(null);
      }
    } finally {
      if (withSpinner) setRefreshing(false);
    }
  }, [shell.user]);

  useFocusEffect(
    useCallback(() => {
      prefetchSocialUserProfileBundle();
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_SOCIAL_FOLLOW_CHANGED, (payload) => {
      const userId = String(payload?.user_id || '');
      const isFollowing = !!payload?.is_following;
      if (userId) {
        setFollowMap((m) => ({ ...m, [userId]: isFollowing }));
      }
      setSearchHits((prev) =>
        prev.map((row) =>
          socialFollowMatches(payload, row.username, row.user_id)
            ? { ...row, is_following: isFollowing }
            : row,
        ),
      );
      void reload();
    });
    return () => sub.remove();
  }, [reload]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_SOCIAL_GRAPH_CHANGED, () => {
      void reload();
    });
    return () => sub.remove();
  }, [reload]);

  const displayList = useMemo(() => {
    if (mutuals != null && Array.isArray(mutuals) && mutuals.length > 0) {
      return mutuals
        .filter((u) => u.username && isNavigableSocialUsername(u.username))
        .map((u) => ({
          id: String(u.user_id || u.id || ''),
          name: socialPersonDisplayName(u),
          username: u.username,
          display_name: u.display_name,
          backendUserId: u.user_id || u.id,
          avatarUrl: u.avatar_url || u.avatar,
        }));
    }
    if (Array.isArray(list) && list.length > 0) {
      return list
        .filter((x) => {
          const raw = String(x?.username || x?.name || '').replace(/^@/, '').trim();
          return raw && isNavigableSocialUsername(raw);
        })
        .map((x) => ({
          id: String(x.id || x.backendUserId || ''),
          name: socialPersonDisplayName(x),
          username: x.username,
          display_name: x.display_name,
          backendUserId: x.backendUserId || x.id,
          avatarUrl: x.avatarUrl || x.avatar,
        }));
    }
    return [];
  }, [mutuals, list]);

  useEffect(() => {
    if (!displayList.length) return undefined;
    const timer = setTimeout(() => {
      displayList.slice(0, 10).forEach((item) => {
        if (item.username) prefetchSocialUserProfile(item.username);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [displayList]);

  const filteredLocal = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return displayList;
    return displayList.filter((x) => {
      const name = String(x.name || '').toLowerCase();
      const username = String(x.username || '').toLowerCase();
      return name.includes(s) || username.includes(s);
    });
  }, [displayList, q]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const raw = q.trim().replace(/^@/, '');
    if (raw.length < 1) {
      setSearchHits([]);
      setSearchBusy(false);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      setSearchBusy(true);
      try {
        const rows = await socialSearchProfiles(raw, 24);
        setSearchHits(Array.isArray(rows) ? rows : []);
      } catch {
        setSearchHits([]);
      } finally {
        setSearchBusy(false);
      }
    }, 80);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [q]);

  const filtered = useMemo(() => {
    const s = q.trim();
    if (!s) return displayList;
    const localIds = new Set(
      filteredLocal.map((x) => String(x.backendUserId || x.id || '')),
    );
    const fromSearch = searchHits
      .filter((u) => !localIds.has(String(u.user_id)))
      .map((u) => ({
        id: String(u.user_id),
        name: socialPersonDisplayName(u),
        username: u.username,
        display_name: u.display_name,
        backendUserId: u.user_id,
        avatarUrl: u.avatar_url,
        fromGlobalSearch: true,
        isFollowing: followMap[String(u.user_id)] !== undefined
          ? followMap[String(u.user_id)]
          : !!u.is_following,
      }));
    return [...filteredLocal, ...fromSearch];
  }, [q, displayList, filteredLocal, searchHits, followMap]);

  const removeFriend = async (item) => {
    const id = item.id;
    const username = String(item.username || '').replace(/^@/, '').trim();
    if (item.backendUserId && username) {
      try {
        await socialUnfollowUsername(username, { user_id: item.backendUserId });
        void reload();
      } catch (e) {
        Alert.alert('', errorToUserText(e, language));
      }
      return;
    }
    const next = list.filter((x) => x.id !== id);
    setList(next);
    await setFriends(next);
  };

  const openChatWithFriend = async (item) => {
    if (!hasMessageApiToken()) {
      Alert.alert('', st(language, 'needBackendLogin'));
      return;
    }
    if (item.backendUserId) {
      try {
        const meta = await messagesOpenThread({ peerUserId: item.backendUserId });
        navigation.navigate('ChatThread', {
          ...shell,
          threadId: meta.id,
          peerName: peerUsernameFromMeta(meta),
          peerDisplayName: peerDisplayNameFromMeta(meta) || item.name,
          peerUsername: peerUsernameFromMeta(meta),
          peerAvatarUrl: item.avatarUrl || meta.peer_avatar_url || '',
          peerUserId: String(meta.peer_user_id || item.backendUserId),
          useMessageApi: true,
          pendingForMe: !!meta.pending_for_me,
        });
      } catch (e) {
        Alert.alert('', errorToUserText(e, language));
      }
    }
  };

  const openFriendProfile = useCallback(
    (item) => {
      openSocialUserProfile(navigation, shell, { row: item });
    },
    [navigation, shell],
  );

  const handleFollowSearch = useCallback(
    async (item) => {
      const userId = String(item.backendUserId || item.id || '');
      const username = String(item.username || '').replace(/^@/, '').trim();
      if (!userId || !username || followBusyMap[userId]) return;
      const currentFollow = followMap[userId] !== undefined ? followMap[userId] : !!item.isFollowing;
      setFollowBusyMap((m) => ({ ...m, [userId]: true }));
      setFollowMap((m) => ({ ...m, [userId]: !currentFollow }));
      try {
        const followOpts = { user_id: userId };
        if (currentFollow) await socialUnfollowUsername(username, followOpts);
        else await socialFollowUsername(username, followOpts);
      } catch (e) {
        setFollowMap((m) => ({ ...m, [userId]: currentFollow }));
        Alert.alert('', errorToUserText(e, language));
      } finally {
        setFollowBusyMap((m) => ({ ...m, [userId]: false }));
      }
    },
    [followBusyMap, followMap, language],
  );

  const openStartChat = useCallback(() => {
    navigation.navigate('StartChat', shell);
  }, [navigation, shell]);

  const openManageFriends = useCallback(() => {
    navigation.navigate('ProfileFriends', shell);
  }, [navigation, shell]);

  const headerRight = forChatPick ? (
    <Pressable
      onPress={openManageFriends}
      hitSlop={12}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, padding: 4 }]}
      accessibilityRole="button"
      accessibilityLabel={langUk ? 'Керувати друзями' : 'Manage friends'}
    >
      <Ionicons name="create-outline" size={24} color={isLight ? '#1E1E1E' : '#FFFFFF'} />
    </Pressable>
  ) : (
    <Pressable
      onPress={openStartChat}
      hitSlop={12}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, padding: 4 }]}
      accessibilityRole="button"
      accessibilityLabel={st(language, 'startChatTitle')}
    >
      <Ionicons name="paper-plane-outline" size={22} color={isLight ? '#1E1E1E' : '#FFFFFF'} />
    </Pressable>
  );

  const listEmpty = useMemo(() => {
    if (q.trim() && !searchBusy && filtered.length === 0) {
      return (
        <SocialPeopleEmptyState
          icon="search-outline"
          title={langUk ? 'Нікого не знайдено' : 'No people found'}
          isLight={isLight}
          textMain={textMain}
          muted={muted}
        />
      );
    }
    if (!q.trim() && displayList.length === 0) {
      return (
        <SocialPeopleEmptyState
          icon="people-outline"
          title={langUk ? 'Поки немає друзів' : 'No friends yet'}
          subtitle={langUk ? 'Знайдіть людей і додайте їх у друзі' : 'Find people and add them as friends'}
          isLight={isLight}
          textMain={textMain}
          muted={muted}
        />
      );
    }
    return null;
  }, [q, searchBusy, filtered.length, displayList.length, langUk, isLight, textMain, muted]);

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        showBrandLogo={forChatPick}
        replaceCenterTitle={forChatPick ? null : pf(language, 'friendsTitle')}
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
      <FlashList
        data={filtered}
        keyExtractor={(item) => item.id}
        estimatedItemSize={72}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: lightTabBarScrollContentPadding(insets.bottom, 20),
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void reload(true)}
            tintColor={accent}
          />
        }
        ListEmptyComponent={listEmpty}
        renderItem={({ item, index }) => {
          const isLast = index === filtered.length - 1;
          const showActions = !forChatPick;
          const rowPress = forChatPick
            ? () => openChatWithFriend(item)
            : undefined;

          let actions = null;
          if (showActions) {
            if (item.fromGlobalSearch) {
              const userId = String(item.backendUserId || item.id || '');
              const isFollowed =
                followMap[userId] !== undefined ? followMap[userId] : !!item.isFollowing;
              actions = (
                <SocialListActionBtn
                  icon={isFollowed ? 'checkmark' : 'add'}
                  onPress={() => handleFollowSearch(item)}
                  disabled={!!followBusyMap[userId]}
                  ripple={ripple}
                  isLight={isLight}
                  accessibilityLabel={isFollowed ? pf(language, 'following') : pf(language, 'follow')}
                />
              );
            } else {
              actions = (
                <>
                  <SocialListActionBtn
                    icon="paper-plane"
                    onPress={() => openChatWithFriend(item)}
                    ripple={ripple}
                    isLight={isLight}
                    accessibilityLabel={st(language, 'startChatTitle')}
                  />
                  <SocialListActionBtn
                    icon="close"
                    variant="danger"
                    onPress={() => removeFriend(item)}
                    ripple={ripple}
                    isLight={isLight}
                    accessibilityLabel={langUk ? 'Видалити' : 'Remove'}
                  />
                </>
              );
            }
          }

          return (
            <SocialPersonRow
              avatarUrl={item.avatarUrl}
              displayName={item.name}
              onPress={rowPress}
              onPressName={() => openFriendProfile(item)}
              onPressNameIn={() => prefetchSocialUserProfile(item.username)}
              actions={actions}
              isLight={isLight}
              textMain={textMain}
              border={border}
              isLast={isLast}
              ripple={ripple}
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
