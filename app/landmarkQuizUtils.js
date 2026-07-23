import { normalizeLandmarkStory } from './landmarkStorySchema';

function optionHasText(o) {
  if (!o || typeof o !== 'object') return false;
  const a = String(o.textUk || '').trim();
  const b = String(o.textEn || '').trim();
  return a.length > 0 || b.length > 0;
}

function isPlayableQuestion(q) {
  if (!q || typeof q !== 'object') return false;
  const opts = Array.isArray(q.options) ? q.options : [];
  const playableCount = opts.length >= 4 ? 4 : 3;
  if (opts.length < 3) return false;
  const hasQ = String(q.questionUk || '').trim() || String(q.questionEn || '').trim();
  if (!hasQ) return false;
  return opts.slice(0, playableCount).every(optionHasText);
}

/**
 * Список питань вікторини: `quiz.questions[]` або legacy одиночне питання.
 * @returns {object[]}
 */
export function getQuizQuestions(quiz) {
  if (!quiz || typeof quiz !== 'object') return [];
  if (Array.isArray(quiz.questions) && quiz.questions.length > 0) {
    return quiz.questions.filter(isPlayableQuestion);
  }
  return isPlayableQuestion(quiz) ? [quiz] : [];
}

/** Чи можна показати вікторину гравцю (хоча б одне питання). */
export function hasPlayableStoryQuiz(quiz) {
  return getQuizQuestions(quiz).length > 0;
}

/** Нормалізований блок quiz з пам’ятки для передачі в навігацію. */
export function storyQuizForLandmarkRoute(lm) {
  const raw = lm?.story;
  if (!raw || typeof raw !== 'object') return undefined;
  const q = normalizeLandmarkStory(raw).quiz;
  return hasPlayableStoryQuiz(q) ? q : undefined;
}

/**
 * Індекс правильної відповіді. Якщо не позначено — 0.
 */
export function resolveCorrectOptionIndex(quizOrQuestion) {
  const opts = Array.isArray(quizOrQuestion?.options) ? quizOrQuestion.options : [];
  const idx = opts.findIndex((o) => o && o.correct);
  if (idx >= 0) return idx;
  return 0;
}

export const LANDMARK_QUIZ_XP_WIN = 5;

/** XP за одне правильне питання. */
export function resolveLandmarkQuizXpPerCorrect(quiz) {
  const custom = Number(quiz?.xpPerCorrect ?? quiz?.xpReward);
  if (Number.isFinite(custom) && custom > 0) return Math.round(custom);
  return LANDMARK_QUIZ_XP_WIN;
}

/** @deprecated use resolveLandmarkQuizXpPerCorrect */
export function resolveLandmarkQuizXpWin(quiz) {
  return resolveLandmarkQuizXpPerCorrect(quiz);
}
