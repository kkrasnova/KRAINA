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
  const fromExtra =
    readExpoExtra('googleMapsApiKey') ||
    readExpoExtra('googleGeocodingApiKey');
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

function readExpoExtra(key) {
  try {
    const manifest2Extra = Constants.manifest2?.extra;
    const fromManifest2 =
      manifest2Extra?.[key] ||
      manifest2Extra?.expoClient?.extra?.[key];
    const fromClassic =
      Constants.expoConfig?.extra?.[key] ||
      Constants.manifest?.extra?.[key];
    const value = fromManifest2 ?? fromClassic;
    return value && String(value).trim() ? String(value).trim() : '';
  } catch {
    return '';
  }
}

function toFiniteCoord(point) {
  if (!point) return null;
  const latitude = Number(
    point.latitude != null ? point.latitude : point.lat,
  );
  const longitude = Number(
    point.longitude != null ? point.longitude : point.lng,
  );
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function directionsMode(transport) {
  switch (transport) {
    case 'car':
      return 'driving';
    case 'bike':
      return 'bicycling';
    case 'bus':
    case 'train':
      return 'transit';
    case 'walk':
    default:
      return 'walking';
  }
}

/** Довжина полілінії в метрах. */
export function polylinePathLengthM(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    total += haversineKm(coords[i - 1], coords[i]) * 1000;
  }
  return total;
}

/** Чи схоже на маршрут по дорогах (не пряма лінія між 2 точками). */
export function isRoadFollowingPolyline(coords) {
  if (!Array.isArray(coords) || coords.length < 3) return false;
  if (coords.length >= 6) return true;
  const pathM = polylinePathLengthM(coords);
  const straightM = haversineKm(coords[0], coords[coords.length - 1]) * 1000;
  if (straightM < 1) return coords.length >= 3;
  return pathM > straightM * 1.06;
}

function pickDensestPath(...candidates) {
  let best = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || candidate.length < 2) continue;
    const pathM = polylinePathLengthM(candidate);
    const score = candidate.length * 1000 + pathM;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best?.length >= 2 ? best : null;
}

function sameCoord(a, b) {
  if (!a || !b) return false;
  return (
    Math.abs(a.latitude - b.latitude) < 1e-6 &&
    Math.abs(a.longitude - b.longitude) < 1e-6
  );
}

function appendPolylinePoints(target, next) {
  if (!next?.length) return;
  if (!target.length) {
    target.push(...next);
    return;
  }
  const last = target[target.length - 1];
  const first = next[0];
  if (sameCoord(last, first)) target.push(...next.slice(1));
  else target.push(...next);
}

