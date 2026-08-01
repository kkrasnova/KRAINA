import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';

export const THEME_STORAGE_KEY = '@kraina_app_theme';
export const THEME_USER_CHOSEN_KEY = '@kraina_app_theme_user_chosen';
/**
 * Одноразовий скид на світлу.
 * v6: попередні міграції могли лишити темну в AsyncStorage — знову чистимо.
 */
export const THEME_POLICY_MIGRATION_V6_KEY = '@kraina_app_theme_policy_v6_light_default';
export const THEME_CHANGED_EVENT = 'kraina_app_theme_changed';

/** За замовчуванням завжди світла. Темна — лише після явного вибору в Налаштуваннях. */
export const DEFAULT_APP_THEME = 'light';

/** Синхронний кеш. */
let cachedAppTheme = DEFAULT_APP_THEME;
/** true лише якщо користувач сам увімкнув темну в Налаштуваннях. */
let cachedPreferDark = false;

function setCachedPreferDark(preferDark) {
  cachedPreferDark = preferDark === true;
  cachedAppTheme = preferDark ? 'dark' : 'light';
}

/** @deprecated лишаємо для сумісності викликів */
export function getThemeUserChosenSync() {
  return cachedPreferDark;
}

/**
 * Поточна тема:
 * — світла за замовчуванням;
 * — dark лише якщо користувач увімкнув темну в Налаштуваннях.
 */
export function getAppThemeSync() {
  return cachedPreferDark ? 'dark' : 'light';
}

export function resolveAppTheme(_routeTheme) {
  return getAppThemeSync();
}

export function screenBgForTheme(theme) {
  return theme === 'light' ? LIGHT_BAR_BG : APP_SCREEN_BG;
}

export function navThemeForAppTheme(appTheme) {
  const bg = screenBgForTheme(appTheme);
  const base = appTheme === 'light' ? DefaultTheme : DarkTheme;
  return {
    ...base,
    dark: appTheme !== 'light',
    colors: {
      ...base.colors,
      background: bg,
      card: bg,
      border: appTheme === 'light' ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.1)',
    },
  };
}

async function migrateToLightDefaultV6() {
  try {
    const done = await AsyncStorage.getItem(THEME_POLICY_MIGRATION_V6_KEY);
    if (done === '1') return;
    setCachedPreferDark(false);
    await AsyncStorage.multiRemove([
      THEME_STORAGE_KEY,
      THEME_USER_CHOSEN_KEY,
      '@kraina_app_theme_policy_v5_light_default',
      '@kraina_app_theme_policy_v4',
      '@kraina_app_theme_policy_v3',
      '@kraina_app_theme_policy_v2',
    ]);
    await AsyncStorage.setItem(THEME_POLICY_MIGRATION_V6_KEY, '1');
    DeviceEventEmitter.emit(THEME_CHANGED_EVENT, DEFAULT_APP_THEME);
  } catch (_) {
    setCachedPreferDark(false);
  }
}

async function hydrateThemeFromStorage() {
  try {
    await migrateToLightDefaultV6();
    const [themeRaw, chosenRaw] = await Promise.all([
      AsyncStorage.getItem(THEME_STORAGE_KEY),
      AsyncStorage.getItem(THEME_USER_CHOSEN_KEY),
    ]);
    const userChosen = chosenRaw === 'true' || chosenRaw === '1';
    // Темна лише якщо користувач явно зберіг dark після міграції.
    const preferDark = userChosen && String(themeRaw || '').trim().toLowerCase() === 'dark';
    setCachedPreferDark(preferDark);
  } catch (_) {
    setCachedPreferDark(false);
  }
}

/** Скинути до світлої (вихід з акаунту). */
export async function resetAppThemeToDefault() {
  setCachedPreferDark(false);
  try {
    await AsyncStorage.multiRemove([THEME_STORAGE_KEY, THEME_USER_CHOSEN_KEY]);
  } catch (_) {}
  DeviceEventEmitter.emit(THEME_CHANGED_EVENT, DEFAULT_APP_THEME);
}

export async function getAppTheme() {
  await hydrateThemeFromStorage();
  return getAppThemeSync();
}

/** Зберегти вибір з Налаштувань: light | dark. */
export async function setAppTheme(theme) {
  const preferDark = !(theme === 'light' || String(theme).trim().toLowerCase() === 'light');
  setCachedPreferDark(preferDark);
  const v = preferDark ? 'dark' : 'light';
  try {
    if (preferDark) {
      await AsyncStorage.multiSet([
        [THEME_STORAGE_KEY, 'dark'],
        [THEME_USER_CHOSEN_KEY, 'true'],
      ]);
    } else {
      // Світла = дефолт: прибираємо «явний» вибір.
      await AsyncStorage.multiRemove([THEME_STORAGE_KEY, THEME_USER_CHOSEN_KEY]);
    }
  } catch (_) {}
  DeviceEventEmitter.emit(THEME_CHANGED_EVENT, v);
  return v;
}

void hydrateThemeFromStorage();
