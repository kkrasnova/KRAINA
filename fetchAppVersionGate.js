import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { API_BASE_URL } from './auth/config';

const ANDROID_PACKAGE = 'com.kraina.app';

function readPublicEnv(key) {
  try {
    if (typeof process === 'undefined' || !process.env) return '';
    const v = process.env[key];
    return v && String(v).trim() ? String(v).trim() : '';
  } catch {
    return '';
  }
}

/** Перші три числові сегменти (2 → 2.0.0, 1.2 → 1.2.0). */
export function parseSemverCore(version) {
  const parts = String(version || '')
    .trim()
    .split('.')
    .map((x) => parseInt(x, 10))
    .filter((n) => !Number.isNaN(n));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/** -1 якщо a < b, 0 якщо рівні, 1 якщо a > b */
export function compareSemver(a, b) {
  const pa = parseSemverCore(a);
  const pb = parseSemverCore(b);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

export function getInstalledAppVersion() {
  return (
    Constants.nativeApplicationVersion ||
    Constants.expoConfig?.version ||
    Constants.manifest?.version ||
    '0.0.0'
  );
}

function defaultStoreUrl() {
  const ios = readPublicEnv('EXPO_PUBLIC_IOS_APP_STORE_URL');
  if (Platform.OS === 'ios' && ios && /^https?:\/\//i.test(ios)) return ios;
  const play = readPublicEnv('EXPO_PUBLIC_PLAY_STORE_URL');
  if (Platform.OS === 'android' && play && /^https?:\/\//i.test(play)) return play;
  if (Platform.OS === 'android') {
    return `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
  }
  return ios && /^https?:\/\//i.test(ios) ? ios : '';
}

/**
 * Перевірка мінімальної версії з бекенду. При помилці мережі — не блокуємо застосунок.
 *
 * @returns {Promise<{
 *   requireUpdate: boolean;
 *   currentVersion: string;
 *   minVersion: string | null;
 *   storeUrl: string;
 * }>}
 */
export async function fetchAppVersionGate() {
  const currentVersion = getInstalledAppVersion();
  const fallbackStore = defaultStoreUrl();

  const url = `${API_BASE_URL}/api/app/version`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) {
      return { requireUpdate: false, currentVersion, minVersion: null, storeUrl: fallbackStore };
    }
    const data = await res.json().catch(() => ({}));
    const minRaw = data?.min_supported_version;
    const minVersion =
      minRaw != null && String(minRaw).trim() !== '' ? String(minRaw).trim() : null;
    if (!minVersion) {
      return { requireUpdate: false, currentVersion, minVersion: null, storeUrl: fallbackStore };
    }
    const cmp = compareSemver(currentVersion, minVersion);
    const requireUpdate = cmp < 0;
    const iosUrl = typeof data?.ios_store_url === 'string' && data.ios_store_url.trim() ? data.ios_store_url.trim() : '';
    const androidUrl =
      typeof data?.android_store_url === 'string' && data.android_store_url.trim()
        ? data.android_store_url.trim()
        : '';
    const storeUrl =
      Platform.OS === 'ios'
        ? iosUrl || fallbackStore
        : androidUrl || fallbackStore;

    return {
      requireUpdate,
      currentVersion,
      minVersion,
      storeUrl: storeUrl || fallbackStore,
    };
  } catch {
    clearTimeout(timer);
    return { requireUpdate: false, currentVersion, minVersion: null, storeUrl: fallbackStore };
  }
}
