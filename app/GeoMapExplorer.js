import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  Keyboard,
  ScrollView,
  DeviceEventEmitter,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSyncedAppLanguage } from './useAppLanguage';
import { brandFontSansMedium, brandFontSansBold, brandFontSansSemibold } from './brandFont';

import { getAppTheme, THEME_CHANGED_EVENT, resolveAppTheme } from './themeStorage';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { RenderProfiler } from './performanceMetrics';
import { gm } from './geoMapI18n';
import { fetchPublishedLocations, searchLocationsPublished } from './locationsApi';
import { fetchGoogleDirectionsPolyline, getGoogleMapsApiKey, openGoogleMapsDirections } from './googleMapsRoute';
import { geocodeAddress, reverseGeocodeLabel } from './googleGeocode';
import { buildGeoMapWalkPlan } from './geoMapRoutePlan';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { getSavedLandmarks } from './savedLandmarksStorage';
import { resolveSavedLandmarkRow } from './savedLandmarksResolve';
import {
  resolveCatalogLandmarkTitle,
  resolveCatalogRegionTitle,
} from './catalogDisplayI18n';
import { lightTabBarOverlayBottomInset } from './LightBottomTabBar';

const UA_CENTER = { latitude: 48.45, longitude: 31.18, latitudeDelta: 6.5, longitudeDelta: 6.5 };

/** Темна палітра карти — глибокий navy/ocean, приглушені підписи. */
const MAP_STYLE_DARK = [
  { elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1117' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#1f2937' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#1a2332' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1a3328' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#243044' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a2332' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2d3a52' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a1628' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#374151' }] },
];

function mapStyleForTheme(isLight) {
  return isLight ? [] : MAP_STYLE_DARK;
}

function visitCategoryFromDb(category) {
  const c = String(category || '').toLowerCase();
  if (c === 'museum') return 'museum';
  if (c === 'park') return 'park';
  if (c === 'monument' || c === 'church' || c === 'art') return 'monument';
  return 'other';
}

function normGeocodeRow(row, fallbackTitle, language) {
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const title = String(row.label || row.title || fallbackTitle || '').trim();
  return {
    id: String(row.id || `geo_${lat}_${lng}`),
    title: title || gm(language, 'customPoint'),
    city: String(row.city || '').trim(),
    country: String(row.country || '').trim(),
    category: 'other',
    lat,
    lng,
    cover_image_url: row.cover_image_url || null,
    isGeocode: true,
  };
}
function normLoc(row) {
  if (!row || !row.id) return null;
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: String(row.id),
    title: String(row.title || ''),
    city: String(row.city || ''),
    country: String(row.country || ''),
    category: row.category,
    lat,
    lng,
    cover_image_url: row.cover_image_url,
  };
}

function straightCoords(points) {
  if (!points || points.length < 2) return [];
  return points.map((p) => ({ latitude: p.lat, longitude: p.lng }));
}

/**
 * @param {{ navigation: any, route: any, bottomInset?: number, topContentInset?: number | null, isTabActive?: boolean }} props
 */
