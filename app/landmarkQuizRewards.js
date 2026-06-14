import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@kraina_landmark_quiz_scores_v1';

/**
 * Одноразова нагорода за вірну відповідь на вікторину для ключа пам’ятки.
 * @returns {{ already: boolean, xp: number }}
 */
export async function applyLandmarkQuizReward(landmarkQuizKey, won, xpOnWin) {
  const key = String(landmarkQuizKey || '').trim();
  if (!key || !won || !Number.isFinite(xpOnWin) || xpOnWin <= 0) {
    return { already: false, xp: 0 };
  }
  let map = {};
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    map = raw ? JSON.parse(raw) : {};
    if (!map || typeof map !== 'object' || Array.isArray(map)) map = {};
  } catch {
    map = {};
  }
  if (map[key]?.claimed) return { already: true, xp: 0 };
  const next = { ...map, [key]: { claimed: true, at: Date.now(), xp: Math.round(xpOnWin) } };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return { already: false, xp: 0 };
  }
  return { already: false, xp: Math.round(xpOnWin) };
}

/** Сума XP з усіх пройдених вікторин (для майбутнього підключення до профілю). */
export async function getLandmarkQuizBonusXpTotal() {
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
