import { Linking } from 'react-native';
import Constants from 'expo-constants';
import { haversineKm, isUserOriginNearRoute } from './routePlannerCore';

const WALK_TRANSPORT = 'walk';

/**
 * Декодування encoded polyline (Google Directions).
 * @param {string} encoded
 * @returns {{ latitude: number, longitude: number }[]}
 */
export function decodeGooglePolyline(encoded) {
  if (!encoded || typeof encoded !== 'string') return [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates = [];
  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    coordinates.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coordinates;
}

export function getGoogleMapsApiKey() {
  const fromExtra = Constants.expoConfig?.extra?.googleMapsApiKey;
  if (typeof fromExtra === 'string' && fromExtra.trim()) return fromExtra.trim();
  const fromEnv =
    typeof process !== 'undefined' && process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
      ? String(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY).trim()
      : '';
  if (fromEnv) return fromEnv;
  const fromGeocode =
    typeof process !== 'undefined' && process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY
      ? String(process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY).trim()
      : '';
  return fromGeocode;
}

function directionsMode(transport) {
  switch (transport) {
    case 'car':
      return 'driving';
    case 'bus':
    case 'train':
      return 'transit';
    case 'walk':
    default:
      return 'walking';
  }
}

function parseDirectionSteps(route) {
  const steps = [];
  if (!Array.isArray(route?.legs)) return steps;
  for (const leg of route.legs) {
    if (!Array.isArray(leg.steps)) continue;
    for (const step of leg.steps) {
      const sl = step.start_location;
      const el = step.end_location;
      if (!sl || !el) continue;
      steps.push({
        start: { latitude: sl.lat, longitude: sl.lng },
        end: { latitude: el.lat, longitude: el.lng },
        distanceM: step.distance?.value || 0,
        durationSec: step.duration?.value || 0,
        maneuver: step.maneuver || null,
        htmlInstructions: step.html_instructions || '',
      });
    }
  }
  return steps;
}

/**
 * @param {{ latitude: number, longitude: number }[]} points
 * @param {string} transport walk|car|bus|train
 * @param {string} apiKey
 * @returns {Promise<{ path: { latitude: number, longitude: number }[]|null, distanceM: number|null, durationSec: number|null, steps: object[] }>}
 */
export async function fetchGoogleDirectionsPolyline(points, transport, apiKey) {
  if (!apiKey || !points || points.length < 2) {
    return { path: null, distanceM: null, durationSec: null, steps: [] };
  }
  const mode = directionsMode(transport);
  const origin = `${points[0].latitude},${points[0].longitude}`;
  const dest = `${points[points.length - 1].latitude},${points[points.length - 1].longitude}`;
  let wp = '';
  if (points.length > 2) {
    const mid = points
      .slice(1, -1)
      .map((p) => `${p.latitude},${p.longitude}`)
      .join('|');
    wp = `&waypoints=${encodeURIComponent(mid)}`;
  }
  let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(
    origin,
  )}&destination=${encodeURIComponent(dest)}${wp}&mode=${encodeURIComponent(mode)}&key=${encodeURIComponent(apiKey)}`;
  if (mode === 'transit') {
    url += `&departure_time=${Math.floor(Date.now() / 1000)}`;
  }
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== 'OK' || !json.routes?.[0]) {
      if (__DEV__) console.warn('[googleMapsRoute]', json.status, json.error_message);
      return { path: null, distanceM: null, durationSec: null, steps: [] };
    }
    const route = json.routes[0];
    const enc = route.overview_polyline?.points;
    const path = enc ? decodeGooglePolyline(enc) : null;
    let distanceM = 0;
    let durationSec = 0;
    if (Array.isArray(route.legs)) {
      for (const leg of route.legs) {
        distanceM += leg.distance?.value || 0;
        durationSec += leg.duration?.value || 0;
      }
    }
    return {
      path: path && path.length >= 2 ? path : null,
      distanceM: distanceM || null,
      durationSec: durationSec || null,
      steps: parseDirectionSteps(route),
    };
  } catch (e) {
    if (__DEV__) console.warn('[googleMapsRoute] fetch failed', e?.message);
    return { path: null, distanceM: null, durationSec: null, steps: [] };
  }
}

/** Прямий сегмент, якщо Directions API недоступний. */
export function buildFallbackDirectionSteps(from, to) {
  if (!from || !to) return [];
  const distM = Math.max(0, Math.round(haversineKm(from, to) * 1000));
  return [
    {
      start: { latitude: from.latitude, longitude: from.longitude },
      end: { latitude: to.latitude, longitude: to.longitude },
      distanceM: distM,
      durationSec: null,
      maneuver: 'straight',
      htmlInstructions: '',
    },
  ];
}

export async function loadRoutePolylineFromPlan(plan, liveUserPos = null, overrideUserPos = null) {
  const key = getGoogleMapsApiKey();
  const coords = getDirectionsCoordinatesFromPlan(plan, liveUserPos, overrideUserPos);
  if (!key || !coords || coords.length < 2) {
    return { path: null, distanceM: null, durationSec: null, steps: [] };
  }
  return fetchGoogleDirectionsPolyline(coords, plan.transport || WALK_TRANSPORT, key);
}

/**
 * Точки для Google Directions: лише якщо геолокація в межах міста, інакше — зупинки маршруту.
 * @param {object} plan
 * @param {{ latitude: number, longitude: number } | null | undefined} [liveUserPos]
 * @param {{ latitude: number, longitude: number } | null | undefined} [overrideUserPos] — натиснута точка на карті
 */
export function getDirectionsCoordinatesFromPlan(plan, liveUserPos = null, overrideUserPos = null) {
  const stops = plan?.stops || [];
  if (!stops.length) {
    return plan?.coordinates?.length >= 2 ? plan.coordinates : [];
  }

  const stopCoords = stops.map((s) => ({ latitude: s.lat, longitude: s.lng }));

  if (
    overrideUserPos &&
    Number.isFinite(overrideUserPos.latitude) &&
    Number.isFinite(overrideUserPos.longitude)
  ) {
    return [{ latitude: overrideUserPos.latitude, longitude: overrideUserPos.longitude }, ...stopCoords];
  }

  // Маршрут ЗАВЖДИ починається з реальної геолокації користувача, якщо вона є —
  // людина «йде» від місця, де стоїть, як у Google Maps. Раніше старт із гео
  // підставлявся лише в межах 100 км, тож у тестах/далеко він зникав.
  if (
    liveUserPos &&
    Number.isFinite(liveUserPos.latitude) &&
    Number.isFinite(liveUserPos.longitude)
  ) {
    return [{ latitude: liveUserPos.latitude, longitude: liveUserPos.longitude }, ...stopCoords];
  }

  const stored = plan?.userOrigin;
  if (
    stored &&
    typeof stored.lat === 'number' &&
    typeof stored.lng === 'number' &&
    isUserOriginNearRoute(stored, stops)
  ) {
    return [{ latitude: stored.lat, longitude: stored.lng }, ...stopCoords];
  }

  if (stopCoords.length >= 2) return stopCoords;

  const coords = plan?.coordinates || [];
  if (coords.length < 2) return coords;
  const first = coords[0];
  const firstStop = stopCoords[0];
  if (!firstStop) return coords;
  const origin = { lat: first.latitude, lng: first.longitude };
  if (isUserOriginNearRoute(origin, stops)) return coords;
  return stopCoords.length >= 1 ? stopCoords : coords.slice(1);
}

/**
 * Відкриває Google Maps (додаток або браузер) з тим самим маршрутом.
 * @param {{ latitude: number, longitude: number }[]} points
 * @param {string} transport walk|car|bus|train
 */
export function openGoogleMapsDirections(points, transport = 'walk') {
  const url = buildGoogleMapsDirectionsUrl(points, transport);
  if (!url) return;
  Linking.openURL(url).catch(() => {});
}

function metersPerDegreeLat() {
  return 110540;
}

function metersPerDegreeLng(lat) {
  return 111320 * Math.cos((lat * Math.PI) / 180);
}

/** Мінімальна відстань від точки до лінії маршруту (для виявлення відхилення). */
export function distanceMetersToPolyline(point, polyline) {
  if (!point || !polyline || polyline.length < 2) return null;
  const px = point.longitude;
  const py = point.latitude;
  let minM = Infinity;
  for (let i = 0; i < polyline.length - 1; i += 1) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const ax = a.longitude;
    const ay = a.latitude;
    const bx = b.longitude;
    const by = b.latitude;
    const mLng = metersPerDegreeLng((ay + by) / 2);
    const mLat = metersPerDegreeLat();
    const abx = (bx - ax) * mLng;
    const aby = (by - ay) * mLat;
    const apx = (px - ax) * mLng;
    const apy = (py - ay) * mLat;
    const abLenSq = abx * abx + aby * aby;
    let t = abLenSq > 0 ? (apx * abx + apy * aby) / abLenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + ((bx - ax) * t);
    const cy = ay + ((by - ay) * t);
    const km = haversineKm(
      { lat: py, lng: px },
      { lat: cy, lng: cx },
    );
    const m = km * 1000;
    if (m < minM) minM = m;
  }
  return minM === Infinity ? null : Math.round(minM);
}

/** Усі точки для fitToCoordinates — маршрут, зупинки, позиція користувача. */
export function collectMapFitCoordinates({ polyline = [], stops = [], extras = [] }) {
  const seen = new Set();
  const out = [];
  const push = (p) => {
    if (!p || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return;
    const k = `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ latitude: p.latitude, longitude: p.longitude });
  };
  if (Array.isArray(polyline)) polyline.forEach(push);
  if (Array.isArray(stops)) {
    stops.forEach((s) => push({ latitude: s.lat, longitude: s.lng }));
  }
  if (Array.isArray(extras)) extras.forEach(push);
  return out;
}

