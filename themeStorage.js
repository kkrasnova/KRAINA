import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const THEME_STORAGE_KEY = '@kraina_app_theme';
export const THEME_CHANGED_EVENT = 'kraina_app_theme_changed';

/**
 * Нормалізує збережене значення: світла тема лише якщо користувач явно обрав «light».
 * Усі інші значення (відсутнє, auto, сміття) → темна за замовчуванням.
 */
function normalizeStoredTheme(raw) {
  if (typeof raw !== 'string') return 'dark';
  return raw.trim().toLowerCase() === 'light' ? 'light' : 'dark';
}

export async function getAppTheme() {
  try {
    const v = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    return normalizeStoredTheme(v);
  } catch (_) {
    return 'dark';
  }
}

export async function setAppTheme(theme) {
  const v = theme === 'light' || String(theme).trim().toLowerCase() === 'light' ? 'light' : 'dark';
  try {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, v);
  } catch (_) {}
  DeviceEventEmitter.emit(THEME_CHANGED_EVENT, v);
  return v;
}
