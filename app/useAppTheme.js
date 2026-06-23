import { useState, useEffect, useMemo } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { getAppTheme, getAppThemeSync, resolveAppTheme, THEME_CHANGED_EVENT } from './themeStorage';
import { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { useAuthStore } from './auth/authStore';
import { effectiveThemeForContext, navThemeContextFromRoute } from './onboardingTheme';

function normalizeTheme(v) {
  return v === 'light' ? 'light' : 'dark';
}

/**
 * Актуальна тема екрана: route.params → кеш → AsyncStorage → THEME_CHANGED_EVENT.
 * До входу в акаунт і на кроках першого онбордингу — завжди темна (див. onboardingTheme.js).
 *
 * @param {string|undefined} routeTheme route.params.appTheme
 * @param {{ name?: string, params?: object }|undefined} route поточний navigation route
 */
export function useAppTheme(routeTheme, route) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = useAuthStore((s) => s.user?.id);
  const [savedTheme, setSavedTheme] = useState(() => normalizeTheme(resolveAppTheme(routeTheme)));

  const themeContext = useMemo(
    () => navThemeContextFromRoute(route),
    [route?.name, route?.params?.fromOnboarding, accessToken, userId],
  );

  useEffect(() => {
    setSavedTheme(normalizeTheme(resolveAppTheme(routeTheme)));
  }, [routeTheme]);

  useEffect(() => {
    let cancelled = false;
    void getAppTheme().then((t) => {
      if (!cancelled) setSavedTheme(normalizeTheme(t));
    });
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, () => {
      if (!cancelled) setSavedTheme(normalizeTheme(getAppThemeSync()));
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const appTheme = useMemo(
    () => effectiveThemeForContext(savedTheme, themeContext),
    [savedTheme, themeContext],
  );

  return useMemo(
    () => ({
      appTheme,
      savedAppTheme: savedTheme,
      isLight: appTheme === 'light',
      screenBg: appTheme === 'light' ? LIGHT_BAR_BG : APP_SCREEN_BG,
    }),
    [appTheme, savedTheme],
  );
}
