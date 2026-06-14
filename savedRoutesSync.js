import { patchProfileMe } from './auth/endpoints';
import { useAuthStore } from './auth/authStore';
import { getSavedRoutesRaw, replaceSavedRoutesRaw } from './profileStorage';
import { enqueueOutbox } from './offline/outboxStore';
import { registerOutboxHandler } from './offline/syncEngine';
import { getIsOnline } from './offline/networkStatus';

/**
 * Після GET /profile/me: якщо на сервері є збережені маршрути — записуємо локально;
 * якщо сервер порожній, а локально є дані — одноразово відправляємо на сервер.
 */
export async function hydrateSavedRoutesFromProfileMe(profile) {
  if (!profile || typeof profile !== 'object') return;
  const server = profile.saved_route_plans;
  if (Array.isArray(server) && server.length > 0) {
    await replaceSavedRoutesRaw(server);
    return;
  }
  const local = await getSavedRoutesRaw();
  if (Array.isArray(local) && local.length > 0) {
    await syncSavedRoutesToBackend();
  }
}

/** Відправити поточний локальний JSON збережених маршрутів у профіль (потрібен access token). */
export async function syncSavedRoutesToBackend() {
  const token = useAuthStore.getState().accessToken;
  if (!token) return;
  try {
    const raw = await getSavedRoutesRaw();
    const { profile } = await patchProfileMe(token, { saved_route_plans: raw });
    if (profile && Array.isArray(profile.saved_route_plans)) {
      await replaceSavedRoutesRaw(profile.saved_route_plans);
    }
  } catch (e) {
    const raw = await getSavedRoutesRaw().catch(() => []);
    if (!getIsOnline()) {
      await enqueueOutbox({
        type: 'profile.patchSavedRoutes',
        payload: { saved_route_plans: raw },
        dedupeKey: 'profile.patchSavedRoutes',
        authUserId: String(useAuthStore.getState().user?.id || ''),
      }).catch(() => {});
    }
    if (__DEV__) {
      const msg = e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e);
      console.warn('[savedRoutesSync]', msg);
    }
  }
}

registerOutboxHandler('profile.patchSavedRoutes', async (item, token) => {
  const body = {
    saved_route_plans: Array.isArray(item.payload?.saved_route_plans) ? item.payload.saved_route_plans : [],
  };
  const { profile } = await patchProfileMe(token, body);
  if (profile && Array.isArray(profile.saved_route_plans)) {
    await replaceSavedRoutesRaw(profile.saved_route_plans);
  }
});
