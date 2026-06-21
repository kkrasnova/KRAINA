import { normalizeLandmarkStory } from './landmarkStorySchema';

function optionHasText(o) {
  if (!o || typeof o !== 'object') return false;
  const a = String(o.textUk || '').trim();
  const b = String(o.textEn || '').trim();
  return a.length > 0 || b.length > 0;
}

/** Чи можна показати вікторину гравцю (питання + 3–4 непорожні відповіді). */
export function hasPlayableStoryQuiz(quiz) {
  if (!quiz || typeof quiz !== 'object') return false;
  const opts = Array.isArray(quiz.options) ? quiz.options : [];
  const playableCount = opts.length >= 4 ? 4 : 3;
  if (opts.length < 3) return false;
  const hasQ = String(quiz.questionUk || '').trim() || String(quiz.questionEn || '').trim();
  if (!hasQ) return false;
  return opts.slice(0, playableCount).every(optionHasText);
}

/** Нормалізований блок quiz з пам’ятки для передачі в навігацію. */
export function storyQuizForLandmarkRoute(lm) {
  const raw = lm?.story;
  if (!raw || typeof raw !== 'object') return undefined;
  const q = normalizeLandmarkStory(raw).quiz;
  return hasPlayableStoryQuiz(q) ? q : undefined;
}

/**
 * Індекс правильної відповіді (0…2). Якщо адмін не позначив жодну — за замовчуванням 0
 * (краще явно позначати в адмінці кнопкою «Правильна»).
 */
export function resolveCorrectOptionIndex(quiz) {
  const opts = Array.isArray(quiz?.options) ? quiz.options : [];
  const idx = opts.findIndex((o) => o && o.correct);
  if (idx >= 0) return idx;
  return 0;
}

export const LANDMARK_QUIZ_XP_WIN = 15;

/** XP за вірну відповідь: `quiz.xpReward` або стандартне значення. */
export function resolveLandmarkQuizXpWin(quiz) {
  const custom = Number(quiz?.xpReward);
  if (Number.isFinite(custom) && custom > 0) return Math.round(custom);
  return LANDMARK_QUIZ_XP_WIN;
}
