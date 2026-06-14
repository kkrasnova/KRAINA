import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import { st } from './settingsI18n';
import { getWalkReminderPrefs, setWalkReminderPrefs } from './walkReminderStorage';

/** undefined = ще не пробували; null = модуль недоступний (немає нативу / dev-білд). */
let notificationsModuleCache;

/**
 * `require('expo-notifications')` одразу тягне JS, який викликає getEnforcing('ExpoPushTokenManager').
 * Це не ловиться try/catch — тому спочатку перевіряємо наявність нативу.
 */
function hasExpoNotificationsNativeRuntime() {
  try {
    const fromTurbo =
      typeof TurboModuleRegistry?.get === 'function' &&
      TurboModuleRegistry.get('ExpoPushTokenManager') != null;
    if (fromTurbo) return true;
  } catch {
    /* */
  }
  try {
    return NativeModules?.ExpoPushTokenManager != null;
  } catch {
    return false;
  }
}

function getExpoNotifications() {
  if (notificationsModuleCache !== undefined) {
    return notificationsModuleCache;
  }
  if (!hasExpoNotificationsNativeRuntime()) {
    notificationsModuleCache = null;
    return null;
  }
  try {
    // Не імпортувати зверху файлу: WalkReminderSetupPage тягне цей модуль.
    notificationsModuleCache = require('expo-notifications');
  } catch {
    notificationsModuleCache = null;
  }
  return notificationsModuleCache;
}

let handlerInstalled = false;

export function installWalkReminderNotificationHandler() {
  if (handlerInstalled) return;
  const Notifications = getExpoNotifications();
  if (!Notifications) {
    handlerInstalled = true;
    return;
  }
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

const CHANNEL_ID = 'kraina-walk-reminder';

export async function ensureWalkReminderAndroidChannel() {
  if (Platform.OS !== 'android') return;
  const Notifications = getExpoNotifications();
  if (!Notifications) return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'KRAÏNA — прогулянки',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 220, 80, 220],
  });
}

function notificationPermissionOk(p) {
  if (!p) return false;
  if (p.granted === true) return true;
  const s = p.status;
  return s === 'granted' || s === 'provisional';
}

export async function requestWalkReminderNotificationPermission() {
  const Notifications = getExpoNotifications();
  if (!Notifications) return false;
  const cur = await Notifications.getPermissionsAsync();
  if (notificationPermissionOk(cur)) return true;
  const next = await Notifications.requestPermissionsAsync();
  return notificationPermissionOk(next);
}

/** Скасувати лише заплановане системне сповіщення (id у prefs), не змінюючи enabled/hour/minute. */
export async function cancelScheduledWalkReminderOnly() {
  const prefs = await getWalkReminderPrefs();
  if (!prefs.scheduledNotificationId) return;
  const Notifications = getExpoNotifications();
  if (Notifications) {
    try {
      await Notifications.cancelScheduledNotificationAsync(prefs.scheduledNotificationId);
    } catch {
      /* */
    }
  }
  await setWalkReminderPrefs({ scheduledNotificationId: null });
}

/**
 * Перечитує prefs і ставить щоденний тригер на локальний час пристрою (hour/minute).
 * @param {{ title: string, body: string }} copy
 * @returns {Promise<'ok' | 'permission_denied' | 'schedule_failed'>}
 */
export async function syncWalkReminderScheduleFromStorage(copy) {
  const Notifications = getExpoNotifications();
  if (!Notifications) return 'schedule_failed';
  try {
    await ensureWalkReminderAndroidChannel();
    const prefs = await getWalkReminderPrefs();
    if (prefs.scheduledNotificationId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(prefs.scheduledNotificationId);
      } catch {
        /* */
      }
      await setWalkReminderPrefs({ scheduledNotificationId: null });
    }
    if (!prefs.enabled) return 'ok';
    const ok = await requestWalkReminderNotificationPermission();
    if (!ok) return 'permission_denied';
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: copy.title,
        body: copy.body,
        sound: true,
      },
      trigger: {
        type: 'daily',
        hour: prefs.hour,
        minute: prefs.minute,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
    });
    await setWalkReminderPrefs({ scheduledNotificationId: id });
    return 'ok';
  } catch {
    return 'schedule_failed';
  }
}

/** Після холодного старту: якщо нагадування увімкнені — знову зареєструвати щоденний тригер (ОС інколи скидає розклад). */
export async function resyncWalkReminderOnAppColdStart() {
  const prefs = await getWalkReminderPrefs();
  if (!prefs.enabled) return;
  let language = 'uk';
  try {
    const raw = await AsyncStorage.getItem('@kraina_app_language');
    if (raw && typeof raw === 'string') {
      const base = raw.split(/[-_]/)[0].toLowerCase();
      language = base === 'ru' ? 'uk' : base;
    }
  } catch {
    /* */
  }
  const copy = {
    title: st(language, 'walkReminderNotifTitle'),
    body: st(language, 'walkReminderNotifBody'),
  };
  await syncWalkReminderScheduleFromStorage(copy);
}
