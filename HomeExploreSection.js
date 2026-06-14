import React, { useMemo, useState, useCallback, useEffect } from 'react';
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
import * as Location from 'expo-location';
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
import {
  getSavedLandmarks,
  toggleSavedLandmark,
  landmarkSaveKey,
  KRAINA_SAVED_LANDMARKS_CHANGED,
} from './savedLandmarksStorage';
import { resolveOfflineUriSync } from './offline/localCacheStore';
const CARD_DARK = '#1A1A1A';
const BORDER_DARK = '#2A2A2A';
const BORDER_LIGHT = 'rgba(30,30,30,0.08)';
const MUTED_DARK = '#9A9A9A';
const MUTED_LIGHT = '#5C5C5C';

export default function HomeExploreSection({
  user,
  countryId,
  language,
  appTheme,
  navigation,
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

  const refreshUserCoords = useCallback(async () => {
    try {
      const existing = await Location.getForegroundPermissionsAsync();
      let granted = existing.status === 'granted';
      if (!granted) {
        const asked = await Location.requestForegroundPermissionsAsync();
        granted = asked.status === 'granted';
      }
      if (!granted) {
        setUserCoords(null);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserCoords({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
    } catch {
      setUserCoords(null);
    }
  }, []);

  useEffect(() => {
    void refreshUserCoords();
  }, [refreshUserCoords]);

  useFocusEffect(
    useCallback(() => {
      void refreshUserCoords();
      void refreshSavedLandmarks();
    }, [refreshUserCoords, refreshSavedLandmarks]),
  );

  useEffect(() => {
    void refreshSavedLandmarks();
  }, [countryId, selectedRegionId, categoryId, refreshSavedLandmarks]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_SAVED_LANDMARKS_CHANGED, () => {
      void refreshSavedLandmarks();
    });
    return () => sub.remove();
  }, [refreshSavedLandmarks]);

  useEffect(() => {
    let cancelled = false;
    const apply = async () => {
      if (!countryId || !regions.length) {
        if (!cancelled) setSelectedRegionId(null);
        return;
      }
      const saved = await getSavedHomeCityRegionId(user, countryId);
      const ok = saved && regions.some((r) => r.id === saved);
      const next = ok ? saved : regions[0].id;
      if (!cancelled) setSelectedRegionId(next);
    };
    apply();
    const unsub = navigation.addListener('focus', () => {
      apply();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [navigation, countryId, user?.id, user?.firebaseUid, user?.email, regionKey, regions]);

  const openCityList = useCallback(() => {
    navigation.navigate('HomeCityPicker', {
      user,
      countryId,
      language,
      appTheme,
    });
  }, [navigation, user, countryId, language, appTheme]);

  const openLandmark = useCallback(
    (lm, region) => {
      navigation.navigate(
        'LandmarkResult',
        buildLandmarkResultParamsFromHomeLandmark({
          lm,
          region,
          countryId,
          language,
          appTheme,
          user,
        }),
      );
    },
    [navigation, language, appTheme, countryId, user],
  );

  const openRouteFinder = useCallback(() => {
    navigation.navigate(HOME_TAB_ROUTE, {
      user,
      language,
      appTheme,
      ...(countryId ? { countryId } : {}),
      tabIndex: HOME_TAB.MAP,
      routeFinderExtras: {},
    });
  }, [navigation, user, language, appTheme, countryId]);

  const onToggleSaveLandmark = useCallback(
    async (lm, region) => {
      if (!countryId || !lm?.id || !region?.id) return;
      const titleUk = landmarkTitle(lm, true);
      const titleEn = landmarkTitle(lm, false);
      await toggleSavedLandmark({
        countryId,
        regionId: region.id,
        landmarkId: lm.id,
        titleUk,
        titleEn,
        regionTitleUk: regionTitle(region, true),
        regionTitleEn: regionTitle(region, false),
        flag: typeof region.flag === 'string' ? region.flag : '',
      });
      await refreshSavedLandmarks();
    },
    [countryId, refreshSavedLandmarks],
  );

  const activeRegion = useMemo(() => {
    if (!regions.length) return null;
    return regions.find((r) => r.id === selectedRegionId) || regions[0];
  }, [regions, selectedRegionId]);

  const cityHeroSource = useMemo(() => {
    if (!activeRegion) return null;
    const u = typeof activeRegion.heroUri === 'string' ? activeRegion.heroUri.trim() : '';
    if (u && /^https?:\/\//i.test(u)) return { uri: resolveOfflineUriSync(u) };
    if (activeRegion.heroThumb) return activeRegion.heroThumb;
    return activeRegion.landmarks?.[0]?.thumb ?? null;
  }, [activeRegion]);
  const cityHeroIsKyiv = activeRegion?.id === 'kyiv';

  const filteredLandmarks = useMemo(() => {
    if (!activeRegion) return [];
    const all = activeRegion.landmarks || [];
    return all.filter((lm) => landmarkMatchesHomeCategory(lm.id, categoryId));
  }, [activeRegion, categoryId]);

  if (!countryId || !regions.length || !activeRegion) return null;

  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? MUTED_LIGHT : MUTED_DARK;
  const cardBg = isLight ? '#F2F2F2' : CARD_DARK;
  const cardBorder = isLight ? BORDER_LIGHT : BORDER_DARK;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.sectionTitle, { color: textMain }]}>{mt(language, 'homePickCity')}</Text>
      <Pressable
        onPress={openCityList}
        style={({ pressed }) => [
          styles.cityListBtn,
          {
            backgroundColor: cardBg,
            borderColor: cardBorder,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
        android_ripple={ripple}
      >
        {cityHeroSource ? (
          <View style={styles.cityListBtnThumbWrap}>
            <Image
              source={cityHeroSource}
              style={[styles.cityListBtnThumb, cityHeroIsKyiv && styles.cityListBtnThumbKyiv]}
              resizeMode="cover"
            />
          </View>
        ) : (
          <Text style={styles.cityListBtnFlag}>{activeRegion.flag}</Text>
        )}
        <View style={styles.cityListBtnTextCol}>
          <Text style={[styles.cityListBtnTitle, { color: textMain }]} numberOfLines={1}>
            {cityHeroSource ? `${activeRegion.flag} ` : ''}
            {regionTitle(activeRegion, langUk)}
          </Text>
          <Text style={[styles.cityListBtnHint, { color: textMuted }]} numberOfLines={1}>
            {mt(language, 'homePickCityOpenList')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={accent} />
      </Pressable>

      <View style={styles.popularHeader}>
        <View style={styles.popularLine}>
          <Text style={[styles.popularPrefix, { color: textMain }]}>{mt(language, 'homePopularPrefix')}</Text>
          <Text style={[styles.popularCity, { color: accent }]}>{regionTitle(activeRegion, langUk)}</Text>
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
          const line = mtHomePlaceLine(language, regionTitle(activeRegion, langUk), dist);
          const desc = langUk ? lm.descUk || '' : lm.descEn || lm.descUk || '';
          const saveKey = landmarkSaveKey(countryId, activeRegion.id, lm.id);
          const isSaved = savedKeySet.has(saveKey);
          return (
            <Pressable
              key={lm.id}
              style={[styles.locCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
              onPress={() => openLandmark(lm, activeRegion)}
              android_ripple={ripple}
              accessibilityRole="button"
              accessibilityLabel={landmarkTitle(lm, langUk)}
            >
              <View style={styles.locThumbCol}>
                <Image
                  source={
                    lm.thumb && typeof lm.thumb === 'object' && typeof lm.thumb.uri === 'string'
                      ? { uri: resolveOfflineUriSync(lm.thumb.uri) }
                      : lm.thumb
                  }
                  style={styles.locThumbImg}
                  resizeMode="cover"
                />
              </View>
              <View style={styles.locBody}>
                <View style={styles.locBodyTop}>
                  <View style={styles.locTopRow}>
                    <Text style={[styles.locMeta, { color: textMain }]} numberOfLines={1}>
                      {activeRegion.flag} {line}
                    </Text>
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
                      onPress={() => onToggleSaveLandmark(lm, activeRegion)}
                      android_ripple={ripple}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSaved }}
                      accessibilityLabel={
                        isSaved ? mt(language, 'homeRemoveSavedLandmarkA11y') : mt(language, 'homeSaveLandmarkA11y')
                      }
                    >
                      <Ionicons
                        name={isSaved ? 'bookmark' : 'bookmark-outline'}
                        size={18}
                        color={accent}
                      />
                    </Pressable>
                  </View>
                  <Text
                    style={[styles.locTitle, { color: textMain }]}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {landmarkTitle(lm, langUk)}
                  </Text>
                  <Text
                    style={[styles.locDesc, { color: textMuted }]}
                    numberOfLines={3}
                    ellipsizeMode="tail"
                  >
                    {desc}
                  </Text>
                </View>
                <Pressable
                  style={[styles.detailsBtn, { backgroundColor: accent }]}
                  onPress={() => openLandmark(lm, activeRegion)}
                  android_ripple={rippleOnDarkSurface}
                >
                  <Text style={[styles.detailsBtnText, { color: onAccentButtonText(isLight) }]}>
                    {mt(language, 'homeDetails')}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          );
        })
      )}

      <Pressable onPress={openRouteFinder} style={styles.moreRoutes} android_ripple={ripple}>
        <Text style={[styles.moreRoutesText, { color: accent }]}>{mt(language, 'homeMoreRoutes')}</Text>
      </Pressable>
    </View>
  );
}

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
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    minHeight: 156,
    overflow: 'hidden',
  },
  /** Ліва половина картки — фото з м’якими краями (overflow + radius). */
  locThumbCol: {
    flex: 1,
    minHeight: 156,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  locThumbImg: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  locBody: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: 'space-between',
  },
  locBodyTop: { flexShrink: 1 },
  locTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  locMeta: { fontSize: 12, flex: 1, marginRight: 8 },
  saveCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locTitle: { fontSize: 17, fontWeight: '700', marginTop: 6 },
  locDesc: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  detailsBtn: {
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  detailsBtnText: { fontWeight: '700', fontSize: 13 },
  moreRoutes: { paddingVertical: 10, alignItems: 'center' },
  moreRoutesText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
});
