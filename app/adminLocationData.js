/**
 * Знімок локацій для адмін-панелі: зберігання в AsyncStorage + застосування до
 * ROUTE_REGIONS / HOME_COUNTRY_ORDER / HOME_REGION_IDS_BY_COUNTRY_ID у пам'яті.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, DeviceEventEmitter } from 'react-native';
import { apiHttp } from './apiHttp';
import { normalizeBackendAssetUrl } from './auth/config';
import { useAuthStore } from './auth/authStore';
import { ROUTE_REGIONS, BUILTIN_REGION_HERO_THUMBS } from './routeRegionsData';
import {
  HOME_COUNTRY_ORDER,
  HOME_REGION_IDS_BY_COUNTRY_ID,
  HOME_COUNTRY_HERO_REFS,
  HOME_COUNTRY_HERO_URIS,
  invalidateHomeExploreCache,
} from './homeExploreData';
import { HERO_THUMB_MAP, heroThumbRefFromImageSource, isValidHeroThumbRef } from './krainaHeroThumbs';
import { normalizeLandmarkStory } from './landmarkStorySchema';
import { runAfterInteractions } from './runAfterInteractions';

export const KRAINA_ADMIN_LOCATION_EVENT = 'kraina_admin_locations_v1';

const STORAGE_KEY = '@kraina_admin_location_bundle_v1';
const REMOTE_SYNC_META_KEY = '@kraina_admin_location_remote_sync_v1';
const REMOTE_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000;
let lastRemoteSyncAttemptAt = 0;

function authHeaders() {
  const token = useAuthStore.getState().accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function isSnapshotLike(data) {
  return !!(
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    data.regions &&
    typeof data.regions === 'object'
  );
}

function isAcceptedImageUri(uri) {
  const u = typeof uri === 'string' ? uri.trim() : '';
  if (!u) return false;
  return /^(https?:\/\/|file:\/\/|content:\/\/|asset:\/\/|ph:\/\/)/i.test(u);
}

function normalizeImageUri(uri) {
  const u = typeof uri === 'string' ? uri.trim() : '';
  if (!isAcceptedImageUri(u)) return '';
  return /^https?:\/\//i.test(u) ? normalizeBackendAssetUrl(u) : u;
}

function normalizeStoryImageUris(story) {
  if (!story || typeof story !== 'object') return story;
  const next = JSON.parse(JSON.stringify(story));
  const normalizeAt = (obj, key) => {
    if (!obj || typeof obj !== 'object') return;
    const normalized = normalizeImageUri(obj[key]);
    if (normalized) obj[key] = normalized;
  };
  normalizeAt(next, 'audioUri');
  normalizeAt(next, 'introPage1PhotoUri');
  normalizeAt(next.photoFact, 'bgUri');
  normalizeAt(next.beforeAfter, 'oldUri');
  normalizeAt(next.beforeAfter, 'newUri');
  if (Array.isArray(next.personMentions)) {
    next.personMentions.forEach((person) => normalizeAt(person, 'photoUri'));
  }
  ['introPagesUk', 'introPagesEn'].forEach((pagesKey) => {
    if (!Array.isArray(next[pagesKey])) return;
    next[pagesKey].forEach((page) => {
      ['photoUri', 'secondaryPhotoUri', 'compareBeforeUri', 'compareAfterUri', 'illustrationUri'].forEach((key) => {
        normalizeAt(page, key);
      });
    });
  });
  return next;
}

function bundleFingerprint(data) {
  const s = JSON.stringify(data || {});
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

async function readRemoteSyncMeta() {
  try {
    const raw = await AsyncStorage.getItem(REMOTE_SYNC_META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
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
  if (typeof lm?.thumbUri === 'string' && isAcceptedImageUri(lm.thumbUri)) {
    return lm.thumbUri.trim();
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
      ...(r.heroThumb
        ? (() => {
            const ref = heroThumbRefFromImageSource(r.heroThumb);
            return ref ? { heroThumbRef: ref } : { heroRegionId: r.id || rid };
          })()
        : {}),
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
          ...(typeof lm.address === 'string' && lm.address.trim()
            ? { address: lm.address.trim() }
            : {}),
          ...(typeof lm.addressEn === 'string' && lm.addressEn.trim()
            ? { addressEn: lm.addressEn.trim() }
            : {}),
          ...(typeof lm.addressUk === 'string' && lm.addressUk.trim()
            ? { addressUk: lm.addressUk.trim() }
            : {}),
          ...(typeof lm.category === 'string' &&
          ['monument', 'museum', 'park', 'other'].includes(lm.category.trim())
            ? { category: lm.category.trim() }
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

let defaultLocationSnapshotJson = null;

function getDefaultLocationSnapshotJson() {
  if (!defaultLocationSnapshotJson) {
    defaultLocationSnapshotJson = JSON.stringify(buildSnapshotFromRuntime());
  }
  return defaultLocationSnapshotJson;
}

/** Capture built-in Europe catalog once, before any remote/CMS snapshot can wipe it. */
getDefaultLocationSnapshotJson();

