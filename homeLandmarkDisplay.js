import { haversineKm } from './geoDistance';
import { HERO_THUMB_MAP } from './krainaHeroThumbs';
import { resolveOfflineUriSync } from './offline/localCacheStore';

/** Якщо користувач далі — показуємо distKm з каталогу, а не «9729 км» з симулятора. */
const MAX_LIVE_DIST_FROM_REGION_KM = 50;

function regionCenterCoords(region) {
  const lat = Number(region?.center?.latitude);
  const lng = Number(region?.center?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function resolveHomeLandmarkDistKm(userCoords, lm, region) {
  const fallback =
    typeof lm?.distKm === 'number' && Number.isFinite(lm.distKm) ? lm.distKm : 0.5;
  const lmLat = Number(lm?.lat);
  const lmLng = Number(lm?.lng);
  if (!userCoords || !Number.isFinite(lmLat) || !Number.isFinite(lmLng)) return fallback;

  const center = regionCenterCoords(region);
  if (center) {
    const toCenter = haversineKm(userCoords.lat, userCoords.lng, center.lat, center.lng);
    if (toCenter != null && Number.isFinite(toCenter) && toCenter > MAX_LIVE_DIST_FROM_REGION_KM) {
      return fallback;
    }
  }

  const live = haversineKm(userCoords.lat, userCoords.lng, lmLat, lmLng);
  if (live != null && Number.isFinite(live)) return Math.round(live * 10) / 10;
  return fallback;
}

export function resolveHomeLandmarkThumbSource(lm) {
  const thumb = lm?.thumb;
  if (typeof thumb === 'number') return thumb;
  if (thumb && typeof thumb === 'object') {
    const uri = typeof thumb.uri === 'string' ? resolveOfflineUriSync(thumb.uri) : '';
    if (uri && /^(https?:\/\/|file:\/\/|content:\/\/|asset:\/\/|ph:\/\/)/i.test(uri)) {
      return { uri };
    }
  }
  return HERO_THUMB_MAP.t1;
}

/** Стабільний ключ для оновлення прев’ю після admin-bundle / зміни thumb in-place. */
export function homeLandmarkThumbKey(lm) {
  const t = lm?.thumb;
  if (typeof t === 'number') return `asset:${t}`;
  if (t && typeof t === 'object' && typeof t.uri === 'string') return `uri:${t.uri}`;
  return `fallback:${lm?.id || 'unknown'}`;
}
