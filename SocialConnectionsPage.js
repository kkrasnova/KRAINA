import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Image, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { getAppTheme } from './themeStorage';
import { useSyncedAppLanguage } from './useAppLanguage';
import { pf } from './profileI18n';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { socialGetPublicProfileFull } from './socialApi';

function pickRows(payload, kind) {
  if (!payload) return [];
  if (kind === 'followers') return Array.isArray(payload.followers) ? payload.followers : [];
  if (kind === 'following') return Array.isArray(payload.following) ? payload.following : [];
  return Array.isArray(payload.friends) ? payload.friends : [];
}

export default function SocialConnectionsPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const username = String(route?.params?.username || '').replace(/^@/, '').trim();
  const kind = route?.params?.kind === 'followers' || route?.params?.kind === 'following' ? route.params.kind : 'friends';
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const isLight = appTheme === 'light';
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const muted = isLight ? '#5C5C5C' : '#9A9A9A';
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const cardBg = isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)';
  const border = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.14)';
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;

  const shell = useMemo(
    () => ({
      user: route?.params?.user || {},
      language,
      ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
      appTheme,
    }),
    [route?.params?.user, route?.params?.countryId, language, appTheme],
  );

  const title = kind === 'followers' ? pf(language, 'followers') : kind === 'following' ? pf(language, 'following') : pf(language, 'friends');

  const reload = useCallback(async () => {
    const t = await getAppTheme();
    setAppTheme(t === 'light' ? 'light' : 'dark');
    if (!username) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const payload = await socialGetPublicProfileFull(username, 120);
      setRows(pickRows(payload, kind));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [username, kind]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      const timer = setInterval(() => {
        void reload();
      }, 9000);
      return () => clearInterval(timer);
    }, [reload]),
  );

  const openUser = useCallback(
    (row) => {
      const uname = String(row?.username || '').replace(/^@/, '').trim();
      if (!uname) return;
      navigation.push('SocialUserProfile', {
        ...shell,
        username: uname,
      });
    },
    [navigation, shell],
  );

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        replaceCenterTitle={title}
        hideSendButton
        lightBarBackgroundColor={isLight ? '#FFFFFF' : undefined}
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={isLight ? '#0212EB' : '#E1FF00'} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.user_id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + lightTabBarExtraScrollPadding() + 20 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openUser(item)}
              android_ripple={ripple}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: cardBg, borderColor: border, opacity: pressed ? 0.92 : 1 },
              ]}
            >
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: isLight ? '#E4E4DE' : '#2A2A31' }]} />
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.name, { color: textMain }]} numberOfLines={1}>
                  {item.display_name || `@${item.username}`}
                </Text>
                <Text style={[styles.username, { color: muted }]} numberOfLines={1}>
                  @{item.username}
                </Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={[styles.empty, { color: muted }]}>—</Text>}
          {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  name: { fontSize: 16, fontWeight: '700' },
  username: { fontSize: 13, marginTop: 2, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 28, fontSize: 14 },
});

