/** Екрани до входу в акаунт — завжди темна тема (брендинг онбордингу). */
export const PRE_LOGIN_ROUTE_NAMES = new Set([
  'FirstPage',
  'SecondPage',
  'OnboardingIntro',
  'ThirdPage',
  'BackendAuth',
]);

/**
 * Примусова темна тема лише на екранах до входу / онбордингу (брендинг).
 * Після входу — світла за замовчуванням (див. themeStorage).
 */
export function shouldForceDarkTheme({ routeName, routeParams } = {}) {
  if (routeName && PRE_LOGIN_ROUTE_NAMES.has(routeName)) return true;
  if (routeName === 'SelectCountry') return true;
  if (routeName === 'WalkReminderSetup' && routeParams?.fromOnboarding === true) return true;
  if (routeName === 'ChoosePlan' && routeParams?.fromOnboarding === true) return true;
  return false;
}

export function effectiveThemeForContext(storedTheme, context = {}) {
  if (shouldForceDarkTheme(context)) return 'dark';
  return storedTheme === 'dark' ? 'dark' : 'light';
}

export function navThemeContextFromRoute(route) {
  if (!route?.name) return {};
  return { routeName: route.name, routeParams: route.params || {} };
}
