import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

const KEY_PREFIX = '@kraina_walk_reminder_v1';

function getKey() {
  try {
    const { useAuthStore } = require('./auth/authStore');
    const userId = useAuthStore.getState().user?.id;
    if (userId) return `${KEY_PREFIX}:${userId}`;
  } catch {}
  return KEY_PREFIX;
}

export const WALK_REMINDER_CHANGED = 'kraina_walk_reminder_changed';

const DEFAULTS = {
  enabled: false,
  hour: 18,
  minute: 30,
  scheduledNotificationId: null,
};

function clampHour(n) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return DEFAULTS.hour;
  return Math.min(23, Math.max(0, x));
}

function clampMinute(n) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return DEFAULTS.minute;
  return Math.min(59, Math.max(0, x));
}

export async function getWalkReminderPrefs() {
  try {
    const raw = await AsyncStorage.getItem(getKey());
    if (!raw) return { ...DEFAULTS };
    const j = JSON.parse(raw);
    return {
      enabled: !!j.enabled,
      hour: clampHour(j.hour),
      minute: clampMinute(j.minute),
      scheduledNotificationId:
        typeof j.scheduledNotificationId === 'string' && j.scheduledNotificationId.trim()
          ? j.scheduledNotificationId.trim()
          : null,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * @param {Partial<{ enabled: boolean, hour: number, minute: number, scheduledNotificationId: string | null }>} patch
 */
export async function setWalkReminderPrefs(patch) {
  const cur = await getWalkReminderPrefs();
  const next = {
    ...cur,
    ...patch,
    hour: patch.hour !== undefined ? clampHour(patch.hour) : cur.hour,
    minute: patch.minute !== undefined ? clampMinute(patch.minute) : cur.minute,
    scheduledNotificationId:
      patch.scheduledNotificationId !== undefined ? patch.scheduledNotificationId : cur.scheduledNotificationId,
  };
  await AsyncStorage.setItem(getKey(), JSON.stringify(next));
  try {
    DeviceEventEmitter.emit(WALK_REMINDER_CHANGED, next);
  } catch {
    /* */
  }
  // Only mirror user-intent fields; scheduledNotificationId is device-local and must not cross devices.
  if (patch.enabled !== undefined || patch.hour !== undefined || patch.minute !== undefined) {
    void mirrorWalkReminderToFirestore({
      enabled: next.enabled,
      hour: next.hour,
      minute: next.minute,
    }).catch(() => {});
  }
  return next;
}

/** Called by PostAuthHome to apply remote value without re-mirroring. Returns merged prefs. */
export async function applyWalkReminderPrefsLocal(remote) {
  if (!remote || typeof remote !== 'object') return null;
  const cur = await getWalkReminderPrefs();
  const next = {
    ...cur,
    enabled: typeof remote.enabled === 'boolean' ? remote.enabled : cur.enabled,
    hour: remote.hour !== undefined ? clampHour(remote.hour) : cur.hour,
    minute: remote.minute !== undefined ? clampMinute(remote.minute) : cur.minute,
    // Never overwrite local schedule id — OS-scoped token.
    scheduledNotificationId: cur.scheduledNotificationId,
  };
  await AsyncStorage.setItem(getKey(), JSON.stringify(next));
  try {
    DeviceEventEmitter.emit(WALK_REMINDER_CHANGED, next);
  } catch {
    /* */
  }
  return next;
}

async function mirrorWalkReminderToFirestore({ enabled, hour, minute }) {
  try {
    const FirebaseCfg = require('./firebaseConfig');
    if (!FirebaseCfg.firebaseEnabled || !FirebaseCfg.db || !FirebaseCfg.auth) return;
    const uid = String(FirebaseCfg.auth.currentUser?.uid || '');
    if (!uid) return;
    const { doc, setDoc, serverTimestamp } = require('firebase/firestore');
    await setDoc(
      doc(FirebaseCfg.db, 'profiles', uid),
      {
        walkReminder: { enabled: !!enabled, hour: clampHour(hour), minute: clampMinute(minute) },
        updated_at: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (_) {
    // Silent: offline or anonymous session — local prefs remain authoritative.
  }
}
