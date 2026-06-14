import { apiHttp } from './apiHttp';
import { auth } from './firebaseConfig';

/**
 * ШІ- або евристичний маршрут з бекенду (POST /api/ai/suggest-route).
 * @param {object} body
 * @returns {Promise<{ routePlan: object, usedAi: boolean, rationale?: string } | null>}
 */
export async function postSuggestAiRoute(body) {
  try {
    const token = await auth?.currentUser?.getIdToken().catch(() => null);
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const response = await apiHttp.post('/api/ai/suggest-route', {
      place: body.place,
      hours: body.hours,
      transport: body.transport,
      interests: body.interests,
      budgetTier: body.budgetTier,
      language: body.language,
      userOrigin: body.userOrigin,
    }, { headers });

    if (response?.data?.routePlan) {
      return {
        routePlan: response.data.routePlan,
        usedAi: !!response.data.usedAi,
        rationale: response.data.rationale || undefined,
      };
    }
    return null;
  } catch (e) {
    if (__DEV__) console.warn('[aiRouteApi] Live backend suggest failed, falling back to local finder.', e?.response?.data || e?.message);
    return null;
  }
}