/** Детальний шлях по кроках Directions (точніше, ніж overview_polyline). */
function parseRoutePath(route) {
  const coordinates = [];
  if (!Array.isArray(route?.legs)) return coordinates;
  for (const leg of route.legs) {
    if (!Array.isArray(leg.steps)) continue;
    for (const step of leg.steps) {
      const enc = step.polyline?.points;
      if (!enc) continue;
      appendPolylinePoints(coordinates, decodeGooglePolyline(enc));
    }
  }
  return coordinates;
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

function mergeDirectionResults(results) {
  const path = [];
  let distanceM = 0;
  let durationSec = 0;
  const steps = [];
  for (const result of results) {
    if (!result?.path?.length) return null;
    appendPolylinePoints(path, result.path);
    distanceM += result.distanceM || 0;
    durationSec += result.durationSec || 0;
    if (result.steps?.length) steps.push(...result.steps);
  }
  return {
    path: path.length >= 2 ? path : null,
    distanceM: distanceM || null,
    durationSec: durationSec || null,
    steps,
  };
}

/**
 * @param {{ latitude: number, longitude: number }[]} points
 * @param {string} transport walk|car|bike|bus|train
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
    const pathFromSteps = parseRoutePath(route);
    const enc = route.overview_polyline?.points;
    const pathFromOverview = enc ? decodeGooglePolyline(enc) : null;
    const path = pickDensestPath(pathFromSteps, pathFromOverview);
    let distanceM = 0;
    let durationSec = 0;
    if (Array.isArray(route.legs)) {
      for (const leg of route.legs) {
        distanceM += leg.distance?.value || 0;
        durationSec += leg.duration?.value || 0;
      }
    }
    return {
      path,
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
    if (__DEV__ && !key) console.warn('[googleMapsRoute] missing API key');
    return { path: null, distanceM: null, durationSec: null, steps: [] };
  }
  const transport = plan.transport || WALK_TRANSPORT;
  const single = await fetchGoogleDirectionsPolyline(coords, transport, key);
  if (single.path?.length >= 2) return single;

  if (coords.length > 2) {
    const legs = [];
    for (let i = 0; i < coords.length - 1; i += 1) {
      legs.push(
        await fetchGoogleDirectionsPolyline([coords[i], coords[i + 1]], transport, key),
      );
    }
    const merged = mergeDirectionResults(legs);
    if (merged?.path?.length >= 2) return merged;
  }
  return single;
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
    const raw = Array.isArray(plan?.coordinates) ? plan.coordinates : [];
    const norm = raw.map(toFiniteCoord).filter(Boolean);
    return norm.length >= 2 ? norm : [];
  }

  const stopCoords = stops
    .map((s) => toFiniteCoord({ latitude: s.lat, longitude: s.lng }))
    .filter(Boolean);
  if (stopCoords.length < 1) return [];

  const overrideCoord = toFiniteCoord(overrideUserPos);
  if (overrideCoord) {
    return [overrideCoord, ...stopCoords];
  }

  const liveCoord = toFiniteCoord(liveUserPos);
  if (liveCoord) {
    const origin = { lat: liveCoord.latitude, lng: liveCoord.longitude };
    if (isUserOriginNearRoute(origin, stops)) {
      const firstStop = stopCoords[0];
      if (firstStop && haversineKm(liveCoord, firstStop) * 1000 < 25) {
        return stopCoords;
      }
      return [liveCoord, ...stopCoords];
    }
  }

  const stored = plan?.userOrigin;
  const storedCoord = toFiniteCoord(stored);
  if (storedCoord && isUserOriginNearRoute(stored, stops)) {
    const firstStop = stopCoords[0];
    if (firstStop && haversineKm(storedCoord, firstStop) * 1000 < 25) {
      return stopCoords;
    }
    return [storedCoord, ...stopCoords];
  }

  if (stopCoords.length >= 2) return stopCoords;

  const coords = (plan?.coordinates || []).map(toFiniteCoord).filter(Boolean);
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

/** Центр і масштаб карти за зупинками маршруту. */
export function regionFromStops(stops) {
  const valid = (stops || []).filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  if (!valid.length) return null;
  if (valid.length === 1) {
    return {
      latitude: valid[0].lat,
      longitude: valid[0].lng,
      latitudeDelta: 0.06,
      longitudeDelta: 0.06,
    };
  }
  let minLat = valid[0].lat;
  let maxLat = valid[0].lat;
  let minLng = valid[0].lng;
  let maxLng = valid[0].lng;
  for (const s of valid) {
    minLat = Math.min(minLat, s.lat);
    maxLat = Math.max(maxLat, s.lat);
    minLng = Math.min(minLng, s.lng);
    maxLng = Math.max(maxLng, s.lng);
  }
  const pad = 0.025;
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.04, (maxLat - minLat) * 1.55 + pad),
    longitudeDelta: Math.max(0.04, (maxLng - minLng) * 1.55 + pad),
  };
}

/**
 * Повертає mapRegion з плану, якщо він узгоджений із зупинками; інакше — bounds зі зупинок.
 * @param {object | null | undefined} plan
 * @param {{ latitude: number, longitude: number, latitudeDelta?: number, longitudeDelta?: number } | null | undefined} [catalogCenter]
 */
export function resolveRouteMapRegion(plan, catalogCenter = null) {
  const fromStops = regionFromStops(plan?.stops);
  const candidate = plan?.mapRegion || catalogCenter;
  if (!fromStops) return candidate || null;
  if (!candidate) return fromStops;
  const center = {
    lat: candidate.latitude,
    lng: candidate.longitude,
  };
  const stopCenter = { lat: fromStops.latitude, lng: fromStops.longitude };
  const centerKm = haversineKm(center, stopCenter);
  const huge =
    (candidate.latitudeDelta || 0) > 3 || (candidate.longitudeDelta || 0) > 3;
  if (centerKm > 50 || huge) return fromStops;
  return candidate;
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
    case 'bike':
      return 'bicycling';
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
