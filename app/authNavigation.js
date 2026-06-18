import { clearSession } from './db';
import { useAuthStore } from './auth/authStore';
import { clearAllAppCaches } from './cacheCleanup';

/** Повний вихід — знову заставка → вибір мови → банери / вхід (ThirdPage). */
export async function resetToLanguageSelect(navigation) {
  // Очищуємо всі кеші перед виходом
  await clearAllAppCaches();
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
