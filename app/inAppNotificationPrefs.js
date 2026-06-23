import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

export const NOTIFICATIONS_PREFS_KEY = '@kraina_settings_inapp_notifications';
export const NOTIFICATION_PREFS_CHANGED_EVENT = 'kraina_inapp_notification_prefs_v1';

export const NOTIFICATION_CATEGORY_KEYS = ['messages', 'feed', 'routesTips', 'productNews'];

export const NOTIFICATION_SOUND_KEYS = {
  messages: 'soundMessages',
  feed: 'soundFeed',
  routesTips: 'soundRoutesTips',
  productNews: 'soundProductNews',
};

export const DEFAULT_NOTIFICATION_PREFS = {
  master: true,
  messages: true,
  feed: true,
  routesTips: true,
  productNews: true,
  soundMaster: true,
  soundMessages: true,
  soundFeed: true,
  soundRoutesTips: true,
  soundProductNews: true,
};

function normalizePrefs(o) {
  const next = { ...DEFAULT_NOTIFICATION_PREFS };
  if (!o || typeof o !== 'object' || Array.isArray(o)) return next;
  for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFS)) {
    if (o[key] === false) next[key] = false;
    else if (o[key] === true) next[key] = true;
  }
  return next;
}

export function parseNotificationPrefsRaw(raw) {
  if (raw == null || raw === '') {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
  const s = String(raw).trim();
  if (s === '0' || s === 'false') {
    return { ...DEFAULT_NOTIFICATION_PREFS, master: false };
  }
  if (s === '1' || s === 'true') {
    return { ...DEFAULT_NOTIFICATION_PREFS, master: true };
  }
  try {
    const o = JSON.parse(s);
    return normalizePrefs(o);
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_NOTIFICATION_PREFS };
}

const notificationPrefsCache = {
  prefs: null,
  fetchedAt: 0,
};

let notificationPrefsRefreshPromise = null;

async function refreshNotificationPrefsCache() {
  const prefs = await getInAppNotificationPrefs();
  notificationPrefsCache.prefs = prefs;
  notificationPrefsCache.fetchedAt = Date.now();
  return prefs;
}

/** Read in-app notification toggles (AsyncStorage); migrates legacy `'0'`/`'1'` values. */
export async function getInAppNotificationPrefs() {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATIONS_PREFS_KEY);
    return parseNotificationPrefsRaw(raw);
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

export function readInAppNotificationPrefsSnapshot() {
  if (notificationPrefsCache.fetchedAt === 0 || !notificationPrefsCache.prefs) return null;
  return { ...notificationPrefsCache.prefs };
}

/** Попередньо зчитати prefs сповіщень — екран відкривається без затримки. */
export function prefetchInAppNotificationPrefs() {
  if (notificationPrefsRefreshPromise) return notificationPrefsRefreshPromise;
  notificationPrefsRefreshPromise = refreshNotificationPrefsCache()
    .catch(() => ({ ...DEFAULT_NOTIFICATION_PREFS }))
    .finally(() => {
      notificationPrefsRefreshPromise = null;
    });
  return notificationPrefsRefreshPromise;
}

export function emitNotificationPrefsChanged(prefs) {
  DeviceEventEmitter.emit(NOTIFICATION_PREFS_CHANGED_EVENT, prefs);
}

export function persistInAppNotificationPrefs(prefs) {
  const next = normalizePrefs(prefs);
  notificationPrefsCache.prefs = next;
  notificationPrefsCache.fetchedAt = Date.now();
  emitNotificationPrefsChanged(next);
  AsyncStorage.setItem(NOTIFICATIONS_PREFS_KEY, JSON.stringify(next)).catch(() => {});
  return next;
}

export function isInAppNotificationEnabled(prefs, category) {
  if (!prefs?.master) return false;
  if (!NOTIFICATION_CATEGORY_KEYS.includes(category)) return false;
  return prefs[category] !== false;
}

export function isInAppNotificationSoundEnabled(prefs, category) {
  if (!isInAppNotificationEnabled(prefs, category)) return false;
  if (prefs.soundMaster === false) return false;
  const soundKey = NOTIFICATION_SOUND_KEYS[category];
  if (!soundKey) return false;
  return prefs[soundKey] !== false;
}

export function allCategorySoundPrefsTrue() {
  return NOTIFICATION_CATEGORY_KEYS.reduce((acc, key) => {
    acc[NOTIFICATION_SOUND_KEYS[key]] = true;
    return acc;
  }, {});
}
