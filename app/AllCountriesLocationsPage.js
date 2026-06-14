import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  DeviceEventEmitter,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import HomeSearchBar from './HomeSearchBar';
import { getAppTheme, THEME_CHANGED_EVENT } from './themeStorage';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { countriesForSelectCountryScreen } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';
import {
  brandFontSans,
  brandFontSansMedium,
  brandFontText,
  brandFontTextMedium,
  brandFontHeadBold,
} from './brandFont';

import { saveCountryForUser } from './countryStorage';
import { saveHomeCityRegionId } from './homeCityStorage';
import {
  ROUTE_REGIONS,
  regionTitle,
  collectAllCountriesWithRegions,
} from './routeRegionsData';
import { mt, mtHomeLocationsCount } from './mainPageI18n';
import { accentForTheme } from './themeAccent';
import OfflineStatusBanner from './OfflineStatusBanner';

/** Як у HomeExploreSection / MainPage. */
const CARD_DARK = '#1A1A1A';
const BORDER_DARK = '#2A2A2A';
const BORDER_LIGHT = 'rgba(30,30,30,0.08)';
const MUTED_DARK = '#9A9A9A';
const MUTED_LIGHT = '#5C5C5C';

const HOME_SCROLL_PAD_H = 24;
const HOME_GAP_AFTER_TOPBAR = 16;
/** Як на головній під пошуком. */
const HOME_GAP_AFTER_SEARCH = 12;

const LOCAL_FLAGS_PNG = {
  ua: require('./assets/flags/ua.png'),
  fr: require('./assets/flags/fr.png'),
  it: require('./assets/flags/it.png'),
  es: require('./assets/flags/es.png'),
  de: require('./assets/flags/de.png'),
  pl: require('./assets/flags/pl.png'),
  nl: require('./assets/flags/nl.png'),
  ro: require('./assets/flags/ro.png'),
  lt: require('./assets/flags/lt.png'),
  lv: require('./assets/flags/lv.png'),
  am: require('./assets/flags/am.png'),
};

function localFlagSource(countryId) {
  const code = String(countryId || '').trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return null;
  return LOCAL_FLAGS_PNG[code] ?? null;
}

