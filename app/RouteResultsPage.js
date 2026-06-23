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
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getRegion, resolveRegionIdFromQuery } from './routeRegionsData';
import { buildRoutePlan, formatDurationUk, formatDurationEn, haversineKm } from './routePlannerCore';
import {
  loadRoutePolylineFromPlan,
  buildGoogleMapsDirectionsUrl,
  getGoogleMapsApiKey,
  getDirectionsCoordinatesFromPlan,
  collectMapFitCoordinates,
  coordFromWalkOrigin,
} from './googleMapsRoute';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { rp } from './routePlannerI18n';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { addSavedRoute } from './profileStorage';
import { syncSavedRoutesToBackend } from './savedRoutesSync';
import { pf } from './profileI18n';
import { routeRegionTitle } from './routePlanTitles';
import { getAppTheme, resolveAppTheme } from './themeStorage';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { routeStopImageSource } from './routeStopThumb';
import { RouteMapPath } from './routeMapPath';

const LIGHT_BG = '#F2F2EA';

function transportIcon(transport) {
  switch (transport) {
    case 'car':
      return 'car-outline';
    case 'bus':
      return 'bus-outline';
    case 'train':
      return 'train-outline';
    default:
      return 'walk-outline';
  }
}

export default function RouteResultsPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const mapRef = useRef(null);
  const plan = route?.params?.routePlan;
  const [appTheme, setAppTheme] = useState(resolveAppTheme(route?.params?.appTheme));
  const [roadPolyline, setRoadPolyline] = useState(null);
  const [directionsBusy, setDirectionsBusy] = useState(false);
  const [userPos, setUserPos] = useState(null);
  const [roadDistanceM, setRoadDistanceM] = useState(null);
  const [walkOrigin, setWalkOrigin] = useState(() => coordFromWalkOrigin(route?.params?.walkOrigin));
  const [focusedStopId, setFocusedStopId] = useState(null);
  const roadPolylineRef = useRef(null);

  useEffect(() => {
    roadPolylineRef.current = roadPolyline;
  }, [roadPolyline]);

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
    const c = getDirectionsCoordinatesFromPlan(plan, userPos, walkOrigin);
    if (!c?.length) return [];
    if (c.length >= 2) return c;
    return [
      c[0],
      {
        latitude: c[0].latitude + 0.003,
        longitude: c[0].longitude + 0.003,
      },
    ];
  }, [plan, userPos, walkOrigin]);

  const drawCoords = useMemo(() => {
    if (roadPolyline && roadPolyline.length >= 2) return roadPolyline;
    return lineCoords;
  }, [roadPolyline, lineCoords]);

  useEffect(() => {
    if (!plan?.stops?.length) return;
    let cancelled = false;
    setDirectionsBusy(true);
    setRoadPolyline(null);
    setRoadDistanceM(null);
    (async () => {
      const { path, distanceM } = await loadRoutePolylineFromPlan(plan, userPos, walkOrigin);
      if (!cancelled && path?.length >= 2) {
        setRoadPolyline(path);
        if (distanceM) setRoadDistanceM(distanceM);
      }
    })().finally(() => {
      if (!cancelled) setDirectionsBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [plan, userPos?.latitude, userPos?.longitude, walkOrigin?.latitude, walkOrigin?.longitude]);

  useEffect(() => {
    if (walkOrigin || !plan?.stops?.length) return;
    if (plan.originNearRegion && userPos) {
      setWalkOrigin({ latitude: userPos.latitude, longitude: userPos.longitude });
      return;
    }
    if (!plan.originNearRegion) {
      setWalkOrigin({ latitude: plan.stops[0].lat, longitude: plan.stops[0].lng });
    }
  }, [plan?.stops, plan?.originNearRegion, userPos?.latitude, userPos?.longitude, walkOrigin]);

  useEffect(() => {
    let sub;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      const last = await Location.getLastKnownPositionAsync();
      if (!cancelled && last?.coords) setUserPos(last.coords);
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 20, timeInterval: 4000 },
        (loc) => setUserPos(loc.coords),
      );
    })();
    return () => {
      cancelled = true;
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

  const fitPoints = useMemo(
    () =>
      collectMapFitCoordinates({
        polyline: drawCoords,
        stops: plan?.stops,
        extras: [
          userPos ? { latitude: userPos.latitude, longitude: userPos.longitude } : null,
          walkOrigin,
        ],
      }),
    [drawCoords, plan?.stops, userPos, walkOrigin],
  );

  const fitMap = useCallback(() => {
    if (!mapRef.current || fitPoints.length < 1) return;
    mapRef.current.fitToCoordinates(fitPoints, {
      edgePadding: { top: 80, right: 40, bottom: 100, left: 40 },
      animated: true,
    });
  }, [fitPoints]);

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

  const onShareRoute = useCallback(async () => {
    const coords = getDirectionsCoordinatesFromPlan(plan, userPos);
    const url = buildGoogleMapsDirectionsUrl(coords, plan.transport || 'walk');
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
  }, [plan, language, userPos]);

  const onMapPress = useCallback(
    (e) => {
      const coord = e.nativeEvent?.coordinate;
      if (!coord) return;
      setWalkOrigin({ latitude: coord.latitude, longitude: coord.longitude });
      setFocusedStopId(null);
    },
    [],
  );

  const onStopMarkerPress = useCallback(
    (stop) => {
      setFocusedStopId(stop.id);
      if (!mapRef.current) return;
      mapRef.current.animateToRegion(
        {
          latitude: stop.lat,
          longitude: stop.lng,
          latitudeDelta: 0.025,
          longitudeDelta: 0.025,
        },
        400,
      );
    },
    [],
  );

  const navWalkOrigin = useMemo(() => {
    if (walkOrigin) return { lat: walkOrigin.latitude, lng: walkOrigin.longitude };
    if (plan?.originNearRegion && userPos) {
      return { lat: userPos.latitude, lng: userPos.longitude };
    }
    if (plan?.stops?.[0]) {
      return { lat: plan.stops[0].lat, lng: plan.stops[0].lng };
    }
    return null;
  }, [walkOrigin, plan?.originNearRegion, plan?.stops, userPos]);

  const navParams = useCallback(
    (autoStartNav = false) => {
      const poly = roadPolylineRef.current;
      return {
        ...shell,
        routePlan: plan,
        mapPolyline: poly && poly.length >= 2 ? poly : null,
        autoStartNav,
        walkOrigin: navWalkOrigin,
      };
    },
    [shell, plan, navWalkOrigin],
  );

  const onStartTrip = useCallback(() => {
    navigation.navigate('RouteNavigation', navParams(true));
  }, [navigation, navParams]);

  const onPreview = useCallback(() => {
    navigation.navigate('RouteNavigation', navParams(false));
  }, [navigation, navParams]);

  const featuredStop = useMemo(() => {
    if (!plan?.stops?.length) return null;
    if (focusedStopId) {
      return plan.stops.find((s) => s.id === focusedStopId) || plan.stops[0];
    }
    return plan.stops[0];
  }, [plan?.stops, focusedStopId]);

  const extraStops = useMemo(() => {
    if (!plan?.stops?.length || !featuredStop) return [];
    return plan.stops.filter((s) => s.id !== featuredStop.id);
  }, [plan?.stops, featuredStop]);

  const canPickAnother = !plan?.aiGenerated && !plan?.generatedFromLocations;

  const effectiveKm = useMemo(() => {
    if (roadDistanceM != null && roadDistanceM > 0) return roadDistanceM / 1000;
    if (plan?.totalKm > 0) return plan.totalKm;
    if (walkOrigin && plan?.stops?.[0]) {
      return haversineKm(
        { lat: walkOrigin.latitude, lng: walkOrigin.longitude },
        { lat: plan.stops[0].lat, lng: plan.stops[0].lng },
      );
    }
    if (plan?.stops?.length >= 2) {
      let km = 0;
      for (let i = 1; i < plan.stops.length; i += 1) {
        km += haversineKm(plan.stops[i - 1], plan.stops[i]);
      }
      return km;
    }
    return 0;
  }, [roadDistanceM, plan?.totalKm, plan?.stops, walkOrigin]);

  const kmDisplay = useMemo(() => {
    if (effectiveKm >= 1) return `${effectiveKm.toFixed(1)} ${rp(language, 'km')}`;
    return `${Math.round(effectiveKm * 1000)} ${rp(language, 'm')}`;
  }, [effectiveKm, language]);

  const onAnother = useCallback(() => {
    if (!canPickAnother || !plan) return;
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
      return;
    }
    Alert.alert('', rp(language, 'noStops'));
  }, [canPickAnother, route.params, plan, language, shell, navigation]);

  const onBookmark = useCallback(() => {
    if (!plan) return;
    void (async () => {
      await addSavedRoute(plan, routeRegionTitle(language, plan));
      void syncSavedRoutesToBackend();
      Alert.alert('', pf(language, 'routeSaved'));
    })();
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

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: screenBg }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} delayPressIn={0} style={styles.headerIcon}>
          <Ionicons name="chevron-back" size={28} color={textMain} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: textMain }]} numberOfLines={1}>
          {plan.flag} {routeRegionTitle(language, plan)}
        </Text>
        <Pressable hitSlop={12} delayPressIn={0} style={styles.headerIcon} onPress={onShareRoute}>
          <Ionicons name="share-outline" size={22} color={textMain} />
        </Pressable>
        <Pressable hitSlop={12} delayPressIn={0} style={styles.headerIcon} onPress={onBookmark}>
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
          onPress={onMapPress}
          showsUserLocation={!walkOrigin}
          showsMyLocationButton={false}
          showsCompass
          showsScale
          toolbarEnabled
        >
          <RouteMapPath
            coordinates={drawCoords}
            accent={accent}
            isLight={isLight}
            mode={roadPolyline?.length >= 2 ? 'road' : 'preview'}
            showArrows={drawCoords.length >= 2}
          />
          {walkOrigin ? (
            <Marker coordinate={walkOrigin} anchor={{ x: 0.5, y: 0.5 }} zIndex={20}>
              <View style={[styles.walkerDot, { borderColor: accent, backgroundColor: isLight ? '#FFF' : '#1A1A1A' }]}>
                <Ionicons name="walk" size={16} color={accent} />
              </View>
            </Marker>
          ) : null}
          {plan.stops.map((s) => (
            <Marker
              key={s.id}
              coordinate={{ latitude: s.lat, longitude: s.lng }}
              title={s.title}
              onPress={() => onStopMarkerPress(s)}
            >
              <View
                style={[
                  styles.markerWrap,
                  (s.order === 1 || focusedStopId === s.id) && { borderColor: accent, borderWidth: 4 },
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

        <View style={[styles.mapHint, { backgroundColor: isLight ? 'rgba(255,255,255,0.92)' : 'rgba(26,26,26,0.92)' }]}>
          <Ionicons name="footsteps-outline" size={14} color={accent} />
          <Text style={[styles.mapHintText, { color: textMuted }]} numberOfLines={2}>
            {rp(language, 'tapMapToWalk')}
          </Text>
        </View>

        <Pressable
          style={[styles.mapFab, styles.mapFabLeft, { backgroundColor: isLight ? '#FFF' : '#1E1E1E' }]}
          onPress={fitMap}
          delayPressIn={0}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={rp(language, 'fitFullRoute')}
        >
          <Ionicons name="scan-outline" size={20} color={accent} />
        </Pressable>

        <Pressable
          style={[styles.mapFab, { backgroundColor: isLight ? '#FFF' : '#1E1E1E' }]}
          onPress={centerOnUser}
          delayPressIn={0}
          hitSlop={8}
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
            paddingBottom: lightTabBarScrollContentPadding(insets.bottom, 12),
            backgroundColor: sheetBg,
            borderTopColor: isLight ? 'rgba(2,18,235,0.12)' : 'rgba(225,255,0,0.2)',
          },
        ]}
      >
        <View style={[styles.sheetHandle, { backgroundColor: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.2)' }]} />

        {!plan.originNearRegion && !walkOrigin ? (
          <View style={[styles.hintBanner, { backgroundColor: isLight ? 'rgba(2,18,235,0.06)' : 'rgba(225,255,0,0.08)' }]}>
            <Ionicons name="information-circle-outline" size={18} color={accent} />
            <Text style={[styles.hintBannerText, { color: textMuted }]}>{rp(language, 'farFromCityHint')}</Text>
          </View>
        ) : null}

        {featuredStop ? (
          <Pressable
            onPress={() => onStopMarkerPress(featuredStop)}
            delayPressIn={0}
            style={({ pressed }) => [
              styles.heroStop,
              {
                backgroundColor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)',
                borderColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
              },
              pressed && { opacity: 0.92 },
            ]}
          >
            <Image source={routeStopImageSource(featuredStop.thumb)} style={styles.heroThumb} resizeMode="cover" />
            <View style={styles.heroBody}>
              <Text style={[styles.heroTitle, { color: textMain }]} numberOfLines={2}>
                {featuredStop.title}
              </Text>
              <Text style={[styles.heroMeta, { color: textMuted }]}>
                {plan.stops.length > 1
                  ? `${rp(language, 'locations')}: ${plan.stops.length}`
                  : routeRegionTitle(language, plan)}
              </Text>
            </View>
            <View style={[styles.heroDuration, { backgroundColor: isLight ? 'rgba(2,18,235,0.08)' : 'rgba(225,255,0,0.12)' }]}>
              <Text style={[styles.heroDurationText, { color: accent }]}>
                {featuredStop.minutes} {rp(language, 'minShort')}
              </Text>
            </View>
          </Pressable>
        ) : null}

        {extraStops.length > 0 ? (
          <ScrollView showsVerticalScrollIndicator={false} style={styles.extraList} nestedScrollEnabled>
            {extraStops.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => onStopMarkerPress(s)}
                delayPressIn={0}
                style={({ pressed }) => [
                  styles.extraStopRow,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <View style={[styles.extraOrder, { backgroundColor: accent }]}>
                  <Text style={styles.extraOrderText}>{s.order}</Text>
                </View>
                <Image source={routeStopImageSource(s.thumb)} style={styles.extraThumb} resizeMode="cover" />
                <View style={styles.extraBody}>
                  <Text style={[styles.extraTitle, { color: textMain }]} numberOfLines={1}>
                    {s.title}
                  </Text>
                  <Text style={[styles.extraMeta, { color: textMuted }]}>
                    {s.minutes} {rp(language, 'minShort')}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.statsRow}>
          <View style={[styles.statChip, styles.statChipFlex, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)' }]}>
            <Ionicons name="time-outline" size={16} color={accent} />
            <Text style={[styles.statChipText, { color: textMain }]} numberOfLines={1}>
              {durFmt}
            </Text>
          </View>
          <View style={[styles.statChip, styles.statChipFlex, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)' }]}>
            <Ionicons name={transportIcon(plan.transport)} size={16} color={accent} />
            <Text style={[styles.statChipText, { color: textMain }]} numberOfLines={1}>
              {kmDisplay}
            </Text>
          </View>
          <View style={[styles.statChip, styles.statChipFlex, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)' }]}>
            <Ionicons name="location-outline" size={16} color={accent} />
            <Text style={[styles.statChipText, { color: textMain }]} numberOfLines={1}>
              {plan.stops.length} {rp(language, 'locations')}
            </Text>
          </View>
        </View>

        {!getGoogleMapsApiKey() ? (
          <Text style={[styles.keyHint, { color: textMuted }]}>{rp(language, 'addMapsKeyHint')}</Text>
        ) : null}

        <View style={styles.actions}>
          <View style={styles.actionsSecondary}>
            {canPickAnother ? (
              <Pressable
                onPress={onAnother}
                delayPressIn={0}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.btnOutline,
                  { borderColor: isLight ? 'rgba(30,30,30,0.22)' : 'rgba(255,255,255,0.35)' },
                  pressed && { opacity: 0.88 },
                ]}
                android_ripple={ripple}
              >
                <Text style={[styles.btnOutlineText, { color: textMain }]} numberOfLines={1} adjustsFontSizeToFit>
                  {rp(language, 'anotherRoute')}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onPreview}
              delayPressIn={0}
              hitSlop={6}
              style={({ pressed }) => [
                styles.btnOutline,
                !canPickAnother && styles.btnOutlineFull,
                { borderColor: isLight ? 'rgba(30,30,30,0.22)' : 'rgba(255,255,255,0.35)' },
                pressed && { opacity: 0.88 },
              ]}
              android_ripple={ripple}
            >
              <Text style={[styles.btnOutlineText, { color: textMain }]} numberOfLines={1} adjustsFontSizeToFit>
                {rp(language, 'previewRoute')}
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={onStartTrip}
            delayPressIn={0}
            hitSlop={4}
            style={({ pressed }) => [styles.btnPrimaryWrap, pressed && { opacity: 0.94, transform: [{ scale: 0.99 }] }]}
            android_ripple={ripple}
          >
            <LinearGradient
              colors={isLight ? [accent, '#1535F0'] : [accent, '#c8e600']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btnPrimary}
            >
              <Ionicons name="navigate" size={20} color={onAccentButtonText(isLight)} style={{ marginRight: 8 }} />
              <Text style={[styles.btnPrimaryText, { color: onAccentButtonText(isLight) }]}>
                {rp(language, 'startTrip')}
              </Text>
            </LinearGradient>
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
    flex: 0.58,
    width: '100%',
    minHeight: 300,
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
  mapFabLeft: {
    right: undefined,
    left: 12,
  },
  mapHint: {
    position: 'absolute',
    left: 12,
    right: 68,
    bottom: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.15)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  mapHintText: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  walkerDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.28,
        shadowRadius: 3,
      },
      android: { elevation: 4 },
    }),
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -18,
    paddingTop: 10,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  heroStop: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 12,
  },
  heroThumb: {
    width: 56,
    height: 56,
    borderRadius: 14,
    marginRight: 12,
    backgroundColor: '#E8E8E8',
  },
  heroBody: { flex: 1, minWidth: 0, paddingRight: 8 },
  heroTitle: { fontSize: 17, fontWeight: '700', lineHeight: 22 },
  heroMeta: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  heroDuration: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  heroDurationText: { fontSize: 13, fontWeight: '700' },
  extraList: { maxHeight: 120, marginBottom: 10 },
  extraStopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 2,
  },
  extraOrder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  extraOrderText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  extraThumb: { width: 40, height: 40, borderRadius: 10, marginRight: 10, backgroundColor: '#EEE' },
  extraBody: { flex: 1, minWidth: 0 },
  extraTitle: { fontSize: 14, fontWeight: '600' },
  extraMeta: { fontSize: 12, marginTop: 2 },
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
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 14,
  },
  statChipFlex: { flex: 1, minWidth: 0 },
  statChipText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  actions: { gap: 10 },
  actionsSecondary: { flexDirection: 'row', gap: 10 },
  btnOutline: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineFull: { flex: 1 },
  btnOutlineText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  btnPrimary: {
    minHeight: 52,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  btnPrimaryText: { fontSize: 16, fontWeight: '700' },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  hintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  hintBannerText: { flex: 1, fontSize: 12, lineHeight: 16 },
  btnPrimaryWrap: { borderRadius: 14, overflow: 'hidden' },
});
