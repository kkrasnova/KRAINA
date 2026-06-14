import { clearSession } from './db';
import { useAuthStore } from './auth/authStore';

/** Повний вихід і старт з екрана входу / реєстрації (без каруселі банерів). */
export async function resetToLanguageSelect(navigation) {
  await useAuthStore.getState().clearLocalSession();
  await clearSession();
  navigation.reset({
    index: 0,
    routes: [{ name: 'FirstPage', params: { nextRoute: 'BackendAuth' } }],
  });
}
