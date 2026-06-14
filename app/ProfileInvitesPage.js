import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, Pressable, Alert, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { useSyncedAppLanguage } from './useAppLanguage';

import { pf } from './profileI18n';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { socialListIncomingRequests, socialAcceptRequest, socialDeclineRequest } from './socialApi';
import { hasSocialApi } from './socialApi';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { getAppTheme } from './themeStorage';
import { accentForTheme } from './themeAccent';
import { errorToUserText } from './errorText';

export default function ProfileInvitesPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const [q, setQ] = useState('');
  const [invites, setInvites] = useState([]);
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
    const t = await getAppTheme();
    setAppTheme(t === 'light' ? 'light' : 'dark');
    if (!hasSocialApi()) {
      setInvites([]);
      return;
    }
    try {
      const inv = await socialListIncomingRequests();
      setInvites(Array.isArray(inv) ? inv : []);
    } catch {
      setInvites([]);
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

  const filtered = q.trim()
    ? invites.filter((x) => `${x.display_name || ''} ${x.username || ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    : invites;

  const accept = async (item) => {
    try {
      await socialAcceptRequest(item.user_id);
      setInvites((prev) => prev.filter((x) => x.user_id !== item.user_id));
    } catch (e) {
      Alert.alert('', errorToUserText(e, language));
    }
  };

  const decline = async (item) => {
    try {
      await socialDeclineRequest(item.user_id);
      setInvites((prev) => prev.filter((x) => x.user_id !== item.user_id));
    } catch (e) {
      Alert.alert('', errorToUserText(e, language));
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        centerSubtitle={pf(language, 'invitesTitle')}
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
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.user_id}
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
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
            ) : (
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)' },
                ]}
              />
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: textMain }]}>{item.display_name || item.username}</Text>
              <Text style={{ color: isLight ? '#888' : '#777', fontSize: 13 }}>@{item.username}</Text>
            </View>
            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [styles.iconBtn, styles.addBtn, pressed && { opacity: 0.85 }]}
                android_ripple={ripple}
                onPress={() => accept(item)}
              >
                <Ionicons name="add" size={22} color="#FFF" />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.iconBtn, styles.delBtn, pressed && { opacity: 0.85 }]}
                android_ripple={ripple}
                onPress={() => decline(item)}
              >
                <Ionicons name="close" size={18} color="#FFF" />
              </Pressable>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  addBtn: { backgroundColor: '#1E1E1E' },
  delBtn: { backgroundColor: '#EB4335' },
});