/** Live clone of built-in ROUTE_REGIONS (keeps require() thumbs + full stories). */
let builtinRouteRegionsLive = null;

function captureBuiltinRouteRegions() {
  if (builtinRouteRegionsLive) return builtinRouteRegionsLive;
  builtinRouteRegionsLive = {};
  for (const rid of Object.keys(ROUTE_REGIONS)) {
    const r = ROUTE_REGIONS[rid];
    if (!r || typeof r !== 'object') continue;
    builtinRouteRegionsLive[rid] = {
      ...r,
      center: r.center && typeof r.center === 'object' ? { ...r.center } : r.center,
      landmarks: Array.isArray(r.landmarks) ? r.landmarks.map((lm) => ({ ...lm })) : [],
    };
  }
  return builtinRouteRegionsLive;
}

captureBuiltinRouteRegions();

function normalizeLandmarkTitleKey(v) {
  return String(v || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-zа-яіїєґ0-9]+/gi, '');
}

function landmarkContentScore(lm) {
  if (!lm || typeof lm !== 'object') return 0;
  let n = 0;
  if (lm.story && typeof lm.story === 'object') {
    n += 50;
    if (lm.story.introPagesUk || lm.story.introPage1Uk) n += 30;
    if (lm.story.shortIntroUk || lm.story.shortIntroEn) n += 10;
  }
  if (lm.descUk || lm.descEn) n += 5;
  if (typeof lm.thumb === 'number') n += 8;
  if (lm.thumb && typeof lm.thumb === 'object' && lm.thumb.uri) n += 6;
  if (Array.isArray(lm.galleryUris) && lm.galleryUris.length) n += 4;
  return n;
}

function stripCityFromStoredTitle(primary, secondary) {
  let t = String(primary || '').trim();
  if (!t) t = String(secondary || '').trim();
  const cleaned = t.replace(/\s*[\(（][^)）]{0,48}[\)）]\s*$/u, '').trim();
  return cleaned || t;
}

