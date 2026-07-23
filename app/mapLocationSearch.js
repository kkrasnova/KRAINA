import { buildHomeSearchRows } from './homeUnifiedSearch';
import { resolveCatalogRegionTitle } from './catalogDisplayI18n';
import { appLangBase } from './appLang';
import { normalizeForSearch } from './countrySearch';

/** Додаткові варіанти запиту для популярних міст (рос./лат. написання). */
const LOCAL_QUERY_EXPANSIONS = {
  kiev: 'kyiv',
  киев: 'київ',
  kiew: 'kyiv',
  munich: 'münchen',
  москва: 'moscow',
  moscow: 'москва',
  petersburg: 'saint petersburg',
  питер: 'saint petersburg',
  spb: 'saint petersburg',
};

function expandLocalSearchQueries(query) {
  const raw = String(query || '').trim();
  if (!raw) return [];
  const norm = normalizeForSearch(raw);
  const extra = LOCAL_QUERY_EXPANSIONS[norm];
  const out = [raw];
  if (extra && extra !== raw) out.push(extra);
  return out;
}

function mapRowToHit(row, language) {
  const lang = appLangBase(language);

  if (row.type === 'city') {
    const center = row.region?.center;
    const lat = Number(center?.latitude);
    const lng = Number(center?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      id: `local_city_${row.regionId}`,
      title: row.title,
      city: row.title,
      country: String(row.detail || '').trim(),
      category: 'other',
      lat,
      lng,
      cover_image_url: null,
      isLocal: true,
      placeKind: 'city',
      mapZoom: {
        latitudeDelta: Number(center?.latitudeDelta) > 0 ? Number(center.latitudeDelta) : 0.12,
        longitudeDelta: Number(center?.longitudeDelta) > 0 ? Number(center.longitudeDelta) : 0.12,
      },
    };
  }

  if (row.type === 'landmark') {
    const lm = row.landmark;
    const lat = Number(lm?.lat);
    const lng = Number(lm?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      id: `local_lm_${row.regionId}_${lm.id}`,
      title: row.title,
      city: resolveCatalogRegionTitle(row.region, lang),
      country: String(row.detail || '').split(' · ').pop() || '',
      category: lm.category || 'other',
      lat,
      lng,
      cover_image_url: lm.thumb || null,
      isLocal: true,
      placeKind: 'landmark',
      mapZoom: { latitudeDelta: 0.045, longitudeDelta: 0.045 },
    };
  }

  return null;
}

/**
 * Локальний пошук міст і пам’яток KRAÏNA (офлайн, миттєво).
 * @param {string} query
 * @param {string} language
 */
export function searchLocalMapPlaces(query, language) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const seen = new Set();
  const out = [];
  for (const variant of expandLocalSearchQueries(q)) {
    const rows = buildHomeSearchRows(variant, language);
    for (const row of rows) {
      if (row.type !== 'city' && row.type !== 'landmark') continue;
      const hit = mapRowToHit(row, language);
      if (!hit) continue;
      const key = `${Number(hit.lat).toFixed(4)}_${Number(hit.lng).toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(hit);
    }
  }
  return out.slice(0, 16);
}

/**
 * @param {{ lat: number, lng: number, mapZoom?: { latitudeDelta?: number, longitudeDelta?: number }, placeKind?: string, isGeocode?: boolean }} loc
 */
export function mapZoomForPlace(loc) {
  if (loc?.mapZoom?.latitudeDelta && loc?.mapZoom?.longitudeDelta) {
    return {
      latitudeDelta: loc.mapZoom.latitudeDelta,
      longitudeDelta: loc.mapZoom.longitudeDelta,
    };
  }
  if (loc?.placeKind === 'city') {
    return { latitudeDelta: 0.14, longitudeDelta: 0.14 };
  }
  if (loc?.isGeocode) {
    return { latitudeDelta: 0.08, longitudeDelta: 0.08 };
  }
  return { latitudeDelta: 0.05, longitudeDelta: 0.05 };
}
