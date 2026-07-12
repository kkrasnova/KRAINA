import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { FlashList } from '@shopify/flash-list';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Platform,
  DeviceEventEmitter,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { getAppTheme, resolveAppTheme } from './themeStorage';
import { useSyncedAppLanguage } from './useAppLanguage';
import { pf } from './profileI18n';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import { brandFontHeadMedium, brandFontSans, brandFontSansSemibold } from './brandFont';
import ProfileAvatarCircle from './ProfileAvatarCircle';
import { resolveFeedMediaUrl } from './feedMediaUrl';
import {
  isDiscoverSearchAvailable,
  socialGetCachedTopProfiles,
  socialInstantSearchProfiles,
  socialSearchProfiles,
  socialListTopProfiles,
  socialWarmDiscoverSearch,
  socialFollowUsername,
  socialUnfollowUsername,
} from './socialApi';
import {
  openSocialUserProfile,
  prefetchSocialUserProfile,
} from './socialProfileNav';
import {
  KRAINA_SOCIAL_FOLLOW_CHANGED,
  KRAINA_SOCIAL_GRAPH_CHANGED,
  socialFollowMatches,
  isNavigableSocialUsername,
} from './socialFollowSyncEvents';

const QUICK_SUGGESTIONS = ['anna', 'travel', 'kyiv', 'mountains', 'coffee'];