function mapSnapshotLandmarkToRuntime(lm) {
  if (!lm || typeof lm !== 'object') return null;
  const uri = normalizeImageUri(lm.thumbUri);
  const thumb = uri ? { uri } : HERO_THUMB_MAP[lm.thumbRef] || HERO_THUMB_MAP.t1;
    const base = {
      id: lm.id,
      titleUk: stripCityFromStoredTitle(lm.titleUk, lm.titleEn),
      titleEn: stripCityFromStoredTitle(lm.titleEn, lm.titleUk),
      lat: Number(lm.lat) || 0,
      lng: Number(lm.lng) || 0,
    minutes: Number(lm.minutes) || 30,
    free: !!lm.free,
    distKm: lm.distKm != null ? Number(lm.distKm) : undefined,
    descUk: lm.descUk,
    descEn: lm.descEn,
    thumb,
    ...(uri ? { thumbUri: uri } : {}),
    ...(lm.titleI18n && typeof lm.titleI18n === 'object' ? { titleI18n: lm.titleI18n } : {}),
    ...(lm.descI18n && typeof lm.descI18n === 'object' ? { descI18n: lm.descI18n } : {}),
    ...(Array.isArray(lm.galleryUris)
      ? {
          galleryUris: lm.galleryUris
            .map((u) => normalizeImageUri(u))
            .filter(Boolean),
        }
      : {}),
    ...(typeof lm.address === 'string' && lm.address.trim() ? { address: lm.address.trim() } : {}),
    ...(typeof lm.addressEn === 'string' && lm.addressEn.trim()
      ? { addressEn: lm.addressEn.trim() }
      : {}),
    ...(typeof lm.addressUk === 'string' && lm.addressUk.trim()
      ? { addressUk: lm.addressUk.trim() }
      : {}),
    ...(typeof lm.category === 'string' &&
    ['monument', 'museum', 'park', 'other'].includes(lm.category.trim())
      ? { category: lm.category.trim() }
      : {}),
  };
  if (lm.story && typeof lm.story === 'object') {
    base.story = normalizeLandmarkStory(normalizeStoryImageUris(lm.story));
  }
  return base;
}

function mergeRuntimeLandmarks(existingList, incomingList) {
  const result = Array.isArray(existingList) ? existingList.map((lm) => ({ ...lm })) : [];
  const byId = new Map();
  const byTitle = new Map();
  const reindex = () => {
    byId.clear();
    byTitle.clear();
    result.forEach((lm, i) => {
      if (lm?.id) byId.set(String(lm.id), i);
      const k1 = normalizeLandmarkTitleKey(lm?.titleUk);
      const k2 = normalizeLandmarkTitleKey(lm?.titleEn);
      if (k1) byTitle.set(k1, i);
      if (k2) byTitle.set(k2, i);
    });
  };
  reindex();

  for (const raw of incomingList || []) {
    const incoming = mapSnapshotLandmarkToRuntime(raw);
    if (!incoming) continue;
    let idx = incoming.id && byId.has(String(incoming.id)) ? byId.get(String(incoming.id)) : -1;
    if (idx < 0) {
      const k1 = normalizeLandmarkTitleKey(incoming.titleUk);
      const k2 = normalizeLandmarkTitleKey(incoming.titleEn);
      if (k1 && byTitle.has(k1)) idx = byTitle.get(k1);
      else if (k2 && byTitle.has(k2)) idx = byTitle.get(k2);
    }
    if (idx >= 0) {
      const prev = result[idx];
      const preferIncoming = landmarkContentScore(incoming) >= landmarkContentScore(prev);
      if (preferIncoming) {
        result[idx] = {
          ...prev,
          ...incoming,
          id: prev.id || incoming.id,
          // Keep richer built-in story/thumb when AI payload is thinner.
          story: incoming.story && landmarkContentScore(incoming) >= 50 ? incoming.story : prev.story || incoming.story,
          thumb:
            incoming.thumb && typeof incoming.thumb === 'object' && incoming.thumb.uri
              ? incoming.thumb
              : prev.thumb || incoming.thumb,
          titleUk: incoming.titleUk || prev.titleUk,
          titleEn: incoming.titleEn || prev.titleEn,
        };
      } else {
        result[idx] = {
          ...prev,
          // Still take HTTPS gallery / desc from AI if missing on built-in.
          ...(incoming.galleryUris && !prev.galleryUris ? { galleryUris: incoming.galleryUris } : {}),
          ...(incoming.descUk && !prev.descUk ? { descUk: incoming.descUk } : {}),
          ...(incoming.descEn && !prev.descEn ? { descEn: incoming.descEn } : {}),
          ...(incoming.address && !prev.address ? { address: incoming.address } : {}),
          ...(incoming.addressEn && !prev.addressEn ? { addressEn: incoming.addressEn } : {}),
          ...(incoming.addressUk && !prev.addressUk ? { addressUk: incoming.addressUk } : {}),
          ...(incoming.category && !prev.category ? { category: incoming.category } : {}),
          ...(incoming.titleI18n ? { titleI18n: { ...(prev.titleI18n || {}), ...incoming.titleI18n } } : {}),
          ...(incoming.descI18n ? { descI18n: { ...(prev.descI18n || {}), ...incoming.descI18n } } : {}),
          thumb:
            (!prev.thumb || prev.thumb === HERO_THUMB_MAP.t1) &&
            incoming.thumb &&
            typeof incoming.thumb === 'object' &&
            incoming.thumb.uri
              ? incoming.thumb
              : prev.thumb,
        };
      }
    } else {
      result.push(incoming);
    }
    reindex();
  }
  return result;
}

