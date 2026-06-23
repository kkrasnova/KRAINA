import { getProfileMe } from './auth/endpoints';
import { useAuthStore } from './auth/authStore';
import { applyBackendSubscriptionToLocal } from './subscriptionStorage';

/** Максимальний інтервал між перевірками платної підписки на сервері. */
export const SUBSCRIPTION_SYNC_TTL_MS = 1000;

let lastSubscriptionSyncAt = 0;
let subscriptionSyncInFlight = null;

export async function syncSubscriptionFromBackend(user) {
  const token = useAuthStore.getState().accessToken;
  if (!token) return { ok: false, reason: 'no_token' };
  try {
    const me = await getProfileMe(token);
    const r = await applyBackendSubscriptionToLocal(user, me.subscription);
    lastSubscriptionSyncAt = Date.now();
    return { ok: true, ...r };
  } catch (e) {
    if (__DEV__) console.warn('[billing] sync profile', e?.message);
    return { ok: false, reason: 'request_failed' };
  }
}

/** Фонова синхронізація підписки — не частіше ніж раз на `staleMs`. */
export async function syncSubscriptionFromBackendIfStale(user, staleMs = SUBSCRIPTION_SYNC_TTL_MS) {
  if (!user) return { ok: false, reason: 'no_user' };
  const elapsed = lastSubscriptionSyncAt > 0 ? Date.now() - lastSubscriptionSyncAt : Infinity;
  if (elapsed < staleMs) return { ok: true, skipped: true };

  if (subscriptionSyncInFlight) return subscriptionSyncInFlight;

  subscriptionSyncInFlight = syncSubscriptionFromBackend(user).finally(() => {
    subscriptionSyncInFlight = null;
  });
  return subscriptionSyncInFlight;
}
