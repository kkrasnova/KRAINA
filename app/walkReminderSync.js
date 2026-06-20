import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter, Linking, NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import { st } from './settingsI18n';
import { getWalkReminderPrefs, setWalkReminderPrefs } from './walkReminderStorage';
import {
  getInAppNotificationPrefs,
  isInAppNotificationEnabled,
  isInAppNotificationSoundEnabled,
  NOTIFICATION_PREFS_CHANGED_EVENT,
  readInAppNotificationPrefsSnapshot,
} from './inAppNotificationPrefs';

/** undefined = ще не пробували; null = модуль недоступний (немає нативу / dev-білд). */
let notificationsModuleCache;

/**
 * `require('expo-notifications')` одразу тягне JS, який викликає getEnforcing('ExpoPushTokenManager').
 * Це не ловиться try/catch — тому спочатку перевіряємо наявність нативу.
 */
function hasExpoNotificationsNativeRuntime() {
  const moduleNames = [
    'ExpoNotificationScheduler',
    'ExpoNotificationPermissionsModule',
    'ExpoPushTokenManager',
  ];
  try {
    if (typeof TurboModuleRegistry?.get === 'function') {
      if (moduleNames.some((name) => TurboModuleRegistry.get(name) != null)) return true;
    }
  } catch {
    /* */
  }
  try {
    const mods = NativeModules || {};
    if (moduleNames.some((name) => mods[name] != null)) return true;
  } catch {
    return false;
  }
  return false;
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
let prefsListenerInstalled = false;

async function resolveNotificationCategory(notification) {
  const data = notification?.request?.content?.data;
  const raw = data?.category || data?.notifCategory;
  if (raw === 'messages' || raw === 'feed' || raw === 'routesTips' || raw === 'productNews') {
    return raw;
  }
  return 'routesTips';
}

async function readEffectiveNotificationPrefs() {
  return readInAppNotificationPrefsSnapshot() || (await getInAppNotificationPrefs());
}

function installNotificationPrefsListener() {
  if (prefsListenerInstalled) return;
  prefsListenerInstalled = true;
  DeviceEventEmitter.addListener(NOTIFICATION_PREFS_CHANGED_EVENT, () => {
    void resyncWalkReminderAfterPrefsChange();
  });
}

async function resyncWalkReminderAfterPrefsChange() {
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

export function installWalkReminderNotificationHandler() {
  if (handlerInstalled) return;
  const Notifications = getExpoNotifications();
  installNotificationPrefsListener();
  if (!Notifications) {
    handlerInstalled = true;
    return;
  }
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const category = await resolveNotificationCategory(notification);
      const prefs = await readEffectiveNotificationPrefs();
      return {
        shouldShowAlert: isInAppNotificationEnabled(prefs, category),
        shouldPlaySound: isInAppNotificationSoundEnabled(prefs, category),
        shouldSetBadge: false,
      };
    },
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

export function isWalkReminderNotificationsAvailable() {
  return !!getExpoNotifications();
}

export async function getWalkReminderNotificationPermissionStatus() {
  const Notifications = getExpoNotifications();
  if (!Notifications) {
    return { granted: false, canAskAgain: false, available: false, status: 'unavailable' };
  }
  try {
    const p = await Notifications.getPermissionsAsync();
    return {
      granted: notificationPermissionOk(p),
      canAskAgain: p?.canAskAgain !== false,
      available: true,
      status: p?.status || 'unknown',
    };
  } catch {
    return { granted: false, canAskAgain: false, available: false, status: 'error' };
  }
}

function resolveAndroidPackageId() {
  try {
    const Application = require('expo-application');
    const id = Application?.applicationId;
    if (id && typeof id === 'string') return id;
  } catch {
    /* */
  }
  return 'com.kraina.app';
}

/** Відкриває системні налаштування сповіщень для KRAÏNA (Android — екран Notifications, iOS — сторінка застосунку). */
export async function openWalkReminderNotificationSettings() {
  if (Platform.OS === 'android') {
    const pkg = resolveAndroidPackageId();
    const intents = [
      `intent:#Intent;action=android.settings.APP_NOTIFICATION_SETTINGS;launchFlags=0x10000000;S.android.provider.extra.APP_PACKAGE=${pkg};end`,
      `intent:#Intent;action=android.settings.APP_NOTIFICATION_SETTINGS;launchFlags=0x10000000;S.app_package=${pkg};end`,
    ];
    for (const uri of intents) {
      try {
        const can = await Linking.canOpenURL(uri);
        if (can) {
          await Linking.openURL(uri);
          return true;
        }
      } catch {
        /* try next */
      }
    }
  }
  if (typeof Linking.openSettings === 'function') {
    await Linking.openSettings();
    return true;
  }
  await Linking.openURL('app-settings:').catch(() => {});
  return true;
}

export async function requestWalkReminderNotificationPermission() {
  const Notifications = getExpoNotifications();
  if (!Notifications) return false;
  const cur = await Notifications.getPermissionsAsync();
  if (notificationPermissionOk(cur)) return true;
  const next = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });
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
    const notifPrefs = await getInAppNotificationPrefs();
    if (!isInAppNotificationEnabled(notifPrefs, 'routesTips')) return 'ok';
    const ok = await requestWalkReminderNotificationPermission();
    if (!ok) return 'permission_denied';
    const playSound = isInAppNotificationSoundEnabled(notifPrefs, 'routesTips');
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: copy.title,
        body: copy.body,
        sound: playSound ? true : false,
        data: { category: 'routesTips' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
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