function restoreBuiltinRegion(rid) {
  const builtin = captureBuiltinRouteRegions()[rid];
  if (!builtin) return;
  const dedicated = BUILTIN_REGION_HERO_THUMBS[rid] || builtin.heroThumb || null;
  ROUTE_REGIONS[rid] = {
    ...builtin,
    center: builtin.center && typeof builtin.center === 'object' ? { ...builtin.center } : builtin.center,
    landmarks: Array.isArray(builtin.landmarks) ? builtin.landmarks.map((lm) => ({ ...lm })) : [],
    ...(dedicated ? { heroThumb: dedicated } : {}),
  };
}

function resolveHeroThumbForRegion(rid, src, prev) {
  const dedicated = BUILTIN_REGION_HERO_THUMBS[rid] || null;
  const fromRef =
    src && isValidHeroThumbRef(src.heroThumbRef) ? HERO_THUMB_MAP[src.heroThumbRef] : null;
  const placeholder = HERO_THUMB_MAP.t1;
  // Never let generic t1 wipe a real city photo.
  if (fromRef && fromRef !== placeholder) return fromRef;
  if (prev?.heroThumb && prev.heroThumb !== placeholder) return prev.heroThumb;
  if (dedicated) return dedicated;
  if (fromRef) return fromRef;
  return prev?.heroThumb || null;
}

function mergeRemoteRegionOnto(rid, src) {
  if (!src || typeof src !== 'object') return;
  if (!ROUTE_REGIONS[rid]) {
    const landmarks = (src.landmarks || []).map(mapSnapshotLandmarkToRuntime).filter(Boolean);
    const heroThumb = resolveHeroThumbForRegion(rid, src, null);
    const heroUriOk = normalizeImageUri(src.heroUri);
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
    return;
  }

  const prev = ROUTE_REGIONS[rid];
  const mergedLandmarks = mergeRuntimeLandmarks(prev.landmarks || [], src.landmarks || []);
  const heroThumb = resolveHeroThumbForRegion(rid, src, prev);
  const heroUriOk = normalizeImageUri(src.heroUri);
  ROUTE_REGIONS[rid] = {
    ...prev,
    id: src.id || prev.id || rid,
    titleUk: src.titleUk || prev.titleUk || rid,
    titleEn: src.titleEn || prev.titleEn || rid,
    countryUk: src.countryUk || prev.countryUk || '',
    countryEn: src.countryEn || prev.countryEn || '',
    flag: src.flag || prev.flag || '🏳️',
    center: src.center || prev.center,
    landmarks: mergedLandmarks,
    ...(heroThumb ? { heroThumb } : {}),
    ...(prev.heroUri && !heroUriOk ? { heroUri: prev.heroUri } : {}),
    ...(heroUriOk ? { heroUri: heroUriOk } : {}),
  };
}