function CrispCountryFlag({ countryId, emoji, variant = 'row' }) {
  const src = localFlagSource(countryId);
  const isHome = variant === 'home';
  const isAvatar = variant === 'avatar';
  if (src != null) {
    return (
      <Image
        source={src}
        style={isHome ? s.homeFlagImg : isAvatar ? s.flagAvatarImg : s.flagRasterList}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <Text style={isHome ? s.flagEmojiHome : isAvatar ? s.flagEmojiAvatar : s.flagEmojiList} allowFontScaling={false}>
      {emoji || '🏳️'}
    </Text>
  );
}

export default function AllCountriesLocationsPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const user = route?.params?.user || {};
  const language = useSyncedAppLanguage(route, 'en');
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme === 'light' ? 'light' : 'dark');
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const [query, setQuery] = useState('');
  const [expandedCountry, setExpandedCountry] = useState(null);

  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? MUTED_LIGHT : MUTED_DARK;
  const cardBg = isLight ? '#F2F2F2' : CARD_DARK;
  const cardBorder = isLight ? BORDER_LIGHT : BORDER_DARK;

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setAppTheme(v === 'light' ? 'light' : 'dark');
    });
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const t = await getAppTheme();
        if (!cancelled) setAppTheme(t === 'light' ? 'light' : 'dark');
      })();
      return () => { cancelled = true; };
    }, []),
  );

  const countries = useMemo(() => {
    const countryList = countriesForSelectCountryScreen(language);
    const byId = Object.fromEntries(countryList.map((c) => [c.id, c]));
    const groups = collectAllCountriesWithRegions();
    return groups.map((g) => {
      const regions = g.regionIds.map((id) => ROUTE_REGIONS[id]).filter(Boolean);
      const totalLandmarks = regions.reduce((n, r) => n + (r.landmarks?.length || 0), 0);
      return {
        countryId: g.countryId,
        title: byId[g.countryId]?.label || (langUk ? g.countryUk : g.countryEn),
        flag: g.flag,
        regions,
        totalLandmarks,
      };
    });
  }, [language, langUk]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries
      .map((c) => {
        const countryMatch = c.title.toLowerCase().includes(q);
        const matchedRegions = c.regions.filter((r) => {
          const uk = String(r.titleUk || '').toLowerCase();
          const en = String(r.titleEn || '').toLowerCase();
          return uk.includes(q) || en.includes(q);
        });
        if (countryMatch || matchedRegions.length) {
          return { ...c, regions: countryMatch ? c.regions : matchedRegions };
        }
        return null;
      })
      .filter(Boolean);
  }, [countries, query]);

  useEffect(() => {
    if (query.trim() && filtered.length && !expandedCountry) {
      setExpandedCountry(filtered[0].countryId);
    }
  }, [query, filtered, expandedCountry]);

  /** Тільки країна: головна з цією країною, локації за збереженим/першим містом. */
  const onPickCountry = useCallback(
    async (countryId) => {
      if (!countryId) return;
      await saveCountryForUser(user, countryId);
      navigation.navigate('HomeTabPager', {
        user,
        language,
        countryId,
        appTheme,
        tabIndex: 0,
        routeFinderExtras: {},
      });
    },
    [navigation, user, language, appTheme],
  );

  /** Місто/село/регіон: головна з цією країною і саме цим місцем. */
  const onPickRegion = useCallback(
    async (countryId, regionId) => {
      await saveCountryForUser(user, countryId);
      await saveHomeCityRegionId(user, countryId, regionId);
      navigation.navigate('HomeTabPager', {
        user,
        language,
        countryId,
        appTheme,
        tabIndex: 0,
        routeFinderExtras: {},
      });
    },
    [navigation, user, language, appTheme],
  );

  const listIntro = query.trim()
    ? (langUk ? 'За твоїм запитом' : 'Matching your search')
    : (langUk ? 'Обери країну' : 'Pick a country');

  return (
    <View style={[s.safe, { backgroundColor: isLight ? LIGHT_BAR_BG : APP_SCREEN_BG }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        hideSendButton
        replaceCenterTitle={mt(language, 'homeAllCountriesScreenTitle')}
      />
      <FlatList
        data={filtered}
        keyExtractor={(c) => String(c.countryId)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: HOME_SCROLL_PAD_H,
          paddingTop: HOME_GAP_AFTER_TOPBAR,
          paddingBottom: Math.max(24, insets.bottom + 24),
        }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={9}
        removeClippedSubviews={Platform.OS === 'android'}
        {...(Platform.OS === 'android' ? { overScrollMode: 'never' } : {})}
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
        ListHeaderComponent={
          <>
            <View style={{ marginBottom: HOME_GAP_AFTER_SEARCH }}>
              <HomeSearchBar
                variant={isLight ? 'light' : 'dark'}
                placeholder={langUk ? 'Пошук країни чи міста…' : 'Search country or city…'}
                value={query}
                onChangeText={setQuery}
                editable
                wrapStyle={s.searchWrap}
              />
              {query.length > 0 ? (
                <Pressable onPress={() => setQuery('')} style={s.clearQuery} hitSlop={12} android_ripple={ripple}>
                  <Text style={[s.clearQueryText, brandFontTextMedium, { color: accent }]}>
                    {langUk ? 'Очистити пошук' : 'Clear search'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {filtered.length > 0 ? (
              <Text style={[s.sectionTitle, brandFontHeadBold, { color: textMain }]}>{listIntro}</Text>
            ) : null}
          </>
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="search" size={36} color={textMuted} />
            <Text style={[s.emptyTxt, brandFontText, { color: textMuted }]}>
              {langUk ? 'Нічого не знайдено' : 'Nothing found'}
            </Text>
          </View>
        }
        renderItem={({ item: c, index: idx }) => (
          <CountryCard
            country={c}
            langUk={langUk}
            language={language}
            expanded={expandedCountry === c.countryId}
            onToggle={() => setExpandedCountry((prev) => (prev === c.countryId ? null : c.countryId))}
            onPickCountry={onPickCountry}
            onPickRegion={onPickRegion}
            textMain={textMain}
            textMuted={textMuted}
            cardBg={cardBg}
            cardBorder={cardBorder}
            accent={accent}
            ripple={ripple}
            isLast={idx === filtered.length - 1}
          />
        )}
      />
      <OfflineStatusBanner isLight={isLight} top={insets.top + 66} />
    </View>
  );
}

function CountryCard({
  country,
  langUk,
  language,
  expanded,
  onToggle,
  onPickCountry,
  onPickRegion,
  textMain,
  textMuted,
  cardBg,
  cardBorder,
  accent,
  ripple,
  isLast,
}) {
  const rotate = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(rotate, {
      toValue: expanded ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [expanded, rotate]);
  const rotateDeg = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  return (
    <View style={{ marginBottom: isLast ? 0 : 12 }}>
      <View
        style={[
          s.countryRow,
          {
            backgroundColor: cardBg,
            borderColor: cardBorder,
          },
        ]}
      >
        <Pressable
          onPress={() => onPickCountry?.(country.countryId)}
          style={({ pressed }) => [s.countryRowMain, { opacity: pressed ? 0.92 : 1 }]}
          android_ripple={ripple}
        >
          <View
            style={[
              s.homeFlagWrap,
              { backgroundColor: cardBg === CARD_DARK ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
            ]}
          >
            <CrispCountryFlag countryId={country.countryId} emoji={country.flag} variant="home" />
          </View>
          <View style={s.countryTextCol}>
            <Text style={[s.countryName, brandFontTextMedium, { color: textMain }]} numberOfLines={1}>
              {country.title}
            </Text>
            <Text style={[s.countryHint, brandFontSans, { color: textMuted }]} numberOfLines={1}>
              {country.regions.length}{' '}
              {langUk ? (country.regions.length === 1 ? 'місто' : 'міст') : country.regions.length === 1 ? 'city' : 'cities'}
              {' · '}
              {mtHomeLocationsCount(language, country.totalLandmarks)}
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={onToggle}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [s.countryRowChevron, { opacity: pressed ? 0.85 : 1 }]}
          android_ripple={ripple}
          accessibilityRole="button"
          accessibilityLabel={langUk ? 'Показати міста' : 'Show cities'}
        >
          <Animated.View style={{ transform: [{ rotate: rotateDeg }] }}>
            <Ionicons name="chevron-forward" size={22} color={accent} />
          </Animated.View>
        </Pressable>
      </View>

      {expanded ? (
        <View style={s.regionsNested}>
          {country.regions.map((region, idx) => {
            const name = regionTitle(region, langUk);
            const n = region.landmarks?.length || 0;
            const first = region.landmarks?.[0];
            return (
              <Pressable
                key={region.id}
                onPress={() => onPickRegion(country.countryId, region.id)}
                style={({ pressed }) => [
                  s.regionRow,
                  {
                    backgroundColor: cardBg,
                    borderColor: cardBorder,
                    marginBottom: idx === country.regions.length - 1 ? 0 : 8,
                    opacity: pressed ? 0.92 : 1,
                  },
                ]}
                android_ripple={ripple}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.regionName, brandFontTextMedium, { color: textMain }]} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={[s.regionMeta, brandFontSans, { color: textMuted }]} numberOfLines={1}>
                    {mtHomeLocationsCount(language, n)}
                    {first ? ` · ${langUk ? first.titleUk : first.titleEn}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={accent} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },

  searchWrap: {
    marginBottom: 0,
  },
  clearQuery: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingVertical: 4,
  },
  clearQueryText: {
    fontSize: 13,
    textDecorationLine: 'underline',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },

  listBlock: {
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 17,
    marginBottom: 12,
    letterSpacing: -0.35,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },

  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 6,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  countryRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 4,
    gap: 12,
    minWidth: 0,
  },
  countryRowChevron: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  homeFlagWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  homeFlagImg: {
    width: 48,
    height: 48,
  },
  flagEmojiHome: {
    fontSize: 28,
    lineHeight: 48,
    textAlign: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  countryTextCol: {
    flex: 1,
    minWidth: 0,
  },
  countryName: {
    fontSize: 17,
    letterSpacing: -0.2,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  countryHint: {
    fontSize: 13,
    marginTop: 5,
    letterSpacing: 0.05,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },

  regionsNested: {
    marginTop: 10,
  },
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  regionName: {
    fontSize: 15,
    letterSpacing: -0.1,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  regionMeta: {
    fontSize: 12,
    marginTop: 3,
    letterSpacing: 0.05,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },

  flagAvatarImg: {
    width: 38,
    height: 38,
  },
  flagEmojiAvatar: {
    fontSize: 22,
    lineHeight: 24,
    textAlign: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  flagRasterList: {
    width: 56,
    height: 42,
    borderRadius: 3,
  },
  flagEmojiList: {
    fontSize: Platform.OS === 'ios' ? 40 : 36,
    lineHeight: Platform.OS === 'ios' ? 46 : 42,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },

  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTxt: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
});
