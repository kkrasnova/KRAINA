import { getProfileMe } from './auth/endpoints';
import { useAuthStore } from './auth/authStore';
import { applyBackendSubscriptionToLocal } from './subscriptionStorage';

export async function syncSubscriptionFromBackend(user) {
  const token = useAuthStore.getState().accessToken;
  if (!token) return { ok: false, reason: 'no_token' };
  try {
    const me = await getProfileMe(token);
    const r = await applyBackendSubscriptionToLocal(user, me.subscription);
    return { ok: true, ...r };
  } catch (e) {
    if (__DEV__) console.warn('[billing] sync profile', e?.message);
    return { ok: false, reason: 'request_failed' };
  }
}
