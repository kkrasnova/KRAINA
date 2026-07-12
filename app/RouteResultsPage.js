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
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getRegion, resolveRegionIdFromOrigin, resolveRegionIdFromQuery } from './routeRegionsData';
import { buildRoutePlan, formatDurationUk, formatDurationEn, haversineKm, buildRouteCoordinates, computeRouteTotalKm, computeUsedMinutes, isUserOriginNearRoute } from './routePlannerCore';
import {
  loadRoutePolylineFromPlan,
  buildGoogleMapsDirectionsUrl,
  getGoogleMapsApiKey,
  getDirectionsCoordinatesFromPlan,
  collectMapFitCoordinates,
  coordFromWalkOrigin,
  resolveRouteMapRegion,
} from './googleMapsRoute';
import { geocodeAddress } from './googleGeocode';
import { postSuggestAiRoute } from './aiRouteApi';
import { useSyncedAppLanguage } from './useAppLanguage';
import { rp } from './routePlannerI18n';
import { lightTabBarOverlayBottomInset } from './LightBottomTabBar';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { addSavedRoute } from './profileStorage';
import { syncSavedRoutesToBackend } from './savedRoutesSync';
import { pf } from './profileI18n';
import { routeRegionTitle } from './routePlanTitles';
import { useAppTheme } from './useAppTheme';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { routeStopImageSource } from './routeStopThumb';
import { RouteMapPath } from './routeMapPath';
import { buildPlanFromPublishedLocations } from './RouteFinderPage';
import { fetchPublishedLocations } from './locationsApi';
import { brandFontSansBold, brandFontSansMedium, brandFontSansSemibold } from './brandFont';

const LIGHT_BG = '#F2F2EA';
const DEFAULT_MAP_ZOOM = 0.035;
const MIN_MAP_ZOOM = 0.0025;
const MAX_MAP_ZOOM = 0.14;

function transportIcon(transport) {
  switch (transport) {
    case 'car':
      return 'car-outline';
    case 'bike':
      return 'bicycle-outline';
    case 'bus':
      return 'bus-outline';
    case 'train':
      return 'train-outline';
    default:
      return 'walk-outline';
  }
}

function parseHoursSafe(text) {
  const m = String(text || '').match(/(\d+[.,]?\d*)/);
  if (m) return Math.min(12, Math.max(1, parseFloat(m[1].replace(',', '.')) || 6));
  return 6;
}

function rotateRouteStops(stops, variant = 1) {
  if (!stops?.length) return [];
  const shift = variant % stops.length;
  if (!shift) return stops.map((s, idx) => ({ ...s, order: idx + 1 }));
  const rotated = [...stops.slice(shift), ...stops.slice(0, shift)];
  return rotated.map((s, idx) => ({ ...s, order: idx + 1 }));
}

function rebuildPlanWithStops(plan, stops) {
  if (!plan || !stops?.length) return plan;
  const anchor = plan.originNearRegion ? plan.userOrigin : null;
  const speed =
    plan.transport === 'car'
      ? 28
      : plan.transport === 'bike'
        ? 16
        : plan.transport === 'bus'
          ? 18
          : plan.transport === 'train'
            ? 35
            : 5;
  const minutesOf = (stop) => stop.minutes || 45;
  return {
    ...plan,
    stops,
    coordinates: buildRouteCoordinates(anchor, stops),
    totalKm: computeRouteTotalKm(anchor, stops),
    totalMinutes: Math.round(computeUsedMinutes(anchor, stops, speed, minutesOf)),
  };
}

function stopsSameOrder(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return false;
  return a.every((s, i) => s.id === b[i].id);
}

