/**
 * Офлайн-кеш побудованих маршрутів: читання / запис / оновлення / видалення JSON-файлів
 * у documentDirectory (expo-file-system).
 */
import * as FileSystem from 'expo-file-system';

const DIR = `${FileSystem.documentDirectory}kraina_route_cache/`;

function safeId(id) {
  return String(id || 'default').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

function pathFor(id) {
  return `${DIR}${safeId(id)}.json`;
}

export async function ensureRouteCacheDir() {
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
}

/** Запис (create/overwrite) кешу маршруту. */
export async function writeRoutePlanCache(cacheId, jsonSerializable) {
  await ensureRouteCacheDir();
  const p = pathFor(cacheId);
  await FileSystem.writeAsStringAsync(p, JSON.stringify(jsonSerializable));
  return p;
}

/** Читання кешу; null якщо файлу немає або JSON пошкоджений. */
export async function readRoutePlanCache(cacheId) {
  try {
    const p = pathFor(cacheId);
    const info = await FileSystem.getInfoAsync(p);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(p);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Видалення одного кешу. */
export async function deleteRoutePlanCache(cacheId) {
  try {
    const p = pathFor(cacheId);
    const info = await FileSystem.getInfoAsync(p);
    if (info.exists) await FileSystem.deleteAsync(p, { idempotent: true });
  } catch {
    /* */
  }
}

/** Список id кешів (імена файлів без .json). */
export async function listRoutePlanCacheIds() {
  await ensureRouteCacheDir();
  try {
    const names = await FileSystem.readDirectoryAsync(DIR);
    return names.filter((n) => n.endsWith('.json')).map((n) => n.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

/** Стабільний ключ для останнього маршруту з екрана побудови. */
export function buildRoutePlanCacheId(regionId, placeQuery, hoursText, budgetTier, transport = '') {
  const a = safeId(regionId);
  const b = safeId(placeQuery);
  const c = safeId(hoursText);
  const d = safeId(budgetTier);
  const e = safeId(transport);
  return `last_${a}_${b}_${c}_${d}_${e}`;
}
