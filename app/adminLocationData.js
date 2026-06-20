/**
 * Знімок локацій для адмін-панелі: зберігання в AsyncStorage + застосування до
 * ROUTE_REGIONS / HOME_COUNTRY_ORDER / HOME_REGION_IDS_BY_COUNTRY_ID у пам'яті.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { ROUTE_REGIONS } from './routeRegionsData';
import {
  HOME_COUNTRY_ORDER,
  HOME_REGION_IDS_BY_COUNTRY_ID,
  HOME_COUNTRY_HERO_REFS,
  HOME_COUNTRY_HERO_URIS,
  invalidateHomeExploreCache,
} from './homeExploreData';
import { HERO_THUMB_MAP, heroThumbRefFromImageSource, isValidHeroThumbRef } from './krainaHeroThumbs';
import { normalizeLandmarkStory } from './landmarkStorySchema';

export const KRAINA_ADMIN_LOCATION_EVENT = 'kraina_admin_locations_v1';

const STORAGE_KEY = '@kraina_admin_location_bundle_v1';

function isAcceptedImageUri(uri) {
  const u = typeof uri === 'string' ? uri.trim() : '';
  if (!u) return false;
  return /^(https?:\/\/|file:\/\/|content:\/\/|asset:\/\/|ph:\/\/)/i.test(u);
}

function thumbRefForLandmark(lm) {
  const t = lm.thumb;
  if (t && typeof t === 'object' && typeof t.uri === 'string') return 't1';
  for (const [k, v] of Object.entries(HERO_THUMB_MAP)) {
    if (v === t) return k;
  }
  return 't1';
}

function landmarkThumbUriFromRuntime(lm) {
  const th = lm?.thumb;
  if (th && typeof th === 'object' && typeof th.uri === 'string' && isAcceptedImageUri(th.uri)) {
    return th.uri.trim();
  }
  return '';
}

export function buildSnapshotFromRuntime() {
  const homeCountryOrder = [...HOME_COUNTRY_ORDER];
  const homeRegionIdsByCountry = {};
  for (const k of Object.keys(HOME_REGION_IDS_BY_COUNTRY_ID)) {
    homeRegionIdsByCountry[k] = [...HOME_REGION_IDS_BY_COUNTRY_ID[k]];
  }
  const regions = {};
  for (const rid of Object.keys(ROUTE_REGIONS)) {
    const r = ROUTE_REGIONS[rid];
    regions[rid] = {
      id: r.id,
      titleUk: r.titleUk,
      titleEn: r.titleEn,
      countryUk: r.countryUk,
      countryEn: r.countryEn,
      flag: r.flag,
      center: { ...r.center },
      ...(r.heroThumb ? { heroThumbRef: heroThumbRefFromImageSource(r.heroThumb) } : {}),
      ...(typeof r.heroUri === 'string' && isAcceptedImageUri(r.heroUri) ? { heroUri: r.heroUri.trim() } : {}),
      landmarks: (r.landmarks || []).map((lm) => {
        const uri = landmarkThumbUriFromRuntime(lm);
        const row = {
          id: lm.id,
          titleUk: lm.titleUk,
          titleEn: lm.titleEn,
          lat: lm.lat,
          lng: lm.lng,
          minutes: lm.minutes,
          free: !!lm.free,
          distKm: lm.distKm,
          descUk: lm.descUk,
          descEn: lm.descEn,
          ...(uri ? { thumbUri: uri } : { thumbRef: thumbRefForLandmark(lm) }),
          ...(Array.isArray(lm.galleryUris)
            ? {
                galleryUris: lm.galleryUris
                  .map((u) => (typeof u === 'string' ? u.trim() : ''))
                  .filter((u) => isAcceptedImageUri(u)),
              }
            : {}),
        };
        if (lm.story && typeof lm.story === 'object') {
          row.story = normalizeLandmarkStory(lm.story);
        }
        return row;
      }),
    };
  }
  const homeCountryHeroRefs = { ...HOME_COUNTRY_HERO_REFS };
  const homeCountryHeroUris = { ...HOME_COUNTRY_HERO_URIS };
  return { homeCountryOrder, homeRegionIdsByCountry, regions, homeCountryHeroRefs, homeCountryHeroUris };
}

const DEFAULT_LOCATION_SNAPSHOT_JSON = JSON.stringify(buildSnapshotFromRuntime());

function applySnapshot(data) {
  if (!data || typeof data !== 'object') return;

  for (const k of Object.keys(HOME_COUNTRY_HERO_REFS)) delete HOME_COUNTRY_HERO_REFS[k];
  if (data.homeCountryHeroRefs && typeof data.homeCountryHeroRefs === 'object') {
    for (const [cid, ref] of Object.entries(data.homeCountryHeroRefs)) {
      if (isValidHeroThumbRef(ref)) HOME_COUNTRY_HERO_REFS[cid] = ref;
    }
  }
  for (const k of Object.keys(HOME_COUNTRY_HERO_URIS)) delete HOME_COUNTRY_HERO_URIS[k];
  if (data.homeCountryHeroUris && typeof data.homeCountryHeroUris === 'object') {
    for (const [cid, u] of Object.entries(data.homeCountryHeroUris)) {
      if (typeof u === 'string' && isAcceptedImageUri(u)) HOME_COUNTRY_HERO_URIS[cid] = u.trim();
    }
  }

  if (Array.isArray(data.homeCountryOrder) && data.homeCountryOrder.length > 0) {
    HOME_COUNTRY_ORDER.splice(0, HOME_COUNTRY_ORDER.length);
    data.homeCountryOrder.forEach((id) => HOME_COUNTRY_ORDER.push(id));
  }

  if (data.homeRegionIdsByCountry && typeof data.homeRegionIdsByCountry === 'object') {
    for (const k of Object.keys(HOME_REGION_IDS_BY_COUNTRY_ID)) {
      delete HOME_REGION_IDS_BY_COUNTRY_ID[k];
    }
    for (const k of Object.keys(data.homeRegionIdsByCountry)) {
      const arr = data.homeRegionIdsByCountry[k];
      HOME_REGION_IDS_BY_COUNTRY_ID[k] = Array.isArray(arr) ? [...arr] : [];
    }
  }

  if (data.regions && typeof data.regions === 'object') {
    const incomingIds = Object.keys(data.regions);
    for (const rid of Object.keys(ROUTE_REGIONS)) {
      if (!incomingIds.includes(rid)) delete ROUTE_REGIONS[rid];
    }
    for (const rid of incomingIds) {
      const src = data.regions[rid];
      if (!src || typeof src !== 'object') continue;
      const landmarks = (src.landmarks || []).map((lm) => {
        const uri = typeof lm.thumbUri === 'string' ? lm.thumbUri.trim() : '';
        const thumb = isAcceptedImageUri(uri) ? { uri } : HERO_THUMB_MAP[lm.thumbRef] || HERO_THUMB_MAP.t1;
        const base = {
          id: lm.id,
          titleUk: lm.titleUk,
          titleEn: lm.titleEn,
          lat: Number(lm.lat) || 0,
          lng: Number(lm.lng) || 0,
          minutes: Number(lm.minutes) || 30,
          free: !!lm.free,
          distKm: lm.distKm != null ? Number(lm.distKm) : undefined,
          descUk: lm.descUk,
          descEn: lm.descEn,
          thumb,
          ...(Array.isArray(lm.galleryUris)
            ? {
                galleryUris: lm.galleryUris
                  .map((u) => (typeof u === 'string' ? u.trim() : ''))
                  .filter((u) => isAcceptedImageUri(u)),
              }
            : {}),
        };
        if (lm.story && typeof lm.story === 'object') {
          base.story = normalizeLandmarkStory(lm.story);
        }
        return base;
      });
      const heroThumb = isValidHeroThumbRef(src.heroThumbRef) ? HERO_THUMB_MAP[src.heroThumbRef] : null;
      const uriTrim = typeof src.heroUri === 'string' ? src.heroUri.trim() : '';
      const heroUriOk = isAcceptedImageUri(uriTrim) ? uriTrim : '';
      ROUTE_REGIONS[rid] = {
        id: src.id || rid,
        titleUk: src.titleUk || rid,
        titleEn: src.titleEn || rid,
        countryUk: src.countryUk || '',
        countryEn: src.countryEn || '',
        flag: src.flag || '🏳️',
        center: src.center || {
          latitude: 0,
          longitude: 0,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        },
        landmarks,
        ...(heroThumb ? { heroThumb } : {}),
        ...(heroUriOk ? { heroUri: heroUriOk } : {}),
      };
    }
  }
  invalidateHomeExploreCache();
}

export async function loadAdminLocationBundleOnStartup() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      invalidateHomeExploreCache();
      DeviceEventEmitter.emit(KRAINA_ADMIN_LOCATION_EVENT);
      return;
    }
    applySnapshot(JSON.parse(raw));
    DeviceEventEmitter.emit(KRAINA_ADMIN_LOCATION_EVENT);
  } catch {
    /* ignore */
  }
}

export async function saveAdminLocationBundle(snapshot) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  applySnapshot(snapshot);
  DeviceEventEmitter.emit(KRAINA_ADMIN_LOCATION_EVENT);
}

export async function resetAdminLocationsToDefaults() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  applySnapshot(JSON.parse(DEFAULT_LOCATION_SNAPSHOT_JSON));
  DeviceEventEmitter.emit(KRAINA_ADMIN_LOCATION_EVENT);
}
