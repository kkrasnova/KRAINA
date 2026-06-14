import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Platform,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getRegion, resolveRegionIdFromQuery } from './routeRegionsData';
import { buildRoutePlan, formatDurationUk, formatDurationEn } from './routePlannerCore';
import {
  loadRoutePolylineFromPlan,
  openGoogleMapsDirections,
  buildGoogleMapsDirectionsUrl,
  getGoogleMapsApiKey,
} from './googleMapsRoute';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { rp } from './routePlannerI18n';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { addSavedRoute } from './profileStorage';
import { syncSavedRoutesToBackend } from './savedRoutesSync';
import { pf } from './profileI18n';
import { routeRegionTitle } from './routePlanTitles';
import { getAppTheme } from './themeStorage';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { routeStopImageSource } from './routeStopThumb';

const LIGHT_BG = '#F2F2EA';

export default function RouteResultsPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const mapRef = useRef(null);
  const plan = route?.params?.routePlan;
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  const [roadPolyline, setRoadPolyline] = useState(null);
  const [directionsBusy, setDirectionsBusy] = useState(false);
  const [userPos, setUserPos] = useState(null);

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

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const screenBg = isLight ? LIGHT_BG : '#0A0A0A';
  const sheetBg = isLight ? '#FFFFFF' : '#1A1A1A';
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#727272' : '#A0A0A0';

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

  useEffect(() => {
    if (!plan?.coordinates?.length) return;
    let cancelled = false;
    setDirectionsBusy(true);
    setRoadPolyline(null);
    (async () => {
      const { path } = await loadRoutePolylineFromPlan(plan);
      if (!cancelled && path?.length >= 2) setRoadPolyline(path);
    })().finally(() => {
      if (!cancelled) setDirectionsBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [plan]);

  useEffect(() => {
    let sub;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 5000 },
        (loc) => setUserPos(loc.coords),
      );
    })();
    return () => {
      sub?.remove();
    };
  }, []);

  const shell = useMemo(
    () => ({
      user: route?.params?.user,
      language,
      ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
      appTheme: isLight ? 'light' : 'dark',
    }),
    [route?.params?.user, route?.params?.countryId, language, isLight],
  );

  const fitMap = useCallback(() => {
    if (!mapRef.current || drawCoords.length < 1) return;
    mapRef.current.fitToCoordinates(drawCoords, {
      edgePadding: { top: 70, right: 36, bottom: 120, left: 36 },
      animated: true,
    });
  }, [drawCoords]);

  useEffect(() => {
    const t = setTimeout(fitMap, 400);
    return () => clearTimeout(t);
  }, [fitMap]);

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
        latitudeDelta: 0.035,
        longitudeDelta: 0.035,
      },
      450,
    );
  }, [userPos]);

  const onOpenGoogleMaps = useCallback(() => {
    if (!plan?.coordinates?.length) return;
    openGoogleMapsDirections(plan.coordinates, plan.transport || 'walk');
  }, [plan]);

  const onShareRoute = useCallback(async () => {
    const url = buildGoogleMapsDirectionsUrl(plan.coordinates, plan.transport || 'walk');
    if (!url) return;
    const title = routeRegionTitle(language, plan);
    try {
      await Share.share({
        message: `${title}\n${url}`,
        url: Platform.OS === 'ios' ? url : undefined,
      });
    } catch {
      /* user dismissed */
    }
  }, [plan, language]);

  if (!plan?.stops?.length) {
    return (
      <View style={[styles.fallback, { paddingTop: insets.top, backgroundColor: screenBg }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backAbs}>
          <Ionicons name="chevron-back" size={28} color={textMain} />
        </Pressable>
        <Text style={[styles.fallbackText, { color: textMuted }]}>{rp(language, 'noStops')}</Text>
      </View>
    );
  }

  const demoRegion = getRegion(plan.regionId);
  const mapInitial =
    plan.mapRegion ||
    demoRegion?.center ||
    (plan.stops[0]
      ? {
          latitude: plan.stops[0].lat,
          longitude: plan.stops[0].lng,
          latitudeDelta: 0.09,
          longitudeDelta: 0.09,
        }
      : null);
  const durFmt =
    language === 'uk' ? formatDurationUk(plan.totalMinutes) : formatDurationEn(plan.totalMinutes);
  const kmDisplay =
    plan.totalKm >= 1
      ? `${plan.totalKm.toFixed(1)} ${rp(language, 'km')}`
      : `${Math.round(plan.totalKm * 1000)} ${rp(language, 'm')}`;

  const onAnother = () => {
    if (plan.aiGenerated || plan.generatedFromLocations) return;
    const v = (route.params.routeVariant || 0) + 1;
    const tier = route.params.budgetTier || (route.params.freeOnly ? 'free' : 'medium');
    const next = buildRoutePlan({
      regionId: resolveRegionIdFromQuery(route.params.placeQuery),
      query: route.params.placeQuery || '',
      hours: parseHoursSafe(route.params.hoursText),
      transport: route.params.transport || 'walk',
      budgetTier: tier,
      interests: route.params.interests || plan.interests || undefined,
      freeOnly: !!route.params.freeOnly,
      variant: v,
      language,
      userOrigin: plan.userOrigin || null,
    });
    if (next.stops.length) {
      navigation.replace('RouteResults', {
        ...shell,
        routePlan: next,
        routeVariant: v,
        placeQuery: route.params.placeQuery,
        hoursText: route.params.hoursText,
        budgetTier: tier,
        interests: route.params.interests || plan.interests,
        freeOnly: tier === 'free',
        transport: route.params.transport,
      });
    }
  };

  const onChoose = () => {
    navigation.navigate('RouteNavigation', {
      ...shell,
      routePlan: plan,
      mapPolyline: roadPolyline && roadPolyline.length >= 2 ? roadPolyline : null,
    });
  };

  const onBookmark = async () => {
    await addSavedRoute(plan, routeRegionTitle(language, plan));
    void syncSavedRoutesToBackend();
    Alert.alert('', pf(language, 'routeSaved'));
  };

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: screenBg }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerIcon}>
          <Ionicons name="chevron-back" size={28} color={textMain} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: textMain }]} numberOfLines={1}>
          {plan.flag} {routeRegionTitle(language, plan)}
        </Text>
        <Pressable hitSlop={10} style={styles.headerIcon} onPress={onBookmark}>
          <Ionicons name="bookmark-outline" size={24} color={textMain} />
        </Pressable>
      </View>

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={mapInitial}
          onMapReady={fitMap}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass
          showsScale
          toolbarEnabled
        >
          {drawCoords.length >= 2 ? (
            <Polyline
              coordinates={drawCoords}
              strokeColor={accent}
              strokeWidth={4}
              lineDashPattern={roadPolyline ? undefined : [10, 6]}
            />
          ) : null}
          {plan.stops.map((s) => (
            <Marker key={s.id} coordinate={{ latitude: s.lat, longitude: s.lng }} title={s.title}>
              <View
                style={[
                  styles.markerWrap,
                  s.order === 1 && { borderColor: accent, borderWidth: 4 },
                ]}
              >
                <Image source={routeStopImageSource(s.thumb)} style={styles.markerImg} resizeMode="cover" />
              </View>
            </Marker>
          ))}
        </MapView>

        {directionsBusy ? (
          <View style={styles.directionsBadge}>
            <ActivityIndicator size="small" color={accent} style={{ marginRight: 8 }} />
            <Text style={[styles.directionsBadgeText, { color: '#FFF' }]}>
              {rp(language, 'loadingRoutePath')}
            </Text>
          </View>
        ) : null}

        <Pressable
          style={[styles.mapFab, { backgroundColor: isLight ? '#FFF' : '#1E1E1E' }]}
          onPress={centerOnUser}
          accessibilityRole="button"
          accessibilityLabel={rp(language, 'recenterMap')}
        >
          <Ionicons name="locate" size={22} color={accent} />
        </Pressable>
      </View>

      <View
        style={[
          styles.sheet,
          {
            paddingBottom: insets.bottom + lightTabBarExtraScrollPadding() + 12,
            backgroundColor: sheetBg,
          },
        ]}
      >
        <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
          {plan.stops.map((s) => (
            <View key={s.id} style={styles.stopRow}>
              <View style={styles.stopLeft}>
                <Text style={[styles.stopOrder, { color: accent }]}>{s.order}</Text>
              </View>
              <Image source={routeStopImageSource(s.thumb)} style={styles.thumb} resizeMode="cover" />
              <View style={styles.stopBody}>
                <Text style={[styles.stopTitle, { color: textMain }]}>{s.title}</Text>
                <Text style={[styles.stopMeta, { color: textMuted }]}>
                  {s.minutes} {rp(language, 'minShort')}
                </Text>
              </View>
              <Ionicons name="star-outline" size={18} color="#C4A000" />
            </View>
          ))}
        </ScrollView>

        <View
          style={[
            styles.statsBar,
            {
              backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
            },
          ]}
        >
          <Text style={[styles.statsText, { color: textMain }]}>🕐 {durFmt}</Text>
          <Text style={[styles.statsText, { color: textMain }]}>🚶 {kmDisplay}</Text>
          <Text style={[styles.statsText, { color: textMain }]}>
            {plan.stops.length} {rp(language, 'locations')}
          </Text>
        </View>

        {!getGoogleMapsApiKey() ? (
          <Text style={[styles.keyHint, { color: textMuted }]}>{rp(language, 'addMapsKeyHint')}</Text>
        ) : null}

        <View style={styles.linkRow}>
          <Pressable onPress={onOpenGoogleMaps} style={styles.linkBtn}>
            <Ionicons name="map-outline" size={18} color={accent} />
            <Text style={[styles.linkBtnText, { color: accent }]}>{rp(language, 'openGoogleMaps')}</Text>
          </Pressable>
          <Pressable onPress={onShareRoute} style={styles.linkBtn}>
            <Ionicons name="share-outline" size={18} color={accent} />
            <Text style={[styles.linkBtnText, { color: accent }]}>{rp(language, 'shareRoute')}</Text>
          </Pressable>
        </View>

        <View style={[styles.actions, plan.aiGenerated || plan.generatedFromLocations ? { flexDirection: 'column', gap: 0 } : null]}>
          {!plan.aiGenerated && !plan.generatedFromLocations ? (
            <Pressable
              onPress={onAnother}
              style={({ pressed }) => [
                styles.btnOutline,
                {
                  borderColor: isLight ? '#1E1E1E' : 'rgba(255,255,255,0.5)',
                },
                pressed && { opacity: 0.88 },
              ]}
              android_ripple={ripple}
            >
              <Text style={[styles.btnOutlineText, { color: textMain }]}>
                {rp(language, 'anotherRoute')}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onChoose}
            style={({ pressed }) => [
              styles.btnPrimary,
              { backgroundColor: accent },
              pressed && { opacity: 0.9 },
            ]}
            android_ripple={ripple}
          >
            <Text style={[styles.btnPrimaryText, { color: onAccentButtonText(isLight) }]}>
              {rp(language, 'choose')}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function parseHoursSafe(text) {
  const m = String(text || '').match(/(\d+[.,]?\d*)/);
  if (m) return Math.min(12, Math.max(1, parseFloat(m[1].replace(',', '.')) || 6));
  return 6;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fallback: { flex: 1, justifyContent: 'center', padding: 24 },
  fallbackText: { fontSize: 16, textAlign: 'center' },
  backAbs: { position: 'absolute', left: 12, top: 48 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  headerIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  mapWrap: {
    flex: 0.38,
    width: '100%',
    minHeight: 200,
    position: 'relative',
  },
  directionsBadge: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  directionsBadgeText: { fontSize: 13, fontWeight: '600', flex: 1 },
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
    flex: 1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    marginTop: -16,
    paddingTop: 16,
    paddingHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  list: { maxHeight: 220 },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  stopLeft: { width: 28, alignItems: 'center', marginRight: 8 },
  stopOrder: { fontSize: 14, fontWeight: '700' },
  thumb: { width: 48, height: 48, borderRadius: 10, marginRight: 12, backgroundColor: '#EEE' },
  stopBody: { flex: 1 },
  stopTitle: { fontSize: 16, fontWeight: '600' },
  stopMeta: { fontSize: 13, marginTop: 2 },
  keyHint: { fontSize: 11, lineHeight: 15, marginBottom: 10, textAlign: 'center' },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  linkBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.35)',
  },
  linkBtnText: { fontSize: 13, fontWeight: '700' },
  markerWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: '#FFF',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3,
      },
      android: { elevation: 3 },
    }),
  },
  markerImg: { width: '100%', height: '100%' },
  statsBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 8,
    marginBottom: 14,
  },
  statsText: { fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12 },
  btnOutline: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnOutlineText: { fontSize: 15, fontWeight: '700' },
  btnPrimary: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnPrimaryText: { fontSize: 15, fontWeight: '700' },
});