function applySnapshot(data) {
  if (!data || typeof data !== 'object') return;

  const baseline = JSON.parse(getDefaultLocationSnapshotJson());
  const builtin = captureBuiltinRouteRegions();

  // Country card photos: always restore built-in heroes, then overlay CMS URLs/refs.
  for (const k of Object.keys(HOME_COUNTRY_HERO_REFS)) delete HOME_COUNTRY_HERO_REFS[k];
  for (const k of Object.keys(HOME_COUNTRY_HERO_URIS)) delete HOME_COUNTRY_HERO_URIS[k];
  if (baseline.homeCountryHeroRefs && typeof baseline.homeCountryHeroRefs === 'object') {
    for (const [cid, ref] of Object.entries(baseline.homeCountryHeroRefs)) {
      if (ref != null) HOME_COUNTRY_HERO_REFS[cid] = ref;
    }
  }
  if (data.homeCountryHeroRefs && typeof data.homeCountryHeroRefs === 'object') {
    for (const [cid, ref] of Object.entries(data.homeCountryHeroRefs)) {
      if (isValidHeroThumbRef(ref)) HOME_COUNTRY_HERO_REFS[cid] = ref;
      else if (typeof ref === 'number') HOME_COUNTRY_HERO_REFS[cid] = ref;
    }
  }
  if (baseline.homeCountryHeroUris && typeof baseline.homeCountryHeroUris === 'object') {
    for (const [cid, u] of Object.entries(baseline.homeCountryHeroUris)) {
      const normalized = normalizeImageUri(u);
      if (normalized) HOME_COUNTRY_HERO_URIS[cid] = normalized;
    }
  }
  if (data.homeCountryHeroUris && typeof data.homeCountryHeroUris === 'object') {
    for (const [cid, u] of Object.entries(data.homeCountryHeroUris)) {
      const normalized = normalizeImageUri(u);
      if (normalized) HOME_COUNTRY_HERO_URIS[cid] = normalized;
    }
  }

  // Countries order: CMS/AI first, then every built-in country that remains.
  {
    const seen = new Set();
    const merged = [];
    const push = (id) => {
      const cid = String(id || '').trim().toUpperCase();
      if (!cid || seen.has(cid)) return;
      seen.add(cid);
      merged.push(cid);
    };
    (Array.isArray(data.homeCountryOrder) ? data.homeCountryOrder : []).forEach(push);
    (Array.isArray(baseline.homeCountryOrder) ? baseline.homeCountryOrder : []).forEach(push);
    HOME_COUNTRY_ORDER.splice(0, HOME_COUNTRY_ORDER.length, ...merged);
  }

  // Region ids per country: union baseline + remote (never drop Europe cities).
  {
    const countryIds = new Set([
      ...Object.keys(baseline.homeRegionIdsByCountry || {}),
      ...Object.keys(data.homeRegionIdsByCountry || {}),
      ...HOME_COUNTRY_ORDER,
    ]);
    for (const raw of countryIds) {
      const cid = String(raw || '').trim().toUpperCase();
      if (!cid) continue;
      const incoming = Array.isArray(data.homeRegionIdsByCountry?.[cid])
        ? data.homeRegionIdsByCountry[cid].map(String)
        : Array.isArray(data.homeRegionIdsByCountry?.[raw])
          ? data.homeRegionIdsByCountry[raw].map(String)
          : [];
      const base = Array.isArray(baseline.homeRegionIdsByCountry?.[cid])
        ? baseline.homeRegionIdsByCountry[cid].map(String)
        : [];
      const seen = new Set();
      const merged = [];
      [...incoming, ...base].forEach((rid) => {
        const id = String(rid || '').trim();
        if (!id || seen.has(id)) return;
        seen.add(id);
        merged.push(id);
      });
      HOME_REGION_IDS_BY_COUNTRY_ID[cid] = merged;
    }
  }

  // Restore full built-in cities (Maidan, Sophia, … with photos/stories), then merge CMS/AI on top.
  for (const rid of Object.keys(builtin)) {
    restoreBuiltinRegion(rid);
  }
  if (data.regions && typeof data.regions === 'object') {
    for (const rid of Object.keys(data.regions)) {
      mergeRemoteRegionOnto(rid, data.regions[rid]);
    }
  }

  invalidateHomeExploreCache();
}