export default function GeoMapExplorer({
  navigation,
  route,
  bottomInset = 0,
  topContentInset = null,
  isTabActive = true,
}) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const [appTheme, setAppTheme] = useState(resolveAppTheme(route?.params?.appTheme));
  const mapRef = useRef(null);
  const debounceRef = useRef(null);
  const searchInputRef = useRef(null);

  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [searchHits, setSearchHits] = useState([]);
  const [geocodeHits, setGeocodeHits] = useState([]);
  const [geocoding, setGeocoding] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchNetworkError, setSearchNetworkError] = useState(false);
  const [searchRetryNonce, setSearchRetryNonce] = useState(0);
  const [catalogHint, setCatalogHint] = useState(null);
  const [routeSeq, setRouteSeq] = useState([]);
  const [roadPath, setRoadPath] = useState(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [userPos, setUserPos] = useState(null);
  const [meta, setMeta] = useState({ distanceM: null, durationSec: null });
  const [mapReady, setMapReady] = useState(false);
  const [mapLayout, setMapLayout] = useState({ width: 0, height: 0 });
  const [mapLayoutEpoch, setMapLayoutEpoch] = useState(0);
  const [mapFault, setMapFault] = useState(false);
  const mapTabActiveRef = useRef(false);
  const [savedList, setSavedList] = useState([]);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    let c = false;
    (async () => {
      const t = await getAppTheme();
      if (!c) setAppTheme(t === 'light' ? 'light' : 'dark');
    })();
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setAppTheme(v === 'light' ? 'light' : 'dark');
    });
    return () => {
      c = true;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (route?.params?.appTheme === 'light' || route?.params?.appTheme === 'dark') {
      setAppTheme(route.params.appTheme);
    }
  }, [route?.params?.appTheme]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(query.trim()), 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    const raw = route?.params?.mapInitialRoutePoint;
    if (!raw || typeof raw !== 'object') return;
    const lat = Number(raw.lat);
    const lng = Number(raw.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const loc = {
      id: String(raw.id || `${lat}_${lng}`),
      title: String(raw.title || '').trim() || '—',
      city: String(raw.city || '').trim(),
      country: String(raw.country || '').trim(),
      category: raw.category || 'other',
      lat,
      lng,
      cover_image_url: raw.cover_image_url || null,
    };
    setRouteSeq([loc]);
    const t = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.animateToRegion(
          { latitude: lat, longitude: lng, latitudeDelta: 0.06, longitudeDelta: 0.06 },
          450,
        );
      }
    }, 320);
    if (typeof navigation?.setParams === 'function') {
      navigation.setParams({ mapInitialRoutePoint: undefined });
    }
    return () => clearTimeout(t);
  }, [route?.params?.mapInitialRoutePoint, navigation]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { rows, networkError } = await fetchPublishedLocations(45);
      if (cancelled) return;
      const list = rows.map(normLoc).filter(Boolean);
      setCatalog(list);
      if (networkError) setCatalogHint('network');
      else if (!list.length) setCatalogHint('empty');
      else setCatalogHint(null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const q = debouncedQ;
    if (q.length < 2) {
      setSearchHits([]);
      setSearching(false);
      setSearchNetworkError(false);
      return;
    }
    setSearching(true);
    setSearchNetworkError(false);
    (async () => {
      const { rows, networkError } = await searchLocationsPublished(q, 24);
      if (!cancelled) {
        setSearchHits(rows.map(normLoc).filter(Boolean));
        setSearchNetworkError(networkError);
        setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, searchRetryNonce]);

  useEffect(() => {
    let cancelled = false;
    const q = debouncedQ;
    if (q.length < 2) {
      setGeocodeHits([]);
      setGeocoding(false);
      return undefined;
    }
    setGeocoding(true);
    (async () => {
      let rows = [];
      const key = getGoogleMapsApiKey();
      if (key) {
        rows = await geocodeAddress(q, language);
      } else {
        try {
          const expoRows = await Location.geocodeAsync(q);
          rows = (Array.isArray(expoRows) ? expoRows : []).slice(0, 10).map((g, i) => ({
            id: `expo_${i}_${g.latitude}_${g.longitude}`,
            label: q,
            lat: g.latitude,
            lng: g.longitude,
          }));
        } catch {
          rows = [];
        }
      }
      if (!cancelled) {
        setGeocodeHits(rows.map((row) => normGeocodeRow(row, q, language)).filter(Boolean));
        setGeocoding(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, language]);

  useEffect(() => {
    let sub;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 30, timeInterval: 8000 },
        (loc) => setUserPos(loc.coords),
      );
    })();
    return () => sub?.remove();
  }, []);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const textMain = isLight ? '#1E1E1E' : '#F7F7F2';
  const textMuted = isLight ? '#5C5C5C' : '#B8B8B8';
  const cardBg = isLight ? 'rgba(255,255,255,0.98)' : 'rgba(28,28,30,0.97)';
  const cardBorder = isLight ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.22)';
  const surfaceTint = isLight ? 'rgba(255,255,255,0.82)' : 'rgba(28,28,30,0.88)';
  const fabBg = isLight ? '#FFFFFF' : 'rgba(44,44,46,0.98)';
  const fabBorder = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.26)';
  const chromeBorderWidth = 1;
  const tabBarClearance = lightTabBarOverlayBottomInset(insets.bottom, 16);
  const mapBackdrop = isLight ? '#E8E8E0' : '#2C2C2E';
  const hasMapsKey = Boolean(getGoogleMapsApiKey());
  const mapProvider = useMemo(
    () => (hasMapsKey ? PROVIDER_GOOGLE : Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined),
    [hasMapsKey],
  );
  const mapStyle = useMemo(
    () => (mapProvider === PROVIDER_GOOGLE ? mapStyleForTheme(isLight) : undefined),
    [isLight, mapProvider],
  );
  const mapSized = mapLayout.width > 64 && mapLayout.height > 64;
  const sheetFloatBottom = tabBarClearance;
  const fabStackBottom = tabBarClearance + (routeSeq.length > 0 ? 176 : 132);

  const shell = useMemo(
    () => ({
      user: route?.params?.user,
      language,
      ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
      appTheme: isLight ? 'light' : 'dark',
    }),
    [route?.params?.user, route?.params?.countryId, language, isLight],
  );

  const displayPins = useMemo(() => {
    if (debouncedQ.length >= 2) return searchHits;
    return catalog;
  }, [debouncedQ, searchHits, catalog]);

  const markerPins = useMemo(() => {
    const byId = new Map();
    for (const p of displayPins) byId.set(p.id, p);
    for (const p of routeSeq) {
      if (!byId.has(p.id)) byId.set(p.id, p);
    }
    return [...byId.values()];
  }, [displayPins, routeSeq]);

  const listData = useMemo(() => {
    if (debouncedQ.length < 2) return [];
    const seen = new Set();
    const out = [];
    const push = (row) => {
      const key = `${Number(row.lat).toFixed(5)}_${Number(row.lng).toFixed(5)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(row);
    };
    for (const row of searchHits) push(row);
    for (const row of geocodeHits) push(row);
    return out;
  }, [debouncedQ, searchHits, geocodeHits]);

  const drawCoords = useMemo(() => {
    if (roadPath && roadPath.length >= 2) return roadPath;
    return straightCoords(routeSeq);
  }, [roadPath, routeSeq]);

  useEffect(() => {
    if (routeSeq.length < 2) {
      setRoadPath(null);
      setMeta({ distanceM: null, durationSec: null });
      return;
    }
    let cancelled = false;
    setRouteBusy(true);
    const pts = routeSeq.map((p) => ({ latitude: p.lat, longitude: p.lng }));
    const key = getGoogleMapsApiKey();
    (async () => {
      if (key) {
        const { path, distanceM, durationSec } = await fetchGoogleDirectionsPolyline(pts, 'walk', key);
        if (!cancelled) {
          setRoadPath(path && path.length >= 2 ? path : straightCoords(routeSeq));
          setMeta({ distanceM, durationSec });
        }
      } else if (!cancelled) {
        setRoadPath(straightCoords(routeSeq));
        setMeta({ distanceM: null, durationSec: null });
      }
    })().finally(() => {
      if (!cancelled) setRouteBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [routeSeq]);

  const fitAll = useCallback(() => {
    const coords = [];
    if (routeSeq.length) {
      for (const p of routeSeq) coords.push({ latitude: p.lat, longitude: p.lng });
    } else if (userPos) {
      coords.push({ latitude: userPos.latitude, longitude: userPos.longitude });
    } else {
      for (const p of displayPins.slice(0, 16)) {
        coords.push({ latitude: p.lat, longitude: p.lng });
      }
    }
    if (drawCoords.length >= 2) coords.push(...drawCoords);
    if (!mapRef.current || coords.length < 1) return;
    const topPadSafe =
      topContentInset != null && Number.isFinite(Number(topContentInset))
        ? Number(topContentInset)
        : insets.top + 10;
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: {
        top: Math.round(topPadSafe + 100),
        right: 36,
        bottom: 210 + bottomInset + insets.bottom,
        left: 36,
      },
      animated: true,
    });
  }, [displayPins, routeSeq, drawCoords, userPos, bottomInset, topContentInset, insets.top]);

  useEffect(() => {
    if (!mapReady || routeSeq.length === 0) return;
    const t = setTimeout(() => {
      fitAll();
    }, 220);
    return () => clearTimeout(t);
  }, [mapReady, routeSeq, fitAll]);

  useEffect(() => {
    if (!mapReady) return;
    const t = setTimeout(fitAll, 500);
    return () => clearTimeout(t);
  }, [fitAll, displayPins.length, routeSeq.length, mapReady]);

  const toggleInRoute = useCallback((loc) => {
    if (!loc) return;
    Keyboard.dismiss();
    setRouteSeq((prev) => {
      const i = prev.findIndex((x) => x.id === loc.id);
      if (i >= 0) return prev.filter((x) => x.id !== loc.id);
      if (prev.length >= 12) return prev;
      return [...prev, loc];
    });
  }, []);

  const addPointToRoute = useCallback(
    (lat, lng, title) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const loc = {
        id: `pin_${lat.toFixed(5)}_${lng.toFixed(5)}_${Date.now()}`,
        title: String(title || '').trim() || gm(language, 'customPoint'),
        city: '',
        country: '',
        category: 'other',
        lat,
        lng,
        cover_image_url: null,
        isGeocode: true,
      };
      toggleInRoute(loc);
      if (mapRef.current) {
        mapRef.current.animateToRegion(
          { latitude: lat, longitude: lng, latitudeDelta: 0.04, longitudeDelta: 0.04 },
          380,
        );
      }
    },
    [language, toggleInRoute],
  );

  const onMapPress = useCallback(
    (e) => {
      Keyboard.dismiss();
      const c = e?.nativeEvent?.coordinate;
      if (!c) return;
      (async () => {
        let title = gm(language, 'customPoint');
        const rev = await reverseGeocodeLabel(c.latitude, c.longitude, language);
        if (rev) {
          title = rev;
        } else {
          try {
            const expoRows = await Location.reverseGeocodeAsync({
              latitude: c.latitude,
              longitude: c.longitude,
            });
            const p = expoRows?.[0];
            if (p) {
              title =
                [p.name, p.street, p.city, p.region, p.country].filter(Boolean).join(', ') || title;
            }
          } catch {
            /* ignore */
          }
        }
        addPointToRoute(c.latitude, c.longitude, title);
      })();
    },
    [addPointToRoute, language],
  );

  const clearRoute = useCallback(() => {
    setRouteSeq([]);
    setRoadPath(null);
    setMeta({ distanceM: null, durationSec: null });
  }, []);

  const toggleSavedPanel = useCallback(async () => {
    if (showSaved) {
      setShowSaved(false);
      return;
    }
    const rows = await getSavedLandmarks();
    const resolved = rows
      .map((r) => {
        const res = resolveSavedLandmarkRow(r);
        if (!res?.lm) return null;
        const lm = res.lm;
        const lat = Number(lm.lat);
        const lng = Number(lm.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          id: r.key || `${r.countryId}_${r.landmarkId}`,
          title: resolveCatalogLandmarkTitle(lm, language, {
            regionId: r.regionId,
            landmarkId: r.landmarkId,
          }),
          city: resolveCatalogRegionTitle(res.region, language),
          country: r.flag || '',
          category: lm.category || 'other',
          lat,
          lng,
          cover_image_url: null,
        };
      })
      .filter(Boolean);
    setSavedList(resolved);
    setShowSaved(true);
  }, [showSaved, language]);

  const startInAppWalk = useCallback(() => {
    if (routeSeq.length < 2) return;
    const plan = buildGeoMapWalkPlan(routeSeq, meta, userPos);
    if (!plan) return;
    navigation.navigate('RouteNavigation', {
      ...shell,
      routePlan: plan,
      mapPolyline: roadPath && roadPath.length >= 2 ? roadPath : null,
      autoStartNav: true,
    });
  }, [routeSeq, meta, userPos, navigation, shell, roadPath]);

  const navigateRoute = useCallback(() => {
    if (routeSeq.length < 2) return;
    const coords = routeSeq.map((p) => ({ latitude: p.lat, longitude: p.lng }));
    openGoogleMapsDirections(coords, 'walk');
  }, [routeSeq]);

  const centerUser = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted' || !mapRef.current) return;
    const pos = userPos
      ? { latitude: userPos.latitude, longitude: userPos.longitude }
      : await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then((p) => ({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        }));
    mapRef.current.animateToRegion(
      {
        ...pos,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      },
      420,
    );
  }, [userPos]);

  const openCard = useCallback(
    (loc) => {
      const headerTitle = String(loc.title || '').trim();
      const photoUri =
        loc.cover_image_url && /^https?:\/\//i.test(String(loc.cover_image_url))
          ? String(loc.cover_image_url).trim()
          : undefined;
      navigation.navigate('LandmarkResult', {
        ...shell,
        title: loc.title,
        headerTitle: headerTitle || loc.title,
        subtitle: loc.city || loc.country || '',
        extract: '',
        source: 'geoCatalog',
        startPhase: 'full',
        visitCity: loc.city || '',
        visitCategory: visitCategoryFromDb(loc.category),
        visitLat: loc.lat,
        visitLng: loc.lng,
        ...(photoUri ? { photoUri } : {}),
      });
    },
    [navigation, shell],
  );

  const topPad =
    topContentInset != null && Number.isFinite(Number(topContentInset))
      ? Number(topContentInset)
      : insets.top + 10;

  const kmLabel =
    meta.distanceM != null && meta.distanceM > 0
      ? `${(meta.distanceM / 1000).toFixed(1)} ${gm(language, 'routeKm')}`
      : '';
  const minLabel =
    meta.durationSec != null && meta.durationSec > 0
      ? `${Math.round(meta.durationSec / 60)} ${gm(language, 'routeMin')}`
      : '';

  const kickMapCamera = useCallback(() => {
    if (!mapRef.current) return;
    const center = userPos
      ? {
          latitude: userPos.latitude,
          longitude: userPos.longitude,
          latitudeDelta: 0.12,
          longitudeDelta: 0.12,
        }
      : UA_CENTER;
    mapRef.current.animateToRegion(center, 1);
    fitAll();
  }, [fitAll, userPos]);

  const handleMapReady = useCallback(() => {
    setMapFault(false);
    setMapReady(true);
    requestAnimationFrame(() => kickMapCamera());
  }, [kickMapCamera]);

  const remountMap = useCallback(() => {
    setMapReady(false);
    setMapFault(false);
    setMapLayoutEpoch((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!isTabActive || !mapReady) return;
    const t = setTimeout(() => {
      fitAll();
    }, 280);
    return () => clearTimeout(t);
  }, [isTabActive, mapReady, fitAll]);

  useEffect(() => {
    const becameActive = isTabActive && !mapTabActiveRef.current;
    mapTabActiveRef.current = isTabActive;
    if (!becameActive) return;
    remountMap();
  }, [isTabActive, remountMap]);

  useEffect(() => {
    if (!isTabActive || !mapSized) return;
    const t = setTimeout(() => kickMapCamera(), 420);
    return () => clearTimeout(t);
  }, [isTabActive, mapSized, mapLayoutEpoch, kickMapCamera]);

  useEffect(() => {
    if (!mapSized || mapReady || !isTabActive) {
      setMapFault(false);
      return undefined;
    }
    const t = setTimeout(() => setMapFault(true), 4500);
    return () => clearTimeout(t);
  }, [mapSized, mapReady, isTabActive, mapLayoutEpoch]);

  const focusMapOn = useCallback((loc) => {
    if (!loc || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: loc.lat,
        longitude: loc.lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      },
      400,
    );
  }, []);

  const handleMapHostLayout = useCallback(
    (e) => {
      const { width, height } = e.nativeEvent.layout;
      setMapLayout({ width, height });
      if (!isTabActive || width < 64 || height < 64) return;
      requestAnimationFrame(() => {
        if (mapRef.current && mapReady) fitAll();
      });
    },
    [fitAll, isTabActive, mapReady],
  );

  const topChrome = (
    <View style={[styles.topBlock, { paddingTop: topPad }]}>
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={isLight ? 88 : 76}
          tint={isLight ? 'light' : 'dark'}
          style={[styles.searchBlur, { borderColor: cardBorder, borderWidth: chromeBorderWidth }]}
        >
          <View style={[styles.searchSurfaceTint, { backgroundColor: surfaceTint }]} />
          <View style={styles.searchRow}>
            <View style={[styles.searchIconWrap, { backgroundColor: isLight ? 'rgba(2,18,235,0.10)' : 'rgba(225,255,0,0.12)' }]}>
              <Ionicons name="search" size={20} color={accent} />
            </View>
            <TextInput
              ref={searchInputRef}
              value={query}
              onChangeText={setQuery}
              placeholder={gm(language, 'searchPlaceholder')}
              placeholderTextColor={textMuted}
              style={[styles.input, brandFontSansMedium, { color: textMain }]}
              returnKeyType="search"
              blurOnSubmit={false}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="never"
              underlineColorAndroid="transparent"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            {query.length > 0 ? (
              <Pressable
                onPress={() => {
                  setQuery('');
                  Keyboard.dismiss();
                }}
                hitSlop={12}
                style={({ pressed }) => [styles.clearSearch, pressed && { opacity: 0.65 }]}
              >
                <Ionicons name="close-circle" size={22} color={textMuted} />
              </Pressable>
            ) : null}
          </View>
        </BlurView>
      ) : (
        <View
          style={[
            styles.searchCardAndroid,
            { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: chromeBorderWidth },
          ]}
        >
          <View style={styles.searchRow}>
            <View style={[styles.searchIconWrap, { backgroundColor: isLight ? 'rgba(2,18,235,0.10)' : 'rgba(225,255,0,0.12)' }]}>
              <Ionicons name="search" size={20} color={accent} />
            </View>
            <TextInput
              ref={searchInputRef}
              value={query}
              onChangeText={setQuery}
              placeholder={gm(language, 'searchPlaceholder')}
              placeholderTextColor={textMuted}
              style={[styles.input, brandFontSansMedium, { color: textMain }]}
              returnKeyType="search"
              blurOnSubmit={false}
              autoCorrect={false}
              autoCapitalize="none"
              underlineColorAndroid="transparent"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            {query.length > 0 ? (
              <Pressable
                onPress={() => {
                  setQuery('');
                  Keyboard.dismiss();
                }}
                hitSlop={12}
                style={({ pressed }) => [styles.clearSearch, pressed && { opacity: 0.65 }]}
              >
                <Ionicons name="close-circle" size={22} color={textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>
      )}

      {debouncedQ.length > 0 && debouncedQ.length < 2 ? (
        <View style={[styles.hintPill, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.hint, brandFontSansMedium, { color: textMuted, marginTop: 0 }]}>
            {gm(language, 'searchHint')}
          </Text>
        </View>
      ) : null}

      {catalogHint === 'network' && !catalog.length ? (
        <View style={[styles.hintPill, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.hint, brandFontSansMedium, { color: textMuted, marginTop: 0 }]}>
            {gm(language, 'apiOffline')}
          </Text>
        </View>
      ) : null}
      {catalogHint === 'empty' && !catalog.length ? (
        <View style={[styles.hintPill, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.hint, brandFontSansMedium, { color: textMuted, marginTop: 0 }]}>
            {gm(language, 'catalogEmpty')}
          </Text>
        </View>
      ) : null}

      {searchNetworkError && debouncedQ.length >= 2 && !searching ? (
        <View style={[styles.searchErrBox, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Ionicons name="cloud-offline-outline" size={20} color={accent} style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.searchErrTxt, brandFontSansMedium, { color: textMain }]}>
              {gm(language, 'searchFailed')}
            </Text>
            <Pressable
              onPress={() => setSearchRetryNonce((n) => n + 1)}
              hitSlop={8}
              style={({ pressed }) => ({ marginTop: 8, opacity: pressed ? 0.8 : 1 })}
            >
              <Text style={[styles.searchRetry, { color: accent }]}>{gm(language, 'searchRetry')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {listData.length > 0 ? (
        <View
          style={[
            styles.listCard,
            { backgroundColor: cardBg, borderColor: cardBorder, maxHeight: 156 },
          ]}
        >
          {searching || geocoding ? (
            <ActivityIndicator style={{ padding: 20 }} color={accent} />
          ) : (
            <RenderProfiler id="GeoMapExplorer:search">
              <FlashList
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                data={listData}
                estimatedItemSize={56}
                keyExtractor={(it) => it.id}
                renderItem={({ item }) => {
                  const inR = routeSeq.some((x) => x.id === item.id);
                  return (
                    <View style={[styles.rowOuter, { borderBottomColor: cardBorder }]}>
                      <Pressable
                        onPress={() => {
                          toggleInRoute(item);
                          focusMapOn(item);
                        }}
                        android_ripple={ripple}
                        style={({ pressed }) => [styles.rowToggle, pressed && { opacity: 0.92 }]}
                      >
                        <View style={styles.rowTextCol}>
                          <Text style={[styles.rowTitle, brandFontSansMedium, { color: textMain }]} numberOfLines={2}>
                            {item.title}
                          </Text>
                          <Text style={[styles.rowSub, { color: textMuted }]} numberOfLines={1}>
                            {item.city}
                            {item.country ? ` · ${item.country}` : ''}
                          </Text>
                        </View>
                        <Ionicons
                          name={inR ? 'checkmark-circle' : 'add-circle-outline'}
                          size={26}
                          color={accent}
                          style={styles.rowRouteIcon}
                        />
                      </Pressable>
                      {!item.isGeocode ? (
                      <Pressable
                        onPress={() => openCard(item)}
                        android_ripple={ripple}
                        style={({ pressed }) => [
                          styles.rowCardBtn,
                          { borderLeftColor: cardBorder, opacity: pressed ? 0.88 : 1 },
                        ]}
                        hitSlop={6}
                      >
                        <Text style={[styles.miniBtnTxt, brandFontSansMedium, { color: accent }]}>
                          {gm(language, 'openCard')}
                        </Text>
                      </Pressable>
                      ) : null}
                    </View>
                  );
                }}
              />
            </RenderProfiler>
          )}
        </View>
      ) : debouncedQ.length >= 2 && !searching && !geocoding && !searchNetworkError ? (
        <View style={[styles.hintPill, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.hint, brandFontSansMedium, { color: textMuted, marginTop: 0 }]}>
            {gm(language, 'noResults')}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const floatingChrome = (
    <>
      <Pressable
        style={[
          styles.fab,
          {
            backgroundColor: fabBg,
            borderColor: fabBorder,
            borderWidth: chromeBorderWidth,
            bottom: fabStackBottom + 58,
          },
        ]}
        onPress={toggleSavedPanel}
        accessibilityRole="button"
        accessibilityLabel={gm(language, 'savedPlaces')}
      >
        <Ionicons name={showSaved ? 'heart' : 'heart-outline'} size={22} color={accent} />
      </Pressable>

      <Pressable
        style={[
          styles.fab,
          {
            backgroundColor: fabBg,
            borderColor: fabBorder,
            borderWidth: chromeBorderWidth,
            bottom: fabStackBottom,
          },
        ]}
        onPress={centerUser}
        accessibilityRole="button"
        accessibilityLabel={gm(language, 'recenter')}
      >
        <Ionicons name="locate" size={22} color={accent} />
      </Pressable>

      {showSaved ? (
        <View
          style={[
            styles.savedPanel,
            {
              backgroundColor: isLight ? 'rgba(255,255,255,0.96)' : 'rgba(36,36,38,0.94)',
              borderColor: cardBorder,
              bottom: fabStackBottom + 118,
              maxHeight: 148,
            },
          ]}
        >
          {savedList.length === 0 ? (
            <Text style={[styles.hint, { color: textMuted, padding: 16 }]}>
              {gm(language, 'noSaved')}
            </Text>
          ) : (
            <RenderProfiler id="GeoMapExplorer:saved">
              <FlashList
                keyboardShouldPersistTaps="handled"
                data={savedList}
                estimatedItemSize={56}
                keyExtractor={(it) => it.id}
                renderItem={({ item }) => {
                  const inR = routeSeq.some((x) => x.id === item.id);
                  return (
                    <Pressable
                      onPress={() => {
                        toggleInRoute(item);
                        focusMapOn(item);
                        setShowSaved(false);
                      }}
                      android_ripple={ripple}
                      style={({ pressed }) => [
                        styles.row,
                        { borderBottomColor: cardBorder, opacity: pressed ? 0.88 : 1 },
                      ]}
                    >
                      <Ionicons name="heart" size={18} color={accent} style={{ marginRight: 10 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: textMain }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={[styles.rowSub, { color: textMuted }]} numberOfLines={1}>
                          {item.city} {item.country}
                        </Text>
                      </View>
                      <Ionicons
                        name={inR ? 'checkmark-circle' : 'add-circle-outline'}
                        size={24}
                        color={accent}
                      />
                    </Pressable>
                  );
                }}
              />
            </RenderProfiler>
          )}
        </View>
      ) : null}

      <View
        style={[
          styles.bottomSheetWrap,
          { bottom: sheetFloatBottom },
          routeSeq.length === 0 && styles.bottomSheetWrapCompact,
        ]}
      >
        <View
          style={[
            styles.bottomSheet,
            isLight ? styles.bottomSheetLight : styles.bottomSheetDark,
            routeSeq.length === 0 && styles.bottomSheetCompact,
            { borderColor: cardBorder, borderWidth: chromeBorderWidth },
          ]}
        >
          {Platform.OS === 'ios' ? (
            <BlurView intensity={isLight ? 80 : 72} tint={isLight ? 'light' : 'dark'} style={StyleSheet.absoluteFill} />
          ) : null}
          <View
            style={[
              styles.bottomSheetTint,
              {
                backgroundColor: isLight ? 'rgba(255,255,255,0.94)' : 'rgba(32,32,34,0.92)',
              },
            ]}
          />
          <View style={[styles.bottomSheetInner, routeSeq.length === 0 && styles.bottomSheetInnerCompact]}>
            <View style={[styles.sheetHandle, { backgroundColor: isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.32)' }]} />
            <View style={styles.sheetHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, brandFontSansBold, { color: textMain }]}>
                  {gm(language, 'routePoints')}
                </Text>
                <Text style={[styles.sheetHint, brandFontSansMedium, { color: textMuted }]}>
                  {gm(language, 'tapMapHint')}
                </Text>
              </View>
              {routeSeq.length > 0 ? (
                <View style={[styles.countBadge, { backgroundColor: isLight ? 'rgba(2,18,235,0.10)' : 'rgba(225,255,0,0.14)' }]}>
                  <Text style={[styles.countBadgeTxt, brandFontSansBold, { color: accent }]}>
                    {routeSeq.length}
                  </Text>
                </View>
              ) : null}
            </View>

            {routeSeq.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.routeChipsRow}
                keyboardShouldPersistTaps="handled"
              >
                {routeSeq.map((p, i) => (
                  <Pressable
                    key={p.id}
                    onPress={() => toggleInRoute(p)}
                    style={({ pressed }) => [
                      styles.routeChip,
                      {
                        borderColor: cardBorder,
                        backgroundColor: isLight ? 'rgba(2,18,235,0.06)' : 'rgba(225,255,0,0.08)',
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <View style={[styles.routeChipNum, { backgroundColor: accent }]}>
                      <Text style={[styles.routeChipNumTxt, brandFontSansBold, { color: onAccentButtonText(isLight) }]}>
                        {i + 1}
                      </Text>
                    </View>
                    <Text style={[styles.routeChipTitle, brandFontSansMedium, { color: textMain }]} numberOfLines={1}>
                      {p.title}
                    </Text>
                    <Ionicons name="close" size={14} color={textMuted} style={{ marginLeft: 4 }} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {routeBusy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator size="small" color={accent} style={{ marginRight: 8 }} />
                <Text style={[styles.busyTxt, brandFontSansMedium, { color: textMuted }]}>
                  {gm(language, 'routeLoading')}
                </Text>
              </View>
            ) : null}

            {(kmLabel || minLabel) && routeSeq.length >= 2 ? (
              <View style={[styles.metaBadge, { borderColor: isLight ? 'rgba(2,18,235,0.15)' : 'rgba(225,255,0,0.25)' }]}>
                <Ionicons name="walk-outline" size={16} color={accent} style={{ marginRight: 6 }} />
                <Text style={[styles.metaLine, brandFontSansSemibold, { color: accent }]}>
                  {[kmLabel, minLabel].filter(Boolean).join(' · ')}
                </Text>
              </View>
            ) : null}

            <View style={styles.btnRow}>
              <Pressable
                onPress={clearRoute}
                style={({ pressed }) => [
                  styles.btnGhost,
                  {
                    borderColor: accent,
                    backgroundColor: isLight ? 'rgba(2,18,235,0.04)' : 'rgba(225,255,0,0.08)',
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={[styles.btnGhostTxt, brandFontSansSemibold, { color: accent }]}>
                  {gm(language, 'clearRoute')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (routeSeq.length < 2) return;
                  fitAll();
                }}
                style={({ pressed }) => [
                  styles.btnPrimary,
                  {
                    backgroundColor: accent,
                    opacity: pressed ? 0.9 : routeSeq.length < 2 ? 0.42 : 1,
                  },
                  routeSeq.length >= 2 && !isLight
                    ? {
                        shadowColor: accent,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.35,
                        shadowRadius: 10,
                      }
                    : null,
                ]}
                disabled={routeSeq.length < 2}
              >
                <Ionicons
                  name="git-network-outline"
                  size={18}
                  color={onAccentButtonText(isLight)}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.btnPrimaryTxt, brandFontSansBold, { color: onAccentButtonText(isLight) }]}>
                  {gm(language, 'buildRoute')}
                </Text>
              </Pressable>
            </View>

            {routeSeq.length >= 2 ? (
              <Pressable
                onPress={startInAppWalk}
                style={({ pressed }) => [
                  styles.navBtn,
                  {
                    borderColor: accent,
                    backgroundColor: isLight ? 'rgba(2,18,235,0.08)' : 'rgba(225,255,0,0.10)',
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}
              >
                <Ionicons name="walk" size={18} color={accent} style={{ marginRight: 8 }} />
                <Text style={[styles.navBtnTxt, brandFontSansSemibold, { color: textMain }]}>
                  {gm(language, 'startWalk')}
                </Text>
              </Pressable>
            ) : null}

            {routeSeq.length >= 2 ? (
              <Pressable
                onPress={navigateRoute}
                style={({ pressed }) => [
                  styles.navBtn,
                  {
                    borderColor: cardBorder,
                    backgroundColor: isLight ? 'rgba(2,18,235,0.04)' : 'rgba(255,255,255,0.05)',
                    opacity: pressed ? 0.88 : 1,
                    marginTop: 8,
                  },
                ]}
              >
                <Ionicons name="navigate" size={18} color={accent} style={{ marginRight: 8 }} />
                <Text style={[styles.navBtnTxt, brandFontSansSemibold, { color: textMuted }]}>
                  {gm(language, 'openInMaps')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </>
  );

  return (
    <View style={[styles.flex, { backgroundColor: mapBackdrop }]}>
      <View
        style={[styles.mapLayer, { backgroundColor: mapBackdrop }]}
        collapsable={false}
        onLayout={handleMapHostLayout}
      >
        {isTabActive ? (
          <MapView
            key={`geo-map-${mapLayoutEpoch}`}
            ref={mapRef}
            style={styles.mapFill}
            provider={mapProvider}
            initialRegion={UA_CENTER}
            customMapStyle={mapStyle}
            userInterfaceStyle={isLight ? 'light' : 'dark'}
            showsUserLocation
            showsMyLocationButton={false}
            showsCompass={false}
            showsScale={false}
            showsPointsOfInterest
            toolbarEnabled={false}
            mapType="standard"
            loadingEnabled
            loadingBackgroundColor={mapBackdrop}
            loadingIndicatorColor={accent}
            onMapReady={handleMapReady}
            onPress={onMapPress}
            moveOnMarkerPress={false}
          >
            {drawCoords.length >= 2 ? (
              <Polyline
                coordinates={drawCoords}
                strokeColor={accent}
                strokeWidth={5}
                lineCap="round"
                lineJoin="round"
                lineDashPattern={roadPath && roadPath.length >= 2 ? undefined : [10, 7]}
              />
            ) : null}
            {markerPins.map((p) => {
              const ord = routeSeq.findIndex((x) => x.id === p.id);
              const inRoute = ord >= 0;
              if (inRoute) {
                return (
                  <Marker
                    key={p.id}
                    coordinate={{ latitude: p.lat, longitude: p.lng }}
                    title={p.title}
                    description={p.city || p.country || ''}
                    onPress={() => toggleInRoute(p)}
                    anchor={{ x: 0.5, y: 0.5 }}
                    tracksViewChanges={false}
                  >
                    <View style={[styles.routePin, { backgroundColor: accent, borderColor: isLight ? '#FFF' : '#1A1A1C' }]}>
                      <Text style={[styles.routePinTxt, brandFontSansBold, { color: onAccentButtonText(isLight) }]}>
                        {ord + 1}
                      </Text>
                    </View>
                  </Marker>
                );
              }
              return (
                <Marker
                  key={p.id}
                  coordinate={{ latitude: p.lat, longitude: p.lng }}
                  title={p.title}
                  description={p.city || p.country || ''}
                  onPress={() => toggleInRoute(p)}
                  pinColor={isLight ? '#0212EB' : '#E1FF00'}
                  tracksViewChanges={false}
                />
              );
            })}
          </MapView>
        ) : (
          <View style={[styles.mapPlaceholder, { backgroundColor: mapBackdrop }]}>
            <ActivityIndicator size="large" color={accent} />
          </View>
        )}
        {!mapReady && isTabActive ? (
          <View
            pointerEvents="none"
            style={[styles.mapLoadingOverlay, { backgroundColor: isLight ? 'rgba(232,232,224,0.42)' : 'rgba(28,28,30,0.38)' }]}
          >
            <ActivityIndicator size="large" color={accent} />
            <Text style={[styles.mapLoadingTxt, brandFontSansMedium, { color: textMuted }]}>
              {gm(language, 'mapLoading')}
            </Text>
          </View>
        ) : null}
        {mapFault ? (
          <Pressable
            onPress={remountMap}
            style={[styles.mapFaultOverlay, { backgroundColor: isLight ? 'rgba(242,242,234,0.88)' : 'rgba(20,20,22,0.86)' }]}
          >
            <Ionicons name="map-outline" size={34} color={accent} style={{ marginBottom: 10 }} />
            <Text style={[styles.mapFaultTxt, brandFontSansMedium, { color: textMain }]}>
              {gm(language, 'mapLoadFailed')}
            </Text>
            <View style={[styles.mapFaultBtn, { backgroundColor: accent }]}>
              <Text style={[styles.mapFaultBtnTxt, brandFontSansBold, { color: onAccentButtonText(isLight) }]}>
                {gm(language, 'mapRetry')}
              </Text>
            </View>
          </Pressable>
        ) : null}
      </View>

      <View pointerEvents="box-none" style={styles.chromeOverlay}>
        {topChrome}
        {floatingChrome}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#E8E8E0' },
  mapLayer: {
    flex: 1,
    backgroundColor: '#E8E8E0',
    overflow: 'hidden',
  },
  mapFill: {
    ...StyleSheet.absoluteFillObject,
  },
  mapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapLoadingTxt: {
    marginTop: 12,
    fontSize: 14,
  },
  mapFaultOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    zIndex: 12,
  },
  mapFaultTxt: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 14,
  },
  mapFaultBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  mapFaultBtnTxt: {
    fontSize: 14,
  },
  routePin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.28,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
    }),
  },
  routePinTxt: {
    fontSize: 13,
    lineHeight: 16,
  },
  chromeOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    justifyContent: 'flex-start',
  },
  topBlock: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 20,
  },
  searchBlur: {
    borderRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.28,
        shadowRadius: 20,
      },
    }),
  },
  searchSurfaceTint: {
    ...StyleSheet.absoluteFillObject,
  },
  searchCardAndroid: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 12,
    minHeight: 48,
    zIndex: 1,
  },
  searchIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    paddingHorizontal: 0,
    minHeight: 44,
  },
  clearSearch: { paddingLeft: 4, justifyContent: 'center' },
  searchErrBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchErrTxt: { fontSize: 13, lineHeight: 19 },
  searchRetry: { fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 13, marginTop: 10, marginHorizontal: 2, lineHeight: 18 },
  hintPill: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  listCard: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
    }),
  },
  rowOuter: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 8,
    minHeight: 56,
  },
  rowTextCol: { flex: 1, paddingRight: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  rowRouteIcon: { marginLeft: 4 },
  rowTitle: { fontSize: 15, lineHeight: 20 },
  rowSub: { fontSize: 12, marginTop: 3, lineHeight: 16 },
  rowCardBtn: {
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderLeftWidth: StyleSheet.hairlineWidth,
    minWidth: 88,
    alignItems: 'center',
  },
  miniBtnTxt: { fontSize: 12, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.32,
        shadowRadius: 12,
      },
    }),
  },
  bottomSheetWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 25,
  },
  bottomSheetWrapCompact: {
    left: 16,
    right: 16,
  },
  bottomSheet: {
    borderRadius: 26,
    overflow: 'hidden',
  },
  bottomSheetCompact: {
    borderRadius: 22,
  },
  bottomSheetLight: {
    ...Platform.select({
      ios: {
        shadowColor: '#0212EB',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 22,
      },
    }),
  },
  bottomSheetDark: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 24,
      },
    }),
  },
  bottomSheetTint: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomSheetInner: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    zIndex: 1,
  },
  bottomSheetInnerCompact: {
    paddingTop: 6,
    paddingBottom: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  sheetTitle: { fontSize: 17, lineHeight: 22 },
  sheetHint: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  countBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginLeft: 10,
    marginTop: 2,
  },
  countBadgeTxt: { fontSize: 13 },
  routeChipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
    paddingRight: 4,
  },
  routeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 200,
    paddingVertical: 7,
    paddingRight: 10,
    paddingLeft: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  routeChipNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  routeChipNumTxt: { fontSize: 11 },
  routeChipTitle: { fontSize: 13, maxWidth: 140 },
  busyRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  busyTxt: { fontSize: 13 },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  metaLine: { fontSize: 13 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btnGhost: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhostTxt: { fontSize: 15 },
  btnPrimary: {
    flex: 1.35,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryTxt: { fontSize: 15 },
  savedPanel: {
    position: 'absolute',
    right: 16,
    width: 252,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    zIndex: 35,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
    }),
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 999,
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  navBtnTxt: { fontSize: 14 },
});
