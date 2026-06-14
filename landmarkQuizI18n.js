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
    uk: 'Свайп вгору або вліво — назад до тексту. Вниз або вправо — показати відповідь (якщо вже обрано варіант).',
    en: 'Swipe up or left to go back. Swipe down or right to reveal the answer (after you pick an option).',
  },
  swipeHintPager: {
    uk: 'Свайпом вліво поверніться до тексту пам’ятки. Після вибору варіанта: вниз або вправо — показати відповідь.',
    en: 'Swipe left to return to the story. After picking an option: swipe down or right to reveal the answer.',
  },
  readPagerSwipeHint: {
    uk: 'Свайпніть уліво — вікторина за історією.',
    en: 'Swipe left for the quiz about this place.',
  },
  openQuiz: {
    uk: 'Вікторина',
    en: 'Quiz',
  },
  chooseOptionHint: {
    uk: 'Оберіть один варіант і натисніть кнопку нижче.',
    en: 'Choose one option and tap the button below.',
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
