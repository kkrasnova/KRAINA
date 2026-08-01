import { liveEuropeLanguages } from './europeRegistry';

/** Список мов інтерфейсу (узгоджено з SecondPage / APP_LANG_IDS / europeRegistry). */
export const APP_LANGUAGE_OPTIONS = liveEuropeLanguages().map((l) => ({
  id: l.id,
  label: l.label,
  flag: l.flag,
}));
