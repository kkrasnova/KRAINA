import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, Pressable, Platform, Alert, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { pf } from './profileI18n';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { getFriends, setFriends } from './profileStorage';
import { ensureThreadForPeer } from './chatService';
import { hasMessageApiToken, messagesOpenThread, socialListMutuals } from './messageApi';
import { socialListIncomingRequests, socialAcceptRequest, socialDeclineRequest } from './socialApi';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { getAppTheme } from './themeStorage';
import { accentForTheme } from './themeAccent';
import { errorToUserText } from './errorText';

export default function ProfileFriendsPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const forChatPick = route?.params?.forChatPick === true;
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [mutuals, setMutuals] = useState(null);
  const [incoming, setIncoming] = useState([]);
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;

  const shell = {
    user: route?.params?.user,
    language,
    ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
    appTheme,
  };

  const reload = useCallback(async () => {
    const [t, friends] = await Promise.all([getAppTheme(), getFriends()]);
    setAppTheme(t === 'light' ? 'light' : 'dark');
    setList(friends);
    if (hasMessageApiToken()) {
      try {
        const [m, inc] = await Promise.all([
          socialListMutuals(),
          socialListIncomingRequests(),
        ]);
        setMutuals(Array.isArray(m) ? m : []);
        setIncoming(Array.isArray(inc) ? inc : []);
      } catch {
        setMutuals([]);
        setIncoming([]);
      }
    } else {
      setMutuals(null);
      setIncoming([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
      const timer = setInterval(() => {
        void reload();
      }, 7000);
      return () => clearInterval(timer);
    }, [reload]),
  );

  const displayList = useMemo(() => {
    if (mutuals != null && mutuals.length > 0) {
      return mutuals.map((u) => ({
        id: u.user_id,
        name: u.username?.startsWith('@') ? u.username : `@${u.username}`,
        backendUserId: u.user_id,
        avatarUrl: u.avatar_url,
      }));
    }
    return list;
  }, [mutuals, list]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return displayList;
    return displayList.filter((x) => x.name.toLowerCase().includes(s));
  }, [displayList, q]);

  const onAcceptRequest = async (userId) => {
    try {
      await socialAcceptRequest(userId);
      setIncoming((prev) => prev.filter((r) => r.user_id !== userId));
      reload();
    } catch (e) {
      Alert.alert('', errorToUserText(e, language));
    }
  };

  const onDeclineRequest = async (userId) => {
    try {
      await socialDeclineRequest(userId);
      setIncoming((prev) => prev.filter((r) => r.user_id !== userId));
    } catch (e) {
      Alert.alert('', errorToUserText(e, language));
    }
  };

  const removeFriend = async (id) => {
    const next = list.filter((x) => x.id !== id);
    setList(next);
    await setFriends(next);
  };

  const openChatWithFriend = async (item) => {
    if (item.backendUserId && hasMessageApiToken()) {
      try {
        const meta = await messagesOpenThread({ peerUserId: item.backendUserId });
        const peerLabel = meta.peer_username?.startsWith('@')
          ? meta.peer_username
          : `@${meta.peer_username}`;
        navigation.navigate('ChatThread', {
          ...shell,
          threadId: meta.id,
          peerName: peerLabel,
          peerAvatarUrl: item.avatarUrl || '',
          useMessageApi: true,
          pendingForMe: !!meta.pending_for_me,
        });
      } catch (e) {
        Alert.alert('', errorToUserText(e, language));
      }
      return;
    }
    const th = await ensureThreadForPeer(
      route?.params?.user,
      `friend_${item.id}`,
      item.name,
      langUk,
    );
    navigation.navigate('ChatThread', {
      ...shell,
      threadId: th.id,
      peerName: item.name,
      peerAvatarUrl: item.avatarUrl || '',
    });
  };

  const openFriendProfile = useCallback(
    (item) => {
      const raw = String(item?.name || item?.username || '').trim();
      const unameFromName = raw.startsWith('@') ? raw.slice(1) : raw;
      const username = String(item?.username || unameFromName || '').replace(/^@/, '').trim();
      if (!username) return;
      navigation.push('SocialUserProfile', {
        ...shell,
        username,
      });
    },
    [navigation, shell],
  );

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        centerSubtitle={pf(language, 'friendsTitle')}
        hideSendButton
      />
      <View
        style={[
          styles.searchWrap,
          {
            borderColor: accent,
            backgroundColor: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.08)',
          },
        ]}
      >
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={pf(language, 'search')}
          placeholderTextColor={isLight ? '#888' : '#777'}
          style={[styles.searchInput, { color: textMain }]}
        />
        <Ionicons name="search-outline" size={22} color={accent} />
      </View>
      {incoming.length > 0 ? (
        <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
          <Text style={[styles.sectionTitle, { color: accent }]}>
            {langUk ? 'Запити в друзі' : 'Friend requests'} ({incoming.length})
          </Text>
          {incoming.map((r) => (
            <View
              key={r.user_id}
              style={[
                styles.row,
                { borderBottomColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)' },
              ]}
            >
              <View style={styles.rowMain}>
                {r.avatar_url ? (
                  <Image source={{ uri: r.avatar_url }} style={styles.avatar} />
                ) : (
                  <View
                    style={[
                      styles.avatar,
                      { backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)' },
                    ]}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Pressable onPress={() => openFriendProfile(r)} style={{ alignSelf: 'flex-start' }}>
                    <Text style={[styles.name, { color: textMain }]}>
                      {r.display_name || r.username}
                    </Text>
                  </Pressable>
                  <Text style={{ color: isLight ? '#888' : '#777', fontSize: 13 }}>
                    @{r.username}
                  </Text>
                </View>
              </View>
              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [styles.iconBtn, { backgroundColor: '#34A853' }, pressed && { opacity: 0.85 }]}
                  android_ripple={ripple}
                  onPress={() => onAcceptRequest(r.user_id)}
                >
                  <Ionicons name="checkmark" size={20} color="#FFF" />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.iconBtn, styles.delBtn, pressed && { opacity: 0.85 }]}
                  android_ripple={ripple}
                  onPress={() => onDeclineRequest(r.user_id)}
                >
                  <Ionicons name="close" size={18} color="#FFF" />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}
      {incoming.length > 0 && filtered.length > 0 ? (
        <View style={{ paddingHorizontal: 20, marginBottom: 4 }}>
          <Text style={[styles.sectionTitle, { color: accent }]}>
            {langUk ? 'Друзі' : 'Friends'} ({filtered.length})
          </Text>
        </View>
      ) : null}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + lightTabBarExtraScrollPadding() + 20,
        }}
        renderItem={({ item }) => (
          <View
            style={[
              styles.row,
              { borderBottomColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)' },
            ]}
          >
            <Pressable
              style={styles.rowMain}
              onPress={() => (forChatPick ? openChatWithFriend(item) : openFriendProfile(item))}
            >
              {item.avatarUrl && item.avatarUrl.startsWith('http') ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
              ) : (
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)' },
                  ]}
                />
              )}
              <Text style={[styles.name, { color: textMain }]}>{item.name}</Text>
            </Pressable>
            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [styles.iconBtn, styles.msgBtn, pressed && { opacity: 0.85 }]}
                android_ripple={ripple}
                onPress={() =>
                  forChatPick ? openChatWithFriend(item) : navigation.navigate('Chats', shell)
                }
              >
                <Ionicons name="paper-plane" size={16} color="#FFF" />
              </Pressable>
              {!item.backendUserId ? (
                <Pressable
                  style={({ pressed }) => [styles.iconBtn, styles.delBtn, pressed && { opacity: 0.85 }]}
                  android_ripple={ripple}
                  onPress={() => removeFriend(item.id)}
                >
                  <Ionicons name="close" size={18} color="#FFF" />
                </Pressable>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4, marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  name: { flex: 1, fontSize: 16 },
  actions: { flexDirection: 'row', gap: 10 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgBtn: { backgroundColor: '#1E1E1E' },
  delBtn: { backgroundColor: '#EB4335' },
});
