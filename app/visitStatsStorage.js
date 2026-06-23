import AsyncStorage from '@react-native-async-storage/async-storage';
import { ttlGetItem, ttlSetItem } from './ttlCache';
import { inferLandmarkInterestTags } from './routePlannerCore';
import { PHYSICAL_VISIT_RADIUS_KM, isWithinPhysicalVisitRadiusKm } from './landmarkProximity';

const KEY_PREFIX = '@kraina_visit_log_v1';
const MAX = 3000;

function getKey() {
  try {
    const { useAuthStore } = require('./auth/authStore');
    const userId = useAuthStore.getState().user?.id;
    if (userId) return `${KEY_PREFIX}:${userId}`;
  } catch {}
  return KEY_PREFIX;
}


/**
 * Фізичний візит — лише в радіусі 50 м від пам’ятки (або сканер камери на місці).
 */
export const VISIT_MAX_DISTANCE_KM = PHYSICAL_VISIT_RADIUS_KM;

function migrateVisitPhysicalFlags(list) {
  const arr = Array.isArray(list) ? list : [];
  let changed = false;
  const out = arr.map((v) => {
    if (v && typeof v === 'object' && v.physicalVisit == null) {
      changed = true;
      return { ...v, physicalVisit: false };
    }
    return v;
  });
  return { out, changed };
}

/**
 * Чи записувати візит при відкритті LandmarkResult (не просто перегляд далеко від місця).
 * @param {{ params?: Record<string, unknown> }} route
 */
export function shouldRecordVisitFromLandmarkRoute(route) {
  const p = route && typeof route === 'object' ? route.params || {} : {};
  if (p.fromScanner === true) return true;
  const km = p.visitKm;
  if (isWithinPhysicalVisitRadiusKm(km)) return true;
  return false;
}

function randomId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Місто з підзаголовка виду «🇺🇦 Рим» / «🇫🇷 Paris». */
export function parseCityFromSubtitle(subtitle) {
  const t = String(subtitle || '').trim();
  if (!t) return '';
  return t.replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, '').trim() || '';
}

/** Категорія для кругової діаграми: monument | park | museum | other */
export function dominantVisitCategoryFromLandmark(lm) {
  if (!lm || typeof lm !== 'object') return 'other';
  const tags = inferLandmarkInterestTags(lm);
  if (tags.has('museum')) return 'museum';
  if (tags.has('park')) return 'park';
  if (tags.has('cafe')) return 'other';
  if (tags.has('landmark')) return 'monument';
  return 'other';
}

/** Категорія відвідування за назвою пам’ятки (після AR-скану). */
export function inferVisitCategoryFromTitle(title) {
  const s = String(title || '').toLowerCase();
  if (/(музей|museum|musée|museo|gallery|галерея|pinacoteca|exposition)/i.test(s)) return 'museum';
  if (/(парк|park|garden|сад|jardin|zoo|зоопарк|botan)/i.test(s)) return 'park';
  if (/(церкв|church|cathedral|собор|temple|mosque|монастир|basilica|kapelle)/i.test(s)) return 'monument';
  return 'other';
}

/**
 * @param {{ physicalOnly?: boolean }} [options] — лише підтверджені «фізичні» візити (для статистики та рівнів).
 */
export async function getVisitLog(options = {}) {
  const physicalOnly = options.physicalOnly === true;
  const key = getKey();
  const list = await ttlGetItem(`visit_log:${key}`, 30000, async () => {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      const { out, changed } = migrateVisitPhysicalFlags(arr);
      if (changed) {
        try {
          await AsyncStorage.setItem(key, JSON.stringify(out));
        } catch {
          /* ignore persist failure */
        }
      }
      return out;
    } catch {
      return [];
    }
  });
  if (physicalOnly) return list.filter((v) => v && v.physicalVisit === true);
  return list;
}

/**
 * @param {{ city: string, category: string, label?: string, km?: number | null, at?: string }} entry
 */
export async function recordLocationVisit(entry) {
  const city = String(entry.city || '').trim() || '—';
  const cat = ['monument', 'park', 'museum', 'other'].includes(entry.category) ? entry.category : 'other';
  const row = {
    id: randomId(),
    at: entry.at || new Date().toISOString(),
    city,
    category: cat,
    label: String(entry.label || '').slice(0, 200),
    km: entry.km != null && Number.isFinite(Number(entry.km)) ? Number(entry.km) : null,
    physicalVisit: true,
  };
  const prev = await getVisitLog();
  const next = [...prev, row].slice(-MAX);
  await AsyncStorage.setItem(getKey(), JSON.stringify(next));
  await ttlSetItem(`visit_log:${getKey()}`, next, 30000);
}

/** Вікно часу для фільтра графіків (крім лінійного «30 днів»). */
export function getPeriodWindow(periodKey) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let start;
  switch (periodKey) {
    case '3d':
      start = new Date(end);
      start.setDate(start.getDate() - 2);
      start.setHours(0, 0, 0, 0);
      break;
    case '7d':
      start = new Date(end);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    case '30d':
      start = new Date(end);
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      break;
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      break;
    case 'year':
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      break;
    case 'all':
    default:
      start = new Date(2020, 0, 1, 0, 0, 0, 0);
      break;
  }
  return { start, end };
}

export function filterVisitsByRange(visits, start, end) {
  const t0 = start.getTime();
  const t1 = end.getTime();
  return visits.filter((v) => {
    const t = new Date(v.at).getTime();
    return t >= t0 && t <= t1;
  });
}

/** Останні 30 календарних днів (включно сьогодні) — для лінійного графіка. */
export function buildLast30DaysSeries(visits) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  const filtered = filterVisitsByRange(visits, start, end);
  const byDay = {};
  for (const v of filtered) {
    const d = new Date(v.at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    byDay[key] = (byDay[key] || 0) + 1;
  }
  const labels = [];
  const data = [];
  for (let i = 0; i < 30; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    data.push(byDay[key] || 0);
    labels.push(i % 5 === 0 ? `${d.getDate()}.${d.getMonth() + 1}` : '');
  }
  return { labels, data };
}

export function aggregateCategoryPie(visits) {
  const acc = { monument: 0, park: 0, museum: 0, other: 0 };
  for (const v of visits) {
    const c = acc[v.category] != null ? v.category : 'other';
    acc[c] += 1;
  }
  return acc;
}

export function topCitiesBar(visits, limit = 5) {
  const ranked = topCitiesRanked(visits, limit);
  return {
    labels: ranked.map(({ city }) => (city.length > 10 ? `${city.slice(0, 9)}…` : city)),
    data: ranked.map(({ count }) => count),
  };
}

/** Повні назви міст і кількість візитів для рейтингу в профілі. */
export function topCitiesRanked(visits, limit = 5) {
  const m = {};
  for (const v of visits) {
    const c = String(v.city || '—').trim() || '—';
    m[c] = (m[c] || 0) + 1;
  }
  return Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([city, count]) => ({ city, count }));
}

export function sumKmInVisits(visits) {
  let s = 0;
  for (const v of visits) {
    if (v.km != null && Number.isFinite(Number(v.km))) s += Number(v.km);
  }
  return Math.round(s * 10) / 10;
}
