import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Platform,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getRegion, getLandmarkInRegion } from './routeRegionsData';
import { landmarkResultExtrasFromResolvedLandmark } from './homeLandmarkResultParams';
import { haversineKm } from './routePlannerCore';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { rp } from './routePlannerI18n';
import { pf } from './profileI18n';
import { landmarkBlurb, routeRegionTitle, routeCountryTitle } from './routePlanTitles';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { getAppTheme } from './themeStorage';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { routeStopImageSource, routeStopAssetMeta } from './routeStopThumb';
import {
  loadRoutePolylineFromPlan,
  openGoogleMapsDirections,
  buildGoogleMapsDirectionsUrl,
} from './googleMapsRoute';
import { RenderProfiler } from './performanceMetrics';

const LIGHT_BG = '#F2F2EA';
const HISTORY_RADIUS_M = 100;

export default function RouteNavigationPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const plan = route?.params?.routePlan;
  const mapPolylineParam = route?.params?.mapPolyline;
  const mapRef = useRef(null);
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  const [navActive, setNavActive] = useState(false);
  const [userPos, setUserPos] = useState(null);
  const [roadPolyline, setRoadPolyline] = useState(
    Array.isArray(mapPolylineParam) && mapPolylineParam.length >= 2 ? mapPolylineParam : null,
  );
  const [polyBusy, setPolyBusy] = useState(!mapPolylineParam);

  useEffect(() => {
    let c = false;
    (async () => {
      const t = await getAppTheme();
      if (!c) setAppTheme(t === 'light' ? 'light' : 'dark');
    })();
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    if (roadPolyline?.length >= 2 || !plan) return;
    let cancelled = false;
    (async () => {
      setPolyBusy(true);
      const { path } = await loadRoutePolylineFromPlan(plan);
      if (!cancelled && path?.length >= 2) setRoadPolyline(path);
    })().finally(() => {
      if (!cancelled) setPolyBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [plan, roadPolyline]);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const screenBg = isLight ? LIGHT_BG : '#0A0A0A';
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const sheetBg = isLight ? '#FFF' : '#1A1A1A';
  const topBarBg = isLight ? 'rgba(242,242,234,0.95)' : 'rgba(10,10,10,0.92)';
  const textMuted = isLight ? '#5C5C5C' : '#A8A8A8';

  const first = plan?.stops?.[0];
  const demoRegion = plan ? getRegion(plan.regionId) : null;
  const mapRegion =
    plan?.mapRegion ||
    demoRegion?.center ||
    (first
      ? {
          latitude: first.lat,
          longitude: first.lng,
          latitudeDelta: 0.09,
          longitudeDelta: 0.09,
        }
      : null);

  const lineCoords = useMemo(() => {
    const c = plan?.coordinates;
    if (!c?.length) return [];
    if (c.length >= 2) return c;
    return [
      c[0],
      {
        latitude: c[0].latitude + 0.003,
        longitude: c[0].longitude + 0.003,
      },
    ];
  }, [plan]);

  const drawCoords = useMemo(() => {
    if (roadPolyline && roadPolyline.length >= 2) return roadPolyline;
    return lineCoords;
  }, [roadPolyline, lineCoords]);

  const shell = useMemo(
    () => ({
      user: route?.params?.user,
      language,
      ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
      appTheme: isLight ? 'light' : 'dark',
    }),
    [route?.params?.user, route?.params?.countryId, language, isLight],
  );

  const headerTitle = useMemo(() => {
    if (!plan || !first) return '';
    const country = routeCountryTitle(language, plan);
    return `${country} — ${first.title}`;
  }, [plan, first, language]);

  const walkMin = plan ? Math.max(5, Math.round((plan.totalKm / 5) * 60)) : 0;
  const driveMin = plan ? Math.max(3, Math.round((plan.totalKm / 28) * 60)) : 0;

  const distToHistoryM = useMemo(() => {
    if (!navActive || !userPos || !first) return null;
    const km = haversineKm(
      { lat: userPos.latitude, lng: userPos.longitude },
      { lat: first.lat, lng: first.lng },
    );
    return Math.max(0, Math.round(km * 1000));
  }, [navActive, userPos, first]);

  const withinHistory = distToHistoryM != null && distToHistoryM <= HISTORY_RADIUS_M;

  const fitMap = useCallback(() => {
    if (!mapRef.current || drawCoords.length < 1) return;
    mapRef.current.fitToCoordinates(drawCoords, {
      edgePadding: { top: 60, right: 28, bottom: 160, left: 28 },
      animated: true,
    });
  }, [drawCoords]);

  useEffect(() => {
    const t = setTimeout(fitMap, 350);
    return () => clearTimeout(t);
  }, [fitMap]);

  useEffect(() => {
    let sub;
    if (!navActive) return undefined;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 8, timeInterval: 2500 },
        (loc) => setUserPos(loc.coords),
      );
    })();
    return () => {
      sub?.remove();
    };
  }, [navActive]);

  const centerOnUser = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted' || !mapRef.current) return;
    const pos = userPos
      ? { latitude: userPos.latitude, longitude: userPos.longitude }
      : await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(
          (p) => ({
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
          }),
        );
    mapRef.current.animateToRegion(
      {
        latitude: pos.latitude,
        longitude: pos.longitude,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      },
      400,
    );
  }, [userPos]);

  const onOpenGoogleMaps = useCallback(() => {
    if (!plan?.coordinates?.length) return;
    openGoogleMapsDirections(plan.coordinates, plan.transport || 'walk');
  }, [plan]);

  const onMenu = useCallback(() => {
    Alert.alert(
      rp(language, 'navActions'),
      undefined,
      [
        { text: rp(language, 'openGoogleMaps'), onPress: onOpenGoogleMaps },
        {
          text: rp(language, 'shareRoute'),
          onPress: async () => {
            const url = buildGoogleMapsDirectionsUrl(plan.coordinates, plan.transport || 'walk');
            if (!url) return;
            try {
              await Share.share({ message: `${headerTitle}\n${url}` });
            } catch {
              /* dismissed */
            }
          },
        },
        { text: pf(language, 'cancel'), style: 'cancel' },
      ],
      { cancelable: true },
    );
  }, [language, onOpenGoogleMaps, plan, headerTitle]);

  const onStartNav = useCallback(() => {
    setNavActive(true);
  }, []);

  const onViewHistory = useCallback(() => {
    if (!plan || !first) return;
    if (distToHistoryM != null && distToHistoryM > HISTORY_RADIUS_M) {
      Alert.alert('', rp(language, 'moveCloserForHistory'));
      return;
    }
    if (plan.aiGenerated) {
      const meta = routeStopAssetMeta(first.thumb);
      const photoUri = meta?.uri || null;
      const city = routeRegionTitle(language, plan);
      const c = String(first.category || '').toLowerCase();
      const visitCategory =
        c === 'museum'
          ? 'museum'
          : c === 'park'
            ? 'park'
            : c === 'monument' || c === 'church' || c === 'art'
              ? 'monument'
              : 'other';
      navigation.navigate('LandmarkResult', {
        ...shell,
        startPhase: 'full',
        title: first.title,
        headerTitle,
        subtitle: `${plan.flag} ${city}`.trim(),
        extract: '',
        source: 'geoCatalog',
        visitCity: city || '',
        visitCategory,
        countAsPhysicalVisit: true,
        ...(distToHistoryM != null && Number.isFinite(Number(distToHistoryM))
          ? { visitKm: Number(distToHistoryM) / 1000 }
          : {}),
        ...(photoUri ? { photoUri } : {}),
        ...(typeof first.lat === 'number' &&
        typeof first.lng === 'number' &&
        Number.isFinite(first.lat) &&
        Number.isFinite(first.lng)
          ? { visitLat: first.lat, visitLng: first.lng }
          : {}),
      });
      return;
    }
    const lm = getLandmarkInRegion(plan.regionId, first.id);
    if (!lm) return;
    const region = getRegion(plan.regionId);
    const extract = landmarkBlurb(language, lm);
    navigation.navigate('LandmarkResult', {
      ...shell,
      ...landmarkResultExtrasFromResolvedLandmark({
        lm,
        region,
        countryId: route?.params?.countryId,
        language,
        user: shell.user,
      }),
      startPhase: 'full',
      title: first.title,
      headerTitle,
      subtitle: `${plan.flag} ${routeRegionTitle(language, plan)}`,
      extract,
      source: 'sourceDemo',
    });
  }, [plan, first, navigation, shell, distToHistoryM, language, headerTitle, route?.params?.countryId]);

  if (!plan?.stops?.length || !first || !mapRegion) {
    return (
      <View style={[styles.fallback, { paddingTop: insets.top, backgroundColor: screenBg }]}>
        <Pressable onPress={() => navigation.goBack()} style={{ padding: 16 }}>
          <Ionicons name="chevron-back" size={28} color={textMain} />
        </Pressable>
        <Text style={[styles.fallbackText, { color: textMain }]}>—</Text>
      </View>
    );
  }

  return (
    <RenderProfiler id="RouteNavigationPage">
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8, backgroundColor: topBarBg }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={[styles.circleBtn, !isLight && { backgroundColor: 'rgba(255,255,255,0.12)' }]}
        >
          <Ionicons name="chevron-back" size={22} color={textMain} />
        </Pressable>
        <Text style={[styles.topTitle, { color: textMain }]} numberOfLines={1}>
          {headerTitle}
        </Text>
        <Pressable
          style={[styles.circleBtn, !isLight && { backgroundColor: 'rgba(255,255,255,0.12)' }]}
          onPress={onMenu}
        >
          <Ionicons name="ellipsis-vertical" size={20} color={textMain} />
        </Pressable>
      </View>

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={mapRegion}
          onMapReady={fitMap}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {drawCoords.length >= 2 ? (
            <Polyline
              coordinates={drawCoords}
              strokeColor={accent}
              strokeWidth={navActive ? 5 : 4}
              lineDashPattern={roadPolyline ? undefined : [10, 6]}
            />
          ) : null}
          {plan.stops.map((s) => (
            <Marker key={s.id} coordinate={{ latitude: s.lat, longitude: s.lng }}>
              <View style={[styles.markerWrap, s.order === 1 && { borderColor: accent }]}>
                <Image source={routeStopImageSource(s.thumb)} style={styles.markerImg} resizeMode="cover" />
              </View>
            </Marker>
          ))}
        </MapView>

        {polyBusy ? (
          <View style={styles.mapBadge}>
            <ActivityIndicator color={accent} size="small" />
          </View>
        ) : null}

        <Pressable
          style={[styles.mapFab, { backgroundColor: isLight ? '#FFF' : '#1E1E1E' }]}
          onPress={centerOnUser}
        >
          <Ionicons name="locate" size={22} color={accent} />
        </Pressable>
      </View>

      <View
        style={[
          styles.sheet,
          {
            paddingBottom: insets.bottom + lightTabBarExtraScrollPadding() + 16,
            backgroundColor: sheetBg,
            borderTopColor: isLight ? 'rgba(2,18,235,0.25)' : 'rgba(225,255,0,0.35)',
          },
        ]}
      >
        {!navActive ? (
          <>
            <View style={styles.sheetHead}>
              <Image source={routeStopImageSource(first.thumb)} style={styles.sheetThumb} resizeMode="cover" />
              <Text style={[styles.sheetTitle, { color: textMain }]} numberOfLines={2}>
                {headerTitle}
              </Text>
            </View>

            <View style={styles.modeRow}>
              <View
                style={[
                  styles.modePill,
                  { backgroundColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)' },
                ]}
              >
                <Ionicons name="walk-outline" size={20} color={isLight ? '#555' : '#AAA'} />
                <Text style={[styles.modeText, { color: isLight ? '#555' : '#AAA' }]}>
                  {walkMin} {rp(language, 'minShort')}
                </Text>
              </View>
              <View
                style={[
                  styles.modePill,
                  styles.modePillActive,
                  {
                    backgroundColor: isLight ? 'rgba(2,18,235,0.08)' : 'rgba(225,255,0,0.12)',
                    borderColor: accent,
                  },
                ]}
              >
                <Ionicons name="car-outline" size={20} color={accent} />
                <Text style={[styles.modeText, { color: accent, fontWeight: '700' }]}>
                  {driveMin} {rp(language, 'minShort')}
                </Text>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryBtn,
                { borderColor: isLight ? '#1E1E1E' : 'rgba(255,255,255,0.45)' },
                pressed && { opacity: 0.88 },
              ]}
              android_ripple={ripple}
              onPress={() => navigation.goBack()}
            >
              <Text style={[styles.secondaryBtnText, { color: textMain }]}>
                {rp(language, 'changePath')}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: accent },
                pressed && { opacity: 0.92 },
              ]}
              android_ripple={ripple}
              onPress={onStartNav}
            >
              <Text style={[styles.primaryBtnText, { color: onAccentButtonText(isLight) }]}>
                {rp(language, 'onTheWay')}
              </Text>
              <Text
                style={[
                  styles.primarySub,
                  { color: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(30,30,30,0.75)' },
                ]}
              >
                {rp(language, 'historyRadius')}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.navRow}>
              <Ionicons name="arrow-forward-outline" size={22} color={accent} style={{ marginRight: 8 }} />
              <Text style={[styles.navHint, { color: textMain }]}>{rp(language, 'navFollowMap')}</Text>
            </View>

            <View
              style={[
                styles.distBar,
                { backgroundColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)' },
              ]}
            >
              <Text style={[styles.distMain, { color: textMain }]}>
                {distToHistoryM != null
                  ? `${rp(language, 'metersToHistory')}: ${distToHistoryM} ${rp(language, 'm')}`
                  : '…'}
              </Text>
              <Text style={[styles.distSub, { color: textMuted }]}>{rp(language, 'historyRadius')}</Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: accent,
                  opacity: pressed ? 0.92 : 1,
                  borderWidth: withinHistory ? 0 : 2,
                  borderColor: withinHistory
                    ? 'transparent'
                    : isLight
                      ? 'rgba(0,0,0,0.22)'
                      : 'rgba(255,255,255,0.35)',
                },
              ]}
              android_ripple={ripple}
              onPress={onViewHistory}
            >
              <Text style={[styles.primaryBtnText, { color: onAccentButtonText(isLight) }]}>
                {rp(language, 'viewHistory')}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryBtn,
                { borderColor: isLight ? '#1E1E1E' : 'rgba(255,255,255,0.45)' },
                pressed && { opacity: 0.88 },
              ]}
              android_ripple={ripple}
              onPress={() => navigation.goBack()}
            >
              <Text style={[styles.secondaryBtnText, { color: textMain }]}>
                {rp(language, 'skipRoute')}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
    </RenderProfiler>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fallback: { flex: 1 },
  fallbackText: { padding: 24, fontSize: 16 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 8,
  },
  mapWrap: { flex: 1, minHeight: 200, position: 'relative' },
  mapBadge: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  mapFab: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
    }),
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    marginTop: -18,
    paddingHorizontal: 20,
    paddingTop: 18,
    borderTopWidth: 3,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: { elevation: 10 },
    }),
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sheetThumb: { width: 56, height: 56, borderRadius: 12, marginRight: 14, backgroundColor: '#EEE' },
  sheetTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
  modeRow: { flexDirection: 'row', marginBottom: 14 },
  modePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    marginHorizontal: 6,
  },
  modePillActive: {
    borderWidth: 2,
  },
  modeText: { fontSize: 15, marginLeft: 8 },
  secondaryBtn: {
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryBtnText: { fontSize: 16, fontWeight: '700' },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 17, fontWeight: '700' },
  primarySub: { fontSize: 12, marginTop: 6, textAlign: 'center', paddingHorizontal: 8 },
  navRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  navHint: { flex: 1, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  distBar: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  distMain: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  distSub: { fontSize: 12, marginTop: 6, textAlign: 'center' },
  markerWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FFF',
    overflow: 'hidden',
  },
  markerImg: { width: '100%', height: '100%' },
});
