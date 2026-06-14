/** Supported app language codes (must stay in sync with SecondPage, mainPageI18n, onboarding). */
export const APP_LANG_IDS = [
  'en',
  'uk',
  'de',
  'pl',
  'nl',
  'es',
  'lt',
  'lv',
  'ro',
  'it',
  'hy',
];

/**
 * Одна країна на кожну мову інтерфейсу, для якої показуємо плитку на екрані вибору країни.
 * Англійська (en) лише на SecondPage — окремої країни для en немає (ні US, ні GB).
 */
export const COUNTRY_BY_APP_LANG = {
  uk: { id: 'UA', flag: '🇺🇦', label: 'Україна' },
  de: { id: 'DE', flag: '🇩🇪', label: 'Deutschland' },
  pl: { id: 'PL', flag: '🇵🇱', label: 'Polska' },
  nl: { id: 'NL', flag: '🇳🇱', label: 'Nederland' },
  es: { id: 'ES', flag: '🇪🇸', label: 'España' },
  lt: { id: 'LT', flag: '🇱🇹', label: 'Lietuva' },
  lv: { id: 'LV', flag: '🇱🇻', label: 'Latvija' },
  ro: { id: 'RO', flag: '🇷🇴', label: 'România' },
  it: { id: 'IT', flag: '🇮🇹', label: 'Italia' },
  hy: { id: 'AM', flag: '🇦🇲', label: 'Հայաստան' },
};

export function countriesAlignedWithAppLanguages() {
  return APP_LANG_IDS.filter((lang) => lang !== 'en').map((lang) => {
    const c = COUNTRY_BY_APP_LANG[lang];
    if (!c) throw new Error(`[appLang] Missing COUNTRY_BY_APP_LANG for "${lang}"`);
    return c;
  });
}

/**
 * Назви країн на плитках вибору країни — відповідають мові інтерфейсу (не рідній назві країни).
 */
export const COUNTRY_DISPLAY_LABELS = {
  en: {
    UA: 'Ukraine',
    FR: 'France',
    DE: 'Germany',
    PL: 'Poland',
    NL: 'Netherlands',
    ES: 'Spain',
    LT: 'Lithuania',
    LV: 'Latvia',
    RO: 'Romania',
    IT: 'Italy',
    AM: 'Armenia',
  },
  uk: {
    UA: 'Україна',
    FR: 'Франція',
    DE: 'Німеччина',
    PL: 'Польща',
    NL: 'Нідерланди',
    ES: 'Іспанія',
    LT: 'Литва',
    LV: 'Латвія',
    RO: 'Румунія',
    IT: 'Італія',
    AM: 'Вірменія',
  },
  de: {
    UA: 'Ukraine',
    FR: 'Frankreich',
    DE: 'Deutschland',
    PL: 'Polen',
    NL: 'Niederlande',
    ES: 'Spanien',
    LT: 'Litauen',
    LV: 'Lettland',
    RO: 'Rumänien',
    IT: 'Italien',
    AM: 'Armenien',
  },
  pl: {
    UA: 'Ukraina',
    FR: 'Francja',
    DE: 'Niemcy',
    PL: 'Polska',
    NL: 'Holandia',
    ES: 'Hiszpania',
    LT: 'Litwa',
    LV: 'Łotwa',
    RO: 'Rumunia',
    IT: 'Włochy',
    AM: 'Armenia',
  },
  nl: {
    UA: 'Oekraïne',
    FR: 'Frankrijk',
    DE: 'Duitsland',
    PL: 'Polen',
    NL: 'Nederland',
    ES: 'Spanje',
    LT: 'Litouwen',
    LV: 'Letland',
    RO: 'Roemenië',
    IT: 'Italië',
    AM: 'Armenië',
  },
  es: {
    UA: 'Ucrania',
    FR: 'Francia',
    DE: 'Alemania',
    PL: 'Polonia',
    NL: 'Países Bajos',
    ES: 'España',
    LT: 'Lituania',
    LV: 'Letonia',
    RO: 'Rumania',
    IT: 'Italia',
    AM: 'Armenia',
  },
  lt: {
    UA: 'Ukraina',
    FR: 'Prancūzija',
    DE: 'Vokietija',
    PL: 'Lenkija',
    NL: 'Nyderlandai',
    ES: 'Ispanija',
    LT: 'Lietuva',
    LV: 'Latvija',
    RO: 'Rumunija',
    IT: 'Italija',
    AM: 'Armėnija',
  },
  lv: {
    UA: 'Ukraina',
    FR: 'Francija',
    DE: 'Vācija',
    PL: 'Polija',
    NL: 'Nīderlande',
    ES: 'Spānija',
    LT: 'Lietuva',
    LV: 'Latvija',
    RO: 'Rumānija',
    IT: 'Itālija',
    AM: 'Armēnija',
  },
  ro: {
    UA: 'Ucraina',
    FR: 'Franța',
    DE: 'Germania',
    PL: 'Polonia',
    NL: 'Țările de Jos',
    ES: 'Spania',
    LT: 'Lituania',
    LV: 'Letonia',
    RO: 'România',
    IT: 'Italia',
    AM: 'Armenia',
  },
  it: {
    UA: 'Ucraina',
    FR: 'Francia',
    DE: 'Germania',
    PL: 'Polonia',
    NL: 'Paesi Bassi',
    ES: 'Spagna',
    LT: 'Lituania',
    LV: 'Lettonia',
    RO: 'Romania',
    IT: 'Italia',
    AM: 'Armenia',
  },
  hy: {
    UA: 'Ուկրաինա',
    FR: 'Ֆրանսիա',
    DE: 'Գերմանիա',
    PL: 'Լեհաստան',
    NL: 'Նիդերլանդներ',
    ES: 'Իսպանիա',
    LT: 'Լիտվա',
    LV: 'Լատվիա',
    RO: 'Ռումինիա',
    IT: 'Իտալիա',
    AM: 'Հայաստան',
  },
};

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
  for (const lang of APP_LANG_IDS) {
    if (lang === 'en') continue;
    const c = COUNTRY_BY_APP_LANG[lang];
    if (c) add(c.label, c.id);
  }
  for (const pack of Object.values(COUNTRY_DISPLAY_LABELS)) {
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
  const map = COUNTRY_DISPLAY_LABELS[base] || COUNTRY_DISPLAY_LABELS.en;
  return countriesAlignedWithAppLanguages().map((c) => ({
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
