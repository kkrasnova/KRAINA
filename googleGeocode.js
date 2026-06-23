import { getGoogleMapsApiKey } from './googleMapsRoute';

/** In-memory кеш для geocoding — уникнути повторних API-запитів. */
const reverseGeocodeCache = new Map();
const geocodeCache = new Map();

/** Максимальний розмір кешу (запобігає витоку пам'яті). */
const MAX_CACHE_SIZE = 200;

/** Лічильник для розрідженого trimCache — чистимо лише кожен 10-й виклик. */
let _trimSeq = 0;

function trimCache(cache) {
  _trimSeq++;
  if (_trimSeq % 10 !== 0) return;
  if (cache.size <= MAX_CACHE_SIZE) return;
  const keys = [...cache.keys()];
  for (const k of keys.slice(0, keys.length - MAX_CACHE_SIZE)) {
    cache.delete(k);
  }
}

function langParam(language) {
  const b = (language || 'uk').split(/[-_]/)[0].toLowerCase();
  return b === 'en' ? 'en' : 'uk';
}

/** Ключ для reverse-кешу: координати, округлені до ~11 м точності. */
function reverseCacheKey(lat, lng, language) {
  return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}_${langParam(language)}`;
}

/**
 * Перевіряє reverse-кеш без API-запиту.
 * Повертає збережену адресу або undefined, якщо координати не кешовані.
 * @param {number} lat
 * @param {number} lng
 * @param {string} language
 * @returns {string|undefined}
 */
export function getCachedReverseGeocode(lat, lng, language) {
  const key = reverseCacheKey(lat, lng, language);
  const val = reverseGeocodeCache.get(key);
  return val === undefined ? undefined : val;
}

/**
 * @param {string} query
 * @param {string} language app language code
 * @returns {Promise<{ id: string, label: string, lat: number, lng: number }[]>}
 */
export async function geocodeAddress(query, language) {
  const key = getGoogleMapsApiKey();
  if (!key || !query || !String(query).trim()) return [];

  const cacheKey = `${String(query).trim().toLowerCase()}_${langParam(language)}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached) return cached;

  const lang = langParam(language);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    String(query).trim(),
  )}&language=${encodeURIComponent(lang)}&key=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
      if (__DEV__) console.warn('[googleGeocode] geocodeAddress status:', json.status, json.error_message || '');
      return [];
    }
    const results = (json.results || []).slice(0, 10).map((r) => ({
      id: r.place_id,
      label: r.formatted_address,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
    }));
    geocodeCache.set(cacheKey, results);
    trimCache(geocodeCache);
    return results;
  } catch (e) {
    if (__DEV__) console.warn('[googleGeocode] geocodeAddress fetch failed', e?.message);
    return [];
  }
}

/**
 * @returns {Promise<string|null>}
 */
export async function reverseGeocodeLabel(lat, lng, language) {
  const key = getGoogleMapsApiKey();
  if (!key || lat == null || lng == null) return null;

  const cacheKey = reverseCacheKey(lat, lng, language);
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const lang = langParam(language);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(
    `${lat},${lng}`,
  )}&language=${encodeURIComponent(lang)}&key=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== 'OK' || !json.results?.length) {
      if (__DEV__) console.warn('[googleGeocode] reverseGeocodeLabel status:', json.status, json.error_message || '');
      reverseGeocodeCache.set(cacheKey, null);
      trimCache(reverseGeocodeCache);
      return null;
    }
    const label = json.results[0].formatted_address || null;
    reverseGeocodeCache.set(cacheKey, label);
    trimCache(reverseGeocodeCache);
    return label;
  } catch (e) {
    if (__DEV__) console.warn('[googleGeocode] reverseGeocodeLabel fetch failed', e?.message);
    return null;
  }
}
