import { Linking } from 'react-native';
import Constants from 'expo-constants';

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
  const k = Constants.expoConfig?.extra?.googleMapsApiKey;
  return typeof k === 'string' && k.trim() ? k.trim() : '';
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

/**
 * @param {{ latitude: number, longitude: number }[]} points
 * @param {string} transport walk|car|bus|train
 * @param {string} apiKey
 * @returns {Promise<{ path: { latitude: number, longitude: number }[]|null, distanceM: number|null, durationSec: number|null }>}
 */
export async function fetchGoogleDirectionsPolyline(points, transport, apiKey) {
  if (!apiKey || !points || points.length < 2) {
    return { path: null, distanceM: null, durationSec: null };
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
      return { path: null, distanceM: null, durationSec: null };
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
    };
  } catch (e) {
    if (__DEV__) console.warn('[googleMapsRoute] fetch failed', e?.message);
    return { path: null, distanceM: null, durationSec: null };
  }
}

export async function loadRoutePolylineFromPlan(plan) {
  const key = getGoogleMapsApiKey();
  const coords = plan?.coordinates;
  if (!key || !coords || coords.length < 2) {
    return { path: null, distanceM: null, durationSec: null };
  }
  return fetchGoogleDirectionsPolyline(coords, plan.transport || 'walk', key);
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
