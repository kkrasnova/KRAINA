import { clearSession } from './db';
import { useAuthStore } from './auth/authStore';
import { clearAllAppCaches } from './cacheCleanup';
import { resetAppThemeToDefault } from './themeStorage';

/** Повний вихід — знову заставка → вибір мови → банери / вхід (ThirdPage). */
export async function resetToLanguageSelect(navigation) {
  await clearAllAppCaches();
  await resetAppThemeToDefault();
  await useAuthStore.getState().clearLocalSession();
  await clearSession();
  navigation.reset({
    index: 0,
    routes: [{
      name: 'FirstPage',
      params: { nextRoute: 'SecondPage', nextRouteParams: { firstLaunchOnboarding: true } },
    }],
  });
}
