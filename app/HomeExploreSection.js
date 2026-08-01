import React, { useMemo, useState, useCallback, useEffect, useRef, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  DeviceEventEmitter,
  FlatList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { runAfterInteractions } from './runAfterInteractions';
import { rippleOnDarkSurface, rippleOnLightSurface, noAndroidRipple } from './androidFeedback';
import { getHomeRegionsForCountry, countRegionLandmarks, resolveRegionHeroSource } from './homeExploreData';
import { buildLandmarkResultParamsFromHomeLandmark } from './homeLandmarkResultParams';
import { prefetchLandmarkResultParams } from './landmarkImagePrefetch';
import { getSavedHomeCityRegionId, saveHomeCityRegionId, KRAINA_HOME_CITY_CHANGED } from './homeCityStorage';
import { mt, mtHomeLocationsCount, mtHomeDistKm } from './mainPageI18n';
import { accentForTheme } from './themeAccent';
import {
  resolveHomeLandmarkDistKm,
  resolveHomeLandmarkThumbSource,
} from './homeLandmarkDisplay';
import {
  HOME_LANDMARK_CARD_MUTED_DARK,
  HOME_LANDMARK_CARD_MUTED_LIGHT,
} from './HomeLandmarkCard';
import HomeCityTile, { HOME_CITY_TILE_W } from './HomeCityTile';
import HomeFeaturedLandmarkCard, { HOME_FEATURED_LANDMARK_H } from './HomeFeaturedLandmarkCard';
import { HOME_TAB_ROUTE, HOME_TAB } from './homeTabPagerConstants';
import { shellNavigate } from './shellNavigate';
import {
  getSavedLandmarks,
  toggleSavedLandmark,
  landmarkSaveKey,
  KRAINA_SAVED_LANDMARKS_CHANGED,
} from './savedLandmarksStorage';
import {
  brandFontSans,
  brandFontHeadBold,
  brandFontTextMedium,
} from './brandFont';
import {
  resolveCatalogLandmarkTitle,
  resolveCatalogRegionTitle,
} from './catalogDisplayI18n';
import { landmarkMatchesHomeCategory } from './homeLandmarkCategories';

export { HOME_FEATURED_LANDMARK_H };

const CITY_TILE_STRIDE = HOME_CITY_TILE_W + 10;

const MUTED_DARK = HOME_LANDMARK_CARD_MUTED_DARK;
const MUTED_LIGHT = HOME_LANDMARK_CARD_MUTED_LIGHT;

const EMPTY_LANDMARKS = Object.freeze([]);

/**
 * Стан секції «міста + популярні місця» — винесений у хук, щоб MainPage
 * міг віртуалізувати картки через FlashList без вкладеного ScrollView.
 */
export function useHomeExplore({
  user,
  countryId,
  language,
  appTheme,
  categoryId = 'all',
  homeLocationsEpoch = 0,
}) {
  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const [focusEpoch, setFocusEpoch] = useState(0);
  const regions = useMemo(
    () => getHomeRegionsForCountry(countryId),
    [countryId, homeLocationsEpoch, focusEpoch],
  );
  const regionKey = useMemo(() => regions.map((r) => r.id).join(','), [regions]);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [userCoords, setUserCoords] = useState(null);
  const [savedKeySet, setSavedKeySet] = useState(() => new Set());
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;

  const refreshSavedLandmarks = useCallback(async () => {
    const list = await getSavedLandmarks();
    setSavedKeySet(new Set(list.map((row) => row.key)));
  }, []);

  useEffect(() => {
    void refreshSavedLandmarks();
  }, [countryId, refreshSavedLandmarks]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_SAVED_LANDMARKS_CHANGED, () => {
      void refreshSavedLandmarks();
    });
    return () => sub.remove();
  }, [refreshSavedLandmarks]);

  useEffect(() => {
    let cancelled = false;
    let watchSub = null;
    const task = runAfterInteractions(async () => {
      try {
        const Location = require('expo-location');
        let { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          const asked = await Location.requestForegroundPermissionsAsync();
          status = asked.status;
        }
        if (status !== 'granted' || cancelled) return;
        const apply = (pos) => {
          if (cancelled || !pos?.coords) return;
          const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserCoords((prev) => {
            if (
              prev &&
              Math.abs(prev.lat - next.lat) < 0.0003 &&
              Math.abs(prev.lng - next.lng) < 0.0003
            ) {
              return prev;
            }
            return next;
          });
        };
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        apply(pos);
        watchSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 80,
            timeInterval: 30000,
          },
          apply,
        );
      } catch {
        /* ignore */
      }
    });
    return () => {
      cancelled = true;
      task.cancel?.();
      try {
        watchSub?.remove?.();
      } catch {
        /* ignore */
      }
    };
  }, [countryId]);

  const refreshSelectedCity = useCallback(async () => {
    if (!countryId) {
      setSelectedRegionId(null);
      return;
    }
    const currentRegions = getHomeRegionsForCountry(countryId);
    if (!currentRegions.length) {
      setSelectedRegionId(null);
      return;
    }
    const saved = await getSavedHomeCityRegionId(user, countryId);
    const ok = saved && currentRegions.some((r) => r.id === saved);
    setSelectedRegionId(ok ? saved : currentRegions[0].id);
  }, [countryId, user]);

  useFocusEffect(
    useCallback(() => {
      setFocusEpoch((n) => n + 1);
      void refreshSelectedCity();
    }, [refreshSelectedCity]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_HOME_CITY_CHANGED, (payload) => {
      if (payload?.countryId && payload.countryId !== countryId) return;
      void refreshSelectedCity();
      setFocusEpoch((n) => n + 1);
    });
    return () => sub.remove();
  }, [countryId, refreshSelectedCity]);

  useEffect(() => {
    void refreshSelectedCity();
  }, [countryId, user?.id, user?.firebaseUid, user?.email, regionKey, refreshSelectedCity]);

  const activeRegion = useMemo(() => {
    if (!countryId || !selectedRegionId) {
      return regions[0] || null;
    }
    const fresh = getHomeRegionsForCountry(countryId);
    return fresh.find((r) => r.id === selectedRegionId) || fresh[0] || null;
  }, [countryId, selectedRegionId, regions, homeLocationsEpoch, focusEpoch]);

  /** Вибране місто завжди перше в горизонтальному ряду. */
  const orderedRegions = useMemo(() => {
    if (!regions.length) return regions;
    const selectedId = selectedRegionId || regions[0]?.id;
    if (!selectedId) return regions;
    const selected = regions.find((r) => r.id === selectedId);
    if (!selected) return regions;
    return [selected, ...regions.filter((r) => r.id !== selectedId)];
  }, [regions, selectedRegionId]);

  const filteredLandmarks = useMemo(() => {
    if (!activeRegion) return EMPTY_LANDMARKS;
    // Каталожний порядок (distKm) — стабільний. Живі координати лише оновлюють підпис
    // дистанції; пересорт при GPS змушував FlashList «стрибати» вниз.
    return (activeRegion.landmarks || [])
      .filter((lm) => landmarkMatchesHomeCategory(lm.id, categoryId))
      .slice()
      .sort((a, b) => {
        const da =
          typeof a?.distKm === 'number' && Number.isFinite(a.distKm)
            ? a.distKm
            : Number.POSITIVE_INFINITY;
        const db =
          typeof b?.distKm === 'number' && Number.isFinite(b.distKm)
            ? b.distKm
            : Number.POSITIVE_INFINITY;
        if (da !== db) return da - db;
        return String(a?.id || '').localeCompare(String(b?.id || ''));
      });
  }, [activeRegion, categoryId]);

  const listRevision = useMemo(() => {
    const lat =
      userCoords && Number.isFinite(userCoords.lat) ? userCoords.lat.toFixed(3) : '';
    const lng =
      userCoords && Number.isFinite(userCoords.lng) ? userCoords.lng.toFixed(3) : '';
    return `${savedKeySet.size}:${lat}:${lng}:${language}:${activeRegion?.id || ''}`;
  }, [userCoords, savedKeySet, language, activeRegion?.id]);

  const landmarkNavById = useMemo(() => {
    if (!activeRegion || !countryId) return new Map();
    const map = new Map();
    for (const lm of filteredLandmarks) {
      map.set(
        lm.id,
        buildLandmarkResultParamsFromHomeLandmark({
          lm,
          region: activeRegion,
          countryId,
          language,
          appTheme,
          user,
        }),
      );
    }
    return map;
  }, [filteredLandmarks, activeRegion, countryId, language, appTheme, user]);

  const openCityList = useCallback(() => {
    shellNavigate('HomeCityPicker', { countryId }, appTheme);
  }, [countryId, appTheme]);

  const onPickCity = useCallback(
    async (regionId) => {
      if (!countryId || !regionId) return;
      setSelectedRegionId(regionId);
      await saveHomeCityRegionId(user, countryId, regionId);
    },
    [countryId, user],
  );

  const openLandmark = useCallback(
    (lm) => {
      const params = landmarkNavById.get(lm?.id);
      if (!params) return;
      void prefetchLandmarkResultParams(params);
      shellNavigate('LandmarkResult', params, appTheme);
    },
    [landmarkNavById, appTheme],
  );

  const prefetchLandmark = useCallback(
    (lm) => {
      const params = landmarkNavById.get(lm?.id);
      if (params) void prefetchLandmarkResultParams(params);
    },
    [landmarkNavById],
  );

  useEffect(() => {
    if (!filteredLandmarks.length) return undefined;
    const task = runAfterInteractions(() => {
      for (const lm of filteredLandmarks.slice(0, 8)) {
        prefetchLandmark(lm);
      }
    });
    return () => task.cancel?.();
  }, [filteredLandmarks, prefetchLandmark]);

  const openRouteFinder = useCallback(() => {
    shellNavigate(
      HOME_TAB_ROUTE,
      { tabIndex: HOME_TAB.MAP, routeFinderExtras: {} },
      appTheme,
    );
  }, [appTheme]);

  const onToggleSaveLandmark = useCallback(
    (lm, region) => {
      if (!countryId || !lm?.id || !region?.id) return;
      const key = landmarkSaveKey(countryId, region.id, lm.id);
      setSavedKeySet((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      void toggleSavedLandmark({
        countryId,
        regionId: region.id,
        landmarkId: lm.id,
        titleUk: resolveCatalogLandmarkTitle(lm, 'uk', {
          regionId: region.id,
          landmarkId: lm.id,
          region,
        }),
        titleEn: resolveCatalogLandmarkTitle(lm, 'en', {
          regionId: region.id,
          landmarkId: lm.id,
          region,
        }),
        regionTitleUk: resolveCatalogRegionTitle(region, 'uk'),
        regionTitleEn: resolveCatalogRegionTitle(region, 'en'),
        flag: typeof region.flag === 'string' ? region.flag : '',
      });
    },
    [countryId],
  );

  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? MUTED_LIGHT : MUTED_DARK;
  const regionLabel = activeRegion ? resolveCatalogRegionTitle(activeRegion, language) : '';

  const getLandmarkRow = useCallback(
    (lm) => {
      if (!lm || !activeRegion || !countryId) return null;
      const dist = resolveHomeLandmarkDistKm(userCoords, lm, activeRegion);
      const saveKey = landmarkSaveKey(countryId, activeRegion.id, lm.id);
      const catalogCtx = { regionId: activeRegion.id, landmarkId: lm.id, region: activeRegion };
      return {
        title: resolveCatalogLandmarkTitle(lm, language, catalogCtx),
        distLabel: mtHomeDistKm(language, dist),
        thumb: resolveHomeLandmarkThumbSource(lm),
        isSaved: savedKeySet.has(saveKey),
        lm,
        region: activeRegion,
      };
    },
    [activeRegion, countryId, language, savedKeySet, userCoords],
  );

  const getLandmarkRowRef = useRef(getLandmarkRow);
  getLandmarkRowRef.current = getLandmarkRow;
  const openLandmarkRef = useRef(openLandmark);
  openLandmarkRef.current = openLandmark;
  const prefetchLandmarkRef = useRef(prefetchLandmark);
  prefetchLandmarkRef.current = prefetchLandmark;
  const onToggleSaveLandmarkRef = useRef(onToggleSaveLandmark);
  onToggleSaveLandmarkRef.current = onToggleSaveLandmark;

  const stableGetLandmarkRow = useCallback((lm) => getLandmarkRowRef.current(lm), []);
  const stableOpenLandmark = useCallback((lm) => openLandmarkRef.current(lm), []);
  const stablePrefetchLandmark = useCallback((lm) => prefetchLandmarkRef.current(lm), []);
  const stableToggleSave = useCallback(
    (lm, region) => onToggleSaveLandmarkRef.current(lm, region),
    [],
  );

  return useMemo(
    () => ({
      ready: !!(countryId && regions.length && activeRegion),
      isLight,
      accent,
      ripple,
      regions,
      orderedRegions,
      activeRegion,
      filteredLandmarks,
      listRevision,
      textMain,
      textMuted,
      regionLabel,
      language,
      openCityList,
      onPickCity,
      openLandmark: stableOpenLandmark,
      prefetchLandmark: stablePrefetchLandmark,
      openRouteFinder,
      onToggleSaveLandmark: stableToggleSave,
      getLandmarkRow: stableGetLandmarkRow,
    }),
    [
      countryId,
      regions,
      orderedRegions,
      activeRegion,
      isLight,
      accent,
      ripple,
      filteredLandmarks,
      listRevision,
      textMain,
      textMuted,
      regionLabel,
      language,
      openCityList,
      onPickCity,
      stableOpenLandmark,
      stablePrefetchLandmark,
      openRouteFinder,
      stableToggleSave,
      stableGetLandmarkRow,
    ],
  );
}

const cityKeyExtractor = (item) => item.id;

/** Міста + заголовок «популярні» — ListHeaderComponent для FlashList на головній. */
export const HomeExploreListHeader = memo(function HomeExploreListHeader({
  explore,
}) {
  const {
    ready,
    accent,
    orderedRegions,
    activeRegion,
    filteredLandmarks,
    textMain,
    textMuted,
    regionLabel,
    language,
    openCityList,
    onPickCity,
  } = explore;

  const cityListRef = useRef(null);
  const selectedCityId = activeRegion?.id;
  const prevCityIdRef = useRef(null);

  useEffect(() => {
    if (!selectedCityId) return;
    const prev = prevCityIdRef.current;
    prevCityIdRef.current = selectedCityId;
    // Не анімуємо горизонтальний скрол на першому mount — лише при зміні міста.
    if (prev == null || prev === selectedCityId) return;
    requestAnimationFrame(() => {
      try {
        cityListRef.current?.scrollToOffset({ offset: 0, animated: false });
      } catch {
        /* */
      }
    });
  }, [selectedCityId]);

  const renderCity = useCallback(
    ({ item: region }) => {
      const selected = region.id === activeRegion?.id;
      const name = resolveCatalogRegionTitle(region, language);
      const hero = resolveRegionHeroSource(region);
      const locs = countRegionLandmarks(region);
      return (
        <HomeCityTile
          regionId={region.id}
          name={name}
          hero={hero}
          locs={locs}
          selected={selected}
          accent={accent}
          language={language}
          onPress={() => onPickCity(region.id)}
        />
      );
    },
    [activeRegion?.id, accent, language, onPickCity],
  );

  if (!ready) return null;

  return (
    <View style={styles.headerWrap}>
      <View style={styles.sectionPad}>
        <View style={styles.cityHeaderRow}>
          <Text style={[styles.sectionTitle, brandFontHeadBold, { color: textMain, marginBottom: 0 }]}>
            {mt(language, 'homePickCity')}
          </Text>
          <Pressable
            onPress={openCityList}
            hitSlop={8}
            style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
            android_ripple={noAndroidRipple}
            accessibilityRole="button"
            accessibilityLabel={mt(language, 'homePickCityOpenList')}
          >
            <Text style={[styles.allCitiesLink, brandFontSans, { color: accent }]}>
              {mt(language, 'homeAllCities')}
            </Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        ref={cityListRef}
        horizontal
        data={orderedRegions}
        keyExtractor={cityKeyExtractor}
        renderItem={renderCity}
        extraData={selectedCityId}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cityRow}
        style={styles.cityScroll}
        nestedScrollEnabled
        removeClippedSubviews={false}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        getItemLayout={(_, index) => ({
          length: CITY_TILE_STRIDE,
          offset: CITY_TILE_STRIDE * index,
          index,
        })}
        {...(Platform.OS === 'android'
          ? { overScrollMode: 'never' }
          : { directionalLockEnabled: true, bounces: false, alwaysBounceHorizontal: false })}
      />

      <View style={styles.sectionPad}>
        <View style={styles.popularHeader}>
          <View style={styles.popularLine}>
            <Text style={[styles.popularPrefix, brandFontHeadBold, { color: textMain }]}>
              {mt(language, 'homePopularPrefix')}
            </Text>
            <Text style={[styles.popularCity, brandFontHeadBold, { color: accent }]}>{regionLabel}</Text>
          </View>
          <Text style={[styles.popularCount, brandFontSans, { color: textMuted }]}>
            {mtHomeLocationsCount(language, filteredLandmarks.length)}
          </Text>
        </View>
        {filteredLandmarks.length === 0 ? (
          <Text style={[styles.emptyCat, brandFontSans, { color: textMuted }]}>
            {mt(language, 'homeNoCategoryResults')}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

/** Кнопка «більше маршрутів» — ListFooterComponent. */
export const HomeExploreListFooter = memo(function HomeExploreListFooter({ explore }) {
  if (!explore.ready) return null;
  const { isLight, ripple, language, openRouteFinder } = explore;
  const linkColor = accentForTheme(!!isLight);
  return (
    <Pressable
      onPress={openRouteFinder}
      style={({ pressed }) => [styles.moreRoutes, pressed && styles.moreRoutesPressed]}
      android_ripple={ripple}
      hitSlop={8}
    >
      <Text style={[styles.moreRoutesText, brandFontTextMedium, { color: linkColor }]}>
        {mt(language, 'homeMoreRoutes')}
      </Text>
    </Pressable>
  );
});

/** Рядок FlashList для однієї локації. */
export const HomeExploreLandmarkRow = memo(function HomeExploreLandmarkRow({
  explore,
  landmark,
  listRevision,
}) {
  const row = explore.getLandmarkRow(landmark);
  if (!row) return null;
  return (
    <HomeFeaturedLandmarkCard
      landmarkId={landmark?.id || row.lm?.id}
      title={row.title}
      distLabel={row.distLabel}
      thumb={row.thumb}
      isSaved={row.isSaved}
      onPress={() => explore.openLandmark(row.lm)}
      onPressIn={() => explore.prefetchLandmark(row.lm)}
      onToggleSave={() => explore.onToggleSaveLandmark(row.lm, row.region)}
    />
  );
}, (prev, next) => (
  prev.landmark?.id === next.landmark?.id &&
  prev.listRevision === next.listRevision &&
  prev.explore === next.explore
));

/** Fallback: повна секція (якщо хтось імпортує без FlashList). */
function HomeExploreSection(props) {
  const explore = useHomeExplore(props);
  if (!explore.ready) return null;
  return (
    <View style={styles.wrap}>
      <HomeExploreListHeader explore={explore} />
      {explore.filteredLandmarks.map((lm) => (
        <HomeExploreLandmarkRow key={lm.id} explore={explore} landmark={lm} />
      ))}
      <HomeExploreListFooter explore={explore} />
    </View>
  );
}

export default memo(HomeExploreSection);

const styles = StyleSheet.create({
  wrap: { marginBottom: 4, marginTop: 4, paddingBottom: 0 },
  headerWrap: { marginTop: 4 },
  sectionPad: {
    paddingHorizontal: 24,
  },
  emptyCat: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 18,
    paddingHorizontal: 8,
  },
  cityHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    letterSpacing: -0.35,
    flex: 1,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  allCitiesLink: {
    fontSize: 14,
    fontWeight: '700',
  },
  cityScroll: {
    alignSelf: 'stretch',
  },
  cityRow: {
    paddingHorizontal: 24,
    paddingBottom: 2,
  },
  popularHeader: { marginTop: 18, marginBottom: 12 },
  popularLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' },
  popularPrefix: {
    fontSize: 17,
    letterSpacing: -0.3,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  popularCity: {
    fontSize: 17,
    letterSpacing: -0.3,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  popularCount: {
    fontSize: 13,
    marginTop: 4,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  moreRoutes: {
    paddingTop: 4,
    paddingBottom: 8,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  moreRoutesPressed: { opacity: 0.72 },
  moreRoutesText: { fontSize: 14, textDecorationLine: 'underline' },
});
