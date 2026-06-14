import { apiHttp } from './apiHttp';
import { useAuthStore } from './auth/authStore';

function authHeaders() {
  const token = useAuthStore.getState().accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * @param {number} [limit]
 * @returns {Promise<{ rows: Array<Record<string, unknown>>; networkError: boolean }>}
 */
export async function fetchPublishedLocations(limit = 40) {
  try {
    const { data } = await apiHttp.get('/api/locations', {
      params: { limit },
      headers: { ...authHeaders() },
    });
    const rows = Array.isArray(data?.locations) ? data.locations : [];
    return { rows, networkError: false };
  } catch {
    return { rows: [], networkError: true };
  }
}

/**
 * Повнотекстовий пошук (PostgreSQL FTS на бекенді).
 * @param {string} q
 * @param {number} [limit]
 * @returns {Promise<{ rows: Array<Record<string, unknown>>; networkError: boolean }>}
 */
export async function searchLocationsPublished(q, limit = 20) {
  try {
    const { data } = await apiHttp.get('/api/locations/search', {
      params: { q, limit },
      headers: { ...authHeaders() },
    });
    const rows = Array.isArray(data?.locations) ? data.locations : [];
    return { rows, networkError: false };
  } catch {
    return { rows: [], networkError: true };
  }
}
