import { fillBundleMissingLangs, pickI18n } from './i18nBundle';

function pick(lang, table) {
  return pickI18n(lang, table);
}

const S = {
  guessTitle: {
    uk: 'Відгадай',
    en: 'Guess',
  },
  showAnswer: {
    uk: 'Показати відповідь',
    en: 'Show answer',
  },
  pickFirst: {
    uk: 'Спочатку оберіть один із варіантів.',
    en: 'Pick one of the options first.',
  },
  correct: {
    uk: 'Вірно!',
    en: 'Correct!',
  },
  wrong: {
    uk: 'Не вірно.',
    en: 'Not quite.',
  },
  pointsLine: {
    uk: '+{n} балів за вікторину',
    en: '+{n} quiz points',
  },
  pointsAlready: {
    uk: 'Нагороду за цю вікторину вже отримано раніше.',
    en: 'You already claimed this quiz reward.',
  },
  swipeHint: {
    uk: 'Свайп вгору або вліво — назад.',
    en: 'Swipe up or left to go back.',
  },
  swipeHintPager: {
    uk: 'Свайпом вліво — назад до тексту пам’ятки.',
    en: 'Swipe left to return to the story.',
  },
  readPagerSwipeHint: {
    uk: 'Свайпніть уліво — вікторина за історією.',
    en: 'Swipe left for the quiz about this place.',
  },
  openQuiz: {
    uk: 'Вікторина',
    en: 'Quiz',
  },
  quizHeroHint: {
    uk: 'Пройди вікторину та дізнайся цікаві факти про серце України',
    en: 'Take the quiz and discover curious facts about the heart of Ukraine',
  },
  questionWord: {
    uk: 'Питання',
    en: 'Question',
  },
  chooseOptionHint: {
    uk: 'Оберіть один варіант — відповідь одразу, повторити не можна.',
    en: 'Pick one option — your answer is final.',
  },
  resultCorrectTitle: {
    uk: 'Чудово! Правильна відповідь.',
    en: 'Great! That is correct.',
  },
  resultWrongTitle: {
    uk: 'Є неточність у відповіді.',
    en: 'Not quite the right answer.',
  },
  explainAnswer: {
    uk: 'Пояснення',
    en: 'Explanation',
  },
  tryAgain: {
    uk: 'Спробувати ще раз',
    en: 'Try again',
  },
  feedbackLike: {
    uk: 'Так, ти вгадав(ла)',
    en: 'Yes, you guessed it',
  },
  feedbackDislike: {
    uk: 'Ні, не вгадав(ла)',
    en: 'No, you did not guess it',
  },
  continueNext: {
    uk: 'Далі',
    en: 'Next',
  },
  continueNextQuestion: {
    uk: 'Наступне питання',
    en: 'Next question',
  },
  quizSessionPoints: {
    uk: 'Разом за цю локацію: +{n} балів',
    en: 'Total for this place: +{n} points',
  },
  quizQuestionPoints: {
    uk: '+{n} балів за правильну відповідь',
    en: '+{n} points for the correct answer',
  },
  quizMoneyHint: {
    uk: 'Після повного проходження локації бали стануть {money}',
    en: 'After you finish this place, points become {money}',
  },
  pointsBurst: {
    uk: '+{n} балів',
    en: '+{n} pts',
  },
};

fillBundleMissingLangs(S);

export function lq(lang, key, vars) {
  let s = pick(lang, S[key] || {});
  if (vars && typeof vars === 'object') {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}
