import { getGoogleMapsApiKey } from './googleMapsRoute';

function langParam(language) {
  const b = (language || 'uk').split(/[-_]/)[0].toLowerCase();
  return b === 'en' ? 'en' : 'uk';
}

/**
 * @param {string} query
 * @param {string} language app language code
 * @returns {Promise<{ id: string, label: string, lat: number, lng: number }[]>}
 */
export async function geocodeAddress(query, language) {
  const key = getGoogleMapsApiKey();
  if (!key || !query || !String(query).trim()) return [];
  const lang = langParam(language);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    String(query).trim(),
  )}&language=${encodeURIComponent(lang)}&key=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') return [];
    return (json.results || []).slice(0, 10).map((r) => ({
      id: r.place_id,
      label: r.formatted_address,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
    }));
  } catch {
    return [];
  }
}

/**
 * @returns {Promise<string|null>}
 */
export async function reverseGeocodeLabel(lat, lng, language) {
  const key = getGoogleMapsApiKey();
  if (!key || lat == null || lng == null) return null;
  const lang = langParam(language);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(
    `${lat},${lng}`,
  )}&language=${encodeURIComponent(lang)}&key=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== 'OK' || !json.results?.length) return null;
    return json.results[0].formatted_address || null;
  } catch {
    return null;
  }
}
