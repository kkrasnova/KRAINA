import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@kraina_landmark_quiz_answers_v1';

function normalizeKey(quizLandmarkKey) {
  return String(quizLandmarkKey || '').trim();
}

/**
 * @returns {Promise<null | {
 *   qIndex: number,
 *   answers: Array<{ selectedIndex: number, won: boolean, rewardXp: number }>,
 *   selectedIndex: number,
 *   revealed: boolean,
 *   won: boolean,
 *   rewardXp: number,
 *   rewardAlready: boolean,
 *   answerHint: string,
 *   finished: boolean,
 * }>}
 */
export async function loadLandmarkQuizAnswer(quizLandmarkKey) {
  const key = normalizeKey(quizLandmarkKey);
  if (!key) return null;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    if (!map || typeof map !== 'object' || Array.isArray(map)) return null;
    const entry = map[key];
    if (!entry || typeof entry !== 'object') return null;
    const selectedIndex = Number(entry.selectedIndex);
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0) return null;
    const answers = Array.isArray(entry.answers) ? entry.answers : [];
    return {
      qIndex: Number.isInteger(Number(entry.qIndex)) ? Math.max(0, Number(entry.qIndex)) : 0,
      answers,
      selectedIndex,
      revealed: entry.revealed === true,
      won: entry.won === true,
      rewardXp: Number.isFinite(Number(entry.rewardXp)) ? Math.max(0, Math.round(Number(entry.rewardXp))) : 0,
      rewardAlready: entry.rewardAlready === true,
      answerHint: typeof entry.answerHint === 'string' ? entry.answerHint : '',
      finished: entry.finished === true,
    };
  } catch {
    return null;
  }
}

export async function saveLandmarkQuizAnswer(quizLandmarkKey, payload) {
  const key = normalizeKey(quizLandmarkKey);
  if (!key || !payload || typeof payload !== 'object') return false;
  const selectedIndex = Number(payload.selectedIndex);
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0) return false;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const base = map && typeof map === 'object' && !Array.isArray(map) ? map : {};
    const next = {
      ...base,
      [key]: {
        qIndex: Number.isInteger(Number(payload.qIndex)) ? Math.max(0, Number(payload.qIndex)) : 0,
        answers: Array.isArray(payload.answers) ? payload.answers : [],
        selectedIndex,
        revealed: payload.revealed === true,
        won: payload.won === true,
        rewardXp: Number.isFinite(Number(payload.rewardXp)) ? Math.max(0, Math.round(Number(payload.rewardXp))) : 0,
        rewardAlready: payload.rewardAlready === true,
        answerHint: typeof payload.answerHint === 'string' ? payload.answerHint : '',
        finished: payload.finished === true,
        at: Date.now(),
      },
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
