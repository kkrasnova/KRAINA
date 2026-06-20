import { useState, useEffect, useMemo } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { getAppTheme, THEME_CHANGED_EVENT } from './themeStorage';
import { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';

function normalizeTheme(v) {
  return v === 'light' ? 'light' : 'dark';
}

/**
 * Актуальна тема екрана: route.params (миттєво) → AsyncStorage → THEME_CHANGED_EVENT.
 */
export function useAppTheme(routeTheme) {
  const routeNorm =
    routeTheme === 'light' || routeTheme === 'dark' ? routeTheme : null;
  const [appTheme, setAppTheme] = useState(() => routeNorm ?? 'dark');

  useEffect(() => {
    if (routeNorm) setAppTheme(routeNorm);
  }, [routeNorm]);

  useEffect(() => {
    let cancelled = false;
    void getAppTheme().then((t) => {
      if (!cancelled) setAppTheme(normalizeTheme(t));
    });
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setAppTheme(normalizeTheme(v));
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return useMemo(
    () => ({
      appTheme,
      isLight: appTheme === 'light',
      screenBg: appTheme === 'light' ? LIGHT_BAR_BG : APP_SCREEN_BG,
    }),
    [appTheme],
  );
}
