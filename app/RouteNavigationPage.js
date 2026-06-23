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
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { getRegion } from './routeRegionsData';
import {
  buildLandmarkResultParamsForRouteStop,
  distanceToStopMeters,
} from './routeLandmarkNavigation';
import {
  isWithinPhysicalVisitRadiusMeters,
  PHYSICAL_VISIT_RADIUS_M,
} from './landmarkProximity';
import { PHYSICAL_VISIT_XP } from './physicalVisitRewards';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { rp } from './routePlannerI18n';
import { pf } from './profileI18n';
import { routeRegionTitle, routeCountryTitle } from './routePlanTitles';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { getAppTheme, resolveAppTheme } from './themeStorage';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { routeStopImageSource } from './routeStopThumb';
import {
  loadRoutePolylineFromPlan,
  buildGoogleMapsDirectionsUrl,
  fetchGoogleDirectionsPolyline,
  getGoogleMapsApiKey,
  getDirectionsCoordinatesFromPlan,
  distanceMetersToPolyline,
  collectMapFitCoordinates,
  coordFromWalkOrigin,
  buildFallbackDirectionSteps,
} from './googleMapsRoute';
import {
  RouteMapPath,
  resolveActiveNavigationStep,
  formatTurnInstruction,
  turnIconForManeuver,
} from './routeMapPath';
import { computeBearingDegrees, estimateMinutesForKm } from './routePlannerCore';
import { RenderProfiler } from './performanceMetrics';
import { updateRouteCompletionProgress, getProgressToNextLevel, LEVEL_THRESHOLDS } from './gamificationEngine';
import { LevelUpNotification, AchievementCard } from './GamificationUI';
import { authStore } from './auth/authStore';

const LIGHT_BG = '#F2F2EA';
const WALK_TRANSPORT = 'walk';
const OFF_ROUTE_THRESHOLD_M = 45;
const REROUTE_COOLDOWN_MS = 12000;

