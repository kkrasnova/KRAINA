import { useAuthStore } from './auth/authStore';
import { isBackendJwt } from './backendAuthApi';
import { getThemeUserChosenSync } from './themeStorage';

/** Екрани до входу в акаунт — завжди темна тема. */
export const PRE_LOGIN_ROUTE_NAMES = new Set([
  'FirstPage',
  'SecondPage',
  'OnboardingIntro',
  'ThirdPage',
  'BackendAuth',
]);

export function isAuthenticatedForTheme() {
  const { accessToken, user } = useAuthStore.getState();
  return isBackendJwt(accessToken) && !!user?.id;
}

/**
 * Примусова темна тема: до входу в систему та на кроках першого онбордингу після реєстрації.
 */
export function shouldForceDarkTheme({ routeName, routeParams } = {}) {
  if (routeName && PRE_LOGIN_ROUTE_NAMES.has(routeName)) return true;
  if (!isAuthenticatedForTheme()) return true;
  if (routeName === 'SelectCountry') return true;
  if (routeName === 'WalkReminderSetup' && routeParams?.fromOnboarding === true) return true;
  if (routeName === 'ChoosePlan' && routeParams?.fromOnboarding === true) return true;
  return false;
}

export function effectiveThemeForContext(storedTheme, context = {}) {
  if (shouldForceDarkTheme(context)) return 'dark';
  if (!getThemeUserChosenSync()) return 'dark';
  return storedTheme === 'light' ? 'light' : 'dark';
}

export function navThemeContextFromRoute(route) {
  if (!route?.name) return {};
  return { routeName: route.name, routeParams: route.params || {} };
}
