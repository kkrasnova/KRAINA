import { useState, useEffect, useMemo, useCallback } from 'react';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { appLangBase } from './appLang';
import { KRAINA_APP_LANGUAGE_CHANGED } from './appLanguageEvents';

const LANGUAGE_STORAGE_KEY = '@kraina_app_language';

async function readStoredLang() {
  try {
    const raw = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (!raw || typeof raw !== 'string') return null;
    const base = String(raw).split(/[-_]/)[0].toLowerCase();
    return base === 'ru' ? 'uk' : base;
  } catch {
    return null;
  }
}

/**
 * Поточна мова інтерфейсу: після зміни в Налаштуваннях оновлюється через AsyncStorage + подію
 * (route.params у вкладках HomeTabPager часто застарілі).
 *
 * @param {import('@react-navigation/native').RouteProp<Record<string, object | undefined>, string> | { params?: { language?: string } } | undefined} route
 * @param {string} [fallback] — якщо немає ні сховища, ні route (наприклад 'uk' | 'en')
 */
export function useSyncedAppLanguage(route, fallback = 'en') {
  const routeLang = route?.params?.language;
  const [storedLang, setStoredLang] = useState(null);

  const refresh = useCallback(async () => {
    const s = await readStoredLang();
    setStoredLang(s);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_APP_LANGUAGE_CHANGED, (code) => {
      if (code != null && typeof code === 'string') {
        setStoredLang(appLangBase(code));
      }
    });
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return useMemo(() => {
    const fromStorage = storedLang != null && storedLang !== '' ? appLangBase(storedLang) : null;
    if (fromStorage) return fromStorage;
    const pr =
      routeLang != null && String(routeLang).trim() !== '' ? appLangBase(String(routeLang).trim()) : null;
    if (pr) return pr;
    return appLangBase(fallback);
  }, [routeLang, storedLang, fallback]);
}

/** @deprecated Використовуйте `useSyncedAppLanguage` — тепер те саме. */
export const useAppLanguage = useSyncedAppLanguage;
