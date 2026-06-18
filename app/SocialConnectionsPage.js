import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator, Platform, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { getAppTheme } from './themeStorage';
import { useSyncedAppLanguage } from './useAppLanguage';
import { pf } from './profileI18n';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { onAccentButtonText } from './themeAccent';
import { socialGetConnections, socialFollowUsername, socialUnfollowUsername } from './socialApi';

export default function SocialConnectionsPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const username = String(route?.params?.username || '').replace(/^@/, '').trim();
  const kind = route?.params?.kind === 'followers' || route?.params?.kind === 'following' ? route.params.kind : 'friends';
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followMap, setFollowMap] = useState({});
  const [followBusyMap, setFollowBusyMap] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const connectionsCache = useRef({});
  const CONNECTIONS_CACHE_TTL = 120000;

  const isLight = appTheme === 'light';
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const muted = isLight ? '#5C5C5C' : '#9A9A9A';
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const cardBg = isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)';
  const border = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.14)';
  const accent = isLight ? '#0212EB' : '#E1FF00';
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

  const reload = useCallback(async (force = false) => {
    const t = await getAppTheme();
    setAppTheme(t === 'light' ? 'light' : 'dark');
    if (!username) {
      setRows([]);
      setLoading(false);
      return;
    }
    const cacheKey = `${username}__${kind}`;
    const cached = connectionsCache.current[cacheKey];
    const cacheFresh = cached && Date.now() - cached.at < CONNECTIONS_CACHE_TTL;

    // Fresh cache — return early
    if (!force && cacheFresh) {
      if (__DEV__) console.log(`[Cache] Connections HIT fresh @${username}/${kind} age=${Date.now() - cached.at}ms`);
      setRows(cached.data);
      setLoading(false);
      return;
    }

    // Stale cache — show immediately, revalidate in background (no spinner)
    if (!force && cached) {
      if (__DEV__) console.log(`[Cache] Connections STALE hit @${username}/${kind} age=${Date.now() - cached.at}ms — background revalidation`);
      setRows(cached.data);
      setLoading(false);
    } else if (__DEV__ && !cached) {
      console.log(`[Cache] Connections MISS @${username}/${kind}`);
    }
    if (__DEV__ && force && cached) {
      console.log(`[Cache] Connections FORCE refresh @${username}/${kind} age=${Date.now() - cached.at}ms`);
    }

    const needsSpinner = force || !cached;
    if (needsSpinner) {
      if (force) setRefreshing(true);
      else setLoading(true);
    }
    try {
      const data = await socialGetConnections(username, kind, 120);
      connectionsCache.current[cacheKey] = { data, at: Date.now() };
      setRows(data);
    } catch {
      if (!cached) setRows([]);
    } finally {
      if (needsSpinner) {
        if (force) setRefreshing(false);
        else setLoading(false);
      }
    }
  }, [username, kind]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const handleFollow = useCallback(async (item) => {
    const userId = String(item.user_id);
    if (followBusyMap[userId]) return;
    const currentFollow = followMap[userId] !== undefined ? followMap[userId] : !!item.is_following;
    setFollowBusyMap((m) => ({ ...m, [userId]: true }));
    setFollowMap((m) => ({ ...m, [userId]: !currentFollow }));
    // Оптимістично оновлюємо is_following у самому item через setRows
    setRows((prev) =>
      prev.map((r) =>
        String(r.user_id) === userId ? { ...r, is_following: !currentFollow } : r,
      ),
    );
    try {
      if (currentFollow) await socialUnfollowUsername(item.username);
      else await socialFollowUsername(item.username);
      connectionsCache.current = {};
      // Перезавантажуємо дані з сервера в фоновому режимі (без спінера)
      const data = await socialGetConnections(username, kind, 120);
      if (data.length) {
        setRows(data);
        connectionsCache.current[`${username}__${kind}`] = { data, at: Date.now() };
      }
    } catch {
      setFollowMap((m) => ({ ...m, [userId]: currentFollow }));
      setRows((prev) =>
        prev.map((r) =>
          String(r.user_id) === userId ? { ...r, is_following: currentFollow } : r,
        ),
      );
    } finally {
      setFollowBusyMap((m) => ({ ...m, [userId]: false }));
    }
  }, [followBusyMap, followMap, username, kind]);

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
      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={isLight ? '#0212EB' : '#E1FF00'} />
        </View>
      ) : (
        <FlashList
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void reload(true)} tintColor={accent} />
          }
          data={rows}
          keyExtractor={(item) => String(item.user_id)}
          estimatedItemSize={82}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + lightTabBarExtraScrollPadding() + 20 }}
          renderItem={({ item }) => {
            const userId = String(item.user_id);
            const isFollowed = followMap[userId] !== undefined ? followMap[userId] : !!item.is_following;
            const isFollowBusy = !!followBusyMap[userId];
            return (
              <View style={[styles.row, { backgroundColor: cardBg, borderColor: border }]}>
                <Pressable
                  onPress={() => openUser(item)}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}
                  android_ripple={ripple}
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
                <Pressable
                  onPress={() => handleFollow(item)}
                  disabled={isFollowBusy}
                  style={({ pressed }) => [
                    styles.followBtn,
                    {
                      backgroundColor: isFollowed
                        ? (isLight ? 'rgba(2,18,235,0.08)' : 'rgba(255,255,255,0.08)')
                        : accent,
                      borderColor: isFollowed ? (isLight ? 'rgba(2,18,235,0.2)' : 'rgba(255,255,255,0.2)') : accent,
                      opacity: pressed || isFollowBusy ? 0.85 : 1,
                    },
                  ]}
                  android_ripple={ripple}
                >
                  <Text
                    style={[
                      styles.followBtnText,
                      { color: isFollowed ? (isLight ? '#0212EB' : '#E1FF00') : onAccentButtonText(isLight) },
                    ]}
                  >
                    {isFollowed ? pf(language, 'following') : pf(language, 'follow')}
                  </Text>
                </Pressable>
              </View>
            );
          }}
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
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    alignSelf: 'center',
  },
  followBtnText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});

