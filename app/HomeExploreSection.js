import React, { useMemo, useState, useCallback, useEffect, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Platform,
  DeviceEventEmitter,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { runAfterInteractions } from './runAfterInteractions';
import Ionicons from '@expo/vector-icons/Ionicons';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { getHomeRegionsForCountry, countRegionLandmarks } from './homeExploreData';
import { buildLandmarkResultParamsFromHomeLandmark } from './homeLandmarkResultParams';
import { getSavedHomeCityRegionId, KRAINA_HOME_CITY_CHANGED } from './homeCityStorage';
import { landmarkTitle, regionTitle } from './routeRegionsData';
import { landmarkMatchesHomeCategory } from './homeLandmarkCategories';
import { mt, mtHomeLocationsCount } from './mainPageI18n';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import {
  resolveHomeLandmarkDistKm,
} from './homeLandmarkDisplay';
import HomeLandmarkCard, {
  HOME_LANDMARK_CARD_DARK,
  HOME_LANDMARK_CARD_BORDER_DARK,
  HOME_LANDMARK_CARD_BORDER_LIGHT,
  HOME_LANDMARK_CARD_MUTED_DARK,
  HOME_LANDMARK_CARD_MUTED_LIGHT,
} from './HomeLandmarkCard';
import { HOME_TAB_ROUTE, HOME_TAB } from './homeTabPagerConstants';
import { shellNavigate } from './shellNavigate';
import {
  getSavedLandmarks,
  toggleSavedLandmark,
  landmarkSaveKey,
  KRAINA_SAVED_LANDMARKS_CHANGED,
} from './savedLandmarksStorage';
import { countryFlagSource } from './WavingCountryFlag';
import { resolveOfflineUriSync } from './offline/localCacheStore';

const CARD_DARK = HOME_LANDMARK_CARD_DARK;
const BORDER_DARK = HOME_LANDMARK_CARD_BORDER_DARK;
const BORDER_LIGHT = HOME_LANDMARK_CARD_BORDER_LIGHT;
const MUTED_DARK = HOME_LANDMARK_CARD_MUTED_DARK;
const MUTED_LIGHT = HOME_LANDMARK_CARD_MUTED_LIGHT;

function HomeExploreSection({
  user,
  countryId,
  language,
  appTheme,
  categoryId = 'all',
  homeLocationsEpoch = 0,
}) {
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
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
    const task = runAfterInteractions(async () => {
      try {
        const Location = require('expo-location');
        const existing = await Location.getForegroundPermissionsAsync();
        if (existing.status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      } catch {
        /* ignore */
      }
    });
    return () => {
      cancelled = true;
      task.cancel?.();
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

  const filteredLandmarks = useMemo(() => {
    if (!activeRegion) return [];
    return (activeRegion.landmarks || [])
      .filter((lm) => landmarkMatchesHomeCategory(lm.id, categoryId))
      .sort((a, b) => {
        const da = typeof a.distKm === 'number' && Number.isFinite(a.distKm) ? a.distKm : 999;
        const db = typeof b.distKm === 'number' && Number.isFinite(b.distKm) ? b.distKm : 999;
        return da - db;
      });
  }, [activeRegion, categoryId]);

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

  const openLandmark = useCallback(
    (lm) => {
      const params = landmarkNavById.get(lm?.id);
      if (!params) return;
      shellNavigate('LandmarkResult', params, appTheme);
    },
    [landmarkNavById, appTheme],
  );

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
        titleUk: landmarkTitle(lm, true),
        titleEn: landmarkTitle(lm, false),
        regionTitleUk: regionTitle(region, true),
        regionTitleEn: regionTitle(region, false),
        flag: typeof region.flag === 'string' ? region.flag : '',
      });
    },
    [countryId],
  );

  const cityHeroSource = useMemo(() => {
    if (!activeRegion) return null;
    const u = typeof activeRegion.heroUri === 'string' ? activeRegion.heroUri.trim() : '';
    if (u && /^https?:\/\//i.test(u)) return { uri: resolveOfflineUriSync(u) };
    if (activeRegion.heroThumb) return activeRegion.heroThumb;
    return activeRegion.landmarks?.[0]?.thumb ?? null;
  }, [activeRegion]);
  const cityHeroIsKyiv = activeRegion?.id === 'kyiv';
  const flagSource = useMemo(() => (countryId ? countryFlagSource(countryId) : null), [countryId]);

  if (!countryId || !regions.length || !activeRegion) return null;

  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? MUTED_LIGHT : MUTED_DARK;
  const cardBg = isLight ? '#F2F2F2' : CARD_DARK;
  const cardBorder = isLight ? BORDER_LIGHT : BORDER_DARK;
  const regionLabel = regionTitle(activeRegion, langUk);

  const activeLocationCount = countRegionLandmarks(activeRegion);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.sectionTitle, { color: textMain }]}>{mt(language, 'homePickCity')}</Text>
      <Pressable
        onPress={openCityList}
        style={({ pressed }) => [
          styles.cityListBtn,
          { backgroundColor: cardBg, borderColor: cardBorder, opacity: pressed ? 0.72 : 1 },
        ]}
        android_ripple={ripple}
        hitSlop={4}
      >
        {cityHeroSource ? (
          <View style={styles.cityListBtnThumbWrap}>
            <Image
              source={cityHeroSource}
              style={[styles.cityListBtnThumb, cityHeroIsKyiv && styles.cityListBtnThumbKyiv]}
              resizeMode="cover"
            />
          </View>
        ) : flagSource ? (
          <Image source={flagSource} style={styles.cityListBtnFlagImg} resizeMode="contain" />
        ) : (
          <Text style={styles.cityListBtnFlag}>{activeRegion.flag}</Text>
        )}
        <View style={styles.cityListBtnTextCol}>
          <View style={styles.cityListBtnTitleRow}>
            {cityHeroSource ? (
              flagSource ? (
                <Image source={flagSource} style={styles.inlineFlagImg} />
              ) : (
                <Text style={{ fontSize: 14, lineHeight: 16 }}>{activeRegion.flag}</Text>
              )
            ) : null}
            <Text style={[styles.cityListBtnTitle, { color: textMain }]} numberOfLines={1}>
              {regionLabel}
            </Text>
          </View>
          <Text style={[styles.cityListBtnHint, { color: textMuted }]} numberOfLines={1}>
            {mtHomeLocationsCount(language, activeLocationCount)}
            {' · '}
            {mt(language, 'homePickCityOpenList')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={accent} />
      </Pressable>

      <View style={styles.popularHeader}>
        <View style={styles.popularLine}>
          <Text style={[styles.popularPrefix, { color: textMain }]}>{mt(language, 'homePopularPrefix')}</Text>
          <Text style={[styles.popularCity, { color: accent }]}>{regionLabel}</Text>
        </View>
        <Text style={[styles.popularCount, { color: textMuted }]}>
          {mtHomeLocationsCount(language, filteredLandmarks.length)}
        </Text>
      </View>

      {filteredLandmarks.length === 0 ? (
        <Text style={[styles.emptyCat, { color: textMuted }]}>{mt(language, 'homeNoCategoryResults')}</Text>
      ) : (
        filteredLandmarks.map((lm) => {
          const dist = resolveHomeLandmarkDistKm(userCoords, lm, activeRegion);
          const saveKey = landmarkSaveKey(countryId, activeRegion.id, lm.id);
          return (
            <HomeLandmarkCard
              key={lm.id}
              lm={lm}
              region={activeRegion}
              countryId={countryId}
              language={language}
              langUk={langUk}
              isLight={isLight}
              accent={accent}
              cardBg={cardBg}
              cardBorder={cardBorder}
              textMain={textMain}
              textMuted={textMuted}
              regionLabel={regionLabel}
              dist={dist}
              isSaved={savedKeySet.has(saveKey)}
              onOpen={() => openLandmark(lm)}
              onToggleSave={() => onToggleSaveLandmark(lm, activeRegion)}
              homeLocationsEpoch={homeLocationsEpoch}
            />
          );
        })
      )}

      <Pressable
        onPress={openRouteFinder}
        style={({ pressed }) => [styles.moreRoutes, pressed && styles.moreRoutesPressed]}
        android_ripple={ripple}
        hitSlop={8}
      >
        <Text style={[styles.moreRoutesText, { color: accent }]}>{mt(language, 'homeMoreRoutes')}</Text>
      </Pressable>
    </View>
  );
}

