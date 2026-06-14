import { appLangBase } from './appLang';

const T = {
  uk: {
    title: 'Потрібне оновлення',
    body:
      'Щоб користуватися KRAÏNA, встановіть останню версію з App Store або Google Play — там виправлення та нові функції.',
    currentLabel: 'Ваша версія',
    requiredLabel: 'Потрібна мінімум',
    ctaUpdate: 'Оновити в магазині',
    ctaRecheck: 'Я вже оновив(-ла) — перевірити',
    checking: 'Перевірка…',
    openStoreFail: 'Не вдалося відкрити магазин. Спробуйте вручну з App Store / Google Play.',
  },
  en: {
    title: 'Update required',
    body:
      'Please install the latest KRAÏNA from the App Store or Google Play to continue — fixes and new features are there.',
    currentLabel: 'Your version',
    requiredLabel: 'Minimum required',
    ctaUpdate: 'Update in store',
    ctaRecheck: 'I already updated — check again',
    checking: 'Checking…',
    openStoreFail: 'Could not open the store. Try App Store / Google Play manually.',
  },
};

export function getForceUpdateTexts(lang) {
  const base = appLangBase(lang || 'en');
  return { ...T.en, ...(T[base] || {}) };
}
