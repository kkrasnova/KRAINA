import { liveEuropeCountries, liveEuropeLanguages } from './europeRegistry';
import { COUNTRY_LABELS_BY_LANG } from './europeLangPacks';

/** Supported app language codes (must stay in sync with SecondPage, mainPageI18n, onboarding). */
export const APP_LANG_IDS = liveEuropeLanguages().map((l) => l.id);

/**
 * Рекомендована країна для мови UI (підказка після вибору мови).
 * Англійська (en) — окремої країни немає.
 */
export const COUNTRY_BY_APP_LANG = {
  uk: { id: 'UA', flag: '🇺🇦', label: 'Україна' },
  fr: { id: 'FR', flag: '🇫🇷', label: 'France' },
  de: { id: 'DE', flag: '🇩🇪', label: 'Deutschland' },
  pl: { id: 'PL', flag: '🇵🇱', label: 'Polska' },
  nl: { id: 'NL', flag: '🇳🇱', label: 'Nederland' },
  es: { id: 'ES', flag: '🇪🇸', label: 'España' },
  lt: { id: 'LT', flag: '🇱🇹', label: 'Lietuva' },
  lv: { id: 'LV', flag: '🇱🇻', label: 'Latvija' },
  ro: { id: 'RO', flag: '🇷🇴', label: 'România' },
  it: { id: 'IT', flag: '🇮🇹', label: 'Italia' },
  hy: { id: 'AM', flag: '🇦🇲', label: 'Հայաստան' },
  pt: { id: 'PT', flag: '🇵🇹', label: 'Portugal' },
  cs: { id: 'CZ', flag: '🇨🇿', label: 'Česko' },
  sk: { id: 'SK', flag: '🇸🇰', label: 'Slovensko' },
  hu: { id: 'HU', flag: '🇭🇺', label: 'Magyarország' },
  sv: { id: 'SE', flag: '🇸🇪', label: 'Sverige' },
  no: { id: 'NO', flag: '🇳🇴', label: 'Norge' },
  da: { id: 'DK', flag: '🇩🇰', label: 'Danmark' },
  fi: { id: 'FI', flag: '🇫🇮', label: 'Suomi' },
  is: { id: 'IS', flag: '🇮🇸', label: 'Ísland' },
  et: { id: 'EE', flag: '🇪🇪', label: 'Eesti' },
  el: { id: 'GR', flag: '🇬🇷', label: 'Ελλάδα' },
  bg: { id: 'BG', flag: '🇧🇬', label: 'България' },
  hr: { id: 'HR', flag: '🇭🇷', label: 'Hrvatska' },
  sl: { id: 'SI', flag: '🇸🇮', label: 'Slovenija' },
  sr: { id: 'RS', flag: '🇷🇸', label: 'Србија' },
  bs: { id: 'BA', flag: '🇧🇦', label: 'Bosna i Hercegovina' },
  mk: { id: 'MK', flag: '🇲🇰', label: 'Северна Македонија' },
  sq: { id: 'AL', flag: '🇦🇱', label: 'Shqipëria' },
  mt: { id: 'MT', flag: '🇲🇹', label: 'Malta' },
  ga: { id: 'IE', flag: '🇮🇪', label: 'Éire' },
  ca: { id: 'AD', flag: '🇦🇩', label: 'Andorra' },
  tr: { id: 'CY', flag: '🇨🇾', label: 'Κύπρος' },
};

/** Live країни для вибору / збереження (розв’язано від мов). */
export function selectableAppCountries() {
  return liveEuropeCountries().map((c) => ({
    id: c.id,
    flag: c.flag,
    label: c.nativeLabel,
  }));
}

/**
 * @deprecated Використовуйте selectableAppCountries — країни більше не 1:1 з мовами.
 */
export function countriesAlignedWithAppLanguages() {
  return selectableAppCountries();
}

/** Назви країн на плитках — з europeLangPacks (усі мови × усі країни). */
export const COUNTRY_DISPLAY_LABELS = COUNTRY_LABELS_BY_LANG;

function normCountryLabelKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Збіг повної назви країни (будь-якою мовою) → ISO2 для геокоду. */
export const COUNTRY_LABEL_LOWER_TO_ID = (() => {
  const m = Object.create(null);
  const add = (label, id) => {
    const k = normCountryLabelKey(label);
    if (k && m[k] == null) m[k] = id;
  };
  for (const c of selectableAppCountries()) {
    add(c.label, c.id);
  }
  for (const c of Object.values(COUNTRY_BY_APP_LANG)) {
    add(c.label, c.id);
  }
  for (const pack of Object.values(COUNTRY_DISPLAY_LABELS || {})) {
    for (const [id, label] of Object.entries(pack)) {
      add(label, id);
    }
  }
  return m;
})();

export function resolveSupportedCountryIdFromDisplayName(name) {
  const k = normCountryLabelKey(name);
  if (!k) return '';
  return COUNTRY_LABEL_LOWER_TO_ID[k] || '';
}

/** Список країн для екрана вибору з підписами обраною мовою інтерфейсу. */
export function countriesForSelectCountryScreen(uiLang) {
  const base = appLangBase(uiLang || 'en');
  const map = COUNTRY_DISPLAY_LABELS[base] || COUNTRY_DISPLAY_LABELS.en || {};
  return selectableAppCountries().map((c) => ({
    ...c,
    label: map[c.id] || c.label,
  }));
}

export function appLangBase(lang) {
  if (!lang || typeof lang !== 'string') return 'en';
  const b = lang.split(/[-_]/)[0].toLowerCase();
  if (b === 'ru') return 'uk';
  return APP_LANG_IDS.includes(b) ? b : 'en';
}