export default memo(HomeExploreSection);

const styles = StyleSheet.create({
  wrap: { marginBottom: 28, marginTop: 4, paddingBottom: 4 },
  emptyCat: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 18,
    paddingHorizontal: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  cityListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  cityListBtnFlag: { fontSize: 26 },
  cityListBtnFlagImg: { width: 40, height: 28, borderRadius: 3 },
  cityListBtnTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  inlineFlagImg: { width: 20, height: 14, borderRadius: 2 },
  cityListBtnThumbWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#333',
  },
  cityListBtnThumb: { width: 48, height: 48, backgroundColor: '#333' },
  cityListBtnThumbKyiv: { height: 68, transform: [{ translateY: -14 }] },
  cityListBtnTextCol: { flex: 1, minWidth: 0 },
  cityListBtnTitle: { fontSize: 17, fontWeight: '700' },
  cityListBtnHint: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  popularHeader: { marginTop: 18, marginBottom: 12 },
  popularLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' },
  popularPrefix: { fontSize: 17, fontWeight: '700' },
  popularCity: { fontSize: 17, fontWeight: '700' },
  popularCount: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  moreRoutes: { paddingVertical: 10, alignItems: 'center' },
  moreRoutesPressed: { opacity: 0.72 },
  moreRoutesText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
});
