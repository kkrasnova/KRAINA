import { useState, useEffect, useMemo } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { getAppTheme, getAppThemeSync, THEME_CHANGED_EVENT } from './themeStorage';
import { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { useAuthStore } from './auth/authStore';
import { effectiveThemeForContext, navThemeContextFromRoute } from './onboardingTheme';

function normalizeTheme(v) {
  return v === 'dark' ? 'dark' : 'light';
}

/**
 * Актуальна тема екрана: AsyncStorage / кеш → THEME_CHANGED_EVENT.
 * До входу в акаунт і на кроках першого онбордингу — завжди темна (див. onboardingTheme.js).
 * Після входу за замовчуванням світла; темну можна увімкнути в Налаштуваннях.
 *
 * @param {string|undefined} _routeTheme застарілий route.params.appTheme (ігнорується)
 * @param {{ name?: string, params?: object }|undefined} route поточний navigation route
 */
export function useAppTheme(_routeTheme, route) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = useAuthStore((s) => s.user?.id);
  const [savedTheme, setSavedTheme] = useState(() => normalizeTheme(getAppThemeSync()));

  const themeContext = useMemo(
    () => navThemeContextFromRoute(route),
    [route?.name, route?.params?.fromOnboarding, accessToken, userId],
  );

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
