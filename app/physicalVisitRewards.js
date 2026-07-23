import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@kraina_physical_visit_rewards_v1';
export const PHYSICAL_VISIT_XP = 5;

/**
 * Одноразова нагорода за фізичний візит до пам’ятки (≤50 м).
 * @returns {{ already: boolean, xp: number }}
 */
export async function applyPhysicalVisitReward(placeKey) {
  const key = String(placeKey || '').trim();
  if (!key) return { already: false, xp: 0 };
  let map = {};
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    map = raw ? JSON.parse(raw) : {};
    if (!map || typeof map !== 'object' || Array.isArray(map)) map = {};
  } catch {
    map = {};
  }
  if (map[key]?.claimed) return { already: true, xp: 0 };
  const next = { ...map, [key]: { claimed: true, at: Date.now(), xp: PHYSICAL_VISIT_XP } };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return { already: false, xp: 0 };
  }
  return { already: false, xp: PHYSICAL_VISIT_XP };
}

/** Сума XP з фізичних візитів (для профілю / рівня). */
export async function getPhysicalVisitBonusXpTotal() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    if (!map || typeof map !== 'object') return 0;
    let sum = 0;
    for (const v of Object.values(map)) {
      if (v && v.claimed && Number.isFinite(Number(v.xp))) sum += Number(v.xp);
    }
    return sum;
  } catch {
    return 0;
  }
}

/** Кількість унікальних фізичних візитів із нагородою. */
export async function getPhysicalVisitClaimedCount() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    if (!map || typeof map !== 'object') return 0;
    let n = 0;
    for (const v of Object.values(map)) {
      if (v && v.claimed) n += 1;
    }
    return n;
  } catch {
    return 0;
  }
}
