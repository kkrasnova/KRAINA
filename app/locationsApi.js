import { db, firebaseEnabled } from './firebaseConfig';
import { ttlMemo } from './ttlCache';

/**
 * @param {number} [limit]
 * @returns {Promise<{ rows: Array<Record<string, unknown>>; networkError: boolean }>}
 */
export async function fetchPublishedLocations(limit = 40) {
  if (!firebaseEnabled || !db) return { rows: [], networkError: true };
  const cap = Math.max(1, Number(limit) || 40);
  try {
    const rows = await ttlMemo(`locations:published:${cap}`, 300000, async () => {
      const { collection, getDocs, limit: qLimit, query, where } = require('firebase/firestore');
      const snap = await getDocs(query(collection(db, 'locations'), where('published', '==', true), qLimit(cap)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    });
    return { rows, networkError: false };
  } catch {
    return { rows: [], networkError: true };
  }
}

/**
 * Повнотекстовий пошук (фільтрація в пам'яті кешованого пулу).
 * @param {string} q
 * @param {number} [limit]
 * @returns {Promise<{ rows: Array<Record<string, unknown>>; networkError: boolean }>}
 */
export async function searchLocationsPublished(q, limit = 20) {
  if (!firebaseEnabled || !db) return { rows: [], networkError: true };
  const queryText = String(q || '').trim().toLowerCase();
  if (!queryText) return { rows: [], networkError: false };
  try {
    const allLocations = await ttlMemo('locations:all_published_400', 300000, async () => {
      const { collection, getDocs, limit: qLimit, query, where } = require('firebase/firestore');
      const snap = await getDocs(query(collection(db, 'locations'), where('published', '==', true), qLimit(400)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    });

    const rows = allLocations
      .filter((row) => `${row.name || ''} ${row.country || ''} ${row.city || ''}`.toLowerCase().includes(queryText))
      .slice(0, Math.max(1, Number(limit) || 20));

    return { rows, networkError: false };
  } catch {
    return { rows: [], networkError: true };
  }
}