export function coordFromWalkOrigin(walkOrigin) {
  if (!walkOrigin) return null;
  if (Number.isFinite(walkOrigin.latitude) && Number.isFinite(walkOrigin.longitude)) {
    return { latitude: walkOrigin.latitude, longitude: walkOrigin.longitude };
  }
  if (Number.isFinite(walkOrigin.lat) && Number.isFinite(walkOrigin.lng)) {
    return { latitude: walkOrigin.lat, longitude: walkOrigin.lng };
  }
  return null;
}

export function travelModeFromTransport(transport) {
  switch (transport) {
    case 'car':
      return 'driving';
    case 'bus':
    case 'train':
      return 'transit';
    default:
      return 'walking';
  }
}

export function buildGoogleMapsDirectionsUrl(points, transport) {
  if (!points?.length) return '';
  const origin = `${points[0].latitude},${points[0].longitude}`;
  const dest = `${points[points.length - 1].latitude},${points[points.length - 1].longitude}`;
  let waypoints = '';
  if (points.length > 2) {
    const mid = points
      .slice(1, -1)
      .map((p) => `${p.latitude},${p.longitude}`)
      .join('|');
    waypoints = `&waypoints=${encodeURIComponent(mid)}`;
  }
  const tm = travelModeFromTransport(transport || 'walk');
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    origin,
  )}&destination=${encodeURIComponent(dest)}${waypoints}&travelmode=${tm}`;
}