export default function RouteResultsPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const language = useSyncedAppLanguage(route, 'uk');
  const mapRef = useRef(null);
  const mapZoomRef = useRef(DEFAULT_MAP_ZOOM);
  const roadPolylineRef = useRef(null);
  const plan = route?.params?.routePlan;
  const { appTheme, isLight } = useAppTheme(route?.params?.appTheme, route);
  const [roadPolyline, setRoadPolyline] = useState(null);
  const [directionsBusy, setDirectionsBusy] = useState(false);
  const [userPos, setUserPos] = useState(null);
  const [roadDistanceM, setRoadDistanceM] = useState(null);
  const [walkOrigin, setWalkOrigin] = useState(() => coordFromWalkOrigin(route?.params?.walkOrigin));
  const [focusedStopId, setFocusedStopId] = useState(null);
  const [routeActionBusy, setRouteActionBusy] = useState(false);
  const [excludedStopIds, setExcludedStopIds] = useState([]);

  const includedStops = useMemo(() => {
    if (!plan?.stops?.length) return [];
    return plan.stops.filter((s) => !excludedStopIds.includes(s.id));
  }, [plan?.stops, excludedStopIds]);

  const displayPlan = useMemo(() => {
    if (!plan?.stops?.length) return plan;
    if (includedStops.length === plan.stops.length) return plan;
    if (!includedStops.length) return plan;
    return rebuildPlanWithStops(
      plan,
      includedStops.map((s, idx) => ({ ...s, order: idx + 1 })),
    );
  }, [plan, includedStops]);

  const routingPlan = displayPlan || plan;

  const toggleStopIncluded = useCallback(
    (stopId) => {
      if (!plan?.stops?.length) return;
      setExcludedStopIds((prev) => {
        if (prev.includes(stopId)) return prev.filter((id) => id !== stopId);
        const wouldRemain = plan.stops.filter((s) => !prev.includes(s.id) && s.id !== stopId);
        if (wouldRemain.length < 1) {
          Alert.alert('', rp(language, 'needOneStop'));
          return prev;
        }
        return [...prev, stopId];
      });
      if (focusedStopId === stopId) setFocusedStopId(null);
      setRoadPolyline(null);
      setRoadDistanceM(null);
    },
    [plan?.stops, language, focusedStopId],
  );

  useEffect(() => {
    setExcludedStopIds([]);
  }, [plan?.regionId, plan?.stops?.map((s) => s.id).join('|')]);

  useEffect(() => {
    roadPolylineRef.current = roadPolyline;
  }, [roadPolyline]);

  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const chrome = useMemo(
    () => ({
      panelBg: isLight ? '#FFFFFF' : '#222228',
      sheetBg: isLight ? '#FFFFFF' : '#1E1E24',
      panelBorder: isLight ? 'rgba(2,18,235,0.32)' : 'rgba(225,255,0,0.4)',
      fabBg: isLight ? '#FFFFFF' : '#222228',
      fabIcon: accent,
      fabBorder: isLight ? 'rgba(2,18,235,0.28)' : 'rgba(225,255,0,0.38)',
      title: isLight ? '#000000' : '#FFFFFF',
      muted: isLight ? '#333333' : '#D6D6D6',
      chipBg: isLight ? '#EEF2FF' : 'rgba(225,255,0,0.16)',
      chipBgActive: isLight ? '#DCE6FF' : 'rgba(225,255,0,0.24)',
      stopCardBg: isLight ? '#F6F8FD' : 'rgba(255,255,255,0.08)',
      hintBg: isLight ? '#FFFFFF' : '#222228',
      iconBtnBg: isLight ? '#FFFFFF' : '#2E2E34',
      iconBtnBorder: isLight ? 'rgba(2,18,235,0.24)' : 'rgba(225,255,0,0.36)',
      timelineLine: isLight ? 'rgba(2,18,235,0.32)' : 'rgba(225,255,0,0.36)',
      statIconBg: isLight ? 'rgba(2,18,235,0.16)' : 'rgba(225,255,0,0.22)',
      useGlass: false,
    }),
    [isLight, accent],
  );
  const goGradient = useMemo(
    () =>
      isLight
        ? ['#0212EB', '#0038FF']
        : ['#E1FF00', '#C8E600'],
    [isLight],
  );
  const textMain = chrome.title;
  const textMuted = chrome.muted;
  const tabBarClearance = lightTabBarOverlayBottomInset(insets.bottom, 8);
  const stopCount = plan?.stops?.length || 2;
  const proposalSheetHeight = useMemo(() => {
    const footerH = 168;
    const headerH = 40;
    const rowH = 58;
    const ideal = headerH + footerH + stopCount * rowH;
    return Math.min(Math.round(windowHeight * 0.52), Math.max(268, ideal));
  }, [stopCount, windowHeight]);
  const mapOverlayBottom = tabBarClearance + proposalSheetHeight + 10;
  const stopsScrollable = stopCount > 3;

  const lineCoords = useMemo(() => {
    const c = getDirectionsCoordinatesFromPlan(routingPlan, userPos, walkOrigin);
    if (!c?.length) return [];
    if (c.length >= 2) return c;
    return [
      c[0],
      {
        latitude: c[0].latitude + 0.003,
        longitude: c[0].longitude + 0.003,
      },
    ];
  }, [routingPlan, userPos, walkOrigin]);

  const drawCoords = useMemo(() => {
    if (roadPolyline && roadPolyline.length >= 2) return roadPolyline;
    return lineCoords;
  }, [roadPolyline, lineCoords]);

  useEffect(() => {
    if (!routingPlan?.stops?.length) return;
    let cancelled = false;
    setDirectionsBusy(true);
    setRoadPolyline(null);
    setRoadDistanceM(null);
    (async () => {
      const { path, distanceM } = await loadRoutePolylineFromPlan(routingPlan, userPos, walkOrigin);
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
  }, [routingPlan, userPos?.latitude, userPos?.longitude, walkOrigin?.latitude, walkOrigin?.longitude]);

  useEffect(() => {
    if (walkOrigin || !routingPlan?.stops?.length) return;
    if (userPos) {
      const origin = { lat: userPos.latitude, lng: userPos.longitude };
      if (isUserOriginNearRoute(origin, routingPlan.stops)) {
        setWalkOrigin({ latitude: userPos.latitude, longitude: userPos.longitude });
        return;
      }
    }
    setWalkOrigin({ latitude: routingPlan.stops[0].lat, longitude: routingPlan.stops[0].lng });
  }, [routingPlan?.stops, userPos?.latitude, userPos?.longitude, walkOrigin]);

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

  const fitPoints = useMemo(() => {
    const extras = [];
    if (walkOrigin) {
      extras.push(walkOrigin);
    } else if (userPos && routingPlan?.originNearRegion !== false) {
      const origin = { lat: userPos.latitude, lng: userPos.longitude };
      if (isUserOriginNearRoute(origin, routingPlan?.stops)) {
        extras.push({ latitude: userPos.latitude, longitude: userPos.longitude });
      }
    }
    return collectMapFitCoordinates({
      polyline: drawCoords,
      stops: routingPlan?.stops,
      extras,
    });
  }, [drawCoords, routingPlan?.stops, routingPlan?.originNearRegion, userPos, walkOrigin]);

  const fitMap = useCallback(() => {
    if (!mapRef.current || fitPoints.length < 1) return;
    mapRef.current.fitToCoordinates(fitPoints, {
      edgePadding: {
        top: insets.top + 88,
        right: 40,
        bottom: mapOverlayBottom + 24,
        left: 40,
      },
      animated: true,
    });
  }, [fitPoints, insets.top, mapOverlayBottom]);

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

  const zoomInMap = useCallback(() => {
    if (!mapRef.current) return;
    const next = Math.max(MIN_MAP_ZOOM, mapZoomRef.current / 1.5);
    mapZoomRef.current = next;
    const center =
      walkOrigin ||
      (userPos ? { latitude: userPos.latitude, longitude: userPos.longitude } : null) ||
      (plan?.stops?.[0] ? { latitude: plan.stops[0].lat, longitude: plan.stops[0].lng } : null);
    if (!center) return;
    mapRef.current.animateToRegion(
      {
        latitude: center.latitude,
        longitude: center.longitude,
        latitudeDelta: next,
        longitudeDelta: next,
      },
      280,
    );
  }, [walkOrigin, userPos, plan?.stops]);

  const zoomOutMap = useCallback(() => {
    if (!mapRef.current) return;
    const next = Math.min(MAX_MAP_ZOOM, mapZoomRef.current * 1.5);
    mapZoomRef.current = next;
    const center =
      walkOrigin ||
      (userPos ? { latitude: userPos.latitude, longitude: userPos.longitude } : null) ||
      (plan?.stops?.[0] ? { latitude: plan.stops[0].lat, longitude: plan.stops[0].lng } : null);
    if (!center) return;
    mapRef.current.animateToRegion(
      {
        latitude: center.latitude,
        longitude: center.longitude,
        latitudeDelta: next,
        longitudeDelta: next,
      },
      280,
    );
  }, [walkOrigin, userPos, plan?.stops]);

  const onRegionChangeComplete = useCallback((region) => {
    if (region?.latitudeDelta) mapZoomRef.current = region.latitudeDelta;
  }, []);

  const onShareRoute = useCallback(async () => {
    const coords = getDirectionsCoordinatesFromPlan(plan, userPos, walkOrigin);
    const url = buildGoogleMapsDirectionsUrl(coords, plan.transport || 'walk');
    const title = routeRegionTitle(language, plan);
    const stopList = (plan?.stops || []).map((s, idx) => `${idx + 1}. ${s.title}`).join('\n');
    const message = url ? `${title}\n${url}` : `${title}\n${stopList}`;
    try {
      await Share.share({
        message,
        url: Platform.OS === 'ios' && url ? url : undefined,
      });
    } catch {
      /* user dismissed */
    }
  }, [plan, language, userPos, walkOrigin]);

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
        routePlan: routingPlan,
        mapPolyline: poly && poly.length >= 2 ? poly : null,
        autoStartNav,
        walkOrigin: navWalkOrigin,
      };
    },
    [shell, routingPlan, navWalkOrigin],
  );

  const replaceWithPlan = useCallback(
    (nextPlan, variant) => {
      if (!nextPlan?.stops?.length) {
        Alert.alert('', rp(language, 'noStops'));
        return;
      }
      setFocusedStopId(null);
      navigation.replace('RouteResults', {
        ...route.params,
        ...shell,
        routePlan: nextPlan,
        routeVariant: variant,
        placeQuery: route.params?.placeQuery || '',
        hoursText: route.params?.hoursText || String(Math.max(1, Math.round((plan?.totalMinutes || 120) / 60))),
        budgetTier: route.params?.budgetTier || plan?.budgetTier || 'medium',
        interests: route.params?.interests || plan?.interests,
        freeOnly: !!(route.params?.freeOnly || plan?.freeOnly),
        transport: route.params?.transport || plan?.transport || 'walk',
      });
    },
    [navigation, route.params, shell, language, plan],
  );

  const onAnother = useCallback(async () => {
    if (!plan || routeActionBusy) return;
    const v = (route.params?.routeVariant || 0) + 1;
    setRouteActionBusy(true);
    setRoadPolyline(null);
    setRoadDistanceM(null);
    setFocusedStopId(null);
    try {
      const hours = parseHoursSafe(
        route.params?.hoursText || String(Math.max(1, Math.round((plan.totalMinutes || 120) / 60))),
      );
      const query = route.params?.placeQuery || routeRegionTitle(language, plan);
      const transport = route.params?.transport || plan.transport || 'walk';
      const tier = route.params?.budgetTier || (route.params?.freeOnly ? 'free' : 'medium');
      const interests = route.params?.interests || plan.interests;

      if (plan.aiGenerated) {
        const res = await postSuggestAiRoute({
          place: query,
          hours,
          transport,
          interests,
          budgetTier: tier,
          language,
          userOrigin: plan.userOrigin ? { lat: plan.userOrigin.lat, lng: plan.userOrigin.lng } : null,
        });
        if (res?.routePlan?.stops?.length) {
          const next = stopsSameOrder(res.routePlan.stops, plan.stops)
            ? rebuildPlanWithStops(res.routePlan, rotateRouteStops(res.routePlan.stops, v))
            : res.routePlan;
          replaceWithPlan(next, v);
          return;
        }
        Alert.alert('', rp(language, 'aiNoStops'));
        return;
      }

      if (plan.generatedFromLocations) {
        const fetchLimit = hours > 16 ? 500 : hours > 8 ? 300 : 160;
        const { rows } = await fetchPublishedLocations(fetchLimit);
        const nextPlan = buildPlanFromPublishedLocations({
          rows,
          query,
          hours,
          transport,
          language,
          interests,
          userOrigin: plan.userOrigin,
          budgetTier: tier,
          variant: v,
        });
        if (nextPlan?.stops?.length) {
          const next = stopsSameOrder(nextPlan.stops, plan.stops)
            ? rebuildPlanWithStops(nextPlan, rotateRouteStops(nextPlan.stops, v))
            : nextPlan;
          replaceWithPlan(next, v);
          return;
        }
        replaceWithPlan(rebuildPlanWithStops(plan, rotateRouteStops(plan.stops, v)), v);
        return;
      }

      let regionId =
        plan.regionId && !String(plan.regionId).startsWith('published:')
          ? plan.regionId
          : resolveRegionIdFromQuery(query);
      if (query) {
        const hits = await geocodeAddress(query, language);
        const hit = hits?.[0];
        if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) {
          regionId = resolveRegionIdFromOrigin({ lat: hit.lat, lng: hit.lng });
        }
      }
      let next = buildRoutePlan({
        regionId,
        query,
        hours,
        transport,
        budgetTier: tier,
        interests: interests || undefined,
        freeOnly: !!route.params?.freeOnly,
        variant: v,
        language,
        userOrigin: plan.userOrigin || null,
      });
      if (!next?.stops?.length) {
        Alert.alert('', rp(language, 'noStops'));
        return;
      }
      if (stopsSameOrder(next.stops, plan.stops)) {
        next = rebuildPlanWithStops(plan, rotateRouteStops(plan.stops, v));
        if (stopsSameOrder(next.stops, plan.stops) && v >= 2 && !plan.aiGenerated) {
          try {
            const res = await postSuggestAiRoute({
              place: query,
              hours,
              transport,
              interests,
              budgetTier: tier,
              language,
              userOrigin: plan.userOrigin ? { lat: plan.userOrigin.lat, lng: plan.userOrigin.lng } : null,
            });
            if (res?.routePlan?.stops?.length && !stopsSameOrder(res.routePlan.stops, plan.stops)) {
              replaceWithPlan(res.routePlan, v);
              return;
            }
          } catch {
            /* catalog fallback below */
          }
        }
      }
      replaceWithPlan(next, v);
    } catch (e) {
      if (__DEV__) console.warn('[onAnother]', e?.message);
      Alert.alert('', rp(language, 'aiFail'));
    } finally {
      setRouteActionBusy(false);
    }
  }, [plan, routeActionBusy, route.params, language, replaceWithPlan]);

  const effectiveKm = useMemo(() => {
    if (roadDistanceM != null && roadDistanceM > 0) return roadDistanceM / 1000;
    if (routingPlan?.totalKm > 0) return routingPlan.totalKm;
    if (walkOrigin && routingPlan?.stops?.[0]) {
      return haversineKm(
        { lat: walkOrigin.latitude, lng: walkOrigin.longitude },
        { lat: routingPlan.stops[0].lat, lng: routingPlan.stops[0].lng },
      );
    }
    if (routingPlan?.stops?.length >= 2) {
      let km = 0;
      for (let i = 1; i < routingPlan.stops.length; i += 1) {
        km += haversineKm(routingPlan.stops[i - 1], routingPlan.stops[i]);
      }
      return km;
    }
    return 0;
  }, [roadDistanceM, routingPlan?.totalKm, routingPlan?.stops, walkOrigin]);

  const kmDisplay = useMemo(() => {
    if (effectiveKm >= 1) return `${effectiveKm.toFixed(1)} ${rp(language, 'km')}`;
    return `${Math.round(effectiveKm * 1000)} ${rp(language, 'm')}`;
  }, [effectiveKm, language]);

  const onBookmark = useCallback(() => {
    if (!plan) return;
    void (async () => {
      await addSavedRoute(routingPlan, routeRegionTitle(language, routingPlan));
      void syncSavedRoutesToBackend();
      Alert.alert('', pf(language, 'routeSaved'));
    })();
  }, [plan, routingPlan, language]);

  const onChooseRoute = useCallback(() => {
    if (routeActionBusy || includedStops.length < 1) return;
    void (async () => {
      await addSavedRoute(routingPlan, routeRegionTitle(language, routingPlan));
      void syncSavedRoutesToBackend();
      if (!roadPolylineRef.current?.length && routingPlan?.stops?.length) {
        try {
          const { path } = await loadRoutePolylineFromPlan(routingPlan, userPos, walkOrigin);
          if (path?.length >= 2) roadPolylineRef.current = path;
        } catch {
          /* fallback straight segments */
        }
      }
      navigation.navigate('RouteNavigation', navParams(true));
    })();
  }, [routeActionBusy, includedStops.length, routingPlan, language, navigation, navParams, userPos, walkOrigin]);

  if (!plan?.stops?.length) {
    return (
      <View style={[styles.fallback, { paddingTop: insets.top, backgroundColor: isLight ? LIGHT_BG : '#0A0A0A' }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backAbs}>
          <Ionicons name="chevron-back" size={28} color={textMain} />
        </Pressable>
        <Text style={[styles.fallbackText, { color: textMuted }]}>{rp(language, 'noStops')}</Text>
      </View>
    );
  }

  const demoRegion = getRegion(plan.regionId);
  const mapInitial = resolveRouteMapRegion(routingPlan, demoRegion?.center);
  const durFmt =
    language === 'uk'
      ? formatDurationUk(routingPlan?.totalMinutes || 0)
      : formatDurationEn(routingPlan?.totalMinutes || 0);

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' && getGoogleMapsApiKey() ? PROVIDER_GOOGLE : undefined}
        initialRegion={mapInitial}
        onMapReady={fitMap}
        onPress={onMapPress}
        scrollEnabled
        zoomEnabled
        zoomTapEnabled
        pitchEnabled={false}
        rotateEnabled={false}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation={!walkOrigin}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        toolbarEnabled={false}
        loadingEnabled={false}
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
        {plan.stops.map((s) => {
          const isExcluded = excludedStopIds.includes(s.id);
          return (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.lat, longitude: s.lng }}
            title={s.title}
            onPress={() => !isExcluded && onStopMarkerPress(s)}
            zIndex={isExcluded ? 0 : focusedStopId === s.id ? 10 : s.order}
          >
            <View style={[styles.markerOuter, isExcluded && { opacity: 0.35 }]}>
              <View
                style={[
                  styles.markerWrap,
                  focusedStopId === s.id && { borderColor: accent, borderWidth: 3 },
                ]}
              >
                <Image source={routeStopImageSource(s.thumb)} style={styles.markerImg} resizeMode="cover" />
              </View>
              <View style={[styles.markerBadge, { backgroundColor: accent }]}>
                <Text style={[styles.markerBadgeText, { color: onAccentButtonText(isLight) }]}>{s.order}</Text>
              </View>
            </View>
          </Marker>
          );
        })}
      </MapView>

      <View style={styles.uiLayer} pointerEvents="box-none" collapsable={false}>
      <LinearGradient
        pointerEvents="none"
        colors={
          isLight
            ? ['transparent', 'rgba(255,255,255,0.55)', '#FFFFFF']
            : ['transparent', 'rgba(10,10,10,0.55)', '#0A0A0A']
        }
        locations={isLight ? [0, 0.45, 1] : [0, 0.5, 1]}
        style={[styles.mapFade, { bottom: 0, height: mapOverlayBottom + 20 }]}
      />

      {directionsBusy ? (
        <View style={[styles.directionsBadge, { top: insets.top + 64, borderColor: chrome.panelBorder }]}>
          {Platform.OS === 'ios' && chrome.useGlass ? (
            <BlurView intensity={72} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
          ) : null}
          <View style={[styles.directionsBadgeTint, { backgroundColor: chrome.hintBg }]} pointerEvents="none" />
          <ActivityIndicator size="small" color={accent} style={{ marginRight: 8 }} />
          <Text style={[styles.directionsBadgeText, brandFontSansSemibold, { color: textMain }]}>
            {rp(language, 'loadingRoutePath')}
          </Text>
        </View>
      ) : null}

      <View pointerEvents="box-none" style={[styles.topChrome, { paddingTop: insets.top + 6 }]}>
        <View
          style={[
            styles.headerBar,
            {
              borderColor: chrome.panelBorder,
              backgroundColor: chrome.panelBg,
              ...Platform.select({
                ios: {
                  shadowOpacity: isLight ? 0.18 : 0.35,
                },
                android: { elevation: 10 },
              }),
            },
          ]}
        >
          {Platform.OS === 'ios' && chrome.useGlass ? (
            <BlurView intensity={76} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
          ) : null}
          <View style={[styles.headerBarTint, { backgroundColor: chrome.panelBg }]} pointerEvents="none" />
          <View style={[styles.headerBarRow, { backgroundColor: chrome.panelBg }]}>
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={12}
              delayPressIn={0}
              style={({ pressed }) => [
                styles.headerCircleBtn,
                {
                  backgroundColor: chrome.iconBtnBg,
                  borderColor: chrome.iconBtnBorder,
                  borderWidth: 1,
                },
                pressed && { opacity: 0.82 },
              ]}
            >
              <Ionicons name="chevron-back" size={22} color={textMain} />
            </Pressable>
            <View style={[styles.headerTitleWrap, { backgroundColor: chrome.panelBg }]}>
              <Text style={[styles.headerTitle, brandFontSansBold, { color: textMain }]} numberOfLines={1}>
                {plan.flag} {routeRegionTitle(language, plan)}
              </Text>
              <Text style={[styles.headerSubtitle, brandFontSansSemibold, { color: textMuted }]} numberOfLines={1}>
                {includedStops.length} {rp(language, 'locations')} · {durFmt}
              </Text>
            </View>
            <Pressable
              hitSlop={12}
              delayPressIn={0}
              style={({ pressed }) => [
                styles.headerCircleBtn,
                {
                  backgroundColor: chrome.iconBtnBg,
                  borderColor: chrome.iconBtnBorder,
                  borderWidth: 1,
                },
                pressed && { opacity: 0.82 },
              ]}
              onPress={onShareRoute}
            >
              <Ionicons name="share-outline" size={19} color={textMain} />
            </Pressable>
            <Pressable
              hitSlop={12}
              delayPressIn={0}
              style={({ pressed }) => [
                styles.headerCircleBtn,
                {
                  backgroundColor: chrome.iconBtnBg,
                  borderColor: chrome.iconBtnBorder,
                  borderWidth: 1,
                },
                pressed && { opacity: 0.82 },
              ]}
              onPress={onBookmark}
            >
              <Ionicons name="bookmark-outline" size={20} color={textMain} />
            </Pressable>
          </View>
        </View>
      </View>

      <Pressable
        style={[
          styles.mapFab,
          styles.mapFabZoomOut,
          {
            backgroundColor: chrome.fabBg,
            borderColor: chrome.fabBorder,
            bottom: mapOverlayBottom + 12,
          },
        ]}
        onPress={zoomOutMap}
        delayPressIn={0}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={rp(language, 'zoomOutMap')}
      >
        <Ionicons name="remove" size={22} color={chrome.fabIcon} />
      </Pressable>

      <Pressable
        style={[
          styles.mapFab,
          styles.mapFabZoomIn,
          {
            backgroundColor: chrome.fabBg,
            borderColor: chrome.fabBorder,
            bottom: mapOverlayBottom + 68,
          },
        ]}
        onPress={zoomInMap}
        delayPressIn={0}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={rp(language, 'zoomInMap')}
      >
        <Ionicons name="add" size={22} color={chrome.fabIcon} />
      </Pressable>

      <Pressable
        style={[
          styles.mapFab,
          styles.mapFabLeft,
          {
            backgroundColor: chrome.fabBg,
            borderColor: chrome.fabBorder,
            bottom: mapOverlayBottom + 12,
          },
        ]}
        onPress={centerOnUser}
        delayPressIn={0}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={rp(language, 'recenterMap')}
      >
        <Ionicons name="locate" size={22} color={chrome.fabIcon} />
      </Pressable>

      <Pressable
        style={[
          styles.mapFab,
          styles.mapFabLeft,
          {
            backgroundColor: chrome.fabBg,
            borderColor: chrome.fabBorder,
            bottom: mapOverlayBottom + 68,
          },
        ]}
        onPress={fitMap}
        delayPressIn={0}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={rp(language, 'fitFullRoute')}
      >
        <Ionicons name="scan-outline" size={20} color={chrome.fabIcon} />
      </Pressable>

      </View>

      <View
        pointerEvents="box-none"
        style={[
          styles.proposalSheetWrap,
          { bottom: tabBarClearance + 6, height: proposalSheetHeight },
        ]}
        collapsable={false}
      >
        <View
          style={[
            styles.sheet,
            styles.proposalSheet,
            {
              borderColor: chrome.panelBorder,
              backgroundColor: chrome.sheetBg,
            },
            isLight ? styles.sheetLightShadow : styles.sheetDarkShadow,
          ]}
          collapsable={false}
        >
          <View style={[styles.sheetTint, { backgroundColor: chrome.sheetBg }]} pointerEvents="none" />
          <View style={styles.sheetInner}>
            <View style={[styles.sheetHandle, { backgroundColor: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.22)' }]} />

            {!plan.originNearRegion && !walkOrigin ? (
              <View style={[styles.hintBanner, { backgroundColor: chrome.chipBg }]}>
                <Ionicons name="information-circle-outline" size={16} color={accent} />
                <Text style={[styles.hintBannerText, brandFontSansMedium, { color: textMuted }]}>
                  {rp(language, 'farFromCityHint')}
                </Text>
              </View>
            ) : null}

            {stopsScrollable ? (
              <Text style={[styles.scrollStopsHint, brandFontSansMedium, { color: textMuted }]}>
                {rp(language, 'scrollStopsHint')}
              </Text>
            ) : null}

            <ScrollView
              style={styles.stopsScroll}
              contentContainerStyle={styles.stopsTimeline}
              showsVerticalScrollIndicator
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {plan.stops.map((s, idx) => {
                const isLast = idx === plan.stops.length - 1;
                const isExcluded = excludedStopIds.includes(s.id);
                const isFocused = !isExcluded && (focusedStopId === s.id || (!focusedStopId && idx === 0 && !excludedStopIds.includes(plan.stops[0]?.id)));
                return (
                  <View key={s.id} style={[styles.timelineRow, isExcluded && { opacity: 0.48 }]}>
                  <Pressable
                    onPress={() => !isExcluded && onStopMarkerPress(s)}
                    disabled={isExcluded}
                    delayPressIn={0}
                    style={({ pressed }) => [styles.timelineRowInner, pressed && !isExcluded && { opacity: 0.9 }]}
                  >
                    <View style={styles.timelineRail}>
                      <View
                        style={[
                          styles.timelineDot,
                          {
                            backgroundColor: isFocused ? accent : isLight ? '#FFFFFF' : chrome.chipBg,
                            borderColor: accent,
                            borderWidth: isFocused ? 0 : 2,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.timelineDotText,
                            brandFontSansBold,
                            { color: isFocused ? onAccentButtonText(isLight) : accent },
                          ]}
                        >
                          {s.order}
                        </Text>
                      </View>
                      {!isLast ? (
                        <View style={[styles.timelineLine, { backgroundColor: chrome.timelineLine }]} />
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.stopCard,
                        {
                          backgroundColor: isFocused ? chrome.chipBgActive : chrome.stopCardBg,
                          borderColor: chrome.panelBorder,
                        },
                      ]}
                    >
                      <Image source={routeStopImageSource(s.thumb)} style={styles.stopThumb} resizeMode="cover" />
                      <View style={styles.stopBody}>
                        <Text
                          style={[
                            styles.stopTitle,
                            brandFontSansBold,
                            { color: textMain },
                            isFocused && styles.stopTitleFocused,
                            isExcluded && styles.stopTitleExcluded,
                          ]}
                          numberOfLines={2}
                        >
                          {s.title}
                        </Text>
                        <View style={styles.stopMetaRow}>
                          {isExcluded ? (
                            <Text style={[styles.stopMeta, brandFontSansMedium, { color: textMuted }]}>
                              {rp(language, 'stopSkipped')}
                            </Text>
                          ) : (
                            <>
                              <Ionicons name="time-outline" size={13} color={accent} />
                              <Text style={[styles.stopMeta, brandFontSansMedium, { color: textMuted }]}>
                                {s.minutes} {rp(language, 'minShort')}
                              </Text>
                            </>
                          )}
                        </View>
                      </View>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => toggleStopIncluded(s.id)}
                    hitSlop={8}
                    style={[styles.stopSkipBtn, { backgroundColor: isExcluded ? chrome.chipBgActive : chrome.chipBg, borderColor: chrome.panelBorder }]}
                    accessibilityRole="button"
                    accessibilityLabel={isExcluded ? rp(language, 'restoreStop') : rp(language, 'skipStop')}
                  >
                    <Ionicons
                      name={isExcluded ? 'arrow-undo-outline' : 'close-circle-outline'}
                      size={20}
                      color={isExcluded ? accent : textMuted}
                    />
                  </Pressable>
                  </View>
                );
              })}
            </ScrollView>

            <View style={[styles.statsBar, { backgroundColor: chrome.chipBg, borderColor: chrome.panelBorder }]}>
              <View style={styles.statsBarItem}>
                <Ionicons name="time-outline" size={14} color={accent} />
                <Text style={[styles.statsBarText, brandFontSansSemibold, { color: textMain }]}>{durFmt}</Text>
              </View>
              <View style={[styles.statsBarDivider, { backgroundColor: chrome.panelBorder }]} />
              <View style={styles.statsBarItem}>
                <Ionicons name={transportIcon(plan.transport)} size={14} color={accent} />
                <Text style={[styles.statsBarText, brandFontSansSemibold, { color: textMain }]}>{kmDisplay}</Text>
              </View>
              <View style={[styles.statsBarDivider, { backgroundColor: chrome.panelBorder }]} />
              <View style={styles.statsBarItem}>
                <Ionicons name="location-outline" size={14} color={accent} />
                <Text style={[styles.statsBarText, brandFontSansSemibold, { color: textMain }]}>
                  {includedStops.length} {rp(language, 'locations')}
                </Text>
              </View>
            </View>

            {!getGoogleMapsApiKey() ? (
              <Text style={[styles.keyHint, brandFontSansMedium, { color: textMuted }]}>{rp(language, 'addMapsKeyHint')}</Text>
            ) : null}

            <View style={styles.actionsPrimary}>
              <Pressable
                onPress={onAnother}
                disabled={routeActionBusy}
                delayPressIn={0}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.btnAnother,
                  {
                    borderColor: chrome.panelBorder,
                    backgroundColor: isLight ? '#FFFFFF' : chrome.chipBg,
                    opacity: routeActionBusy ? 0.6 : pressed ? 0.88 : 1,
                  },
                ]}
                android_ripple={ripple}
              >
                {routeActionBusy ? (
                  <ActivityIndicator size="small" color={accent} style={{ marginRight: 6 }} />
                ) : (
                  <Ionicons name="shuffle-outline" size={18} color={accent} style={{ marginRight: 6 }} />
                )}
                <Text style={[styles.btnAnotherText, brandFontSansBold, { color: textMain }]} numberOfLines={1}>
                  {rp(language, 'anotherRoute')}
                </Text>
              </Pressable>
              <Pressable
                onPress={onChooseRoute}
                disabled={routeActionBusy || includedStops.length < 1}
                delayPressIn={0}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.btnChooseOuter,
                  routeActionBusy && { opacity: 0.6 },
                  pressed && !routeActionBusy && { opacity: 0.92 },
                ]}
                android_ripple={ripple}
              >
                <LinearGradient
                  colors={goGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.btnChooseGrad}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color={onAccentButtonText(isLight)} />
                  <Text style={[styles.btnChooseText, brandFontSansBold, { color: onAccentButtonText(isLight) }]}>
                    {rp(language, 'chooseRoute')}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' },
  uiLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  fallback: { flex: 1, justifyContent: 'center', padding: 24 },
  fallbackText: { fontSize: 16, textAlign: 'center' },
  backAbs: { position: 'absolute', left: 12, top: 48 },
  mapFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
  },
  topChrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 30,
    paddingHorizontal: 14,
  },
  headerBar: {
    borderRadius: 22,
    borderWidth: 1.5,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  headerBarTint: { ...StyleSheet.absoluteFillObject },
  headerBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
    zIndex: 1,
  },
  headerCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1, minWidth: 0, paddingHorizontal: 6, paddingVertical: 2 },
  headerTitle: { fontSize: 17, lineHeight: 21 },
  headerSubtitle: { fontSize: 13, marginTop: 2, lineHeight: 17 },
  directionsBadge: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 25,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  directionsBadgeTint: { ...StyleSheet.absoluteFillObject },
  directionsBadgeText: { fontSize: 13, flex: 1, zIndex: 1 },
  mapFab: {
    position: 'absolute',
    right: 14,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    zIndex: 28,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  mapFabWalk: {
    position: 'absolute',
    right: 14,
    width: 54,
    height: 54,
    borderRadius: 27,
    zIndex: 29,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  mapFabWalkGrad: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapFabLeft: {
    right: undefined,
    left: 14,
  },
  mapFabZoomIn: {},
  mapFabZoomOut: {},
  mapHint: {
    position: 'absolute',
    left: 14,
    right: 78,
    zIndex: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  mapHintTint: { ...StyleSheet.absoluteFillObject },
  mapHintText: { flex: 1, fontSize: 12, lineHeight: 16, zIndex: 1 },
  goWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 50,
  },
  goBtnOuter: {
    borderRadius: 999,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.24,
        shadowRadius: 18,
      },
      android: { elevation: 10 },
    }),
  },
  goBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 58,
  },
  goIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  goTextCol: { flex: 1 },
  goTitle: { fontSize: 17, lineHeight: 21 },
  goSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  sheetWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 45,
    minHeight: 200,
  },
  proposalSheetWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 200,
  },
  proposalSheet: {
    flex: 1,
    borderRadius: 24,
  },
  sheetTitle: {
    fontSize: 16,
    lineHeight: 20,
    marginBottom: 4,
  },
  sheetHint: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  sheet: {
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  sheetLightShadow: Platform.select({
    ios: {
      shadowColor: '#0212EB',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.16,
      shadowRadius: 22,
    },
    android: { elevation: 10 },
  }),
  sheetDarkShadow: Platform.select({
    ios: {
      shadowColor: '#E1FF00',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.14,
      shadowRadius: 22,
    },
    android: { elevation: 10 },
  }),
  sheetTint: { ...StyleSheet.absoluteFillObject },
  sheetInner: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 12,
    zIndex: 1,
  },
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
  stopsScroll: {
    flex: 1,
    marginBottom: 8,
  },
  scrollStopsHint: {
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
    marginBottom: 6,
  },
  stopsTimeline: {
    paddingBottom: 4,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  timelineRowInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stopSkipBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    marginTop: 10,
  },
  timelineRail: {
    width: 24,
    alignItems: 'center',
    marginRight: 6,
    paddingTop: 12,
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  timelineDotText: { fontSize: 11, lineHeight: 13 },
  timelineLine: {
    width: 2,
    height: 28,
    marginTop: 3,
    borderRadius: 1,
  },
  stopCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 6,
    marginBottom: 4,
  },
  stopThumb: {
    width: 44,
    height: 44,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: '#E8E8E8',
  },
  stopBody: { flex: 1, minWidth: 0 },
  stopTitle: { fontSize: 13, lineHeight: 17 },
  stopTitleFocused: { fontSize: 14, lineHeight: 18 },
  stopTitleExcluded: { textDecorationLine: 'line-through' },
  stopMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  stopMeta: { fontSize: 12, lineHeight: 16 },
  keyHint: { fontSize: 11, lineHeight: 15, marginBottom: 8, textAlign: 'center' },
  markerOuter: { alignItems: 'center' },
  markerWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 3,
    borderColor: '#FFF',
    overflow: 'hidden',
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
  markerBadge: {
    position: 'absolute',
    bottom: -2,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  markerBadgeText: { fontSize: 10, fontWeight: '800', lineHeight: 12 },
  markerImg: { width: '100%', height: '100%' },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  statsBarItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 0,
  },
  statsBarText: { fontSize: 12, lineHeight: 16 },
  statsBarDivider: { width: 1, height: 18, opacity: 0.65 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 0,
  },
  statIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statChipText: { fontSize: 11, flexShrink: 1 },
  actionsPrimary: { flexDirection: 'row', gap: 8, marginTop: 2 },
  btnAnother: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 10,
    minHeight: 46,
  },
  btnAnotherText: { fontSize: 13, textAlign: 'center' },
  btnChooseOuter: {
    flex: 1.15,
    borderRadius: 999,
    overflow: 'hidden',
    minHeight: 46,
  },
  btnChooseGrad: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    paddingHorizontal: 10,
    minHeight: 46,
  },
  btnChooseText: { fontSize: 14 },
  actionsSecondary: { flexDirection: 'row', gap: 8 },
  btnOutline: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineFull: { flex: 1 },
  btnOutlineText: { fontSize: 13, textAlign: 'center' },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  hintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 10,
  },
  hintBannerText: { flex: 1, fontSize: 12, lineHeight: 16 },
});