async function fetchPublicLandmarkContentVersion() {
  try {
    const { data } = await apiHttp.get('/api/app/landmark-content/version', {
      timeout: 8000,
    });
    return data?.version ? String(data.version) : null;
  } catch {
    return null;
  }
}

async function fetchPublicLandmarkContentBundle() {
  const { data } = await apiHttp.get('/api/app/landmark-content/bundle', {
    timeout: 20000,
  });
  return isSnapshotLike(data) ? data : null;
}

export async function syncRemoteLocationBundleNow(opts = {}) {
  const now = Date.now();
  const minIntervalMs = Number(opts?.minIntervalMs ?? REMOTE_SYNC_MIN_INTERVAL_MS);
  if (!opts?.force && now - lastRemoteSyncAttemptAt < minIntervalMs) {
    // Lightweight version probe bypasses full-bundle throttle: if version changed, sync immediately.
    const remoteVersion = await fetchPublicLandmarkContentVersion();
    if (!remoteVersion) return { status: 'skipped', reason: 'throttled' };
    const prevMeta = await readRemoteSyncMeta();
    if (prevMeta?.fingerprint === remoteVersion || prevMeta?.version === remoteVersion) {
      return { status: 'unchanged' };
    }
  }
  lastRemoteSyncAttemptAt = now;
  try {
    const remote = await fetchPublicLandmarkContentBundle();
    if (!remote) return { status: 'empty' };
    const fingerprint = remote?._meta?.version ? String(remote._meta.version) : bundleFingerprint(remote);
    const prevMeta = await readRemoteSyncMeta();
    if (!opts?.forceApply && (prevMeta?.fingerprint === fingerprint || prevMeta?.version === fingerprint)) {
      return { status: 'unchanged' };
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
    await AsyncStorage.setItem(
      REMOTE_SYNC_META_KEY,
      JSON.stringify({
        syncedAt: new Date().toISOString(),
        source: 'backend',
        fingerprint,
        version: fingerprint,
      }),
    );
    runAfterInteractions(() => {
      applySnapshot(remote);
      DeviceEventEmitter.emit(KRAINA_ADMIN_LOCATION_EVENT);
    });
    return { status: 'synced' };
  } catch (e) {
    return { status: 'error', message: e?.message || String(e) };
  }
}

export function startRemoteLocationBundleAutoSync(opts = {}) {
  const minIntervalMs = Number(opts?.minIntervalMs ?? REMOTE_SYNC_MIN_INTERVAL_MS);
  const sync = () => {
    if (typeof opts?.shouldSync === 'function' && !opts.shouldSync()) return;
    void syncRemoteLocationBundleNow({ minIntervalMs });
  };
  if (opts?.syncImmediately !== false) sync();
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') sync();
  });
  return () => sub.remove();
}

export async function publishAdminLocationBundle(snapshot) {
  const { data } = await apiHttp.put('/api/admin/landmark-content/bundle', snapshot, {
    headers: { ...authHeaders() },
    timeout: 180000,
  });
  return data;
}

export async function loadAdminLocationBundleOnStartup() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      invalidateHomeExploreCache();
      DeviceEventEmitter.emit(KRAINA_ADMIN_LOCATION_EVENT);
    } else {
      applySnapshot(JSON.parse(raw));
      DeviceEventEmitter.emit(KRAINA_ADMIN_LOCATION_EVENT);
    }
  } catch {
    /* ignore */
  }
  void syncRemoteLocationBundleNow({ force: true, forceApply: true });
}

export async function saveAdminLocationBundle(snapshot, opts = {}) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  applySnapshot(snapshot);
  DeviceEventEmitter.emit(KRAINA_ADMIN_LOCATION_EVENT);
  if (opts?.publish) {
    return publishAdminLocationBundle(snapshot);
  }
  return { ok: true, localOnly: true };
}

export async function resetAdminLocationsToDefaults() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  applySnapshot(JSON.parse(getDefaultLocationSnapshotJson()));
  DeviceEventEmitter.emit(KRAINA_ADMIN_LOCATION_EVENT);
}
