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
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Speech from 'expo-speech';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { getRegion } from './routeRegionsData';
import { mapStyleForTheme } from './mapStyle';
import {
  buildStepGuidePhrase,
  buildLandmarkGuidePhrase,
  buildStreetEnteredPhrase,
  fetchStreetGuideInfo,
  streetGuideKey,
  streetNameFromStep,
  distanceMetersBetween,
  GUIDE_SPEECH_COOLDOWN_MS,
  LANDMARK_GUIDE_RADIUS_M,
  STREET_GUIDE_MOVE_M,
} from './routeStreetGuide';
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
import { useAppTheme } from './useAppTheme';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { routeStopImageSource } from './routeStopThumb';
import {
  loadRoutePolylineFromPlan,
  buildGoogleMapsDirectionsUrl,
  fetchGoogleDirectionsPolyline,
  getGoogleMapsApiKey,
  getDirectionsCoordinatesFromPlan,
  isRoadFollowingPolyline,
  distanceMetersToPolyline,
  collectMapFitCoordinates,
  coordFromWalkOrigin,
  resolveRouteMapRegion,
  buildFallbackDirectionSteps,
} from './googleMapsRoute';
import { isUserOriginNearRoute } from './routePlannerCore';
import {
  RouteMapPath,
  resolveNextManeuverStep,
  resolveActiveStepIndex,
  isSignificantManeuver,
  distanceToManeuverStep,
  formatTurnInstruction,
  formatNavDistanceM,
  turnIconForManeuver,
  NAV_SPEECH_THRESHOLDS_M,
} from './routeMapPath';
import {
  computeBearingDegrees,
  estimateMinutesForKm,
  offsetCoordinateMeters,
  haversineKm,
  advanceAlongPolyline,
  nearestPointOnPolyline,
  bearingAlongPolyline,
  slicePolylineFromPosition,
} from './routePlannerCore';
import { brandFontSansBold, brandFontSansMedium, brandFontSansSemibold } from './brandFont';
import { RenderProfiler } from './performanceMetrics';
import { updateRouteCompletionProgress, getProgressToNextLevel, LEVEL_THRESHOLDS } from './gamificationEngine';
import { LevelUpNotification, AchievementCard } from './GamificationUI';
import { authStore } from './auth/authStore';

const LIGHT_BG = '#F2F2EA';
const OFF_ROUTE_THRESHOLD_M = 45;
const REROUTE_COOLDOWN_MS = 12000;
const DEFAULT_NAV_ZOOM = 0.018;
const ROUTE_FOLLOW_ZOOM = 0.004;
const ROUTE_MAX_ZOOM_DELTA = 0.35;
const MAP_ZOOM_STEP = 1.5;
const TURN_ZOOM = 0.005;
const BEHIND_VIEW_ZOOM = Platform.OS === 'ios' ? 18.4 : 18.8;
const BEHIND_VIEW_ALTITUDE_M = 420;
const BEHIND_VIEW_PITCH = Platform.OS === 'ios' ? 62 : 58;
const BEHIND_CENTER_AHEAD_M = 125;
const BEHIND_LOOK_AHEAD_M = 42;
const NAV_ROUTE_GLOW = 'rgba(2,18,235,0.34)';
const NAV_ROUTE_BLUE = '#0066FF';
const NAV_CAMERA_ANIM_GUARD_MS = 900;
const AUTO_WALK_INTERVAL_MS = 500;
const AUTO_WALK_STEP_M = 1.35;
const STOP_ARRIVAL_M = 48;
const MIN_ZOOM_DELTA = 0.0012;
const MAX_ZOOM_DELTA = 0.14;

function legPolylineSignature(path) {
  if (!path?.length) return '';
  const n = path.length;
  const a = path[0];
  const mid = path[Math.floor(n / 2)];
  const b = path[n - 1];
  return `${n}:${a.latitude.toFixed(5)},${a.longitude.toFixed(5)}:${mid.latitude.toFixed(5)},${mid.longitude.toFixed(5)}:${b.latitude.toFixed(5)},${b.longitude.toFixed(5)}`;
}

function coordsNear(a, b, epsilon = 1e-5) {
  if (!a || !b) return false;
  return (
    Math.abs(a.latitude - b.latitude) < epsilon &&
    Math.abs(a.longitude - b.longitude) < epsilon
  );
}


