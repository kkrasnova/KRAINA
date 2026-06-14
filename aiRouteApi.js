import { apiHttp } from './apiHttp';
import { useAuthStore } from './auth/authStore';

/**
 * ШІ- або евристичний маршрут з бекенду (POST /api/ai/suggest-route).
 * @param {object} body
 * @returns {Promise<{ routePlan: object, usedAi: boolean, rationale?: string } | null>}
 */
export async function postSuggestAiRoute(body) {
  const token = useAuthStore.getState().accessToken;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  try {
    const { data } = await apiHttp.post('/api/ai/suggest-route', body, { headers, timeout: 60000 });
    if (!data?.routePlan?.stops?.length) return null;
    return {
      routePlan: data.routePlan,
      usedAi: !!data.usedAi,
      rationale: typeof data.rationale === 'string' ? data.rationale : undefined,
    };
  } catch (e) {
    if (__DEV__) console.warn('[aiRouteApi]', e?.response?.data || e?.message);
    return null;
  }
}
