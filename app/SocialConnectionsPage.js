import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { FlashList } from '@shopify/flash-list';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  RefreshControl,
  DeviceEventEmitter,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { getAppTheme, resolveAppTheme } from './themeStorage';
import { useSyncedAppLanguage } from './useAppLanguage';
import { pf } from './profileI18n';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { socialGetConnections, socialFollowUsername, socialUnfollowUsername } from './socialApi';
import { KRAINA_SOCIAL_FOLLOW_CHANGED, KRAINA_SOCIAL_GRAPH_CHANGED, socialFollowMatches, isNavigableSocialUsername, SOCIAL_SYNC_TTL_MS } from './socialFollowSyncEvents';
import { resolveFeedMediaUrl } from './feedMediaUrl';
import ProfileAvatarCircle from './ProfileAvatarCircle';
import { brandFontHeadMedium, brandFontSans, brandFontSansSemibold } from './brandFont';

const EMPTY_META = {
  followers: {
    icon: 'people-outline',
    titleKey: 'connectionsFollowersEmptyTitle',
    subtitleKey: 'connectionsFollowersEmptySubtitle',
    sticker: '✦',
    stickerLabelUk: 'Спільнота',
    stickerLabelEn: 'Community',
  },
  following: {
    icon: 'compass-outline',
    titleKey: 'connectionsFollowingEmptyTitle',
    subtitleKey: 'connectionsFollowingEmptySubtitle',
    sticker: '→',
    stickerLabelUk: 'Цікаве',
    stickerLabelEn: 'Explore',
  },
  friends: {
    icon: 'heart-outline',
    titleKey: 'connectionsFriendsEmptyTitle',
    subtitleKey: 'connectionsFriendsEmptySubtitle',
    sticker: '♡',
    stickerLabelUk: 'Разом',
    stickerLabelEn: 'Together',
  },
};

function ConnectionsEmptyState({ kind, language, isLight, textMain, muted, accent }) {
  const meta = EMPTY_META[kind] || EMPTY_META.followers;
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const stickerLabel = langUk ? meta.stickerLabelUk : meta.stickerLabelEn;

  return (
    <View
      style={[
        styles.emptyWrap,
        isLight ? styles.emptyWrapLight : styles.emptyWrapDark,
      ]}
    >
      <View style={styles.emptyVisualRow}>
        <View style={styles.emptyAvatarStack}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.emptyAvatarGhost,
                {
                  marginLeft: i === 0 ? 0 : -14,
                  zIndex: 3 - i,
                  backgroundColor: isLight ? '#ECECE4' : 'rgba(255,255,255,0.1)',
                  borderColor: isLight ? '#FFFFFF' : 'rgba(0,0,0,0.35)',
                },
              ]}
            >
              <Ionicons
                name="person"
                size={i === 1 ? 18 : 14}
                color={isLight ? 'rgba(30,30,30,0.28)' : 'rgba(255,255,255,0.35)'}
              />
            </View>
          ))}
        </View>
        <View
          style={[
            styles.emptyIconBadge,
            {
              backgroundColor: isLight ? 'rgba(2,18,235,0.1)' : 'rgba(225,255,0,0.14)',
              borderColor: isLight ? 'rgba(2,18,235,0.18)' : 'rgba(225,255,0,0.22)',
            },
          ]}
        >
          <Ionicons name={meta.icon} size={28} color={accent} />
        </View>
      </View>

      <View style={styles.emptyStickerRow}>
        <View
          style={[
            styles.emptySticker,
            {
              borderColor: accent,
              backgroundColor: isLight ? '#FFFEF8' : 'rgba(255,255,255,0.08)',
            },
          ]}
        >
          <Text style={[styles.emptyStickerGlyph, { color: accent }]}>{meta.sticker}</Text>
          <Text
            style={[
              styles.emptyStickerLabel,
              brandFontSansSemibold,
              { color: isLight ? '#1E1E1E' : '#F2F2EA' },
            ]}
          >
            {stickerLabel}
          </Text>
        </View>
      </View>

      <Text style={[styles.emptyTitle, brandFontHeadMedium, { color: textMain }]}>
        {pf(language, meta.titleKey)}
      </Text>
      <Text style={[styles.emptyBody, brandFontSans, { color: muted }]}>
        {pf(language, meta.subtitleKey)}
      </Text>
    </View>
  );
}

