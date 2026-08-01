import React, { memo, useMemo, useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
  DeviceEventEmitter,
  Animated,
  Easing,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import HomeSearchBar from './HomeSearchBar';
import { getAppTheme, THEME_CHANGED_EVENT } from './themeStorage';
import { noAndroidRipple } from './androidFeedback';
import { countriesForSelectCountryScreen } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';
import {
  brandFontSans,
  brandFontText,
  brandFontTextMedium,
  brandFontHeadBold,
} from './brandFont';
import FittingText from './FittingText';

import { getSavedCountryIdForUser, saveCountryForUser } from './countryStorage';
import { saveHomeCityRegionId } from './homeCityStorage';
import {
  ROUTE_REGIONS,
  regionTitle,
  collectAllCountriesWithRegions,
} from './routeRegionsData';
import { RenderProfiler } from './performanceMetrics';
import { mt, mtHomeLocationsCount } from './mainPageI18n';
import { accentForTheme } from './themeAccent';
import OfflineStatusBanner from './OfflineStatusBanner';
import {
  countRegionLandmarks,
  resolveRegionHeroSource,
  getHomeCountryHeroAsset,
  HOME_COUNTRY_ORDER,
  HOME_REGION_IDS_BY_COUNTRY_ID,
} from './homeExploreData';
import { useHomeLocationsEpoch } from './useHomeLocationsEpoch';
import { countryFlagSource } from './WavingCountryFlag';
import HomeScrollSafeMedia, { homeScrollSafeImageStyle } from './HomeScrollSafeMedia';

/** Ті самі card-hero, що на головній (карусель «Обери країну»). */
function resolveCountryListHero(countryId) {
  const src = getHomeCountryHeroAsset(countryId);
  return { primary: src, fallback: src };
}

function keyExtractorPlain(c) {
  return String(c.countryId);
}

const CARD_H = 176;
const CARD_GAP = 14;
const REGIONS_NEST_TOP = 10;
const HOME_SCROLL_PAD_H = 20;
const HOME_GAP_AFTER_TOPBAR = 14;
const HOME_GAP_AFTER_SEARCH = 14;

function CrispCountryFlag({ countryId, emoji }) {
  const src = countryFlagSource(countryId);
  if (src != null) {
    return (
      <ExpoImage
        source={src}
        style={s.flagImg}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={`flag:${countryId}`}
        transition={0}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <Text style={s.flagEmoji} allowFontScaling={false}>
      {emoji || '🏳️'}
    </Text>
  );
}

function citiesWord(langUk, n) {
  if (!langUk) return n === 1 ? 'city' : 'cities';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'місто';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'міста';
  return 'міст';
}

export default function AllCountriesLocationsPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const user = route?.params?.user || {};
  const language = useSyncedAppLanguage(route, 'en');
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme === 'dark' ? 'dark' : 'light');
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceTimerRef = useRef(null);
  const [expandedCountry, setExpandedCountry] = useState(null);
  const [selectedCountryId, setSelectedCountryId] = useState(
    () => String(route?.params?.countryId || '').trim().toUpperCase() || null,
  );
  const homeLocationsEpoch = useHomeLocationsEpoch();
  const listRef = useRef(null);

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => setDebouncedQuery(query), 150);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [query]);

  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#5C5C5C' : '#9A9A9A';
  const pageBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const nestBg = isLight ? '#F2F2F2' : '#1A1A1A';
  const nestBorder = isLight ? 'rgba(30,30,30,0.08)' : '#2A2A2A';

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setAppTheme(v === 'dark' ? 'dark' : 'light');
    });
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const t = await getAppTheme();
        if (!cancelled) setAppTheme(t === 'dark' ? 'dark' : 'light');
        const saved = await getSavedCountryIdForUser(user);
        if (!cancelled) {
          const fromRoute = String(route?.params?.countryId || '').trim().toUpperCase();
          const next = fromRoute || String(saved || '').trim().toUpperCase() || null;
          setSelectedCountryId(next);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [user, route?.params?.countryId]),
  );

  const countries = useMemo(() => {
    const countryList = countriesForSelectCountryScreen(language);
    const byId = Object.fromEntries(countryList.map((c) => [c.id, c]));
    // Live catalog: built-in Europe + CMS/AI overlays (not a frozen module snapshot).
    const liveGroups = collectAllCountriesWithRegions();
    const byGroupId = Object.fromEntries(liveGroups.map((g) => [g.countryId, g]));
    const orderIds = [];
    const seen = new Set();
    const pushId = (id) => {
      const cid = String(id || '').trim().toUpperCase();
      if (!cid || seen.has(cid)) return;
      seen.add(cid);
      orderIds.push(cid);
    };
    (Array.isArray(HOME_COUNTRY_ORDER) ? HOME_COUNTRY_ORDER : []).forEach(pushId);
    liveGroups.forEach((g) => pushId(g.countryId));

    return orderIds
      .map((countryId) => {
        const g = byGroupId[countryId];
        const regionIds =
          (g && g.regionIds) ||
          HOME_REGION_IDS_BY_COUNTRY_ID[countryId] ||
          [];
        const regions = regionIds.map((id) => ROUTE_REGIONS[id]).filter(Boolean);
        if (!regions.length && !g) return null;
        const totalLandmarks = regions.reduce((n, r) => n + countRegionLandmarks(r), 0);
        const heroPair = resolveCountryListHero(countryId);
        const first = regions[0];
        return {
          countryId,
          title: byId[countryId]?.label || (langUk ? g?.countryUk || first?.countryUk : g?.countryEn || first?.countryEn) || countryId,
          flag: g?.flag || first?.flag || '🏳️',
          regions,
          totalLandmarks,
          hero: heroPair.primary,
          heroFallback: heroPair.fallback,
        };
      })
      .filter(Boolean);
  }, [language, langUk, homeLocationsEpoch]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
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
  }, [countries, debouncedQuery]);

  useEffect(() => {
    if (debouncedQuery.trim() && filtered.length && !expandedCountry) {
      setExpandedCountry(filtered[0].countryId);
    }
  }, [debouncedQuery, filtered, expandedCountry]);

  const onPickCountry = useCallback(
    async (countryId) => {
      if (!countryId) return;
      setSelectedCountryId(String(countryId).toUpperCase());
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

  const onToggleExpand = useCallback((countryId) => {
    setExpandedCountry((prev) => (prev === countryId ? null : countryId));
  }, []);

  const renderCountryCard = useCallback(
    ({ item: c, index: idx }) => (
      <CountryHeroCard
        country={c}
        langUk={langUk}
        language={language}
        selected={selectedCountryId === c.countryId}
        expanded={expandedCountry === c.countryId}
        onToggle={() => onToggleExpand(c.countryId)}
        onPickCountry={onPickCountry}
        onPickRegion={onPickRegion}
        accent={accent}
        isLight={isLight}
        nestBg={nestBg}
        nestBorder={nestBorder}
        textMain={textMain}
        textMuted={textMuted}
        isLast={idx === filtered.length - 1}
      />
    ),
    [
      langUk,
      language,
      selectedCountryId,
      expandedCountry,
      onToggleExpand,
      onPickCountry,
      onPickRegion,
      accent,
      isLight,
      nestBg,
      nestBorder,
      textMain,
      textMuted,
      filtered.length,
    ],
  );

  const listIntro = debouncedQuery.trim()
    ? langUk
      ? 'За твоїм запитом'
      : 'Matching your search'
    : langUk
      ? 'Обери країну'
      : 'Pick a country';

  return (
    <View style={[s.safe, { backgroundColor: pageBg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        hideSendButton
        replaceCenterTitle={mt(language, 'homeAllCountriesScreenTitle')}
      />
      <RenderProfiler id="AllCountriesLocationsPage">
        <FlatList
          ref={listRef}
          data={filtered}
          keyExtractor={keyExtractorPlain}
          extraData={`${selectedCountryId}:${expandedCountry}`}
          renderItem={renderCountryCard}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: HOME_SCROLL_PAD_H,
            paddingTop: HOME_GAP_AFTER_TOPBAR,
            paddingBottom: Math.max(28, insets.bottom + 28),
          }}
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
                  <Pressable
                    onPress={() => setQuery('')}
                    style={s.clearQuery}
                    hitSlop={12}
                    android_ripple={noAndroidRipple}
                  >
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
              <View style={[s.emptyIconWell, { backgroundColor: nestBg }]}>
                <Ionicons name="earth-outline" size={32} color={textMuted} />
              </View>
              <Text style={[s.emptyTxt, brandFontText, { color: textMuted }]}>
                {langUk ? 'Нічого не знайдено' : 'Nothing found'}
              </Text>
            </View>
          }
        />
      </RenderProfiler>
      <OfflineStatusBanner isLight={isLight} top={insets.top + 66} />
    </View>
  );
}

const CountryHeroCard = memo(function CountryHeroCard({
  country,
  langUk,
  language,
  selected,
  expanded,
  onToggle,
  onPickCountry,
  onPickRegion,
  accent,
  isLight,
  nestBg,
  nestBorder,
  textMain,
  textMuted,
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

  const citiesLine = `${country.regions.length} ${citiesWord(langUk, country.regions.length)}`;
  const locsLine = mtHomeLocationsCount(language, country.totalLandmarks);
  const heroSrc = country.hero || country.heroFallback;
  const heroKey = `all-countries:${country.countryId}`;

  return (
    <View style={{ marginBottom: isLast && !expanded ? 0 : CARD_GAP }}>
      <View
        style={[
          s.heroOuter,
          { height: CARD_H },
          selected && { borderColor: accent, borderWidth: 2 },
        ]}
        collapsable={false}
      >
        <HomeScrollSafeMedia style={s.heroMediaBg}>
          {heroSrc ? (
            <ExpoImage
              key={heroKey}
              source={heroSrc}
              style={homeScrollSafeImageStyle}
              contentFit="cover"
              contentPosition="center"
              cachePolicy="memory-disk"
              recyclingKey={heroKey}
              transition={0}
              allowDownscaling
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={[homeScrollSafeImageStyle, { backgroundColor: '#2A2A2A' }]} />
          )}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.90)']}
            locations={[0, 0.45, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </HomeScrollSafeMedia>
        <Pressable
          onPress={() => onPickCountry?.(country.countryId)}
          style={StyleSheet.absoluteFill}
          android_ripple={noAndroidRipple}
          accessibilityRole="button"
          accessibilityLabel={country.title}
          accessibilityState={{ selected: !!selected }}
        >
          <View style={s.heroContent} pointerEvents="box-none">
            <View style={s.flagChip}>
              <CrispCountryFlag countryId={country.countryId} emoji={country.flag} />
            </View>
            <View style={s.heroTextBlock}>
              <FittingText style={[s.heroTitle, brandFontHeadBold]} minimumFontScale={0.55}>
                {country.title}
              </FittingText>
              <Text style={[s.heroMeta, brandFontSans]} numberOfLines={1}>
                {citiesLine}
                {'  ·  '}
                {locsLine}
              </Text>
            </View>
          </View>
        </Pressable>

        <Pressable
          onPress={onToggle}
          hitSlop={10}
          style={[
            s.expandBtn,
            {
              backgroundColor: selected
                ? accent
                : isLight
                  ? 'rgba(255,255,255,0.92)'
                  : 'rgba(18,18,18,0.72)',
            },
          ]}
          android_ripple={noAndroidRipple}
          accessibilityRole="button"
          accessibilityLabel={langUk ? 'Показати міста' : 'Show cities'}
        >
          {selected ? (
            <Ionicons name="checkmark" size={18} color="#FFFFFF" />
          ) : (
            <Animated.View style={{ transform: [{ rotate: rotateDeg }] }}>
              <Ionicons name="chevron-forward" size={18} color={accent} />
            </Animated.View>
          )}
        </Pressable>
      </View>

      {expanded ? (
        <View style={s.regionsNested}>
          {country.regions.map((region, idx) => {
            const name = regionTitle(region, langUk);
            const n = countRegionLandmarks(region);
            const thumb = resolveRegionHeroSource(region);
            const thumbKey = `region-thumb:${region.id}`;
            return (
              <Pressable
                key={region.id}
                onPress={() => onPickRegion(country.countryId, region.id)}
                style={({ pressed }) => [
                  s.regionRow,
                  {
                    backgroundColor: nestBg,
                    borderColor: nestBorder,
                    marginBottom: idx === country.regions.length - 1 ? 0 : 8,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                android_ripple={noAndroidRipple}
              >
                <View style={s.regionThumbWrap} collapsable={false}>
                  {thumb ? (
                    <ExpoImage
                      key={thumbKey}
                      source={thumb}
                      style={s.regionThumb}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      recyclingKey={thumbKey}
                      transition={0}
                      allowDownscaling
                    />
                  ) : (
                    <View style={[s.regionThumb, { backgroundColor: isLight ? '#E4E4E4' : '#2A2A2A' }]}>
                      <Ionicons name="location" size={16} color={textMuted} style={{ alignSelf: 'center', marginTop: 14 }} />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <FittingText style={[s.regionName, brandFontTextMedium, { color: textMain }]} minimumFontScale={0.55}>
                    {name}
                  </FittingText>
                  <Text style={[s.regionMeta, brandFontSans, { color: textMuted }]} numberOfLines={1}>
                    {mtHomeLocationsCount(language, n)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={accent} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
});

const s = StyleSheet.create({
  safe: { flex: 1 },
  searchWrap: { marginBottom: 0 },
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
  sectionTitle: {
    fontSize: 16,
    marginBottom: 12,
    letterSpacing: -0.4,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },

  heroOuter: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#121212',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  heroMediaBg: {
    backgroundColor: '#121212',
  },
  heroContent: {
    position: 'absolute',
    left: 14,
    right: 56,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  flagChip: {
    width: 36,
    height: 36,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  flagImg: { width: 36, height: 36 },
  flagEmoji: {
    fontSize: 22,
    lineHeight: 36,
    textAlign: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  heroTextBlock: { flex: 1, minWidth: 0, paddingBottom: 1 },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    letterSpacing: -0.55,
    width: '100%',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroMeta: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12.5,
    marginTop: 3,
    letterSpacing: 0.1,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  expandBtn: {
    position: 'absolute',
    right: 12,
    bottom: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },

  regionsNested: {
    marginTop: REGIONS_NEST_TOP,
    paddingLeft: 2,
  },
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  regionThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 11,
    overflow: 'hidden',
  },
  regionThumb: {
    width: 44,
    height: 44,
  },
  regionName: {
    fontSize: 15,
    letterSpacing: -0.2,
    width: '100%',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  regionMeta: {
    fontSize: 12,
    marginTop: 2,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },

  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: 14,
  },
  emptyIconWell: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTxt: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
});
