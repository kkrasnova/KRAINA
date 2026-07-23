import AsyncStorage from '@react-native-async-storage/async-storage';
import { LANDMARK_QUIZ_XP_WIN } from './landmarkQuizUtils';

const SCORES_KEY = '@kraina_landmark_quiz_scores_v1';
const PENDING_KEY = '@kraina_landmark_quiz_pending_v1';
const WHEEL_SPENT_KEY = '@kraina_quiz_wheel_spent_v1';

async function readMap(storageKey) {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    const map = raw ? JSON.parse(raw) : {};
    if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
    return map;
  } catch {
    return {};
  }
}

async function writeMap(storageKey, map) {
  try {
    await AsyncStorage.setItem(storageKey, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

/**
 * +XP за правильну відповідь на конкретне питання (один раз на індекс).
 * Поки локація не «закрита», бали лежать у pending; після commit — у scores.
 * @returns {{ already: boolean, xp: number, pendingTotal: number }}
 */
export async function applyLandmarkQuizQuestionReward(landmarkQuizKey, questionIndex, xpOnWin = LANDMARK_QUIZ_XP_WIN) {
  const key = String(landmarkQuizKey || '').trim();
  const qi = Number(questionIndex);
  if (!key || !Number.isInteger(qi) || qi < 0 || !Number.isFinite(xpOnWin) || xpOnWin <= 0) {
    return { already: false, xp: 0, pendingTotal: 0 };
  }
  const xp = Math.round(xpOnWin);
  const scores = await readMap(SCORES_KEY);
  if (scores[key]?.claimed) {
    return { already: true, xp: 0, pendingTotal: Number(scores[key].xp) || 0 };
  }
  const pending = await readMap(PENDING_KEY);
  const entry = pending[key] && typeof pending[key] === 'object' ? pending[key] : { questions: {}, xp: 0 };
  const questions = entry.questions && typeof entry.questions === 'object' ? { ...entry.questions } : {};
  if (questions[qi]) {
    return { already: true, xp: 0, pendingTotal: Number(entry.xp) || 0 };
  }
  questions[qi] = xp;
  const pendingTotal = Object.values(questions).reduce((s, v) => s + (Number(v) || 0), 0);
  pending[key] = { questions, xp: pendingTotal, at: Date.now() };
  await writeMap(PENDING_KEY, pending);
  return { already: false, xp, pendingTotal };
}

/** Pending XP за локацію (ще не зараховано після повного проходження). */
export async function getLandmarkQuizPendingXp(landmarkQuizKey) {
  const key = String(landmarkQuizKey || '').trim();
  if (!key) return 0;
  const pending = await readMap(PENDING_KEY);
  const entry = pending[key];
  if (!entry) return 0;
  return Number.isFinite(Number(entry.xp)) ? Math.max(0, Math.round(Number(entry.xp))) : 0;
}

/** Сума pending-балів по всіх локаціях (ще не закомічених). */
export async function getLandmarkQuizPendingXpTotal() {
  const pending = await readMap(PENDING_KEY);
  let sum = 0;
  for (const v of Object.values(pending)) {
    if (v && Number.isFinite(Number(v.xp))) sum += Math.max(0, Math.round(Number(v.xp)));
  }
  return sum;
}

/**
 * Зарахувати pending-бали в баланс після повного проходження локації.
 * @returns {{ already: boolean, xp: number }}
 */
export async function commitLandmarkQuizPendingReward(landmarkQuizKey) {
  const key = String(landmarkQuizKey || '').trim();
  if (!key) return { already: false, xp: 0 };
  const scores = await readMap(SCORES_KEY);
  if (scores[key]?.claimed) {
    return { already: true, xp: Number(scores[key].xp) || 0 };
  }
  const pending = await readMap(PENDING_KEY);
  const entry = pending[key];
  const xp = entry && Number.isFinite(Number(entry.xp)) ? Math.max(0, Math.round(Number(entry.xp))) : 0;
  if (xp <= 0) return { already: false, xp: 0 };
  scores[key] = { claimed: true, at: Date.now(), xp, fromPending: true };
  delete pending[key];
  await writeMap(SCORES_KEY, scores);
  await writeMap(PENDING_KEY, pending);
  return { already: false, xp };
}

/**
 * Legacy: одноразова нагорода (сума). Якщо вже claimed — already.
 * Для сумісності зі старим одиночним питанням.
 */
export async function applyLandmarkQuizReward(landmarkQuizKey, won, xpOnWin) {
  const key = String(landmarkQuizKey || '').trim();
  if (!key || !won || !Number.isFinite(xpOnWin) || xpOnWin <= 0) {
    return { already: false, xp: 0 };
  }
  const scores = await readMap(SCORES_KEY);
  if (scores[key]?.claimed) return { already: true, xp: 0 };
  const pending = await readMap(PENDING_KEY);
  const pendingXp = pending[key]?.xp ? Number(pending[key].xp) : 0;
  const xp = Math.max(Math.round(xpOnWin), pendingXp > 0 ? pendingXp : 0);
  scores[key] = { claimed: true, at: Date.now(), xp };
  if (pending[key]) {
    delete pending[key];
    await writeMap(PENDING_KEY, pending);
  }
  await writeMap(SCORES_KEY, scores);
  return { already: false, xp };
}

export async function getLandmarkQuizClaimedReward(landmarkQuizKey) {
  const key = String(landmarkQuizKey || '').trim();
  if (!key) return null;
  const map = await readMap(SCORES_KEY);
  const entry = map[key];
  if (!entry?.claimed) return null;
  return {
    claimed: true,
    xp: Number.isFinite(Number(entry.xp)) ? Math.max(0, Math.round(Number(entry.xp))) : 0,
  };
}

/** Сума XP з усіх пройдених вікторин (закомічених). */
export async function getLandmarkQuizBonusXpTotal() {
  const map = await readMap(SCORES_KEY);
  let sum = 0;
  for (const v of Object.values(map)) {
    if (v && v.claimed && Number.isFinite(Number(v.xp))) sum += Number(v.xp);
  }
  return sum;
}

/** Кількість локацій з завершеною вікториною. */
export async function getLandmarkQuizCompletedCount() {
  const map = await readMap(SCORES_KEY);
  let n = 0;
  for (const v of Object.values(map)) {
    if (v && v.claimed) n += 1;
  }
  return n;
}

/** Витрати на колесо (персистентні). */
export async function getQuizWheelSpentXp() {
  try {
    const raw = await AsyncStorage.getItem(WHEEL_SPENT_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  } catch {
    return 0;
  }
}

export async function addQuizWheelSpentXp(amount) {
  const add = Math.round(Number(amount) || 0);
  if (add <= 0) return 0;
  const prev = await getQuizWheelSpentXp();
  const next = prev + add;
  try {
    await AsyncStorage.setItem(WHEEL_SPENT_KEY, String(next));
  } catch {
    return prev;
  }
  return next;
}