function DiscoverSearchBar({
  value,
  onChangeText,
  isLight,
  accent,
  muted,
  textMain,
  border,
  language,
  onFocus,
  onBlur,
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.searchShell,
        {
          backgroundColor: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
          borderColor: focused ? accent : border,
        },
        isLight && styles.searchShadow,
      ]}
    >
      <Ionicons name="search" size={20} color={focused ? accent : muted} style={{ marginRight: 8 }} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        placeholder={pf(language, 'searchPeoplePlaceholder')}
        placeholderTextColor={muted}
        autoCapitalize="words"
        autoCorrect
        returnKeyType="search"
        style={[styles.input, brandFontSans, { color: textMain }]}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function DiscoverPeoplePage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const user = route?.params?.user || {};
  const countryId = route?.params?.countryId;
  const [appTheme, setAppTheme] = useState(resolveAppTheme(route?.params?.appTheme));
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [topProfiles, setTopProfiles] = useState(() => socialGetCachedTopProfiles(24));
  const [followBusyMap, setFollowBusyMap] = useState({});
  const [followMap, setFollowMap] = useState({});
  const [searchBusy, setSearchBusy] = useState(false);
  const debRef = useRef(null);
  const searchSeqRef = useRef(0);
  const discoverSearchOk = useMemo(() => isDiscoverSearchAvailable(), []);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const muted = isLight ? '#6B6B75' : '#9A9A9A';
  const border = isLight ? 'rgba(30,30,30,0.1)' : 'rgba(255,255,255,0.12)';
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const cardBg = isLight ? '#FFFFFF' : '#17171A';
  const cardShadow = isLight
    ? {
        shadowColor: '#111C63',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      }
    : null;

  const shell = useMemo(
    () => ({
      user,
      language,
      ...(countryId != null ? { countryId } : {}),
      appTheme: appTheme === 'light' ? 'light' : 'dark',
    }),
    [user, language, countryId, appTheme],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await getAppTheme();
      if (!cancelled) setAppTheme(t === 'light' ? 'light' : 'dark');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!discoverSearchOk) return;
    socialWarmDiscoverSearch();
    let cancelled = false;
    (async () => {
      try {
        const rows = await socialListTopProfiles(24);
        if (!cancelled) setTopProfiles(Array.isArray(rows) ? rows : []);
      } catch {
        /* keep cached rows */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [discoverSearchOk]);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    const raw = q.trim().replace(/^@/, '');
    if (raw.length < 1) {
      setResults([]);
      setSearchBusy(false);
      return;
    }
    if (!discoverSearchOk) {
      setResults([]);
      setSearchBusy(false);
      return;
    }

    const instant = socialInstantSearchProfiles(raw, 24);
    if (instant.length) setResults(instant);

    const seq = searchSeqRef.current + 1;
    searchSeqRef.current = seq;
    setSearchBusy(true);
    debRef.current = setTimeout(async () => {
      try {
        const rows = await socialSearchProfiles(raw, 24);
        if (searchSeqRef.current !== seq) return;
        setResults(Array.isArray(rows) ? rows : []);
      } catch {
        if (searchSeqRef.current !== seq) return;
        if (!instant.length) setResults([]);
      } finally {
        if (searchSeqRef.current === seq) setSearchBusy(false);
      }
    }, 80);
    return () => {
      if (debRef.current) clearTimeout(debRef.current);
    };
  }, [q, discoverSearchOk]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_SOCIAL_FOLLOW_CHANGED, (payload) => {
      const userId = String(payload?.user_id || '');
      const isFollowing = !!payload?.is_following;
      if (!userId && !payload?.username) return;
      setFollowMap((m) => {
        const next = { ...m };
        if (userId) next[userId] = isFollowing;
        return next;
      });
      const patchRow = (row) => {
        if (!socialFollowMatches(payload, row.username, row.user_id)) return row;
        return { ...row, is_following: isFollowing };
      };
      setResults((prev) => prev.map(patchRow));
      setTopProfiles((prev) => prev.map(patchRow));
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!discoverSearchOk) return undefined;
    const sub = DeviceEventEmitter.addListener(KRAINA_SOCIAL_GRAPH_CHANGED, () => {
      void socialListTopProfiles(24)
        .then((rows) => {
          if (Array.isArray(rows)) setTopProfiles(rows);
        })
        .catch(() => {});
    });
    return () => sub.remove();
  }, [discoverSearchOk]);

  const isSearching = q.trim().length >= 1;
  const displayRows = useMemo(() => {
    const source = isSearching ? results : topProfiles;
    return (Array.isArray(source) ? source : []).filter((row) => isNavigableSocialUsername(row?.username));
  }, [isSearching, results, topProfiles]);

  const openUser = useCallback(
    (username, preloadedProfile = null) => {
      openSocialUserProfile(navigation, shell, { username, row: preloadedProfile });
    },
    [navigation, shell],
  );

  const handleFollow = useCallback(async (item) => {
    const userId = String(item.user_id);
    if (followBusyMap[userId]) return;
    const currentFollow = followMap[userId] !== undefined ? followMap[userId] : !!item.is_following;
    setFollowBusyMap((m) => ({ ...m, [userId]: true }));
    setFollowMap((m) => ({ ...m, [userId]: !currentFollow }));
    try {
      if (currentFollow) await socialUnfollowUsername(item.username, { user_id: item.user_id });
      else await socialFollowUsername(item.username, { user_id: item.user_id });
    } catch {
      setFollowMap((m) => ({ ...m, [userId]: currentFollow }));
    } finally {
      setFollowBusyMap((m) => ({ ...m, [userId]: false }));
    }
  }, [followBusyMap, followMap]);

  const renderItem = useCallback(
    ({ item, index }) => {
      const dn = item.display_name != null ? String(item.display_name).trim() : '';
      const bio = item.bio != null ? String(item.bio).trim() : '';
      const userId = String(item.user_id);
      const isFollowed = followMap[userId] !== undefined ? followMap[userId] : !!item.is_following;
      const isFollowBusy = !!followBusyMap[userId];
      const avatarUri = item.avatar_url ? resolveFeedMediaUrl(String(item.avatar_url)) : '';
      const isLast = index === displayRows.length - 1;

      return (
        <View
          style={[
            { backgroundColor: cardBg },
            index === 0 && styles.cardTop,
            isLast && styles.cardBottom,
            isLight && index === 0 && cardShadow,
          ]}
        >
          <Pressable
            onPressIn={() => prefetchSocialUserProfile(item.username)}
            onPress={() => openUser(item.username, item)}
            style={({ pressed }) => [
              styles.row,
              !isLast && { borderBottomColor: border, borderBottomWidth: StyleSheet.hairlineWidth },
              pressed && { backgroundColor: isLight ? 'rgba(2,18,235,0.03)' : 'rgba(255,255,255,0.04)' },
            ]}
          >
            <ProfileAvatarCircle uri={avatarUri} size={48} isLight={isLight} />
            <View style={styles.rowBody}>
              <Text style={[styles.uname, brandFontSansSemibold, { color: textMain }]} numberOfLines={1}>
                {dn || `@${item.username}`}
              </Text>
              <Text style={[styles.subName, brandFontSans, { color: muted }]} numberOfLines={1}>
                @{item.username}
              </Text>
              {bio ? (
                <Text style={[styles.bio, brandFontSans, { color: muted }]} numberOfLines={1}>
                  {bio}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => void handleFollow(item)}
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
                  {
                    color: isFollowed ? (isLight ? '#0212EB' : '#E1FF00') : onAccentButtonText(isLight),
                  },
                ]}
              >
                {isFollowed ? pf(language, 'following') : pf(language, 'follow')}
              </Text>
            </Pressable>
          </Pressable>
        </View>
      );
    },
    [
      accent,
      border,
      cardBg,
      cardShadow,
      displayRows.length,
      followBusyMap,
      followMap,
      handleFollow,
      isLight,
      language,
      muted,
      openUser,
      ripple,
      textMain,
    ],
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.headerBlock}>
        <View style={[styles.heroCard, { backgroundColor: cardBg }, isLight && cardShadow]}>
          <LinearGradient
            colors={
              isLight
                ? ['rgba(2,18,235,0.1)', 'rgba(2,18,235,0.03)', 'transparent']
                : ['rgba(225,255,0,0.14)', 'rgba(225,255,0,0.04)', 'transparent']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={[styles.heroIcon, { backgroundColor: isLight ? 'rgba(2,18,235,0.08)' : 'rgba(225,255,0,0.14)' }]}>
            <Ionicons name="people" size={22} color={accent} />
          </View>
          <Text style={[styles.heroText, brandFontSans, { color: muted }]}>
            {pf(language, 'discoverHeroHint')}
          </Text>
        </View>

        {!discoverSearchOk ? (
          <View style={[styles.warnBanner, { backgroundColor: isLight ? 'rgba(229,57,53,0.08)' : 'rgba(229,57,53,0.12)' }]}>
            <Ionicons name="cloud-offline-outline" size={18} color="#E53935" style={{ marginRight: 8 }} />
            <Text style={[styles.warnText, brandFontSans, { color: textMain }]}>
              {pf(language, 'discoverSearchUnavailable')}
            </Text>
          </View>
        ) : null}

        <DiscoverSearchBar
          value={q}
          onChangeText={setQ}
          isLight={isLight}
          accent={accent}
          muted={muted}
          textMain={textMain}
          border={border}
          language={language}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestionRow}
          keyboardShouldPersistTaps="handled"
        >
          {QUICK_SUGGESTIONS.map((tag) => (
            <Pressable
              key={tag}
              onPress={() => setQ(tag)}
              style={({ pressed }) => [
                styles.suggestionChip,
                {
                  backgroundColor: isLight ? 'rgba(2,18,235,0.06)' : 'rgba(255,255,255,0.08)',
                  borderColor: isLight ? 'rgba(2,18,235,0.14)' : 'rgba(255,255,255,0.14)',
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              android_ripple={ripple}
            >
              <Text style={[styles.suggestionText, brandFontSansSemibold, { color: isLight ? '#0212EB' : '#E1FF00' }]}>
                @{tag}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.sectionRow}>
          <Text style={[styles.sectionTitle, brandFontHeadMedium, { color: textMain }]}>
            {isSearching ? pf(language, 'discoverResultsTitle') : pf(language, 'discoverTitle')}
          </Text>
          {isSearching ? (
            <Text style={[styles.sectionMeta, brandFontSans, { color: muted }]}>
              {searchBusy && results.length < 1
                ? pf(language, 'discoverSearching')
                : pf(language, 'discoverResultsCount').replace('{n}', String(displayRows.length))}
            </Text>
          ) : null}
        </View>
      </View>
    ),
    [
      accent,
      border,
      cardBg,
      cardShadow,
      discoverSearchOk,
      isLight,
      displayRows.length,
      isSearching,
      language,
      muted,
      q,
      results.length,
      ripple,
      searchBusy,
      textMain,
    ],
  );

  const listEmpty = useMemo(() => {
    if (displayRows.length > 0) return null;
    const searching = isSearching && searchBusy;
    return (
      <View style={[styles.emptyCard, { backgroundColor: cardBg }, isLight && cardShadow]}>
        <Ionicons name={searching ? 'hourglass-outline' : isSearching ? 'search-outline' : 'people-outline'} size={28} color={muted} />
        <Text style={[styles.emptyTitle, brandFontSansSemibold, { color: textMain }]}>
          {searching
            ? pf(language, 'discoverSearching')
            : isSearching
              ? pf(language, 'discoverNoPeopleTitle')
              : pf(language, 'discoverTypeHint')}
        </Text>
        {isSearching && !searching ? (
          <Text style={[styles.emptyHint, brandFontSans, { color: muted }]}>
            {pf(language, 'discoverNoPeopleSubtitle')}
          </Text>
        ) : null}
      </View>
    );
  }, [cardBg, cardShadow, displayRows.length, isLight, isSearching, language, muted, searchBusy, textMain]);

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        replaceCenterTitle={pf(language, 'discoverTitle')}
        hideSendButton
      />
      <FlashList
        data={displayRows}
        keyExtractor={(it) => String(it.user_id)}
        renderItem={renderItem}
        estimatedItemSize={72}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: lightTabBarScrollContentPadding(insets.bottom, 24),
        }}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBlock: { paddingTop: 8, paddingBottom: 4 },
  heroCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1, fontSize: 14, lineHeight: 20 },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  warnText: { flex: 1, fontSize: 13, lineHeight: 18 },
  searchShell: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchShadow: {
    shadowColor: '#0212EB',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  input: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 13 : 11,
    fontSize: 16,
  },
  suggestionRow: { gap: 8, paddingVertical: 12 },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  suggestionText: { fontSize: 12 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 2,
  },
  sectionTitle: { fontSize: 17 },
  sectionMeta: { fontSize: 13 },
  cardTop: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  cardBottom: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  rowBody: { flex: 1, minWidth: 0 },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  followBtnText: { fontSize: 13 },
  uname: { fontSize: 15 },
  subName: { fontSize: 13, marginTop: 1 },
  bio: { fontSize: 12, marginTop: 3 },
  emptyCard: {
    marginTop: 8,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: { fontSize: 15, textAlign: 'center' },
  emptyHint: { fontSize: 13.5, textAlign: 'center', lineHeight: 19, maxWidth: 260 },
});
