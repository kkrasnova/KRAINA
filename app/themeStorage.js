import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';

export const THEME_STORAGE_KEY = '@kraina_app_theme';
export const THEME_USER_CHOSEN_KEY = '@kraina_app_theme_user_chosen';
export const THEME_POLICY_MIGRATION_KEY = '@kraina_app_theme_policy_v2';
export const THEME_CHANGED_EVENT = 'kraina_app_theme_changed';

/**
 * Нормалізує збережене значення: світла тема лише якщо користувач явно обрав «light».
 * Усі інші значення (відсутнє, auto, сміття) → темна за замовчуванням.
 */
function normalizeStoredTheme(raw) {
  if (typeof raw !== 'string') return 'dark';
  return raw.trim().toLowerCase() === 'light' ? 'light' : 'dark';
}

/** Синхронний кеш — однакова тема на всіх екранах без очікування AsyncStorage. */
let cachedAppTheme = null;
/** Світла тема лише після явного перемикання в Налаштуваннях. */
let cachedThemeUserChosen = false;

function setCachedAppTheme(theme) {
  cachedAppTheme = normalizeStoredTheme(theme);
}

function setCachedThemeUserChosen(chosen) {
  cachedThemeUserChosen = chosen === true;
}

/** Чи користувач сам обрав тему в налаштуваннях (інакше завжди темна). */
export function getThemeUserChosenSync() {
  return cachedThemeUserChosen;
}

/** Поточна тема з памʼяті (після hydrate — збігається зі сховищем). */
export function getAppThemeSync() {
  if (!getThemeUserChosenSync()) return 'dark';
  return cachedAppTheme ?? 'dark';
}

/**
 * Актуальна тема для екранів: збережений вибір користувача (кеш/AsyncStorage).
 * route.params.appTheme ігнорується — він часто застарілий після перемикача в Налаштуваннях.
 */
export function resolveAppTheme(_routeTheme) {
  if (!getThemeUserChosenSync()) return 'dark';
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

async function migrateThemePolicyV2() {
  try {
    const done = await AsyncStorage.getItem(THEME_POLICY_MIGRATION_KEY);
    if (done === '1') return;
    setCachedAppTheme('dark');
    setCachedThemeUserChosen(false);
    await AsyncStorage.multiRemove([THEME_STORAGE_KEY, THEME_USER_CHOSEN_KEY]);
    await AsyncStorage.setItem(THEME_POLICY_MIGRATION_KEY, '1');
    DeviceEventEmitter.emit(THEME_CHANGED_EVENT, 'dark');
  } catch (_) {
    setCachedAppTheme('dark');
    setCachedThemeUserChosen(false);
  }
}

async function hydrateThemeFromStorage() {
  try {
    await migrateThemePolicyV2();
    const [themeRaw, chosenRaw] = await Promise.all([
      AsyncStorage.getItem(THEME_STORAGE_KEY),
      AsyncStorage.getItem(THEME_USER_CHOSEN_KEY),
    ]);
    setCachedAppTheme(themeRaw);
    setCachedThemeUserChosen(chosenRaw === 'true' || chosenRaw === '1');
  } catch (_) {
    setCachedAppTheme('dark');
    setCachedThemeUserChosen(false);
  }
}

/** Скинути тему до тёмної (вихід з акаунту). */
export async function resetAppThemeToDefault() {
  setCachedAppTheme('dark');
  setCachedThemeUserChosen(false);
  try {
    await AsyncStorage.multiRemove([THEME_STORAGE_KEY, THEME_USER_CHOSEN_KEY]);
  } catch (_) {}
  DeviceEventEmitter.emit(THEME_CHANGED_EVENT, 'dark');
}

export async function getAppTheme() {
  await hydrateThemeFromStorage();
  return getAppThemeSync();
}

export async function setAppTheme(theme) {
  const v = theme === 'light' || String(theme).trim().toLowerCase() === 'light' ? 'light' : 'dark';
  setCachedAppTheme(v);
  setCachedThemeUserChosen(true);
  try {
    await AsyncStorage.multiSet([
      [THEME_STORAGE_KEY, v],
      [THEME_USER_CHOSEN_KEY, 'true'],
    ]);
  } catch (_) {}
  DeviceEventEmitter.emit(THEME_CHANGED_EVENT, v);
  return v;
}

void hydrateThemeFromStorage();
