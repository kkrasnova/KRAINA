import AsyncStorage from '@react-native-async-storage/async-storage';

const OFFLINE_MEDIA_MAP_KEY = '@kraina_offline_media_map_v1';
const OFFLINE_BUNDLE_META_KEY = '@kraina_offline_bundle_meta_v1';
let mediaMapCache = {};

async function readJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export async function getOfflineMediaMap() {
  const map = await readJson(OFFLINE_MEDIA_MAP_KEY, {});
  mediaMapCache = map && typeof map === 'object' ? map : {};
  return mediaMapCache;
}

export async function resolveOfflineUri(uri) {
  const raw = String(uri || '').trim();
  if (!raw) return '';
  const map = await getOfflineMediaMap();
  const local = typeof map[raw] === 'string' ? map[raw].trim() : '';
  return local || raw;
}

export function resolveOfflineUriSync(uri) {
  const raw = String(uri || '').trim();
  if (!raw) return '';
  const local = typeof mediaMapCache[raw] === 'string' ? mediaMapCache[raw].trim() : '';
  return local || raw;
}

export async function saveOfflineMediaMap(map) {
  mediaMapCache = map && typeof map === 'object' ? map : {};
  await AsyncStorage.setItem(OFFLINE_MEDIA_MAP_KEY, JSON.stringify(mediaMapCache));
}

export async function mergeOfflineMediaMap(patch) {
  const prev = await getOfflineMediaMap();
  const next = { ...prev, ...(patch || {}) };
  await saveOfflineMediaMap(next);
  return next;
}

export async function warmOfflineMediaCache() {
  await getOfflineMediaMap();
}

export async function getOfflineBundleMeta() {
  const meta = await readJson(OFFLINE_BUNDLE_META_KEY, {});
  return meta && typeof meta === 'object' ? meta : {};
}

export async function setOfflineBundleMeta(meta) {
  await AsyncStorage.setItem(
    OFFLINE_BUNDLE_META_KEY,
    JSON.stringify({
      ...(meta || {}),
      updatedAt: new Date().toISOString(),
    }),
  );
}
