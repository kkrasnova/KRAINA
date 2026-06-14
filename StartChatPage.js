import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getAppTheme } from './themeStorage';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { st } from './chatsI18n';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { accentForTheme } from './themeAccent';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { hasMessageApiToken, messagesOpenThread } from './messageApi';

const APP_SCREEN_BG = '#000000';
const LIGHT_BAR_BG = '#F2F2EA';

export default function StartChatPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const user = route?.params?.user;
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);

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

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const bg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#5C5C5C' : '#8E8E93';

  const openChat = useCallback(async () => {
    if (!hasMessageApiToken()) {
      Alert.alert('', st(language, 'needBackendLogin'));
      return;
    }
    const u = username.trim().replace(/^@/, '');
    if (!u) return;
    setBusy(true);
    try {
      const meta = await messagesOpenThread({ peerUsername: u });
      const peerLabel = meta.peer_username?.startsWith('@')
        ? meta.peer_username
        : `@${meta.peer_username}`;
      navigation.replace('ChatThread', {
        ...shell,
        threadId: meta.id,
        peerName: peerLabel,
        useMessageApi: true,
        pendingForMe: !!meta.pending_for_me,
      });
    } catch (e) {
      Alert.alert('', e?.message || 'Error');
    } finally {
      setBusy(false);
    }
  }, [username, navigation, shell, language]);

  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 6, borderBottomColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' },
        ]}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.headerSide}>
          <Ionicons name="chevron-back" size={28} color={textMain} />
        </Pressable>
        <Text style={[styles.title, { color: textMain }]} numberOfLines={1}>
          {st(language, 'startChatTitle')}
        </Text>
        <View style={styles.headerSide} />
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
        <Text style={{ color: textMuted, marginBottom: 8, fontSize: 14 }}>{st(language, 'usernameLabel')}</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="@nickname"
          placeholderTextColor={textMuted}
          style={[
            styles.input,
            { color: textMain, borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)' },
          ]}
        />
        <Pressable
          onPress={openChat}
          disabled={busy}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: accent, opacity: busy ? 0.6 : pressed ? 0.9 : 1 },
          ]}
          android_ripple={ripple}
        >
          <Text style={[styles.ctaText, { color: isLight ? '#1E1E1E' : '#1E1E1E' }]}>
            {st(language, 'openChatCta')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('ProfileFriends', { ...shell, forChatPick: true })}
          style={{ marginTop: 24, paddingVertical: 12 }}
          android_ripple={ripple}
        >
          <Text style={{ color: accent, fontWeight: '700', fontSize: 16 }}>
            {st(language, 'pickMutualOrUsername')}
          </Text>
        </Pressable>
      </View>

      <View style={{ flex: 1 }} />
      <Text
        style={{
          color: textMuted,
          fontSize: 12,
          textAlign: 'center',
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + lightTabBarExtraScrollPadding() + 16,
        }}
      >
        {st(language, 'backendChatsNote')}
      </Text>
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
  headerSide: { width: 48, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 16,
    marginBottom: 16,
  },
  cta: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaText: { fontSize: 16, fontWeight: '800' },
});
