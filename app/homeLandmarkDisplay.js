import { Image } from 'react-native';
import { haversineKm } from './geoDistance';
import { HERO_THUMB_MAP } from './krainaHeroThumbs';
import { resolveOfflineUriSync } from './offline/localCacheStore';

/**
 * Відстань до пам’ятки в км від поточної геолокації користувача.
 * Якщо геонемає — беремо distKm з каталогу (якщо є).
 */
export function resolveHomeLandmarkDistKm(userCoords, lm, _region) {
  const lmLat = Number(lm?.lat);
  const lmLng = Number(lm?.lng);
  const catalogDist =
    typeof lm?.distKm === 'number' && Number.isFinite(lm.distKm) ? Math.max(0, lm.distKm) : null;

  if (
    userCoords &&
    Number.isFinite(Number(userCoords.lat)) &&
    Number.isFinite(Number(userCoords.lng)) &&
    Number.isFinite(lmLat) &&
    Number.isFinite(lmLng)
  ) {
    const live = haversineKm(userCoords.lat, userCoords.lng, lmLat, lmLng);
    if (live != null && Number.isFinite(live)) {
      if (live < 10) return Math.round(live * 10) / 10;
      if (live < 100) return Math.round(live);
      return Math.round(live);
    }
  }

  if (catalogDist != null) {
    if (catalogDist < 10) return Math.round(catalogDist * 10) / 10;
    return Math.round(catalogDist);
  }
  return null;
}

/** ExpoImage на iOS надійніше з { uri } від resolveAssetSource, ніж з raw require-id. */
export function normalizeHomeExpoImageSource(source) {
  if (source == null) return null;
  if (typeof source === 'number') {
    const resolved = Image.resolveAssetSource(source);
    if (resolved?.uri) return { uri: String(resolved.uri) };
    return source;
  }
  if (typeof source === 'object' && typeof source.uri === 'string') {
    const uri = resolveOfflineUriSync(source.uri) || source.uri.trim();
    if (uri) return { uri };
  }
  return null;
}

export function resolveHomeLandmarkThumbSource(lm) {
  const thumb = lm?.thumb;
  const asUriSource = (raw) => {
    const uri = typeof raw === 'string' ? resolveOfflineUriSync(raw.trim()) : '';
    if (uri && /^(https?:\/\/|file:\/\/|content:\/\/|asset:\/\/|ph:\/\/)/i.test(uri)) {
      return { uri };
    }
    return null;
  };

  // Prefer real remote/local URI thumbs over the generic hikers placeholder (t1).
  if (thumb && typeof thumb === 'object') {
    const fromThumb = asUriSource(thumb.uri);
    if (fromThumb) return fromThumb;
  }
  const fromThumbUri = asUriSource(lm?.thumbUri);
  if (fromThumbUri) return fromThumbUri;
  if (Array.isArray(lm?.galleryUris)) {
    for (const g of lm.galleryUris) {
      const fromGal = asUriSource(g);
      if (fromGal) return fromGal;
    }
  }
  const story = lm?.story && typeof lm.story === 'object' ? lm.story : null;
  const fromStory =
    asUriSource(story?.introPage1PhotoUri) ||
    asUriSource(story?.beforeAfter?.newUri) ||
    (Array.isArray(story?.introPagesUk)
      ? asUriSource(story.introPagesUk.find((p) => p?.photoUri || p?.compareAfterUri)?.photoUri ||
          story.introPagesUk.find((p) => p?.compareAfterUri)?.compareAfterUri)
      : null);
  if (fromStory) return fromStory;

  if (typeof thumb === 'number') return thumb;
  return HERO_THUMB_MAP.t1;
}

/** Стабільний ключ для оновлення прев’ю після admin-bundle / зміни thumb in-place. */
export function homeLandmarkThumbKey(lm) {
  const thumbUri = typeof lm?.thumbUri === 'string' ? lm.thumbUri.trim() : '';
  if (thumbUri) return `uri:${thumbUri}`;
  const t = lm?.thumb;
  if (t && typeof t === 'object' && typeof t.uri === 'string' && t.uri.trim()) {
    return `uri:${t.uri.trim()}`;
  }
  if (typeof t === 'number') return `asset:${t}`;
  if (Array.isArray(lm?.galleryUris) && lm.galleryUris[0]) return `gal:${lm.galleryUris[0]}`;
  return `fallback:${lm?.id || 'unknown'}`;
}

/**
 * Ключ для ExpoImage у віртуалізованих списках.
 * Завжди включає entity id, щоб при recycle не «залипала» чужа картинка.
 */
export function homeImageRecyclingKey(entityId, source, prefix = 'img') {
  const id = String(entityId || 'unknown');
  if (typeof source === 'number') return `${prefix}:${id}:asset:${source}`;
  if (source && typeof source === 'object' && typeof source.uri === 'string' && source.uri) {
    return `${prefix}:${id}:uri:${source.uri}`;
  }
  return `${prefix}:${id}:none`;
}