export default function RouteNavigationPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const plan = route?.params?.routePlan;
  const transport = plan?.transport || 'walk';
  const transportLabelKey =
    transport === 'car'
      ? 'drive'
      : transport === 'bike'
        ? 'bike'
        : transport === 'bus'
          ? 'bus'
          : transport === 'train'
            ? 'train'
            : 'walk';
  const transportModeIconName =
    transport === 'car'
      ? 'car-outline'
      : transport === 'bike'
        ? 'bicycle-outline'
        : transport === 'bus'
          ? 'bus-outline'
          : transport === 'train'
            ? 'train-outline'
            : 'walk-outline';
  const mapPolylineParam = route?.params?.mapPolyline;
  const mapRef = useRef(null);
  const autoStartNav = route?.params?.autoStartNav === true;
  const mapZoomRef = useRef(autoStartNav ? ROUTE_FOLLOW_ZOOM : DEFAULT_NAV_ZOOM);
  const { appTheme, isLight } = useAppTheme(route?.params?.appTheme, route);
  const [navActive, setNavActive] = useState(autoStartNav);
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
  const [roadPolyline, setRoadPolyline] = useState(() =>
    isRoadFollowingPolyline(mapPolylineParam) ? mapPolylineParam : null,
  );
  const [roadSteps, setRoadSteps] = useState([]);
  const [legPolyline, setLegPolyline] = useState(null);
  const [legSteps, setLegSteps] = useState([]);
  const [legDurationSec, setLegDurationSec] = useState(null);
  const [legBusy, setLegBusy] = useState(false);
  const [polyBusy, setPolyBusy] = useState(!mapPolylineParam);
  const [followUser, setFollowUser] = useState(true);
  const [behindView, setBehindView] = useState(autoStartNav);
  const [navCamera, setNavCamera] = useState(null);
  const [autoWalkActive, setAutoWalkActive] = useState(autoStartNav);
  const liveGpsActiveRef = useRef(false);
  const lastUserPosRef = useRef(null);
  const routeFollowBootRef = useRef(false);
  const navCameraBootRef = useRef(false);
  const lastSpokenCueRef = useRef({ stepKey: '', threshold: Infinity });
  const lastNavSpeechAtRef = useRef(0);
  const lastGuideStepIndexRef = useRef(-1);
  const announcedGuideLandmarksRef = useRef(new Set());
  const lastStreetGuideKeyRef = useRef('');
  const lastStreetGuidePosRef = useRef(null);
  const streetGuideBusyRef = useRef(false);
  const [streetGuideLabel, setStreetGuideLabel] = useState('');
  const lastMapFollowAtRef = useRef(0);
  const userControlledZoomRef = useRef(false);
  const navCameraAnimatingRef = useRef(false);
  const navCameraAnimDoneAtRef = useRef(0);
  const autoWalkSeededRef = useRef(false);
  const lastArrivedStopRef = useRef(null);
  const demoWalkRef = useRef(autoStartNav);
  const [skippedStopIds, setSkippedStopIds] = useState([]);
  const lastRerouteAtRef = useRef(0);
  const legFetchIdRef = useRef(0);
  const legFetchInFlightRef = useRef(false);
  const legTargetKeyRef = useRef('');
  const lastLegSignatureRef = useRef('');
  const legPolylineRef = useRef(null);
  const navigationPosRef = useRef(null);
  const pendingWalkerZoomRef = useRef(false);
  const [simulatedPos, setSimulatedPos] = useState(() => coordFromWalkOrigin(route?.params?.walkOrigin));
  const [positionSource, setPositionSource] = useState('auto');

  const userNearRoute = useMemo(() => {
    if (!userPos || !plan?.stops?.length) return false;
    return isUserOriginNearRoute({ lat: userPos.latitude, lng: userPos.longitude }, plan.stops);
  }, [userPos?.latitude, userPos?.longitude, plan?.stops]);

  const routeStartSeed = useMemo(() => {
    const fromOrigin = coordFromWalkOrigin(route?.params?.walkOrigin);
    if (fromOrigin) return fromOrigin;
    if (mapPolylineParam?.[0]) {
      return { latitude: mapPolylineParam[0].latitude, longitude: mapPolylineParam[0].longitude };
    }
    if (roadPolyline?.[0]) {
      return { latitude: roadPolyline[0].latitude, longitude: roadPolyline[0].longitude };
    }
    if (plan?.stops?.[0]) {
      return { latitude: plan.stops[0].lat, longitude: plan.stops[0].lng };
    }
    return null;
  }, [route?.params?.walkOrigin, mapPolylineParam, roadPolyline, plan?.stops]);

  const navigationPos = useMemo(() => {
    if (positionSource === 'manual' && simulatedPos) return simulatedPos;
    if (userPos && userNearRoute && positionSource !== 'manual') {
      return { latitude: userPos.latitude, longitude: userPos.longitude };
    }
    if (autoWalkActive && simulatedPos) return simulatedPos;
    if (simulatedPos) return simulatedPos;
    if (userPos) {
      return { latitude: userPos.latitude, longitude: userPos.longitude };
    }
    return null;
  }, [positionSource, autoWalkActive, simulatedPos, userPos, userNearRoute]);

  useEffect(() => {
    navigationPosRef.current = navigationPos;
  }, [navigationPos]);

  useEffect(() => {
    legPolylineRef.current = legPolyline;
  }, [legPolyline]);

  useEffect(() => {
    if (!plan || isRoadFollowingPolyline(roadPolyline)) return;
    let cancelled = false;
    (async () => {
      setPolyBusy(true);
      const { path, steps } = await loadRoutePolylineFromPlan(plan, userPos, simulatedPos);
      if (!cancelled && isRoadFollowingPolyline(path)) setRoadPolyline(path);
      if (!cancelled && steps?.length) setRoadSteps(steps);
    })().finally(() => {
      if (!cancelled) setPolyBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [plan, roadPolyline, userPos?.latitude, userPos?.longitude, simulatedPos?.latitude, simulatedPos?.longitude]);

  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const screenBg = isLight ? LIGHT_BG : '#0A0A0A';
  const goGradient = useMemo(
    () => (isLight ? ['#0212EB', '#0038FF'] : ['#E1FF00', '#C8E600']),
    [isLight],
  );
  const chrome = useMemo(
    () => ({
      panelBg: isLight ? '#FFFFFF' : '#222228',
      sheetBg: isLight ? '#FFFFFF' : '#1E1E24',
      panelBorder: isLight ? 'rgba(2,18,235,0.32)' : 'rgba(225,255,0,0.4)',
      title: isLight ? '#000000' : '#FFFFFF',
      muted: isLight ? '#333333' : '#D6D6D6',
      chipBg: isLight ? '#EEF2FF' : 'rgba(225,255,0,0.16)',
      iconBtnBg: isLight ? '#FFFFFF' : '#2E2E34',
      iconBtnBorder: isLight ? 'rgba(2,18,235,0.24)' : 'rgba(225,255,0,0.36)',
      statIconBg: isLight ? 'rgba(2,18,235,0.16)' : 'rgba(225,255,0,0.22)',
      useGlass: false,
    }),
    [isLight],
  );
  const textMain = chrome.title;
  const textMuted = chrome.muted;
  const chromeBorder = chrome.panelBorder;
  const fabBg = chrome.panelBg;

  const activeStop = plan?.stops?.[currentStopIndex] || plan?.stops?.[0];
  const totalStops = plan?.stops?.length || 0;
  const remainingStops = useMemo(
    () => (plan?.stops || []).filter((s) => !skippedStopIds.includes(s.id)),
    [plan?.stops, skippedStopIds],
  );
  const remainingStopsCount = remainingStops.length;
  const demoRegion = plan ? getRegion(plan.regionId) : null;
  const mapRegion = useMemo(
    () => resolveRouteMapRegion(plan, demoRegion?.center),
    [plan, demoRegion?.center],
  );
  const mapInitialRegion = useMemo(() => {
    if (!autoStartNav && !navActive) return mapRegion;
    const center =
      (userNearRoute && userPos
        ? { latitude: userPos.latitude, longitude: userPos.longitude }
        : null) ||
      simulatedPos ||
      routeStartSeed ||
      mapRegion;
    if (!center || !Number.isFinite(center.latitude)) return mapRegion;
    return {
      latitude: center.latitude,
      longitude: center.longitude,
      latitudeDelta: ROUTE_FOLLOW_ZOOM,
      longitudeDelta: ROUTE_FOLLOW_ZOOM,
    };
  }, [autoStartNav, navActive, mapRegion, simulatedPos, routeStartSeed, userNearRoute, userPos]);
  const useGoogleMaps = useMemo(() => Boolean(getGoogleMapsApiKey()), []);
  const useGoogleProvider = useGoogleMaps && Platform.OS === 'android';
  const mapProvider = useMemo(
    () => (useGoogleProvider ? PROVIDER_GOOGLE : undefined),
    [useGoogleProvider],
  );
  const wantRealisticMap = navActive || autoStartNav || Boolean(roadPolyline?.length >= 2);
  const mapNavType = useMemo(() => {
    if (!wantRealisticMap) return 'standard';
    if (useGoogleProvider) return 'hybrid';
    return Platform.OS === 'ios' ? 'hybrid' : 'hybrid';
  }, [wantRealisticMap, useGoogleProvider]);
  const mapCustomStyle = useMemo(() => {
    if (wantRealisticMap) return undefined;
    return useGoogleProvider && !isLight && !behindView ? mapStyleForTheme(isLight) : undefined;
  }, [wantRealisticMap, useGoogleProvider, isLight, behindView]);
  const navigatorCameraReady = behindView && navCamera != null;
  const mapUiStyle = wantRealisticMap || navigatorCameraReady || navActive ? 'light' : isLight ? 'light' : 'dark';
  const navMapPadding = useMemo(
    () =>
      navActive
        ? {
            top: insets.top + (followUser && behindView ? 156 : 96),
            bottom: followUser && behindView ? 72 : 148,
            left: 32,
            right: 32,
          }
        : undefined,
    [navActive, followUser, behindView, insets.top],
  );

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

  const resolveNavRoadPath = useCallback(
    (pos) => {
      if (isRoadFollowingPolyline(legPolyline)) return legPolyline;
      if (isRoadFollowingPolyline(roadPolyline)) {
        if (pos) {
          const { remaining } = slicePolylineFromPosition(roadPolyline, pos);
          if (isRoadFollowingPolyline(remaining)) return remaining;
        }
        return roadPolyline;
      }
      return null;
    },
    [legPolyline, roadPolyline],
  );

  const mapRouteCoords = useMemo(() => {
    if (navActive) {
      return resolveNavRoadPath(navigationPos) || [];
    }
    if (isRoadFollowingPolyline(roadPolyline)) return roadPolyline;
    if (isRoadFollowingPolyline(lineCoords)) return lineCoords;
    return drawCoords.length >= 2 ? drawCoords : [];
  }, [navActive, resolveNavRoadPath, navigationPos, roadPolyline, lineCoords, drawCoords]);

  const walkPath = useMemo(() => {
    if (navActive) return resolveNavRoadPath(navigationPos);
    if (isRoadFollowingPolyline(legPolyline)) return legPolyline;
    if (isRoadFollowingPolyline(roadPolyline)) return roadPolyline;
    if (isRoadFollowingPolyline(lineCoords)) return lineCoords;
    return null;
  }, [navActive, resolveNavRoadPath, navigationPos, legPolyline, roadPolyline, lineCoords]);

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
      : Math.max(5, estimateMinutesForKm(plan.totalKm, transport))
    : 0;

  const fetchLeg = useCallback(
    async (from, { silent = false } = {}) => {
      if (!from || !activeStop || legFetchInFlightRef.current) return;
      const fetchId = ++legFetchIdRef.current;
      const to = { latitude: activeStop.lat, longitude: activeStop.lng };
      legFetchInFlightRef.current = true;
      if (!silent) setLegBusy(true);
      try {
        const key = getGoogleMapsApiKey();
        if (key) {
          const { path, durationSec, steps } = await fetchGoogleDirectionsPolyline(
            fallback,
            transport,
            key,
          );
          if (fetchId !== legFetchIdRef.current) return;
          if (path?.length >= 2 && isRoadFollowingPolyline(path)) {
            const sig = legPolylineSignature(path);
            if (sig !== lastLegSignatureRef.current) {
              lastLegSignatureRef.current = sig;
              setLegPolyline(path);
              setLegSteps(steps?.length ? steps : buildFallbackDirectionSteps(from, to));
              setLegDurationSec(durationSec || null);
            }
            lastRerouteAtRef.current = Date.now();
            return;
          }
          if (path?.length >= 2 && __DEV__) {
            console.warn('[RouteNavigation] directions path too straight, retrying leg');
          }
        }
        if (fetchId === legFetchIdRef.current) {
          if (__DEV__) console.warn('[RouteNavigation] directions unavailable — no straight fallback');
          setLegSteps(buildFallbackDirectionSteps(from, to));
          setLegDurationSec(null);
          lastRerouteAtRef.current = Date.now();
        }
      } finally {
        legFetchInFlightRef.current = false;
        if (fetchId === legFetchIdRef.current && !silent) setLegBusy(false);
      }
    },
    [activeStop, transport],
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
    return estimateMinutesForKm(distToHistoryM / 1000, transport);
  }, [distToHistoryM, legDurationSec, navActive, transport]);

  const distToHistoryLabel = useMemo(() => {
    if (distToHistoryM == null) return '…';
    return formatNavDistanceM(distToHistoryM, language);
  }, [distToHistoryM, language]);

  const withinHistory = isWithinPhysicalVisitRadiusMeters(distToHistoryM);
  const stopProgressRatio =
    remainingStopsCount > 1
      ? (remainingStops.findIndex((s) => s.id === activeStop?.id) + 1) / remainingStopsCount
      : 0;

  const navSteps = useMemo(() => {
    if (legSteps.length) return legSteps;
    if (roadSteps.length) return roadSteps;
    return [];
  }, [legSteps, roadSteps]);

  const nextManeuverStep = useMemo(() => {
    if (!navSteps.length || !navigationPos) return null;
    return resolveNextManeuverStep(navSteps, navigationPos);
  }, [navSteps, navigationPos]);

  const distToManeuverM = useMemo(() => {
    if (!nextManeuverStep || !navigationPos) return null;
    return distanceToManeuverStep(navSteps, navigationPos, nextManeuverStep);
  }, [navSteps, navigationPos, nextManeuverStep]);

  const turnInstruction = useMemo(() => {
    if (!nextManeuverStep) return '';
    return formatTurnInstruction(nextManeuverStep, language, navigationPos, {
      distM: distToManeuverM,
      steps: navSteps,
    });
  }, [nextManeuverStep, language, navigationPos, distToManeuverM, navSteps]);

  const activeStepIndex = useMemo(() => {
    if (!navSteps.length || !navigationPos) return -1;
    return resolveActiveStepIndex(navSteps, navigationPos);
  }, [navSteps, navigationPos]);

  const currentStreetLabel = useMemo(() => {
    if (streetGuideLabel) return streetGuideLabel;
    const step = activeStepIndex >= 0 ? navSteps[activeStepIndex] : null;
    const street = streetNameFromStep(step);
    if (street) return language === 'en' ? `On ${street}` : `Вул. ${street}`;
    return '';
  }, [streetGuideLabel, navSteps, activeStepIndex, language]);

  const speakNavGuide = useCallback(
    (phrase) => {
      if (!phrase || !navActive) return;
      const now = Date.now();
      if (now - lastNavSpeechAtRef.current < GUIDE_SPEECH_COOLDOWN_MS) return;
      lastNavSpeechAtRef.current = now;
      try {
        Speech.speak(phrase, { language: language === 'uk' ? 'uk-UA' : 'en-US', rate: 0.9 });
      } catch {
        /* optional */
      }
    },
    [navActive, language],
  );

  const displayNavigationPos = useMemo(() => {
    if (!navigationPos) return null;
    if (!walkPath?.length) return navigationPos;
    const onPath = nearestPointOnPolyline(walkPath, navigationPos);
    const offM = haversineKm(navigationPos, onPath) * 1000;
    return offM > 18 ? onPath : navigationPos;
  }, [navigationPos, walkPath]);

  const navRouteSlices = useMemo(() => {
    if (!navActive || mapRouteCoords.length < 2 || !displayNavigationPos) {
      return { remaining: mapRouteCoords, traveled: [] };
    }
    const { remaining, traveled } = slicePolylineFromPosition(mapRouteCoords, displayNavigationPos);
    return {
      remaining: remaining.length >= 2 ? remaining : mapRouteCoords,
      traveled: traveled.length >= 2 ? traveled : [],
    };
  }, [navActive, mapRouteCoords, displayNavigationPos?.latitude, displayNavigationPos?.longitude]);

  const travelBearing = useMemo(() => {
    if (walkPath?.length >= 2 && displayNavigationPos) {
      const along = bearingAlongPolyline(walkPath, displayNavigationPos, BEHIND_LOOK_AHEAD_M);
      if (along != null) return along;
    }
    if (nextManeuverStep?.end && navigationPos) {
      return computeBearingDegrees(navigationPos, nextManeuverStep.end);
    }
    return bearingToStop;
  }, [walkPath, displayNavigationPos, nextManeuverStep, navigationPos, bearingToStop]);

  const isGpsPosition = positionSource === 'gps' || (positionSource === 'auto' && userNearRoute && userPos && !simulatedPos);
  const positionModeLabel = isGpsPosition ? rp(language, 'posModeGps') : rp(language, 'posModeManual');
  const gpsOffRouteCoords = useMemo(() => {
    if (!isGpsPosition || !userPos || !displayNavigationPos) return null;
    const distM = haversineKm(userPos, displayNavigationPos) * 1000;
    if (distM < 14) return null;
    return [userPos, displayNavigationPos];
  }, [isGpsPosition, userPos, displayNavigationPos]);

  const walkHeadingDeg = travelBearing;
  const puckMapRotation = behindView && navCamera != null ? 0 : travelBearing ?? 0;
  const navDestinationCoord = useMemo(() => {
    if (!navActive || !activeStop) return null;
    if (navRouteSlices.remaining.length >= 1) {
      const last = navRouteSlices.remaining[navRouteSlices.remaining.length - 1];
      return { latitude: last.latitude, longitude: last.longitude };
    }
    return { latitude: activeStop.lat, longitude: activeStop.lng };
  }, [navActive, activeStop, navRouteSlices.remaining]);

  const walkDirectionHint = useMemo(() => {
    if (turnInstruction) return turnInstruction;
    if (navSteps.length && navigationPos) {
      const step = resolveNextManeuverStep(navSteps, navigationPos);
      const fromStep = formatTurnInstruction(step, language, navigationPos, { steps: navSteps });
      if (fromStep) return fromStep;
    }
    if (distToHistoryM == null || !activeStop) return rp(language, 'followBlueLine');
    return rp(language, 'walkTowardStop', {
      dist: distToHistoryLabel,
      stop: activeStop.title,
    });
  }, [turnInstruction, navSteps, navigationPos, distToHistoryM, distToHistoryLabel, activeStop, language]);

  const navBannerSub = useMemo(() => {
    if (!navActive) return '';
    if (distToManeuverM != null && nextManeuverStep && isSignificantManeuver(nextManeuverStep.maneuver)) {
      const maneuverDist = formatNavDistanceM(distToManeuverM, language);
      if (etaMinToStop != null && distToHistoryLabel !== '…') {
        return language === 'en'
          ? `${maneuverDist} to turn · ${etaMinToStop} min · ${distToHistoryLabel} to goal`
          : `${maneuverDist} до повороту · ${etaMinToStop} хв · ${distToHistoryLabel} до цілі`;
      }
      return language === 'en' ? `${maneuverDist} to turn` : `${maneuverDist} до повороту`;
    }
    if (etaMinToStop != null && distToHistoryLabel !== '…') {
      return rp(language, 'navEtaBanner', { eta: etaMinToStop, dist: distToHistoryLabel });
    }
    if (autoWalkActive) return rp(language, 'autoWalking');
    if (userPos) return rp(language, 'navGpsActive');
    return rp(language, 'navThenStreet');
  }, [
    navActive,
    distToManeuverM,
    nextManeuverStep,
    etaMinToStop,
    distToHistoryLabel,
    autoWalkActive,
    userPos,
    language,
  ]);

  const nextTurnPoint = useMemo(() => {
    if (!nextManeuverStep?.end) return null;
    return nextManeuverStep.end;
  }, [nextManeuverStep]);

  const navWaypoint = nextTurnPoint;

  useEffect(() => {
    if (!activeStop || !plan) {
      setLegPolyline(null);
      setLegSteps([]);
      setLegDurationSec(null);
      lastLegSignatureRef.current = '';
      legTargetKeyRef.current = '';
      return undefined;
    }
    if (!navActive) return undefined;

    const targetKey = `${activeStop.id}:${currentStopIndex}`;
    if (legTargetKeyRef.current === targetKey && isRoadFollowingPolyline(legPolylineRef.current)) {
      return undefined;
    }
    legTargetKeyRef.current = targetKey;
    lastLegSignatureRef.current = '';

    const pos = navigationPosRef.current;
    const from = pos
      ? { latitude: pos.latitude, longitude: pos.longitude }
      : currentStopIndex > 0
        ? {
            latitude: plan.stops[currentStopIndex - 1].lat,
            longitude: plan.stops[currentStopIndex - 1].lng,
          }
        : {
            latitude: activeStop.lat,
            longitude: activeStop.lng,
          };

    fetchLeg(from);
    return () => {
      legFetchIdRef.current += 1;
    };
  }, [navActive, activeStop?.id, currentStopIndex, fetchLeg, plan?.stops?.length]);

  useEffect(() => {
    if (!navActive || !navigationPos || !legPolylineRef.current?.length || legBusy || legFetchInFlightRef.current) {
      return;
    }
    const now = Date.now();
    if (now - lastRerouteAtRef.current < REROUTE_COOLDOWN_MS) return;
    const distM = distanceMetersToPolyline(navigationPos, legPolylineRef.current);
    if (distM == null || distM <= OFF_ROUTE_THRESHOLD_M) return;
    const from = { latitude: navigationPos.latitude, longitude: navigationPos.longitude };
    const currentPath = legPolylineRef.current;
    if (currentPath?.length >= 2 && coordsNear(currentPath[0], from, 0.00015)) return;
    fetchLeg(from, { silent: true });
  }, [navActive, navigationPos?.latitude, navigationPos?.longitude, legBusy, fetchLeg]);

  const fitPoints = useMemo(() => {
    const extras = [];
    if (navigationPos) {
      const origin = { lat: navigationPos.latitude, lng: navigationPos.longitude };
      if (navActive || (plan?.originNearRegion !== false && isUserOriginNearRoute(origin, plan?.stops))) {
        extras.push(navigationPos);
      }
    }
    return collectMapFitCoordinates({
      polyline: drawCoords,
      stops: plan?.stops,
      extras,
    });
  }, [drawCoords, plan?.stops, plan?.originNearRegion, navigationPos, navActive]);

  const fitMap = useCallback(() => {
    if (!mapRef.current || fitPoints.length < 1 || navActive) return;
    setFollowUser(false);
    setBehindView(false);
    mapRef.current.fitToCoordinates(fitPoints, {
      edgePadding: { top: insets.top + 100, right: 40, bottom: 300, left: 40 },
      animated: true,
    });
  }, [fitPoints, insets.top, navActive]);

  const snapMapToPosition = useCallback((pos, { animated = true, zoomDelta = null } = {}) => {
    if (!mapRef.current || !pos) return;
    const delta = zoomDelta ?? mapZoomRef.current ?? ROUTE_FOLLOW_ZOOM;
    mapZoomRef.current = delta;
    mapRef.current.animateToRegion(
      {
        latitude: pos.latitude,
        longitude: pos.longitude,
        latitudeDelta: delta,
        longitudeDelta: delta,
      },
      animated ? 280 : 0,
    );
  }, []);

  const panMapToPosition = useCallback(
    (pos, { animated = true } = {}) => {
      snapMapToPosition(pos, { animated, zoomDelta: mapZoomRef.current || ROUTE_FOLLOW_ZOOM });
    },
    [snapMapToPosition],
  );

  const focusOnRoutePosition = useCallback(
    (pos, options = {}) => {
      if (!pos) return;
      const follow = options.follow !== false;
      const resetZoom = options.resetZoom !== false;
      setFollowUser(follow);
      setBehindView(false);
      setNavCamera(null);
      if (resetZoom) mapZoomRef.current = ROUTE_FOLLOW_ZOOM;
      snapMapToPosition(pos, { zoomDelta: resetZoom ? ROUTE_FOLLOW_ZOOM : mapZoomRef.current });
    },
    [snapMapToPosition],
  );

  const getMapCenter = useCallback(() => {
    if (navigationPos) return navigationPos;
    if (activeStop) return { latitude: activeStop.lat, longitude: activeStop.lng };
    return mapRegion;
  }, [navigationPos, activeStop, mapRegion]);

  const isUserMapGesture = useCallback(() => {
    if (navCameraAnimatingRef.current) return false;
    if (Date.now() - navCameraAnimDoneAtRef.current < 320) return false;
    return true;
  }, []);

  const buildNavCamera = useCallback((pos, bearing) => {
    if (!pos || bearing == null) return null;
    const camera = {
      center: offsetCoordinateMeters(pos, bearing, BEHIND_CENTER_AHEAD_M),
      heading: bearing,
      pitch: BEHIND_VIEW_PITCH,
    };
    if (Platform.OS === 'ios') {
      camera.altitude = BEHIND_VIEW_ALTITUDE_M;
    } else {
      camera.zoom = BEHIND_VIEW_ZOOM;
    }
    return camera;
  }, []);

  const runNavCamera = useCallback((camera, options = {}) => {
    const animate = options.animate !== false;
    if (!mapRef.current || !camera) return;
    const payload = {
      ...camera,
      pitch: camera.pitch ?? BEHIND_VIEW_PITCH,
      ...(Platform.OS === 'ios'
        ? { altitude: camera.altitude ?? BEHIND_VIEW_ALTITUDE_M }
        : { zoom: camera.zoom ?? BEHIND_VIEW_ZOOM }),
    };
    navCameraAnimatingRef.current = true;
    setNavCamera(payload);
    if (!animate && typeof mapRef.current.setCamera === 'function') {
      mapRef.current.setCamera(payload);
    } else if (typeof mapRef.current.animateCamera === 'function') {
      mapRef.current.animateCamera(payload, { duration: animate ? 720 : 0 });
    }
    const guardMs = animate ? Math.max(NAV_CAMERA_ANIM_GUARD_MS, 900) : 160;
    setTimeout(() => {
      navCameraAnimatingRef.current = false;
      navCameraAnimDoneAtRef.current = Date.now();
    }, guardMs);
  }, []);

  const animateMapZoom = useCallback(
    (delta, centerOverride = null) => {
      if (!mapRef.current) return;
      const next = Math.min(MAX_ZOOM_DELTA, Math.max(MIN_ZOOM_DELTA, delta));
      mapZoomRef.current = next;
      const center = centerOverride || getMapCenter();
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
    },
    [getMapCenter],
  );

  const zoomToNavigationTurn = useCallback(
    (posOverride = null, options = {}) => {
      const follow = options.follow !== false;
      const pos = posOverride || navigationPos;
      if (!mapRef.current || !pos) return;

      const bearing =
        (walkPath?.length >= 2 ? bearingAlongPolyline(walkPath, pos, BEHIND_LOOK_AHEAD_M) : null) ??
        (nextManeuverStep?.end ? computeBearingDegrees(pos, nextManeuverStep.end) : null) ??
        (activeStop ? computeBearingDegrees(pos, { latitude: activeStop.lat, longitude: activeStop.lng }) : null) ??
        travelBearing ??
        0;
      const camera = buildNavCamera(pos, bearing);
      if (!camera) return;

      setFollowUser(follow);
      setBehindView(true);
      userControlledZoomRef.current = false;
      runNavCamera(camera, { animate: true });
      mapZoomRef.current = TURN_ZOOM;
    },
    [navigationPos, walkPath, nextManeuverStep, activeStop, travelBearing, buildNavCamera, runNavCamera],
  );

  const zoomInMap = useCallback(() => {
    if (navActive && navigationPos) {
      userControlledZoomRef.current = false;
      setFollowUser(true);
      zoomToNavigationTurn(navigationPos, { follow: true });
      return;
    }
    setFollowUser(false);
    setBehindView(false);
    setNavCamera(null);
    userControlledZoomRef.current = true;
    const next = Math.max(MIN_ZOOM_DELTA, mapZoomRef.current / MAP_ZOOM_STEP);
    animateMapZoom(next);
  }, [animateMapZoom, navActive, navigationPos, zoomToNavigationTurn]);

  const zoomOutMap = useCallback(() => {
    setFollowUser(false);
    setBehindView(false);
    setNavCamera(null);
    userControlledZoomRef.current = true;
    const next = Math.min(MAX_ZOOM_DELTA, mapZoomRef.current * MAP_ZOOM_STEP);
    animateMapZoom(next);
  }, [animateMapZoom]);

  const onMapReady = useCallback(() => {
    if (autoStartNav || navActive) {
      const pos =
        navigationPos ||
        simulatedPos ||
        (plan?.stops?.[0] ? { latitude: plan.stops[0].lat, longitude: plan.stops[0].lng } : null);
      if (pos && navActive) {
        navCameraBootRef.current = false;
        setTimeout(() => zoomToNavigationTurn(pos, { follow: true }), 420);
        return;
      }
      if (pos) snapMapToPosition(pos, { animated: false });
      return;
    }
    fitMap();
  }, [autoStartNav, navActive, fitMap, navigationPos, simulatedPos, plan?.stops, snapMapToPosition, zoomToNavigationTurn]);

  const zoomToTurn = useCallback(() => {
    zoomToNavigationTurn();
  }, [zoomToNavigationTurn]);

  const onWalkerPress = useCallback(() => {
    const pos = navigationPos;
    if (!pos || !activeStop) return;
    if (!navActive) setNavActive(true);
    if (!legSteps.length || legBusy) {
      pendingWalkerZoomRef.current = true;
      void fetchLeg(pos);
      return;
    }
    zoomToNavigationTurn(pos);
  }, [
    navigationPos,
    activeStop,
    navActive,
    legSteps.length,
    legBusy,
    fetchLeg,
    zoomToNavigationTurn,
  ]);

  useEffect(() => {
    if (!pendingWalkerZoomRef.current || !legSteps.length || !navigationPos) return;
    pendingWalkerZoomRef.current = false;
    zoomToNavigationTurn(navigationPos);
  }, [legSteps, navigationPos, zoomToNavigationTurn]);

  const onRegionChangeComplete = useCallback(
    (_region, details) => {
      if (_region?.latitudeDelta) {
        mapZoomRef.current = _region.latitudeDelta;
        const delta = _region.latitudeDelta;
        if (
          navActive &&
          followUser &&
          !behindView &&
          !userControlledZoomRef.current &&
          !details?.isGesture &&
          delta > ROUTE_MAX_ZOOM_DELTA &&
          navigationPos &&
          mapRef.current
        ) {
          panMapToPosition(navigationPos);
        }
      }
      if (details?.isGesture && isUserMapGesture()) {
        userControlledZoomRef.current = true;
        setFollowUser(false);
        setBehindView(false);
        setNavCamera(null);
      }
    },
    [navActive, followUser, behindView, navigationPos, panMapToPosition, isUserMapGesture],
  );

  useEffect(() => {
    if (autoStartNav || navActive) return;
    const t = setTimeout(fitMap, 350);
    return () => clearTimeout(t);
  }, [fitMap, autoStartNav, navActive]);

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
    if (positionSource === 'manual') return;
    if (!navActive || !userPos || liveGpsActiveRef.current) return;
    const origin = { lat: userPos.latitude, lng: userPos.longitude };
    if (!isUserOriginNearRoute(origin, plan?.stops)) return;
    demoWalkRef.current = false;
    setAutoWalkActive(false);
    setSimulatedPos(null);
    liveGpsActiveRef.current = true;
    setPositionSource('gps');
  }, [positionSource, navActive, userPos?.latitude, userPos?.longitude, plan?.stops]);

  useEffect(() => {
    if (positionSource === 'manual') return;
    if (!userPos || !navActive || liveGpsActiveRef.current) return;
    const origin = { lat: userPos.latitude, lng: userPos.longitude };
    const routePts = walkPath?.length ? walkPath : plan?.stops;
    if (!isUserOriginNearRoute(origin, routePts)) return;
    const prev = lastUserPosRef.current;
    if (prev) {
      const movedM = haversineKm(prev, userPos) * 1000;
      if (movedM >= 12) {
        liveGpsActiveRef.current = true;
        setAutoWalkActive(false);
        setSimulatedPos(null);
        setPositionSource('gps');
      }
    }
    lastUserPosRef.current = { latitude: userPos.latitude, longitude: userPos.longitude };
  }, [positionSource, userPos?.latitude, userPos?.longitude, navActive, walkPath, plan?.stops]);

  useEffect(() => {
    if (!navActive) {
      autoWalkSeededRef.current = false;
      return;
    }
    if (!autoWalkActive || !walkPath?.length || liveGpsActiveRef.current) return;

    if (!autoWalkSeededRef.current) {
      autoWalkSeededRef.current = true;
      const seed = navigationPos || walkPath[0];
      setSimulatedPos({
        latitude: seed.latitude,
        longitude: seed.longitude,
      });
    }

    const timer = setInterval(() => {
      setSimulatedPos((prev) => {
        if (!prev) return prev;
        return advanceAlongPolyline(walkPath, prev, AUTO_WALK_STEP_M);
      });
    }, AUTO_WALK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [navActive, autoWalkActive, walkPath, navigationPos?.latitude, navigationPos?.longitude]);

  useEffect(() => {
    lastArrivedStopRef.current = null;
    autoWalkSeededRef.current = false;
    routeFollowBootRef.current = false;
  }, [activeStop?.id]);

  useEffect(() => {
    if (!autoStartNav || userNearRoute) return;
    if (simulatedPos) return;
    if (routeStartSeed) {
      setSimulatedPos(routeStartSeed);
      setAutoWalkActive(true);
      liveGpsActiveRef.current = false;
    }
  }, [autoStartNav, userNearRoute, simulatedPos, routeStartSeed]);

  useEffect(() => {
    if (!navActive || !navigationPos || !mapRef.current || !followUser || behindView) return;
    if (userControlledZoomRef.current) return;
    const now = Date.now();
    if (now - lastMapFollowAtRef.current < 420) return;
    lastMapFollowAtRef.current = now;
    zoomToNavigationTurn(navigationPos, { follow: true });
  }, [navActive, navigationPos?.latitude, navigationPos?.longitude, followUser, behindView, zoomToNavigationTurn]);

  useEffect(() => {
    if (!navigationPos || !mapRef.current || !followUser || !behindView) return;
    const bearing = travelBearing;
    if (bearing == null) return;
    const now = Date.now();
    if (now - lastMapFollowAtRef.current < 280) return;
    lastMapFollowAtRef.current = now;
    const camera = buildNavCamera(navigationPos, bearing);
    if (!camera) return;
    runNavCamera(camera, { animate: false });
  }, [
    behindView,
    followUser,
    navigationPos?.latitude,
    navigationPos?.longitude,
    travelBearing,
    buildNavCamera,
    runNavCamera,
  ]);

  const prevMapNavTypeRef = useRef('standard');

  useEffect(() => {
    if (!navActive || !followUser || !behindView || navCamera || !navigationPos) return;
    if (userControlledZoomRef.current) return;
    zoomToNavigationTurn(navigationPos, { follow: true });
  }, [navActive, followUser, behindView, navCamera, navigationPos, zoomToNavigationTurn]);

  useEffect(() => {
    const prev = prevMapNavTypeRef.current;
    prevMapNavTypeRef.current = mapNavType;
    if (!navCamera || !mapRef.current || mapNavType === prev) return;
    const t = setTimeout(() => runNavCamera(navCamera, { animate: false }), 80);
    return () => clearTimeout(t);
  }, [mapNavType, navCamera, runNavCamera]);

  const centerOnUser = useCallback(async () => {
    userControlledZoomRef.current = false;
    setFollowUser(true);
    setPositionSource('gps');
    setSimulatedPos(null);
    liveGpsActiveRef.current = true;
    setAutoWalkActive(false);
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
    if (navActive) {
      zoomToNavigationTurn(pos, { follow: true });
      return;
    }
    setBehindView(false);
    setNavCamera(null);
    focusOnRoutePosition(pos, { follow: true, resetZoom: false });
  }, [navigationPos, focusOnRoutePosition, navActive, zoomToNavigationTurn]);

  const onMapPress = useCallback(
    (e) => {
      const coord = e.nativeEvent?.coordinate;
      if (!coord) return;
      userControlledZoomRef.current = false;
      setPositionSource('manual');
      setSimulatedPos({ latitude: coord.latitude, longitude: coord.longitude });
      setFollowUser(true);
      setBehindView(true);
      setAutoWalkActive(false);
      liveGpsActiveRef.current = false;
      if (!navActive) setNavActive(true);
      legFetchIdRef.current += 1;
      lastLegSignatureRef.current = '';
      legTargetKeyRef.current = '';
      setLegPolyline(null);
      setLegSteps([]);
      setLegDurationSec(null);
      navCameraBootRef.current = false;
      setTimeout(() => zoomToNavigationTurn(coord, { follow: true }), 160);
      void fetchLeg(coord);
    },
    [navActive, zoomToNavigationTurn, fetchLeg],
  );

  const onStopMarkerPress = useCallback(
    (stop) => {
      if (skippedStopIds.includes(stop.id)) return;
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
    [plan?.stops, skippedStopIds],
  );

  const onMenu = useCallback(() => {
    Alert.alert(
      rp(language, 'navActions'),
      undefined,
      [
        {
          text: rp(language, 'skipStop'),
          onPress: () => {
            if (activeStop) skipStopById(activeStop.id);
          },
        },
        {
          text: rp(language, 'shareRoute'),
          onPress: async () => {
            const coords = getDirectionsCoordinatesFromPlan(plan, userPos, simulatedPos);
            const url = buildGoogleMapsDirectionsUrl(coords, transport);
            const stopList = (plan?.stops || []).map((s, idx) => `${idx + 1}. ${s.title}`).join('\n');
            const message = url ? `${headerTitle}\n${url}` : `${headerTitle}\n${stopList}`;
            try {
              await Share.share({ message, url: Platform.OS === 'ios' && url ? url : undefined });
            } catch {
              /* dismissed */
            }
          },
        },
        { text: pf(language, 'cancel'), style: 'cancel' },
      ],
      { cancelable: true },
    );
  }, [language, plan, headerTitle, userPos, simulatedPos, activeStop, skipStopById, transport]);

  const onStartNav = useCallback(() => {
    const nearRoute =
      userPos && plan?.stops?.length
        ? isUserOriginNearRoute({ lat: userPos.latitude, lng: userPos.longitude }, plan.stops)
        : false;
    setFollowUser(true);
    navCameraBootRef.current = false;
    routeFollowBootRef.current = false;
    userControlledZoomRef.current = false;
    demoWalkRef.current = !nearRoute;
    setAutoWalkActive(!nearRoute);
    setPositionSource(nearRoute ? 'gps' : 'manual');
    liveGpsActiveRef.current = nearRoute;
    if (nearRoute) {
      setSimulatedPos(null);
    } else {
      autoWalkSeededRef.current = false;
      if (routeStartSeed) setSimulatedPos(routeStartSeed);
    }
    mapZoomRef.current = ROUTE_FOLLOW_ZOOM;
    setNavActive(true);
  }, [userPos, plan?.stops, routeStartSeed]);

  useEffect(() => {
    if (!navActive || !navigationPos || navCameraBootRef.current) return;
    if (!legSteps.length && !legPolyline?.length && !walkPath?.length) return;
    navCameraBootRef.current = true;
    const t = setTimeout(() => {
      zoomToNavigationTurn(navigationPos, { follow: true });
    }, 320);
    return () => clearTimeout(t);
  }, [
    navActive,
    navigationPos?.latitude,
    navigationPos?.longitude,
    activeStop?.id,
    legSteps.length,
    legPolyline?.length,
    walkPath?.length,
    zoomToNavigationTurn,
  ]);

  useEffect(() => {
    navCameraBootRef.current = false;
    lastSpokenCueRef.current = { stepKey: '', threshold: Infinity };
    lastGuideStepIndexRef.current = -1;
    announcedGuideLandmarksRef.current = new Set();
    lastStreetGuideKeyRef.current = '';
    lastStreetGuidePosRef.current = null;
    setStreetGuideLabel('');
  }, [activeStop?.id]);

  useEffect(() => {
    if (!navActive) {
      lastGuideStepIndexRef.current = -1;
      announcedGuideLandmarksRef.current = new Set();
      lastStreetGuideKeyRef.current = '';
      setStreetGuideLabel('');
      return;
    }
    if (activeStepIndex < 0 || !navSteps[activeStepIndex]) return;
    if (activeStepIndex === lastGuideStepIndexRef.current) return;
    lastGuideStepIndexRef.current = activeStepIndex;
    const phrase = buildStepGuidePhrase(navSteps[activeStepIndex], language);
    if (phrase) speakNavGuide(phrase);
  }, [navActive, activeStepIndex, navSteps, language, speakNavGuide]);

  useEffect(() => {
    if (!navActive || !navigationPos || !plan?.stops?.length) return;
    for (const stop of plan.stops) {
      if (announcedGuideLandmarksRef.current.has(stop.id)) continue;
      const distM = distanceToStopMeters(navigationPos, stop);
      if (distM == null || distM > LANDMARK_GUIDE_RADIUS_M) continue;
      const phrase = buildLandmarkGuidePhrase(plan, stop, language);
      if (!phrase) continue;
      announcedGuideLandmarksRef.current.add(stop.id);
      speakNavGuide(phrase);
      break;
    }
  }, [
    navActive,
    navigationPos?.latitude,
    navigationPos?.longitude,
    plan?.stops,
    language,
    speakNavGuide,
  ]);

  useEffect(() => {
    if (!navActive || !navigationPos) return;
    const prev = lastStreetGuidePosRef.current;
    if (prev) {
      const movedM = distanceMetersBetween(prev, navigationPos);
      if (movedM != null && movedM < STREET_GUIDE_MOVE_M) return;
    }
    lastStreetGuidePosRef.current = { ...navigationPos };
    if (streetGuideBusyRef.current) return;
    streetGuideBusyRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const info = await fetchStreetGuideInfo(
          navigationPos.latitude,
          navigationPos.longitude,
          language,
        );
        if (cancelled || !info?.street) return;
        const key = streetGuideKey(info);
        if (!key || key === lastStreetGuideKeyRef.current) return;
        lastStreetGuideKeyRef.current = key;
        const phrase = buildStreetEnteredPhrase(info, language);
        const label = language === 'en' ? `On ${info.street}` : `Вул. ${info.street}`;
        setStreetGuideLabel(label);
        if (phrase) speakNavGuide(phrase);
      } finally {
        if (!cancelled) streetGuideBusyRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
      streetGuideBusyRef.current = false;
    };
  }, [navActive, navigationPos?.latitude, navigationPos?.longitude, language, speakNavGuide]);

  useEffect(() => {
    if (!navActive || !navigationPos || !nextManeuverStep) return;
    const stepKey = `${nextManeuverStep.end?.latitude?.toFixed(5)},${nextManeuverStep.end?.longitude?.toFixed(5)}:${nextManeuverStep.maneuver || ''}`;
    const distM = distToManeuverM ?? distanceToManeuverStep(navSteps, navigationPos, nextManeuverStep);
    if (distM == null) return;

    if (stepKey !== lastSpokenCueRef.current.stepKey) {
      lastSpokenCueRef.current = { stepKey, threshold: Infinity };
    }

    for (const threshold of NAV_SPEECH_THRESHOLDS_M) {
      if (distM <= threshold && lastSpokenCueRef.current.threshold > threshold) {
        lastSpokenCueRef.current.threshold = threshold;
        const phrase = formatTurnInstruction(nextManeuverStep, language, navigationPos, {
          distM,
          steps: navSteps,
        });
        if (!phrase) break;
        try {
          Speech.stop();
          lastNavSpeechAtRef.current = Date.now();
          Speech.speak(phrase, { language: language === 'uk' ? 'uk-UA' : 'en-US', rate: 0.92 });
        } catch {
          /* optional */
        }
        break;
      }
    }
  }, [
    navActive,
    navigationPos?.latitude,
    navigationPos?.longitude,
    nextManeuverStep,
    distToManeuverM,
    navSteps,
    language,
  ]);

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
      for (let i = idx + 1; i < plan.stops.length; i += 1) {
        if (!skippedStopIds.includes(plan.stops[i].id)) return i;
      }
      return idx;
    });
    autoOpenedStopIdRef.current = null;
  }, [plan?.stops, skippedStopIds]);

  useEffect(() => {
    if (!navActive || !autoWalkActive || !navigationPos || !activeStop) return;
    if (lastArrivedStopRef.current === activeStop.id) return;
    const distM = distanceToStopMeters(navigationPos, activeStop);
    if (distM == null || distM > STOP_ARRIVAL_M) return;
    lastArrivedStopRef.current = activeStop.id;
    markStopVisited(activeStop.id);
    autoWalkSeededRef.current = false;
    routeFollowBootRef.current = false;
    advanceToNextStop();
  }, [
    navActive,
    autoWalkActive,
    navigationPos?.latitude,
    navigationPos?.longitude,
    activeStop?.id,
    markStopVisited,
    advanceToNextStop,
  ]);

  const skipStopById = useCallback(
    (stopId) => {
      if (!plan?.stops?.length) return;

      setSkippedStopIds((prev) => {
        if (prev.includes(stopId)) return prev;
        const nextSkipped = [...prev, stopId];
        const remaining = plan.stops.filter((s) => !nextSkipped.includes(s.id));

        if (remaining.length === 0) {
          setTimeout(() => {
            Alert.alert('', rp(language, 'allStopsSkipped'), [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
          }, 0);
          return nextSkipped;
        }

        const curIdx = plan.stops.findIndex((s) => s.id === stopId);
        let nextIdx = -1;
        for (let i = curIdx + 1; i < plan.stops.length; i += 1) {
          if (!nextSkipped.includes(plan.stops[i].id)) {
            nextIdx = i;
            break;
          }
        }
        if (nextIdx < 0) {
          nextIdx = plan.stops.findIndex((s) => !nextSkipped.includes(s.id));
        }

        setCurrentStopIndex(nextIdx);
        autoOpenedStopIdRef.current = null;
        legFetchIdRef.current += 1;
        setLegPolyline(null);
        setLegSteps([]);
        setLegDurationSec(null);

        return nextSkipped;
      });
    },
    [plan?.stops, language, navigation],
  );

  const skipCurrentStop = useCallback(() => {
    if (!activeStop) return;
    skipStopById(activeStop.id);
  }, [activeStop, skipStopById]);

  const showRouteCompleteIfDone = useCallback(() => {
    if (!plan?.stops?.length || routeCompleteShownRef.current) return;
    const allHandled = plan.stops.every(
      (s) => visitedStopIds.includes(s.id) || skippedStopIds.includes(s.id),
    );
    if (!allHandled) return;
    
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
  }, [plan?.stops, visitedStopIds, skippedStopIds, sessionXpEarned, language]);

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
  const navigatorMode = navActive && followUser && behindView;
  const immersiveNav = navActive && followUser;

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
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={mapProvider}
          customMapStyle={mapCustomStyle}
          mapType={mapNavType}
          initialRegion={mapInitialRegion}
          mapPadding={navMapPadding}
          onMapReady={onMapReady}
          loadingEnabled
          loadingBackgroundColor={screenBg}
          userInterfaceStyle={mapUiStyle}
          onPress={onMapPress}
          showsUserLocation={!navigationPos}
          showsMyLocationButton={false}
          showsBuildings
          showsPointsOfInterest
          showsTraffic={false}
          followsUserLocation={false}
          scrollEnabled
          zoomEnabled
          zoomTapEnabled
          pitchEnabled={navActive && followUser && behindView}
          rotateEnabled={navActive && followUser && behindView}
          showsCompass={false}
          onPanDrag={() => {
            if (!isUserMapGesture()) return;
            userControlledZoomRef.current = true;
            setFollowUser(false);
            setBehindView(false);
            setNavCamera(null);
          }}
          onRegionChange={(_region, details) => {
            if (details?.isGesture && isUserMapGesture()) {
              userControlledZoomRef.current = true;
              setFollowUser(false);
              setBehindView(false);
              setNavCamera(null);
            }
          }}
          onRegionChangeComplete={onRegionChangeComplete}
        >
          {navActive && navRouteSlices.traveled.length >= 2 ? (
            <Polyline
              coordinates={navRouteSlices.traveled}
              strokeColor="rgba(120,130,150,0.55)"
              strokeWidth={10}
              lineCap="round"
              lineJoin="round"
            />
          ) : null}
          {navActive && navRouteSlices.remaining.length >= 2 ? (
            <>
              <Polyline
                coordinates={navRouteSlices.remaining}
                strokeColor={NAV_ROUTE_GLOW}
                strokeWidth={24}
                lineCap="round"
                lineJoin="round"
              />
              <RouteMapPath
                key={`nav-line-${activeStop?.id || 'route'}`}
                coordinates={navRouteSlices.remaining}
                accent={NAV_ROUTE_BLUE}
                isLight
                mode="nav"
                showArrows
              />
            </>
          ) : mapRouteCoords.length >= 2 ? (
            <RouteMapPath
              coordinates={mapRouteCoords}
              accent={accent}
              isLight={isLight}
              mode={routePathMode}
              showArrows={false}
            />
          ) : null}
          {!navActive && navWaypoint ? (
            <Marker coordinate={navWaypoint} anchor={{ x: 0.5, y: 0.5 }} zIndex={25} tracksViewChanges={false}>
              <View style={[styles.waypointPin, { backgroundColor: accent, borderColor: isLight ? '#FFF' : '#1A1A1A' }]}>
                <Text style={[styles.waypointPinText, { color: onAccentButtonText(isLight) }]}>→</Text>
              </View>
            </Marker>
          ) : null}
          {navActive && nextTurnPoint && nextManeuverStep && isSignificantManeuver(nextManeuverStep.maneuver) ? (
            <Marker coordinate={nextTurnPoint} anchor={{ x: 0.5, y: 0.5 }} zIndex={28} tracksViewChanges={false}>
              <View style={[styles.turnPointRing, { borderColor: accent }]}>
                <View style={[styles.turnPointCore, { backgroundColor: accent }]} />
              </View>
            </Marker>
          ) : null}
          {gpsOffRouteCoords ? (
            <>
              <Polyline
                coordinates={gpsOffRouteCoords}
                strokeColor="rgba(2,18,235,0.45)"
                strokeWidth={4}
                lineDashPattern={[6, 8]}
              />
              <Marker coordinate={userPos} anchor={{ x: 0.5, y: 0.5 }} zIndex={31} tracksViewChanges={false}>
                <View style={[styles.gpsRawDot, { borderColor: '#FFFFFF', backgroundColor: accent }]} />
              </Marker>
            </>
          ) : null}
          {displayNavigationPos ? (
            <Marker
              coordinate={displayNavigationPos}
              anchor={{ x: 0.5, y: 0.58 }}
              zIndex={32}
              flat={navActive}
              rotation={navActive ? puckMapRotation : 0}
              tracksViewChanges={false}
              onPress={onWalkerPress}
            >
              <View style={styles.navPuckWrap}>
                {navActive ? (
                  <View style={[styles.navPuckBeam, { borderBottomColor: 'rgba(0,102,255,0.38)' }]} />
                ) : null}
                <View style={styles.navPuckRing}>
                  <View style={[styles.navPuckDot, { backgroundColor: NAV_ROUTE_BLUE }]} />
                </View>
                {navActive ? (
                  <View style={[styles.navPuckLabel, { backgroundColor: chrome.panelBg, borderColor: chromeBorder }]}>
                    <Text style={[styles.navPuckLabelText, brandFontSansBold, { color: isGpsPosition ? accent : textMain }]}>
                      {positionModeLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Marker>
          ) : null}
          {navActive && navDestinationCoord ? (
            <Marker
              coordinate={navDestinationCoord}
              anchor={{ x: 0.5, y: 1 }}
              zIndex={28}
              tracksViewChanges={false}
            >
              <View style={styles.destPinWrap}>
                <View style={[styles.destPinHead, { backgroundColor: NAV_ROUTE_BLUE, borderColor: '#FFFFFF' }]}>
                  <Ionicons name="flag" size={16} color="#FFFFFF" />
                </View>
                <View style={[styles.destPinStem, { backgroundColor: NAV_ROUTE_BLUE }]} />
                <View style={[styles.destPinLabel, { backgroundColor: chrome.panelBg, borderColor: chromeBorder }]}>
                  <Text style={[styles.destPinLabelTag, brandFontSansSemibold, { color: accent }]}>
                    {rp(language, 'navGoalPin')}
                  </Text>
                  <Text style={[styles.destPinLabelTitle, brandFontSansBold, { color: textMain }]} numberOfLines={2}>
                    {activeStop?.title || ''}
                  </Text>
                </View>
              </View>
            </Marker>
          ) : null}
          {(navActive ? [] : plan.stops).map((s, idx) => {
            const stopIndex = navActive ? currentStopIndex : idx;
            const isSkipped = skippedStopIds.includes(s.id);
            return (
            <Marker
              key={s.id}
              coordinate={{ latitude: s.lat, longitude: s.lng }}
              tracksViewChanges={false}
              onPress={() => onStopMarkerPress(s)}
            >
              <View style={[isSkipped && { opacity: 0.35 }]}>
              <View
                style={[
                  styles.markerWrap,
                  stopIndex === currentStopIndex && !isSkipped && { borderColor: accent, borderWidth: 3 },
                  visitedStopIds.includes(s.id) && { opacity: 0.72 },
                ]}
              >
                <Image source={routeStopImageSource(s.thumb)} style={styles.markerImg} resizeMode="cover" />
                {stopIndex === currentStopIndex && !isSkipped ? (
                  <View style={[styles.markerActiveRing, { borderColor: accent }]} />
                ) : null}
              </View>
              </View>
            </Marker>
            );
          })}
        </MapView>

        {!immersiveNav ? (
          <LinearGradient
            pointerEvents="none"
            colors={
              isLight
                ? ['transparent', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0.92)']
                : ['transparent', 'rgba(10,10,10,0.25)', 'rgba(10,10,10,0.88)']
            }
            locations={[0, 0.55, 1]}
            style={styles.mapFade}
          />
        ) : null}

        <View style={styles.uiLayer} pointerEvents="box-none" collapsable={false}>
        <View style={[styles.topBar, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
          {!navigatorMode ? (
          <View
            style={[
              styles.topBarCard,
              { borderColor: chromeBorder, backgroundColor: chrome.panelBg },
            ]}
          >
            {Platform.OS === 'ios' && chrome.useGlass ? (
              <BlurView intensity={76} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
            ) : null}
            <View style={[styles.topBarTint, { backgroundColor: chrome.panelBg }]} pointerEvents="none" />
            <View style={[styles.topBarRow, { backgroundColor: chrome.panelBg }]}>
              <Pressable
                onPress={() => navigation.goBack()}
                style={({ pressed }) => [
                  styles.circleBtn,
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
              <View style={[styles.topTitleWrap, { backgroundColor: chrome.panelBg }]}>
                <Text style={[styles.topTitle, brandFontSansBold, { color: textMain }]} numberOfLines={1}>
                  {activeStop.title}
                </Text>
                {remainingStopsCount > 1 ? (
                  <Text style={[styles.topSubtitle, brandFontSansSemibold, { color: textMuted }]} numberOfLines={1}>
                    {routeCountryTitle(language, plan)} · {rp(language, 'stopProgress', {
                      current: Math.max(1, remainingStops.findIndex((s) => s.id === activeStop?.id) + 1),
                      total: remainingStopsCount,
                    })}
                  </Text>
                ) : (
                  <Text style={[styles.topSubtitle, brandFontSansSemibold, { color: textMuted }]} numberOfLines={1}>
                    {routeCountryTitle(language, plan)}
                  </Text>
                )}
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.circleBtn,
                  {
                    backgroundColor: chrome.iconBtnBg,
                    borderColor: chrome.iconBtnBorder,
                    borderWidth: 1,
                  },
                  pressed && { opacity: 0.82 },
                ]}
                onPress={onMenu}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={textMain} />
              </Pressable>
            </View>
          </View>
          ) : (
            <View style={styles.navigatorTopRow}>
              <Pressable
                onPress={() => navigation.goBack()}
                style={({ pressed }) => [
                  styles.circleBtn,
                  styles.navigatorCircleBtn,
                  { backgroundColor: chrome.iconBtnBg, borderColor: chrome.iconBtnBorder, borderWidth: 1 },
                  pressed && { opacity: 0.82 },
                ]}
              >
                <Ionicons name="chevron-back" size={22} color={textMain} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.circleBtn,
                  styles.navigatorCircleBtn,
                  { backgroundColor: chrome.iconBtnBg, borderColor: chrome.iconBtnBorder, borderWidth: 1 },
                  pressed && { opacity: 0.82 },
                ]}
                onPress={onMenu}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={textMain} />
              </Pressable>
            </View>
          )}
        </View>

        {navActive ? (
          <View
            style={[
              styles.directionBanner,
              navigatorMode && styles.directionBannerNav,
              {
                top: navigatorMode ? insets.top + 10 : insets.top + 78,
                borderColor: chromeBorder,
                backgroundColor: chrome.panelBg,
              },
            ]}
            pointerEvents="none"
          >
            {Platform.OS === 'ios' && chrome.useGlass ? (
              <BlurView intensity={76} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
            ) : null}
            <View style={[styles.directionBannerTint, { backgroundColor: chrome.panelBg }]} pointerEvents="none" />
            <View
              style={[
                styles.directionArrowWrap,
                navigatorMode && styles.directionArrowWrapNav,
                { backgroundColor: isLight ? 'rgba(2,18,235,0.12)' : 'rgba(225,255,0,0.16)' },
              ]}
            >
              <Ionicons
                name={turnInstruction ? turnIconForManeuver(nextManeuverStep?.maneuver) : 'arrow-up'}
                size={navigatorMode ? 34 : 26}
                color={accent}
              />
            </View>
            <View style={{ flex: 1 }}>
              {!navigatorMode ? (
                <Text style={[styles.directionGoLabel, brandFontSansSemibold, { color: textMuted }]}>
                  {rp(language, 'goThisWay')}
                </Text>
              ) : (
                <Text style={[styles.directionGoLabel, brandFontSansSemibold, { color: accent }]}>
                  {positionModeLabel} · {rp(language, 'followBlueRoute')}
                </Text>
              )}
              <Text
                style={[
                  styles.directionMain,
                  navigatorMode && styles.directionMainNav,
                  brandFontSansBold,
                  { color: textMain },
                ]}
                numberOfLines={2}
              >
                {walkDirectionHint}
              </Text>
              <Text style={[styles.directionSub, brandFontSansMedium, { color: navigatorMode ? textMuted : accent }]}>
                {navigatorMode && activeStop
                  ? `${rp(language, 'headingTo')} ${activeStop.title}${navBannerSub ? ` · ${navBannerSub}` : ''}`
                  : currentStreetLabel
                    ? `${currentStreetLabel}${navBannerSub ? ` · ${navBannerSub}` : ''}`
                    : navBannerSub}
              </Text>
            </View>
          </View>
        ) : null}

        {polyBusy || legBusy ? (
          <View style={[styles.mapBadge, { borderColor: chromeBorder }]}>
            {Platform.OS === 'ios' && chrome.useGlass ? (
              <BlurView intensity={72} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
            ) : null}
            <View style={[styles.mapBadgeTint, { backgroundColor: chrome.panelBg }]} pointerEvents="none" />
            <ActivityIndicator color={accent} size="small" />
          </View>
        ) : null}

        {!navActive ? (
          <View style={[styles.mapHint, { borderColor: chromeBorder }]} pointerEvents="none">
            {Platform.OS === 'ios' && chrome.useGlass ? (
              <BlurView intensity={72} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
            ) : null}
            <View style={[styles.mapHintTint, { backgroundColor: chrome.panelBg }]} pointerEvents="none" />
            <Ionicons name="footsteps-outline" size={15} color={accent} />
            <Text style={[styles.mapHintText, brandFontSansSemibold, { color: textMain }]} numberOfLines={2}>
              {rp(language, 'tapMapToWalk')}
            </Text>
          </View>
        ) : null}

        <Pressable
          style={[styles.mapFab, styles.mapFabLeft, { backgroundColor: fabBg, borderColor: chromeBorder }]}
          onPress={fitMap}
          accessibilityRole="button"
          accessibilityLabel={rp(language, 'fitFullRoute')}
        >
          <Ionicons name="scan-outline" size={20} color={accent} />
        </Pressable>

        <Pressable
          style={[styles.mapFab, styles.mapFabZoomOut, { backgroundColor: fabBg, borderColor: chromeBorder }]}
          onPress={zoomOutMap}
          accessibilityRole="button"
          accessibilityLabel={rp(language, 'zoomOutMap')}
        >
          <Ionicons name="remove" size={22} color={accent} />
        </Pressable>

        {navActive && positionSource === 'manual' ? (
          <Pressable
            style={[
              styles.posModeChip,
              { top: insets.top + 112, backgroundColor: fabBg, borderColor: chromeBorder },
            ]}
            onPress={centerOnUser}
            accessibilityRole="button"
            accessibilityLabel={rp(language, 'switchToGps')}
          >
            <Ionicons name="navigate" size={16} color={accent} />
            <Text style={[styles.posModeChipText, brandFontSansSemibold, { color: textMain }]}>
              {rp(language, 'switchToGps')}
            </Text>
          </Pressable>
        ) : null}

        {navActive && isGpsPosition ? (
          <View
            style={[
              styles.tapMoveHint,
              { borderColor: chromeBorder, backgroundColor: chrome.panelBg, bottom: insets.bottom + 178 },
            ]}
            pointerEvents="none"
          >
            <Ionicons name="finger-print-outline" size={14} color={accent} />
            <Text style={[styles.tapMoveHintText, brandFontSansMedium, { color: textMuted }]}>
              {rp(language, 'tapMapToMove')}
            </Text>
          </View>
        ) : null}

        {navActive && !navigatorMode ? (
          <Pressable
            style={[
              styles.followChip,
              { backgroundColor: accent, borderColor: accent, bottom: insets.bottom + 108 },
            ]}
            onPress={centerOnUser}
            accessibilityRole="button"
            accessibilityLabel={rp(language, 'tapFollowCamera')}
          >
            <Ionicons name="navigate" size={18} color={onAccentButtonText(isLight)} />
            <Text style={[styles.followChipText, brandFontSansBold, { color: onAccentButtonText(isLight) }]}>
              {rp(language, 'tapFollowCamera')}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          style={[
            styles.mapFab,
            styles.mapFabZoomIn,
            { backgroundColor: navActive ? accent : fabBg, borderColor: navActive ? accent : chromeBorder },
          ]}
          onPress={zoomInMap}
          accessibilityRole="button"
          accessibilityLabel={navActive ? rp(language, 'followWalker') : rp(language, 'zoomInMap')}
        >
          <Ionicons
            name={navActive ? 'navigate' : 'add'}
            size={navActive ? 20 : 22}
            color={navActive ? onAccentButtonText(isLight) : accent}
          />
        </Pressable>

        {turnInstruction ? (
          <Pressable
            style={[styles.mapFab, styles.mapFabTurn, { backgroundColor: accent, borderColor: accent }]}
            onPress={zoomToTurn}
            accessibilityRole="button"
            accessibilityLabel={rp(language, 'zoomToTurn')}
          >
            <Ionicons name="git-merge-outline" size={20} color={onAccentButtonText(isLight)} />
          </Pressable>
        ) : null}

        <Pressable
          style={[
            styles.mapFab,
            styles.mapFabLocate,
            {
              backgroundColor: navActive && behindView ? accent : fabBg,
              borderColor: navActive && behindView ? accent : chromeBorder,
            },
          ]}
          onPress={centerOnUser}
          accessibilityRole="button"
          accessibilityLabel={navActive ? rp(language, 'followWalker') : rp(language, 'recenterMap')}
        >
          <Ionicons
            name={followUser && behindView ? 'locate' : 'locate-outline'}
            size={22}
            color={navActive && behindView ? onAccentButtonText(isLight) : accent}
          />
        </Pressable>

        <View
          style={[
            styles.sheet,
            immersiveNav && styles.sheetCompact,
            { paddingBottom: lightTabBarScrollContentPadding(insets.bottom, immersiveNav ? 6 : 12) },
          ]}
        >
          <View style={[styles.sheetCard, { borderColor: chromeBorder }]}>
            {Platform.OS === 'ios' && chrome.useGlass ? (
              <BlurView intensity={72} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
            ) : null}
            <View style={[styles.sheetTint, { backgroundColor: chrome.sheetBg }]} pointerEvents="none" />
            <View style={styles.sheetInner}>
              <View style={[styles.sheetHandle, { backgroundColor: isLight ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.28)' }]} />

              {navActive && remainingStopsCount > 1 ? (
                <View style={styles.progressWrap}>
                  <View style={[styles.progressTrack, { backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)' }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.round(stopProgressRatio * 100)}%`, backgroundColor: accent },
                      ]}
                    />
                  </View>
                </View>
              ) : null}

              {!navActive ? (
                <>
                  <View style={styles.sheetHead}>
                    <Image source={routeStopImageSource(activeStop.thumb)} style={styles.sheetThumb} resizeMode="cover" />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sheetTitle, brandFontSansBold, { color: textMain }]} numberOfLines={2}>
                        {activeStop.title}
                      </Text>
                      <Text style={[styles.sheetMeta, brandFontSansMedium, { color: textMuted }]}>
                        {walkMin} {rp(language, 'minShort')} · {rp(language, transportLabelKey)}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.modePill, { backgroundColor: chrome.chipBg, borderColor: chromeBorder }]}>
                    <Ionicons name={transportModeIconName} size={20} color={accent} />
                    <Text style={[styles.modeText, brandFontSansSemibold, { color: accent }]}>
                      {walkMin} {rp(language, 'minShort')} · {rp(language, transportLabelKey)}
                    </Text>
                  </View>

                  {turnInstruction ? (
                    <Pressable
                      onPress={onWalkerPress}
                      style={({ pressed }) => [
                        styles.turnRow,
                        { backgroundColor: chrome.chipBg, borderWidth: 1, borderColor: chromeBorder },
                        pressed && { opacity: 0.9 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={rp(language, 'zoomToTurn')}
                    >
                      <View style={[styles.turnIconWrap, { backgroundColor: chrome.statIconBg }]}>
                        <Ionicons
                          name={turnIconForManeuver(nextManeuverStep?.maneuver)}
                          size={24}
                          color={accent}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.turnText, brandFontSansBold, { color: textMain }]} numberOfLines={2}>
                          {turnInstruction}
                        </Text>
                        <Text style={[styles.turnHint, brandFontSansMedium, { color: accent }]}>
                          {rp(language, 'tapTurnToZoom')}
                        </Text>
                      </View>
                      <Ionicons name="search-outline" size={18} color={accent} />
                    </Pressable>
                  ) : null}

                  <Pressable
                    onPress={onStartNav}
                    style={({ pressed }) => [styles.primaryBtnOuter, pressed && { opacity: 0.92, transform: [{ scale: 0.985 }] }]}
                    android_ripple={ripple}
                  >
                    <LinearGradient colors={goGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtn}>
                      <Ionicons name="navigate" size={20} color={onAccentButtonText(isLight)} style={{ marginRight: 8 }} />
                      <Text style={[styles.primaryBtnText, brandFontSansBold, { color: onAccentButtonText(isLight) }]}>
                        {rp(language, 'startTrip')}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                  <Text style={[styles.primarySub, brandFontSansMedium, { color: textMuted }]}>
                    {rp(language, 'historyRadius')}
                  </Text>

                  {remainingStopsCount > 1 ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.skipStopBtn,
                        {
                          borderColor: chromeBorder,
                          backgroundColor: isLight ? '#FFFFFF' : chrome.chipBg,
                        },
                        pressed && { opacity: 0.88 },
                      ]}
                      android_ripple={ripple}
                      onPress={skipCurrentStop}
                    >
                      <Ionicons name="play-skip-forward-outline" size={18} color={accent} style={{ marginRight: 8 }} />
                      <Text style={[styles.skipStopBtnText, brandFontSansSemibold, { color: textMain }]}>
                        {rp(language, 'skipStop')}
                      </Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    style={({ pressed }) => [
                      styles.secondaryBtn,
                      {
                        borderColor: chromeBorder,
                        backgroundColor: isLight ? '#FFFFFF' : chrome.chipBg,
                      },
                      pressed && { opacity: 0.88 },
                    ]}
                    android_ripple={ripple}
                    onPress={() => navigation.goBack()}
                  >
                    <Text style={[styles.secondaryBtnText, brandFontSansSemibold, { color: textMain }]}>
                      {rp(language, 'changePath')}
                    </Text>
                  </Pressable>
                </>
              ) : immersiveNav ? (
                <>
                  {turnInstruction ? (
                    <View
                      style={[
                        styles.turnRow,
                        styles.turnRowCompact,
                        { backgroundColor: chrome.chipBg, borderWidth: 1, borderColor: chromeBorder },
                      ]}
                    >
                      <View style={[styles.turnIconWrap, { backgroundColor: chrome.statIconBg }]}>
                        <Ionicons
                          name={turnIconForManeuver(nextManeuverStep?.maneuver)}
                          size={22}
                          color={accent}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.turnText, brandFontSansBold, { color: textMain }]} numberOfLines={2}>
                          {turnInstruction}
                        </Text>
                        <Text style={[styles.turnHint, brandFontSansMedium, { color: textMuted }]}>
                          {autoWalkActive ? rp(language, 'autoWalking') : rp(language, 'tapMapWalkActive')}
                        </Text>
                      </View>
                      {etaMinToStop != null ? (
                        <Text style={[styles.compactEta, brandFontSansBold, { color: accent }]}>
                          {etaMinToStop} {rp(language, 'minShort')}
                        </Text>
                      ) : null}
                    </View>
                  ) : (
                    <View style={styles.navHeadCompact}>
                      {walkHeadingDeg != null ? (
                        <View style={[styles.compass, styles.compassCompact, { backgroundColor: isLight ? 'rgba(2,18,235,0.10)' : 'rgba(225,255,0,0.14)' }]}>
                          <Ionicons
                            name="navigate"
                            size={22}
                            color={accent}
                            style={{ transform: [{ rotate: `${walkHeadingDeg}deg` }] }}
                          />
                        </View>
                      ) : null}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.navHeadingLabel, brandFontSansSemibold, { color: textMuted }]}>
                          {rp(language, 'goThisWay')}
                        </Text>
                        <Text style={[styles.navHeadingTitle, brandFontSansBold, { color: textMain }]} numberOfLines={2}>
                          {walkDirectionHint}
                        </Text>
                        <Text style={[styles.turnHint, brandFontSansMedium, { color: textMuted }]}>
                          {rp(language, 'followBlueLine')}
                          {etaMinToStop != null ? ` · ~${etaMinToStop} ${rp(language, 'minShort')}` : ''}
                        </Text>
                      </View>
                    </View>
                  )}

                  {withinHistory ? (
                    <Pressable
                      onPress={onViewHistory}
                      style={({ pressed }) => [
                        styles.primaryBtnOuter,
                        styles.primaryBtnOuterCompact,
                        pressed && { opacity: 0.92 },
                      ]}
                      android_ripple={ripple}
                    >
                      <LinearGradient colors={goGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtnCompact}>
                        <Ionicons name="book-outline" size={18} color={onAccentButtonText(isLight)} style={{ marginRight: 6 }} />
                        <Text style={[styles.primaryBtnText, brandFontSansBold, { color: onAccentButtonText(isLight) }]}>
                          {rp(language, 'viewHistory')}
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <>
                  {turnInstruction ? (
                    <Pressable
                      onPress={zoomToTurn}
                      style={({ pressed }) => [
                        styles.turnRow,
                        { backgroundColor: chrome.chipBg, borderWidth: 1, borderColor: chromeBorder },
                        pressed && { opacity: 0.9 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={rp(language, 'zoomToTurn')}
                    >
                      <View style={[styles.turnIconWrap, { backgroundColor: chrome.statIconBg }]}>
                        <Ionicons
                          name={turnIconForManeuver(nextManeuverStep?.maneuver)}
                          size={24}
                          color={accent}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.turnText, brandFontSansBold, { color: textMain }]} numberOfLines={2}>
                          {turnInstruction}
                        </Text>
                        <Text style={[styles.turnHint, brandFontSansMedium, { color: accent }]}>
                          {rp(language, 'tapTurnToZoom')}
                        </Text>
                      </View>
                      <Ionicons name="search-outline" size={18} color={accent} />
                    </Pressable>
                  ) : (
                    <View style={styles.navHead}>
                      {bearingToStop != null ? (
                        <View style={[styles.compass, { backgroundColor: isLight ? 'rgba(2,18,235,0.10)' : 'rgba(225,255,0,0.14)' }]}>
                          <Ionicons
                            name="navigate"
                            size={28}
                            color={accent}
                            style={{ transform: [{ rotate: `${bearingToStop}deg` }] }}
                          />
                        </View>
                      ) : null}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.navHeadingLabel, brandFontSansSemibold, { color: textMuted }]}>
                          {rp(language, 'headingTo')}
                        </Text>
                        <Text style={[styles.navHeadingTitle, brandFontSansBold, { color: textMain }]} numberOfLines={2}>
                          {activeStop.title}
                        </Text>
                        {etaMinToStop != null ? (
                          <Text style={[styles.navEta, brandFontSansSemibold, { color: accent }]}>
                            {rp(language, 'etaToStop', { min: etaMinToStop })}
                          </Text>
                        ) : null}
                        {legBusy ? (
                          <Text style={[styles.navEta, brandFontSansMedium, { color: textMuted }]}>
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
                        { backgroundColor: isLight ? 'rgba(2,18,235,0.06)' : 'rgba(225,255,0,0.08)', borderColor: chromeBorder },
                      ]}
                    >
                      <Text style={[styles.distMain, brandFontSansBold, { color: textMain }]}>
                        {distToHistoryLabel}
                      </Text>
                      <Text style={[styles.distSub, brandFontSansMedium, { color: textMuted }]}>
                        {rp(language, 'metersToHistory')}
                        {sessionXpEarned > 0 ? ` · +${sessionXpEarned} XP` : ''}
                      </Text>
                    </View>
                  ) : null}

                  <Pressable
                    onPress={onViewHistory}
                    style={({ pressed }) => [
                      styles.primaryBtnOuter,
                      pressed && { opacity: 0.92, transform: [{ scale: 0.985 }] },
                    ]}
                    android_ripple={ripple}
                  >
                    <LinearGradient
                      colors={withinHistory ? goGradient : isLight ? ['#F6F8FD', '#EEF2FF'] : ['#2A2A2E', '#1E1E22']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[
                        styles.primaryBtn,
                        !withinHistory && { borderWidth: 1, borderColor: chromeBorder },
                      ]}
                    >
                      <Ionicons
                        name={withinHistory ? 'book-outline' : 'footsteps-outline'}
                        size={20}
                        color={withinHistory ? onAccentButtonText(isLight) : accent}
                        style={{ marginRight: 8 }}
                      />
                      <Text
                        style={[
                          styles.primaryBtnText,
                          brandFontSansBold,
                          { color: withinHistory ? onAccentButtonText(isLight) : textMain },
                        ]}
                      >
                        {withinHistory
                          ? rp(language, 'viewHistory')
                          : rp(language, 'historyToGo', { dist: distToHistoryLabel })}
                      </Text>
                    </LinearGradient>
                  </Pressable>

                  {!withinHistory ? (
                    <Text style={[styles.historyRadiusHint, brandFontSansMedium, { color: textMuted }]}>
                      {rp(language, 'historyRadius')}
                    </Text>
                  ) : null}

                  {remainingStopsCount > 1 ? (
                    <Text style={[styles.remainingStopsHint, brandFontSansMedium, { color: textMuted }]}>
                      {rp(language, 'remainingStops', { count: remainingStopsCount })}
                    </Text>
                  ) : null}

                  {remainingStopsCount > 1 ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.skipStopBtn,
                        {
                          borderColor: chromeBorder,
                          backgroundColor: isLight ? '#FFFFFF' : chrome.chipBg,
                        },
                        pressed && { opacity: 0.88 },
                      ]}
                      android_ripple={ripple}
                      onPress={skipCurrentStop}
                    >
                      <Ionicons name="play-skip-forward-outline" size={18} color={accent} style={{ marginRight: 8 }} />
                      <Text style={[styles.skipStopBtnText, brandFontSansSemibold, { color: textMain }]}>
                        {rp(language, 'skipStop')}
                      </Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    style={({ pressed }) => [
                      styles.secondaryBtn,
                      {
                        borderColor: chromeBorder,
                        backgroundColor: isLight ? '#FFFFFF' : chrome.chipBg,
                      },
                      pressed && { opacity: 0.88 },
                    ]}
                    android_ripple={ripple}
                    onPress={() => navigation.goBack()}
                  >
                    <Text style={[styles.secondaryBtnText, brandFontSansSemibold, { color: textMuted }]}>
                      {rp(language, 'skipRoute')}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        </View>
        </View>
      </View>
    </RenderProfiler>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  mapFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 180,
    zIndex: 4,
  },
  uiLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  fallback: { flex: 1 },
  fallbackText: { padding: 24, fontSize: 16 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: 14,
  },
  topBarCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.14,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  topBarTint: {
    ...StyleSheet.absoluteFillObject,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitleWrap: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  topTitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  topSubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
  },
  mapBadge: {
    position: 'absolute',
    top: 108,
    alignSelf: 'center',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 12,
  },
  mapBadgeTint: {
    ...StyleSheet.absoluteFillObject,
  },
  mapFab: {
    position: 'absolute',
    right: 14,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  mapFabLeft: {
    left: 14,
    right: undefined,
    bottom: 292,
  },
  mapFabLocate: {
    bottom: 236,
  },
  mapFabZoomIn: {
    bottom: 180,
  },
  mapFabZoomOut: {
    bottom: 124,
  },
  mapFabTurn: {
    bottom: 348,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 18,
    paddingHorizontal: 12,
  },
  sheetCompact: {
    paddingHorizontal: 10,
  },
  sheetCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
      },
      android: { elevation: 14 },
    }),
  },
  sheetTint: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetInner: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 4,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  progressWrap: { marginBottom: 14 },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 14 },
  sheetThumb: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: '#EEE',
  },
  sheetTitle: { fontSize: 19, lineHeight: 24 },
  sheetMeta: { fontSize: 13, marginTop: 5 },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 14,
    gap: 8,
  },
  modeText: { fontSize: 15 },
  secondaryBtn: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryBtnText: { fontSize: 15 },
  skipStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  skipStopBtnText: { fontSize: 15 },
  remainingStopsHint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
  primaryBtnOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  primaryBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 17 },
  primarySub: { fontSize: 12, marginTop: 8, marginBottom: 4, textAlign: 'center', lineHeight: 16 },
  navHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 14 },
  compass: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navHeadingLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  navHeadingTitle: { fontSize: 18, marginTop: 3, lineHeight: 23 },
  navEta: { fontSize: 14, marginTop: 5 },
  distBar: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  distMain: { fontSize: 22, textAlign: 'center' },
  distSub: { fontSize: 12, marginTop: 5, textAlign: 'center', lineHeight: 16 },
  markerWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: '#FFF',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.22,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
    }),
  },
  markerActiveRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: 2,
    opacity: 0.55,
  },
  markerImg: { width: '100%', height: '100%' },
  mapFabLeft: {
    right: undefined,
    left: 14,
  },
  mapHint: {
    position: 'absolute',
    left: 14,
    right: 72,
    bottom: 304,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
    }),
  },
  mapHintTint: {
    ...StyleSheet.absoluteFillObject,
    opacity: Platform.OS === 'ios' ? 0.72 : 1,
  },
  mapHintText: { flex: 1, fontSize: 12, lineHeight: 16 },
  navPuckWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navPuckBeam: {
    position: 'absolute',
    top: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 16,
    borderRightWidth: 16,
    borderBottomWidth: 30,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  navPuckRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.95)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.28,
        shadowRadius: 5,
      },
      android: { elevation: 6 },
    }),
  },
  navPuckDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  navPuckLabel: {
    position: 'absolute',
    bottom: -2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.14,
        shadowRadius: 3,
      },
      android: { elevation: 3 },
    }),
  },
  navPuckLabelText: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
  destPinWrap: {
    alignItems: 'center',
    maxWidth: 160,
  },
  destPinHead: {
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
        shadowOpacity: 0.22,
        shadowRadius: 4,
      },
      android: { elevation: 5 },
    }),
  },
  destPinStem: {
    width: 4,
    height: 14,
    borderRadius: 2,
    marginTop: -2,
  },
  destPinLabel: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    maxWidth: 160,
  },
  destPinLabelTag: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  destPinLabelTitle: {
    fontSize: 12,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 2,
  },
  gpsRawDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  posModeChip: {
    position: 'absolute',
    right: 16,
    zIndex: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  posModeChipText: {
    fontSize: 12,
  },
  tapMoveHint: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  tapMoveHintText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  followChip: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  followChipText: {
    fontSize: 14,
    flexShrink: 1,
    textAlign: 'center',
  },
  turnPointRing: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  turnPointCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  directionBanner: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.14,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  directionBannerNav: {
    left: 10,
    right: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  navigatorTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  navigatorCircleBtn: {
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  directionBannerTint: {
    ...StyleSheet.absoluteFillObject,
  },
  directionArrowWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionArrowWrapNav: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  directionGoLabel: {
    fontSize: 11,
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  directionMain: {
    fontSize: 16,
    lineHeight: 21,
  },
  directionMainNav: {
    fontSize: 22,
    lineHeight: 28,
  },
  directionSub: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
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
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  turnRowCompact: {
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  navHeadCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  compassCompact: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  compactEta: {
    fontSize: 15,
    minWidth: 44,
    textAlign: 'right',
  },
  primaryBtnOuterCompact: {
    marginTop: 4,
    marginBottom: 0,
  },
  primaryBtnCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  turnIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  turnText: {
    fontSize: 18,
    lineHeight: 24,
  },
  turnHint: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  historyRadiusHint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 2,
    lineHeight: 16,
  },
});