export default function SocialConnectionsPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const username = String(route?.params?.username || '').replace(/^@/, '').trim();
  const kind = route?.params?.kind === 'followers' || route?.params?.kind === 'following' ? route.params.kind : 'following';
  const [appTheme, setAppTheme] = useState(resolveAppTheme(route?.params?.appTheme));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followMap, setFollowMap] = useState({});
  const [followBusyMap, setFollowBusyMap] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const connectionsCache = useRef({});
  const CONNECTIONS_CACHE_TTL = SOCIAL_SYNC_TTL_MS;

  const isLight = appTheme === 'light';
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const muted = isLight ? '#5C5C5C' : '#9A9A9A';
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const cardBg = isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)';
  const border = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const cardShadow = isLight
    ? {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      }
    : null;

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

  const visibleRows = useMemo(
    () => rows.filter((row) => isNavigableSocialUsername(row?.username)),
    [rows],
  );

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

    if (!force && cacheFresh) {
      if (__DEV__) console.log(`[Cache] Connections HIT fresh @${username}/${kind} age=${Date.now() - cached.at}ms`);
      setRows(cached.data);
      setLoading(false);
      return;
    }

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

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_SOCIAL_FOLLOW_CHANGED, (payload) => {
      const userId = String(payload?.user_id || '');
      const isFollowing = !!payload?.is_following;
      if (!userId && !payload?.username) return;
      if (userId) {
        setFollowMap((m) => ({ ...m, [userId]: isFollowing }));
      }
      setRows((prev) =>
        prev.map((row) =>
          socialFollowMatches(payload, row.username, row.user_id)
            ? { ...row, is_following: isFollowing }
            : row,
        ),
      );
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_SOCIAL_GRAPH_CHANGED, () => {
      connectionsCache.current = {};
      void reload(true);
    });
    return () => sub.remove();
  }, [reload]);

  const handleFollow = useCallback(async (item) => {
    const userId = String(item.user_id);
    if (followBusyMap[userId]) return;
    const currentFollow = followMap[userId] !== undefined ? followMap[userId] : !!item.is_following;
    setFollowBusyMap((m) => ({ ...m, [userId]: true }));
    setFollowMap((m) => ({ ...m, [userId]: !currentFollow }));
    setRows((prev) =>
      prev.map((r) =>
        String(r.user_id) === userId ? { ...r, is_following: !currentFollow } : r,
      ),
    );
    try {
      if (currentFollow) await socialUnfollowUsername(item.username, { user_id: item.user_id });
      else await socialFollowUsername(item.username, { user_id: item.user_id });
      connectionsCache.current = {};
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
      if (!uname || !isNavigableSocialUsername(uname)) return;
      navigation.push('SocialUserProfile', {
        ...shell,
        username: uname,
        preloadedProfile: row,
      });
    },
    [navigation, shell],
  );

  const listEmpty = useMemo(
    () => (
      <ConnectionsEmptyState
        kind={kind}
        language={language}
        isLight={isLight}
        textMain={textMain}
        muted={muted}
        accent={accent}
      />
    ),
    [kind, language, isLight, textMain, muted, accent],
  );

  const listHeader = useMemo(() => {
    if (visibleRows.length === 0) return null;
    const countLabel =
      kind === 'followers'
        ? pf(language, 'followers')
        : kind === 'following'
          ? pf(language, 'following')
          : pf(language, 'friends');
    return (
      <View style={styles.listHeader}>
        <Text style={[styles.listHeaderCount, brandFontSansSemibold, { color: textMain }]}>
          {visibleRows.length}
        </Text>
        <Text style={[styles.listHeaderLabel, brandFontSans, { color: muted }]}>{countLabel}</Text>
      </View>
    );
  }, [visibleRows.length, kind, language, textMain, muted]);

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        replaceCenterTitle={title}
        hideSendButton
      />
      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={accent} />
        </View>
      ) : (
        <FlashList
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void reload(true)} tintColor={accent} />
          }
          data={visibleRows}
          keyExtractor={(item) => String(item.user_id)}
          estimatedItemSize={82}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: lightTabBarScrollContentPadding(insets.bottom, 20),
            ...(visibleRows.length === 0 ? { flexGrow: 1 } : {}),
          }}
          renderItem={({ item }) => {
            const userId = String(item.user_id);
            const isFollowed = followMap[userId] !== undefined ? followMap[userId] : !!item.is_following;
            const isFollowBusy = !!followBusyMap[userId];
            return (
              <View style={[styles.row, { backgroundColor: cardBg, borderColor: border }, isLight && cardShadow]}>
                <Pressable
                  onPress={() => openUser(item)}
                  style={styles.rowMain}
                  android_ripple={ripple}
                >
                  <ProfileAvatarCircle
                    uri={resolveFeedMediaUrl(item.avatar_url || '')}
                    size={50}
                    isLight={isLight}
                  />
                  <View style={styles.rowText}>
                    <Text style={[styles.name, brandFontSansSemibold, { color: textMain }]} numberOfLines={1}>
                      {item.display_name || `@${item.username}`}
                    </Text>
                    <Text style={[styles.username, brandFontSans, { color: muted }]} numberOfLines={1}>
                      @{item.username}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={isLight ? 'rgba(30,30,30,0.22)' : 'rgba(255,255,255,0.28)'} />
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
                      brandFontSansSemibold,
                      { color: isFollowed ? accent : onAccentButtonText(isLight) },
                    ]}
                  >
                    {isFollowed ? pf(language, 'following') : pf(language, 'follow')}
                  </Text>
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={listEmpty}
          {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  listHeaderCount: { fontSize: 22, lineHeight: 28 },
  listHeaderLabel: { fontSize: 15, lineHeight: 22 },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  rowText: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, lineHeight: 21 },
  username: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  followBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  followBtnText: {
    fontSize: 13,
    letterSpacing: 0.2,
  },
  emptyWrap: {
    flex: 1,
    marginTop: 8,
    borderRadius: 28,
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  emptyWrapLight: {
    backgroundColor: 'rgba(2, 18, 235, 0.06)',
    borderColor: 'rgba(2, 18, 235, 0.14)',
  },
  emptyWrapDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  emptyVisualRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  emptyAvatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyAvatarGhost: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStickerRow: {
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  emptySticker: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 2,
    transform: [{ rotate: '-3deg' }],
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyStickerGlyph: { fontSize: 18, marginRight: 8 },
  emptyStickerLabel: { fontSize: 13, letterSpacing: 0.4 },
  emptyTitle: {
    fontSize: 20,
    lineHeight: 26,
    marginBottom: 10,
    textAlign: 'left',
    alignSelf: 'stretch',
  },
  emptyBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'left',
    alignSelf: 'stretch',
  },
});