export default function RouteNavigationPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const plan = route?.params?.routePlan;
  const mapPolylineParam = route?.params?.mapPolyline;
  const mapRef = useRef(null);
  const [appTheme, setAppTheme] = useState(resolveAppTheme(route?.params?.appTheme));
  const [navActive, setNavActive] = useState(route?.params?.autoStartNav === true);
  const [userPos, setUserPos] = useState(null);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [visitedStopIds, setVisitedStopIds] = useState([]);
  const [sessionXpEarned, setSessionXpEarned] = useState(0);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpData, setLevelUpData] = useState(null);
  const [newAchievements, setNewAchievements] = useState([]);
  const autoOpenedStopIdRef = useRef(null);
  const pendingAdvanceRef = useRef(false);
  const routeCompleteShownRef = useRef(false);
  const [roadPolyline, setRoadPolyline] = useState(
    Array.isArray(mapPolylineParam) && mapPolylineParam.length >= 2 ? mapPolylineParam : null,
  );
  const [legPolyline, setLegPolyline] = useState(null);
  const [legSteps, setLegSteps] = useState([]);
  const [legDurationSec, setLegDurationSec] = useState(null);
  const [legBusy, setLegBusy] = useState(false);
  const [polyBusy, setPolyBusy] = useState(!mapPolylineParam);
  const [followUser, setFollowUser] = useState(true);
  const lastRerouteAtRef = useRef(0);
  const legFetchIdRef = useRef(0);
  const [simulatedPos, setSimulatedPos] = useState(() => coordFromWalkOrigin(route?.params?.walkOrigin));

  const navigationPos = useMemo(() => {
    if (simulatedPos) return simulatedPos;
    if (userPos) return { latitude: userPos.latitude, longitude: userPos.longitude };
    return null;
  }, [simulatedPos, userPos]);

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
      const { path } = await loadRoutePolylineFromPlan(plan, userPos, simulatedPos);
      if (!cancelled && path?.length >= 2) setRoadPolyline(path);
    })().finally(() => {
      if (!cancelled) setPolyBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [plan, roadPolyline, userPos?.latitude, userPos?.longitude, simulatedPos?.latitude, simulatedPos?.longitude]);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const screenBg = isLight ? LIGHT_BG : '#0A0A0A';
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const sheetBg = isLight ? '#FFF' : '#1A1A1A';
  const topBarBg = isLight ? 'rgba(242,242,234,0.95)' : 'rgba(10,10,10,0.92)';
  const textMuted = isLight ? '#5C5C5C' : '#A8A8A8';

  const activeStop = plan?.stops?.[currentStopIndex] || plan?.stops?.[0];
  const totalStops = plan?.stops?.length || 0;
  const demoRegion = plan ? getRegion(plan.regionId) : null;
  const mapRegion =
    plan?.mapRegion ||
    demoRegion?.center ||
    (activeStop
      ? {
          latitude: activeStop.lat,
          longitude: activeStop.lng,
          latitudeDelta: 0.09,
          longitudeDelta: 0.09,
        }
      : null);

  const lineCoords = useMemo(() => {
    const c = getDirectionsCoordinatesFromPlan(plan, userPos, simulatedPos);
    if (!c?.length) return [];
    if (c.length >= 2) return c;
    return [
      c[0],
      {
        latitude: c[0].latitude + 0.003,
        longitude: c[0].longitude + 0.003,
      },
    ];
  }, [plan, userPos, simulatedPos]);

  const drawCoords = useMemo(() => {
    if (navActive && legPolyline?.length >= 2) return legPolyline;
    if (roadPolyline && roadPolyline.length >= 2) return roadPolyline;
    return lineCoords;
  }, [navActive, legPolyline, roadPolyline, lineCoords]);

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
    if (!plan || !activeStop) return '';
    const country = routeCountryTitle(language, plan);
    return `${country} — ${activeStop.title}`;
  }, [plan, activeStop, language]);

  const walkMin = plan
    ? legDurationSec != null
      ? Math.max(1, Math.round(legDurationSec / 60))
      : Math.max(5, Math.round((plan.totalKm / 5) * 60))
    : 0;

  const fetchWalkingLeg = useCallback(
    async (from, { silent = false } = {}) => {
      if (!from || !activeStop) return;
      const fetchId = ++legFetchIdRef.current;
      const to = { latitude: activeStop.lat, longitude: activeStop.lng };
      const fallback = [from, to];
      if (!silent) setLegBusy(true);
      try {
        const key = getGoogleMapsApiKey();
        if (key) {
          const { path, durationSec, steps } = await fetchGoogleDirectionsPolyline(
            fallback,
            WALK_TRANSPORT,
            key,
          );
          if (fetchId !== legFetchIdRef.current) return;
          if (path?.length >= 2) {
            setLegPolyline(path);
            setLegSteps(steps?.length ? steps : buildFallbackDirectionSteps(from, to));
            setLegDurationSec(durationSec || null);
            lastRerouteAtRef.current = Date.now();
            return;
          }
        }
        if (fetchId === legFetchIdRef.current) {
          setLegPolyline(fallback);
          setLegSteps(buildFallbackDirectionSteps(from, to));
          setLegDurationSec(null);
          lastRerouteAtRef.current = Date.now();
        }
      } finally {
        if (fetchId === legFetchIdRef.current && !silent) setLegBusy(false);
      }
    },
    [activeStop],
  );

  const distToHistoryM = useMemo(() => {
    if (!navActive || !navigationPos || !activeStop) return null;
    return distanceToStopMeters(navigationPos, activeStop);
  }, [navActive, navigationPos, activeStop]);

  const bearingToStop = useMemo(() => {
    if (!navigationPos || !activeStop) return null;
    return computeBearingDegrees(navigationPos, { latitude: activeStop.lat, longitude: activeStop.lng });
  }, [navigationPos, activeStop]);

  const etaMinToStop = useMemo(() => {
    if (legDurationSec != null && navActive) {
      return Math.max(1, Math.round(legDurationSec / 60));
    }
    if (distToHistoryM == null) return null;
    return estimateMinutesForKm(distToHistoryM / 1000, WALK_TRANSPORT);
  }, [distToHistoryM, legDurationSec, navActive]);

  const withinHistory = isWithinPhysicalVisitRadiusMeters(distToHistoryM);

  const activeNavStep = useMemo(() => {
    if (!navActive || !legSteps.length) return null;
    return resolveActiveNavigationStep(legSteps, navigationPos);
  }, [navActive, legSteps, navigationPos]);

  const turnInstruction = useMemo(() => {
    if (!navActive || !activeNavStep) return '';
    return formatTurnInstruction(activeNavStep, language, navigationPos);
  }, [navActive, activeNavStep, language, navigationPos]);

  const navWaypoint = useMemo(() => {
    if (!navActive || !activeNavStep?.end) return null;
    return activeNavStep.end;
  }, [navActive, activeNavStep]);

  useEffect(() => {
    if (!navActive || !activeStop || !plan) {
      setLegPolyline(null);
      setLegSteps([]);
      setLegDurationSec(null);
      return undefined;
    }
    const from = navigationPos
      ? { latitude: navigationPos.latitude, longitude: navigationPos.longitude }
      : currentStopIndex > 0
        ? {
            latitude: plan.stops[currentStopIndex - 1].lat,
            longitude: plan.stops[currentStopIndex - 1].lng,
          }
        : null;
    if (!from) return undefined;
    fetchWalkingLeg(from);
    return () => {
      legFetchIdRef.current += 1;
    };
  }, [navActive, activeStop?.id, currentStopIndex, plan, fetchWalkingLeg]);

  useEffect(() => {
    if (!navActive || !navigationPos || !activeStop || legPolyline?.length >= 2) return;
    fetchWalkingLeg({ latitude: navigationPos.latitude, longitude: navigationPos.longitude });
  }, [navActive, navigationPos?.latitude, navigationPos?.longitude, activeStop?.id, legPolyline, fetchWalkingLeg]);

  useEffect(() => {
    if (!navActive || !navigationPos || !legPolyline?.length || legBusy) return;
    const now = Date.now();
    if (now - lastRerouteAtRef.current < REROUTE_COOLDOWN_MS) return;
    const distM = distanceMetersToPolyline(
      { latitude: navigationPos.latitude, longitude: navigationPos.longitude },
      legPolyline,
    );
    if (distM == null || distM <= OFF_ROUTE_THRESHOLD_M) return;
    fetchWalkingLeg(
      { latitude: navigationPos.latitude, longitude: navigationPos.longitude },
      { silent: true },
    );
  }, [navActive, navigationPos?.latitude, navigationPos?.longitude, legPolyline, legBusy, fetchWalkingLeg]);

  const fitPoints = useMemo(
    () =>
      collectMapFitCoordinates({
        polyline: drawCoords,
        stops: plan?.stops,
        extras: [navigationPos],
      }),
    [drawCoords, plan?.stops, navigationPos],
  );

  const fitMap = useCallback(() => {
    if (!mapRef.current || fitPoints.length < 1) return;
    mapRef.current.fitToCoordinates(fitPoints, {
      edgePadding: { top: 70, right: 36, bottom: navActive ? 200 : 160, left: 36 },
      animated: true,
    });
  }, [fitPoints, navActive]);

  useEffect(() => {
    const t = setTimeout(fitMap, 350);
    return () => clearTimeout(t);
  }, [fitMap]);

  useEffect(() => {
    let sub;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
          maximumAge: 15000,
        });
        if (!cancelled) setUserPos(pos.coords);
      } catch {
        /* optional */
      }
      const watchOpts = navActive
        ? { accuracy: Location.Accuracy.High, distanceInterval: 4, timeInterval: 1500 }
        : { accuracy: Location.Accuracy.Balanced, distanceInterval: 8, timeInterval: 2500 };
      sub = await Location.watchPositionAsync(watchOpts, (loc) => {
        if (!cancelled) setUserPos(loc.coords);
      });
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [navActive]);

  useEffect(() => {
    if (!navActive || !navigationPos || !mapRef.current || !followUser) return;
    mapRef.current.animateToRegion(
      {
        latitude: navigationPos.latitude,
        longitude: navigationPos.longitude,
        latitudeDelta: 0.018,
        longitudeDelta: 0.018,
      },
      450,
    );
  }, [navActive, navigationPos?.latitude, navigationPos?.longitude, followUser]);

  const centerOnUser = useCallback(async () => {
    setFollowUser(true);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (!mapRef.current) return;
    const pos = navigationPos
      ? navigationPos
      : status === 'granted'
        ? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then((p) => ({
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
          }))
        : null;
    if (!pos) return;
    mapRef.current.animateToRegion(
      {
        latitude: pos.latitude,
        longitude: pos.longitude,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      },
      400,
    );
  }, [navigationPos]);

  const onMapPress = useCallback(
    (e) => {
      const coord = e.nativeEvent?.coordinate;
      if (!coord) return;
      setSimulatedPos({ latitude: coord.latitude, longitude: coord.longitude });
      setFollowUser(true);
      if (!navActive) setNavActive(true);
      legFetchIdRef.current += 1;
      setLegPolyline(null);
      setLegSteps([]);
      setLegDurationSec(null);
    },
    [navActive],
  );

  const onStopMarkerPress = useCallback(
    (stop) => {
      const idx = plan?.stops?.findIndex((s) => s.id === stop.id);
      if (idx >= 0) {
        setCurrentStopIndex(idx);
        autoOpenedStopIdRef.current = null;
        legFetchIdRef.current += 1;
        setLegPolyline(null);
        setLegSteps([]);
        setLegDurationSec(null);
      }
    },
    [plan?.stops],
  );

  const onMenu = useCallback(() => {
    Alert.alert(
      rp(language, 'navActions'),
      undefined,
      [
        {
          text: rp(language, 'shareRoute'),
          onPress: async () => {
            const coords = getDirectionsCoordinatesFromPlan(plan, userPos, simulatedPos);
            const url = buildGoogleMapsDirectionsUrl(coords, WALK_TRANSPORT);
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
  }, [language, plan, headerTitle, userPos, simulatedPos]);

  const onStartNav = useCallback(() => {
    setFollowUser(true);
    setNavActive(true);
  }, []);

  const markStopVisited = useCallback(
    (stopId) => {
      if (!stopId) return;
      setVisitedStopIds((prev) => {
        if (prev.includes(stopId)) return prev;
        setSessionXpEarned((xp) => xp + PHYSICAL_VISIT_XP);
        return [...prev, stopId];
      });
    },
    [],
  );

  const advanceToNextStop = useCallback(() => {
    if (!plan?.stops?.length) return;
    setCurrentStopIndex((idx) => {
      const next = Math.min(idx + 1, plan.stops.length - 1);
      return next;
    });
    autoOpenedStopIdRef.current = null;
  }, [plan?.stops?.length]);

  const showRouteCompleteIfDone = useCallback(() => {
    if (!plan?.stops?.length || routeCompleteShownRef.current) return;
    const allVisited = plan.stops.every((s) => visitedStopIds.includes(s.id));
    if (!allVisited) return;
    
    routeCompleteShownRef.current = true;
    
    // ⚡ Запускаємо гейміфікацію в фоні (не блокуємо UI)
    void (async () => {
      try {
        const userId = authStore.getState().user?.id;
        if (!userId) return;
        
        const result = await updateRouteCompletionProgress(
          userId,
          visitedStopIds.length,
          sessionXpEarned,
        );
        
        // Якщо сталось рівень-ап, показуємо красиву анімацію
        if (result.leveledUp) {
          const levelConfig = LEVEL_THRESHOLDS[result.newLevel];
          setLevelUpData({
            previousLevel: result.previousLevel,
            newLevel: result.newLevel,
            title: levelConfig?.title,
            badge: levelConfig?.badge,
          });
          setNewAchievements(result.newAchievements);
          setShowLevelUp(true);
        }
      } catch (e) {
        if (__DEV__) console.warn('[RouteNav] Gamification error:', e);
      }
    })();
    
    // Показуємо стандартне повідомлення про завершення
    Alert.alert(
      rp(language, 'routeCompleteTitle'),
      rp(language, 'routeCompleteBody', {
        stops: visitedStopIds.length,
        xp: sessionXpEarned,
      }),
    );
  }, [plan?.stops, visitedStopIds, sessionXpEarned, language]);

  useFocusEffect(
    useCallback(() => {
      if (pendingAdvanceRef.current) {
        pendingAdvanceRef.current = false;
        advanceToNextStop();
      }
      showRouteCompleteIfDone();
    }, [advanceToNextStop, showRouteCompleteIfDone]),
  );

  const openLandmarkForStop = useCallback(
    (stop, distM, auto = false) => {
      if (!plan || !stop) return;
      if (distM != null && distM > PHYSICAL_VISIT_RADIUS_M && !auto) {
        Alert.alert('', rp(language, 'moveCloserForHistory'));
        return;
      }
      const built = buildLandmarkResultParamsForRouteStop({
        plan,
        stop,
        shell,
        distM,
        countryId: route?.params?.countryId,
      });
      if (!built?.params) return;
      pendingAdvanceRef.current = true;
      markStopVisited(stop.id);
      navigation.navigate(built.screen, built.params);
    },
    [plan, shell, language, navigation, route?.params?.countryId, markStopVisited],
  );

  const onViewHistory = useCallback(() => {
    if (!plan || !activeStop) return;
    openLandmarkForStop(activeStop, distToHistoryM, false);
  }, [plan, activeStop, distToHistoryM, openLandmarkForStop]);

  const routePathMode = navActive && legPolyline?.length >= 2 ? 'nav' : roadPolyline?.length >= 2 ? 'road' : 'preview';

  if (!plan?.stops?.length || !activeStop || !mapRegion) {
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
      <LevelUpNotification
        visible={showLevelUp}
        level={levelUpData?.newLevel || 1}
        title={levelUpData?.title || ''}
        badge={levelUpData?.badge || '🎯'}
        onAnimationEnd={() => setShowLevelUp(false)}
      />
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
          onPress={onMapPress}
          showsUserLocation={!simulatedPos}
          showsMyLocationButton={false}
          followsUserLocation={navActive && followUser && !simulatedPos}
          showsCompass={navActive}
          onPanDrag={() => {
            setFollowUser(false);
          }}
          onRegionChangeComplete={(_region, details) => {
            if (details?.isGesture) setFollowUser(false);
          }}
        >
          <RouteMapPath
            coordinates={drawCoords}
            accent={accent}
            isLight={isLight}
            mode={routePathMode}
            showArrows={drawCoords.length >= 2 && (navActive || roadPolyline?.length >= 2)}
          />
          {navWaypoint && navActive ? (
            <Marker coordinate={navWaypoint} anchor={{ x: 0.5, y: 0.5 }} zIndex={25}>
              <View style={[styles.waypointPin, { backgroundColor: accent, borderColor: isLight ? '#FFF' : '#1A1A1A' }]}>
                <Text style={[styles.waypointPinText, { color: onAccentButtonText(isLight) }]}>B</Text>
              </View>
            </Marker>
          ) : null}
          {simulatedPos ? (
            <Marker coordinate={simulatedPos} anchor={{ x: 0.5, y: 0.5 }} zIndex={30}>
              <View style={[styles.walkerDot, { borderColor: accent, backgroundColor: isLight ? '#FFF' : '#1A1A1A' }]}>
                <Ionicons name="walk" size={16} color={accent} />
              </View>
            </Marker>
          ) : null}
          {plan.stops.map((s, idx) => (
            <Marker
              key={s.id}
              coordinate={{ latitude: s.lat, longitude: s.lng }}
              onPress={() => onStopMarkerPress(s)}
            >
              <View
                style={[
                  styles.markerWrap,
                  (idx === currentStopIndex || s.order === 1) && { borderColor: accent, borderWidth: 3 },
                ]}
              >
                <Image source={routeStopImageSource(s.thumb)} style={styles.markerImg} resizeMode="cover" />
              </View>
            </Marker>
          ))}
        </MapView>

        {polyBusy || legBusy ? (
          <View style={styles.mapBadge}>
            <ActivityIndicator color={accent} size="small" />
          </View>
        ) : null}

        <View style={[styles.mapHint, { backgroundColor: isLight ? 'rgba(255,255,255,0.92)' : 'rgba(26,26,26,0.92)' }]}>
          <Ionicons name="footsteps-outline" size={14} color={accent} />
          <Text style={[styles.mapHintText, { color: textMuted }]} numberOfLines={2}>
            {navActive ? rp(language, 'tapMapWalkActive') : rp(language, 'tapMapToWalk')}
          </Text>
        </View>

        <Pressable
          style={[styles.mapFab, styles.mapFabLeft, { backgroundColor: isLight ? '#FFF' : '#1E1E1E' }]}
          onPress={fitMap}
          accessibilityRole="button"
          accessibilityLabel={rp(language, 'fitFullRoute')}
        >
          <Ionicons name="scan-outline" size={20} color={accent} />
        </Pressable>

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
            paddingBottom: lightTabBarScrollContentPadding(insets.bottom, 16),
            backgroundColor: sheetBg,
            borderTopColor: isLight ? 'rgba(2,18,235,0.25)' : 'rgba(225,255,0,0.35)',
          },
        ]}
      >
        {!navActive ? (
          <>
            <View style={styles.sheetHead}>
              <Image source={routeStopImageSource(activeStop.thumb)} style={styles.sheetThumb} resizeMode="cover" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: textMain }]} numberOfLines={2}>
                  {headerTitle}
                </Text>
                {totalStops > 1 ? (
                  <Text style={{ color: textMuted, fontSize: 13, marginTop: 4 }}>
                    {rp(language, 'stopProgress', {
                      current: currentStopIndex + 1,
                      total: totalStops,
                    })}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.modeRow}>
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
                <Ionicons name="walk-outline" size={20} color={accent} />
                <Text style={[styles.modeText, { color: accent, fontWeight: '700' }]}>
                  {walkMin} {rp(language, 'minShort')} · {rp(language, 'walk')}
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
                {rp(language, 'startTrip')}
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
            {turnInstruction ? (
              <View style={styles.turnRow}>
                <View style={[styles.turnIconWrap, { backgroundColor: isLight ? 'rgba(2,18,235,0.08)' : 'rgba(225,255,0,0.12)' }]}>
                  <Ionicons
                    name={turnIconForManeuver(activeNavStep?.maneuver)}
                    size={22}
                    color={accent}
                  />
                </View>
                <Text style={[styles.turnText, { color: textMain }]} numberOfLines={2}>
                  {turnInstruction}
                </Text>
              </View>
            ) : (
              <View style={styles.navHead}>
                {bearingToStop != null ? (
                  <View style={[styles.compass, { backgroundColor: isLight ? 'rgba(2,18,235,0.08)' : 'rgba(225,255,0,0.12)' }]}>
                    <Ionicons
                      name="navigate"
                      size={28}
                      color={accent}
                      style={{ transform: [{ rotate: `${bearingToStop}deg` }] }}
                    />
                  </View>
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.navHeadingLabel, { color: textMuted }]}>{rp(language, 'headingTo')}</Text>
                  <Text style={[styles.navHeadingTitle, { color: textMain }]} numberOfLines={2}>
                    {activeStop.title}
                  </Text>
                  {etaMinToStop != null ? (
                    <Text style={[styles.navEta, { color: accent }]}>
                      {rp(language, 'etaToStop', { min: etaMinToStop })}
                    </Text>
                  ) : null}
                  {legBusy ? (
                    <Text style={[styles.navEta, { color: textMuted, fontWeight: '500' }]}>
                      {rp(language, 'rerouting')}
                    </Text>
                  ) : null}
                </View>
              </View>
            )}

            {!turnInstruction ? (
              <View
                style={[
                  styles.distBar,
                  { backgroundColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)' },
                ]}
              >
                <Text style={[styles.distMain, { color: textMain }]}>
                  {distToHistoryM != null ? `${distToHistoryM} ${rp(language, 'm')}` : '…'}
                </Text>
                <Text style={[styles.distSub, { color: textMuted }]}>
                  {rp(language, 'metersToHistory')}
                  {sessionXpEarned > 0 ? ` · +${sessionXpEarned} XP` : ''}
                </Text>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: withinHistory ? accent : isLight ? '#D8D8D8' : '#3A3A3A',
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
              android_ripple={ripple}
              onPress={onViewHistory}
            >
              <Text
                style={[
                  styles.primaryBtnText,
                  { color: withinHistory ? onAccentButtonText(isLight) : isLight ? '#5C5C5C' : '#C8C8C8' },
                ]}
              >
                {withinHistory
                  ? rp(language, 'viewHistory')
                  : rp(language, 'historyToGo', { dist: distToHistoryM ?? '…' })}
              </Text>
            </Pressable>

            {!withinHistory ? (
              <Text style={[styles.historyRadiusHint, { color: textMuted }]}>{rp(language, 'historyRadius')}</Text>
            ) : null}

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
  modeRow: { flexDirection: 'row', marginBottom: 14, justifyContent: 'center' },
  modePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    marginHorizontal: 6,
    maxWidth: 320,
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
  navHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 14 },
  compass: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navHeadingLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  navHeadingTitle: { fontSize: 17, fontWeight: '700', marginTop: 2 },
  navEta: { fontSize: 14, fontWeight: '700', marginTop: 4 },
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
    }),
  },
  mapHintText: { flex: 1, fontSize: 11, lineHeight: 14, fontWeight: '600' },
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
  waypointPin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waypointPinText: {
    fontSize: 14,
    fontWeight: '800',
  },
  turnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  turnIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  turnText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  historyRadiusHint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: -4,
    marginBottom: 8,
    lineHeight: 16,
  },
});
