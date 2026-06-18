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
import { runAfterInteractions } from './runAfterInteractions';
import Ionicons from '@expo/vector-icons/Ionicons';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { getHomeRegionsForCountry } from './homeExploreData';
import { buildLandmarkResultParamsFromHomeLandmark } from './homeLandmarkResultParams';
import { getSavedHomeCityRegionId } from './homeCityStorage';
import { landmarkTitle, regionTitle } from './routeRegionsData';
import { landmarkMatchesHomeCategory } from './homeLandmarkCategories';
import { mt, mtHomePlaceLine } from './mainPageI18n';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { haversineKm } from './geoDistance';
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

const CARD_DARK = '#1A1A1A';
const BORDER_DARK = '#2A2A2A';
const BORDER_LIGHT = 'rgba(30,30,30,0.08)';
const MUTED_DARK = '#9A9A9A';
const MUTED_LIGHT = '#5C5C5C';

const HomeLandmarkCard = memo(function HomeLandmarkCard({
  lm,
  region,
  countryId,
  language,
  langUk,
  isLight,
  accent,
  cardBg,
  cardBorder,
  textMain,
  textMuted,
  regionLabel,
  dist,
  isSaved,
  onOpen,
  onToggleSave,
}) {
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const flagImgSrc = useMemo(() => countryFlagSource(countryId), [countryId]);
  const line = mtHomePlaceLine(language, regionLabel, dist);
  const desc = langUk ? lm.descUk || '' : lm.descEn || lm.descUk || '';
  const thumbSource =
    lm.thumb && typeof lm.thumb === 'object' && typeof lm.thumb.uri === 'string'
      ? { uri: resolveOfflineUriSync(lm.thumb.uri) }
      : lm.thumb;

  return (
    <View style={[styles.locCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      <Pressable
        style={({ pressed }) => [styles.locThumbWrap, pressed && styles.pressedThumb]}
        onPress={onOpen}
        android_ripple={ripple}
        accessibilityRole="button"
        accessibilityLabel={landmarkTitle(lm, langUk)}
      >
        <Image source={thumbSource} style={styles.locThumbImg} resizeMode="cover" />
      </Pressable>
      <View style={styles.locBody}>
        <View style={styles.locBodyTop}>
          <View style={styles.locTopRow}>
            <View style={styles.locTopRowLeft}>
              {flagImgSrc ? (
                <Image source={flagImgSrc} style={styles.locFlagImg} />
              ) : (
                <Text style={styles.locFlagFallback}>{region.flag}</Text>
              )}
              <Text style={[styles.locMeta, { color: textMain }]} numberOfLines={1}>
                {line}
              </Text>
            </View>
            <Pressable
              style={[
                styles.saveCircle,
                {
                  borderColor: isLight ? 'rgba(2, 18, 235, 0.45)' : 'rgba(225,255,0,0.45)',
                  backgroundColor: isSaved
                    ? isLight
                      ? 'rgba(2, 18, 235, 0.12)'
                      : 'rgba(225, 255, 0, 0.14)'
                    : 'transparent',
                },
              ]}
              onPress={onToggleSave}
              android_ripple={ripple}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ selected: isSaved }}
              accessibilityLabel={
                isSaved ? mt(language, 'homeRemoveSavedLandmarkA11y') : mt(language, 'homeSaveLandmarkA11y')
              }
            >
              <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={15} color={accent} />
            </Pressable>
          </View>
          <Text style={[styles.locTitle, { color: textMain }]} numberOfLines={2} ellipsizeMode="tail">
            {landmarkTitle(lm, langUk)}
          </Text>
          <Text style={[styles.locDesc, { color: textMuted }]} numberOfLines={2} ellipsizeMode="tail">
            {desc}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.detailsBtn,
            { backgroundColor: accent, opacity: pressed ? 0.88 : 1 },
          ]}
          onPress={onOpen}
          android_ripple={rippleOnDarkSurface}
          hitSlop={6}
        >
          <Text style={[styles.detailsBtnText, { color: onAccentButtonText(isLight) }]}>
            {mt(language, 'homeDetails')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

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
  const regions = useMemo(() => getHomeRegionsForCountry(countryId), [countryId, homeLocationsEpoch]);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!countryId || !regions.length) {
        if (!cancelled) setSelectedRegionId(null);
        return;
      }
      const saved = await getSavedHomeCityRegionId(user, countryId);
      const ok = saved && regions.some((r) => r.id === saved);
      const next = ok ? saved : regions[0].id;
      if (!cancelled) setSelectedRegionId(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [countryId, user?.id, user?.firebaseUid, user?.email, regionKey, regions, user]);

  const activeRegion = useMemo(() => {
    if (!regions.length) return null;
    return regions.find((r) => r.id === selectedRegionId) || regions[0];
  }, [regions, selectedRegionId]);

  const filteredLandmarks = useMemo(() => {
    if (!activeRegion) return [];
    return (activeRegion.landmarks || []).filter((lm) => landmarkMatchesHomeCategory(lm.id, categoryId));
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
      </View>

      {filteredLandmarks.length === 0 ? (
        <Text style={[styles.emptyCat, { color: textMuted }]}>{mt(language, 'homeNoCategoryResults')}</Text>
      ) : (
        filteredLandmarks.map((lm) => {
          const live =
            userCoords != null &&
            lm.lat != null &&
            lm.lng != null &&
            Number.isFinite(Number(lm.lat)) &&
            Number.isFinite(Number(lm.lng))
              ? haversineKm(userCoords.lat, userCoords.lng, Number(lm.lat), Number(lm.lng))
              : null;
          const dist =
            live != null && Number.isFinite(live)
              ? Math.round(live * 10) / 10
              : typeof lm.distKm === 'number' && Number.isFinite(lm.distKm)
                ? lm.distKm
                : 0.5;
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
  wrap: { marginBottom: 22, marginTop: 4 },
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
  locCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    minHeight: 110,
    overflow: 'hidden',
  },
  pressedThumb: { opacity: 0.88 },
  /** Фіксована ширина + stretch по висоті рядка — cover без сплющування (як у збережених місцях). */
  locThumbWrap: {
    width: 86,
    flexShrink: 0,
    alignSelf: 'stretch',
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  locThumbImg: {
    width: '100%',
    height: '100%',
  },
  locBody: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    justifyContent: 'space-between',
  },
  locBodyTop: { flexShrink: 1 },
  locTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  locTopRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flex: 1,
    marginRight: 6,
    minWidth: 0,
  },
  locFlagImg: { width: 16, height: 12, borderRadius: 2 },
  locFlagFallback: { fontSize: 11, lineHeight: 14 },
  locMeta: { fontSize: 11, flex: 1, marginRight: 0 },
  saveCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locTitle: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  locDesc: { fontSize: 12, lineHeight: 16, marginTop: 4 },
  detailsBtn: {
    alignSelf: 'flex-end',
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  detailsBtnText: { fontWeight: '700', fontSize: 12 },
  moreRoutes: { paddingVertical: 10, alignItems: 'center' },
  moreRoutesPressed: { opacity: 0.72 },
  moreRoutesText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
});
