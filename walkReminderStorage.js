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
  return next;
}
