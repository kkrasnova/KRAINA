/**
 * Єдине джерело правди для охоплення Європи (країни + мови).
 * status: 'live' — уже в застосунку; 'planned' — наступні хвилі.
 *
 * Країни й мови розв’язані: можна додати країну без нової мови UI і навпаки.
 * Не включаємо BY / RU (свідома відсутність у каталозі).
 */

/** @typedef {'live' | 'planned'} CoverageStatus */

/**
 * @typedef {{
 *   id: string,
 *   flag: string,
 *   nativeLabel: string,
 *   status: CoverageStatus,
 *   defaultLang?: string,
 *   capitalId?: string,
 *   wave: number,
 * }} EuropeCountry
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   flag: string,
 *   status: CoverageStatus,
 *   wave: number,
 * }} EuropeLanguage
 */

/** Wave 0 = вже було; 1 = FR + fr; 2… = наступні партії EU/Європи. */
export const EUROPE_COUNTRIES = /** @type {EuropeCountry[]} */ ([
  // —— live ——
  { id: 'UA', flag: '🇺🇦', nativeLabel: 'Україна', status: 'live', defaultLang: 'uk', capitalId: 'kyiv', wave: 0 },
  { id: 'FR', flag: '🇫🇷', nativeLabel: 'France', status: 'live', defaultLang: 'fr', capitalId: 'paris', wave: 1 },
  { id: 'DE', flag: '🇩🇪', nativeLabel: 'Deutschland', status: 'live', defaultLang: 'de', capitalId: 'berlin', wave: 0 },
  { id: 'PL', flag: '🇵🇱', nativeLabel: 'Polska', status: 'live', defaultLang: 'pl', capitalId: 'warsaw', wave: 0 },
  { id: 'NL', flag: '🇳🇱', nativeLabel: 'Nederland', status: 'live', defaultLang: 'nl', capitalId: 'amsterdam', wave: 0 },
  { id: 'ES', flag: '🇪🇸', nativeLabel: 'España', status: 'live', defaultLang: 'es', capitalId: 'madrid', wave: 0 },
  { id: 'LT', flag: '🇱🇹', nativeLabel: 'Lietuva', status: 'live', defaultLang: 'lt', capitalId: 'vilnius', wave: 0 },
  { id: 'LV', flag: '🇱🇻', nativeLabel: 'Latvija', status: 'live', defaultLang: 'lv', capitalId: 'riga', wave: 0 },
  { id: 'RO', flag: '🇷🇴', nativeLabel: 'România', status: 'live', defaultLang: 'ro', capitalId: 'bucharest', wave: 0 },
  { id: 'IT', flag: '🇮🇹', nativeLabel: 'Italia', status: 'live', defaultLang: 'it', capitalId: 'rome', wave: 0 },
  { id: 'AM', flag: '🇦🇲', nativeLabel: 'Հայաստան', status: 'live', defaultLang: 'hy', capitalId: 'yerevan', wave: 0 },

  // —— wave 2: Захід / Центр EU ——
  { id: 'PT', flag: '🇵🇹', nativeLabel: 'Portugal', status: 'live', defaultLang: 'pt', capitalId: 'lisbon', wave: 2 },
  { id: 'BE', flag: '🇧🇪', nativeLabel: 'België', status: 'live', defaultLang: 'nl', capitalId: 'brussels', wave: 2 },
  { id: 'AT', flag: '🇦🇹', nativeLabel: 'Österreich', status: 'live', defaultLang: 'de', capitalId: 'vienna', wave: 2 },
  { id: 'CH', flag: '🇨🇭', nativeLabel: 'Schweiz', status: 'live', defaultLang: 'de', capitalId: 'bern', wave: 2 },
  { id: 'CZ', flag: '🇨🇿', nativeLabel: 'Česko', status: 'live', defaultLang: 'cs', capitalId: 'prague', wave: 2 },
  { id: 'SK', flag: '🇸🇰', nativeLabel: 'Slovensko', status: 'live', defaultLang: 'sk', capitalId: 'bratislava', wave: 2 },
  { id: 'HU', flag: '🇭🇺', nativeLabel: 'Magyarország', status: 'live', defaultLang: 'hu', capitalId: 'budapest', wave: 2 },
  { id: 'IE', flag: '🇮🇪', nativeLabel: 'Éire', status: 'live', defaultLang: 'en', capitalId: 'dublin', wave: 2 },
  { id: 'GB', flag: '🇬🇧', nativeLabel: 'United Kingdom', status: 'live', defaultLang: 'en', capitalId: 'london', wave: 2 },

  // —— wave 3: Північ ——
  { id: 'SE', flag: '🇸🇪', nativeLabel: 'Sverige', status: 'live', defaultLang: 'sv', capitalId: 'stockholm', wave: 3 },
  { id: 'NO', flag: '🇳🇴', nativeLabel: 'Norge', status: 'live', defaultLang: 'no', capitalId: 'oslo', wave: 3 },
  { id: 'DK', flag: '🇩🇰', nativeLabel: 'Danmark', status: 'live', defaultLang: 'da', capitalId: 'copenhagen', wave: 3 },
  { id: 'FI', flag: '🇫🇮', nativeLabel: 'Suomi', status: 'live', defaultLang: 'fi', capitalId: 'helsinki', wave: 3 },
  { id: 'IS', flag: '🇮🇸', nativeLabel: 'Ísland', status: 'live', defaultLang: 'is', capitalId: 'reykjavik', wave: 3 },
  { id: 'EE', flag: '🇪🇪', nativeLabel: 'Eesti', status: 'live', defaultLang: 'et', capitalId: 'tallinn', wave: 3 },

  // —— wave 4: Південь / Балкани ——
  { id: 'GR', flag: '🇬🇷', nativeLabel: 'Ελλάδα', status: 'live', defaultLang: 'el', capitalId: 'athens', wave: 4 },
  { id: 'BG', flag: '🇧🇬', nativeLabel: 'България', status: 'live', defaultLang: 'bg', capitalId: 'sofia', wave: 4 },
  { id: 'HR', flag: '🇭🇷', nativeLabel: 'Hrvatska', status: 'live', defaultLang: 'hr', capitalId: 'zagreb', wave: 4 },
  { id: 'SI', flag: '🇸🇮', nativeLabel: 'Slovenija', status: 'live', defaultLang: 'sl', capitalId: 'ljubljana', wave: 4 },
  { id: 'RS', flag: '🇷🇸', nativeLabel: 'Србија', status: 'live', defaultLang: 'sr', capitalId: 'belgrade', wave: 4 },
  { id: 'BA', flag: '🇧🇦', nativeLabel: 'Bosna i Hercegovina', status: 'live', defaultLang: 'bs', capitalId: 'sarajevo', wave: 4 },
  { id: 'ME', flag: '🇲🇪', nativeLabel: 'Crna Gora', status: 'live', defaultLang: 'sr', capitalId: 'podgorica', wave: 4 },
  { id: 'MK', flag: '🇲🇰', nativeLabel: 'Северна Македонија', status: 'live', defaultLang: 'mk', capitalId: 'skopje', wave: 4 },
  { id: 'AL', flag: '🇦🇱', nativeLabel: 'Shqipëria', status: 'live', defaultLang: 'sq', capitalId: 'tirana', wave: 4 },
  { id: 'XK', flag: '🇽🇰', nativeLabel: 'Kosova', status: 'live', defaultLang: 'sq', capitalId: 'pristina', wave: 4 },

  // —— wave 5: Схід / малі держави ——
  { id: 'MD', flag: '🇲🇩', nativeLabel: 'Moldova', status: 'live', defaultLang: 'ro', capitalId: 'chisinau', wave: 5 },
  { id: 'LU', flag: '🇱🇺', nativeLabel: 'Lëtzebuerg', status: 'live', defaultLang: 'fr', capitalId: 'luxembourg', wave: 5 },
  { id: 'MT', flag: '🇲🇹', nativeLabel: 'Malta', status: 'live', defaultLang: 'mt', capitalId: 'valletta', wave: 5 },
  { id: 'CY', flag: '🇨🇾', nativeLabel: 'Κύπρος', status: 'live', defaultLang: 'el', capitalId: 'nicosia', wave: 5 },
  { id: 'MC', flag: '🇲🇨', nativeLabel: 'Monaco', status: 'live', defaultLang: 'fr', capitalId: 'monaco', wave: 5 },
  { id: 'AD', flag: '🇦🇩', nativeLabel: 'Andorra', status: 'live', defaultLang: 'ca', capitalId: 'andorra', wave: 5 },
  { id: 'LI', flag: '🇱🇮', nativeLabel: 'Liechtenstein', status: 'live', defaultLang: 'de', capitalId: 'vaduz', wave: 5 },
  { id: 'SM', flag: '🇸🇲', nativeLabel: 'San Marino', status: 'live', defaultLang: 'it', capitalId: 'san_marino', wave: 5 },
  { id: 'VA', flag: '🇻🇦', nativeLabel: 'Città del Vaticano', status: 'live', defaultLang: 'it', capitalId: 'vatican', wave: 5 },
]);

export const EUROPE_LANGUAGES = /** @type {EuropeLanguage[]} */ ([
  // —— live ——
  { id: 'en', label: 'English', flag: '🇬🇧', status: 'live', wave: 0 },
  { id: 'uk', label: 'Українська', flag: '🇺🇦', status: 'live', wave: 0 },
  { id: 'de', label: 'Deutsch', flag: '🇩🇪', status: 'live', wave: 0 },
  { id: 'pl', label: 'Polski', flag: '🇵🇱', status: 'live', wave: 0 },
  { id: 'nl', label: 'Nederlands', flag: '🇳🇱', status: 'live', wave: 0 },
  { id: 'es', label: 'Español', flag: '🇪🇸', status: 'live', wave: 0 },
  { id: 'lt', label: 'Lietuvių', flag: '🇱🇹', status: 'live', wave: 0 },
  { id: 'lv', label: 'Latviešu', flag: '🇱🇻', status: 'live', wave: 0 },
  { id: 'ro', label: 'Română', flag: '🇷🇴', status: 'live', wave: 0 },
  { id: 'it', label: 'Italiano', flag: '🇮🇹', status: 'live', wave: 0 },
  { id: 'hy', label: 'Հայերեն', flag: '🇦🇲', status: 'live', wave: 0 },
  { id: 'fr', label: 'Français', flag: '🇫🇷', status: 'live', wave: 1 },

  // —— wave 2 ——
  { id: 'pt', label: 'Português', flag: '🇵🇹', status: 'live', wave: 2 },
  { id: 'cs', label: 'Čeština', flag: '🇨🇿', status: 'live', wave: 2 },
  { id: 'sk', label: 'Slovenčina', flag: '🇸🇰', status: 'live', wave: 2 },
  { id: 'hu', label: 'Magyar', flag: '🇭🇺', status: 'live', wave: 2 },

  // —— wave 3 ——
  { id: 'sv', label: 'Svenska', flag: '🇸🇪', status: 'live', wave: 3 },
  { id: 'no', label: 'Norsk', flag: '🇳🇴', status: 'live', wave: 3 },
  { id: 'da', label: 'Dansk', flag: '🇩🇰', status: 'live', wave: 3 },
  { id: 'fi', label: 'Suomi', flag: '🇫🇮', status: 'live', wave: 3 },
  { id: 'is', label: 'Íslenska', flag: '🇮🇸', status: 'live', wave: 3 },
  { id: 'et', label: 'Eesti', flag: '🇪🇪', status: 'live', wave: 3 },

  // —— wave 4 ——
  { id: 'el', label: 'Ελληνικά', flag: '🇬🇷', status: 'live', wave: 4 },
  { id: 'bg', label: 'Български', flag: '🇧🇬', status: 'live', wave: 4 },
  { id: 'hr', label: 'Hrvatski', flag: '🇭🇷', status: 'live', wave: 4 },
  { id: 'sl', label: 'Slovenščina', flag: '🇸🇮', status: 'live', wave: 4 },
  { id: 'sr', label: 'Српски', flag: '🇷🇸', status: 'live', wave: 4 },
  { id: 'bs', label: 'Bosanski', flag: '🇧🇦', status: 'live', wave: 4 },
  { id: 'mk', label: 'Македонски', flag: '🇲🇰', status: 'live', wave: 4 },
  { id: 'sq', label: 'Shqip', flag: '🇦🇱', status: 'live', wave: 4 },

  // —— wave 5 ——
  { id: 'mt', label: 'Malti', flag: '🇲🇹', status: 'live', wave: 5 },
  { id: 'ga', label: 'Gaeilge', flag: '🇮🇪', status: 'live', wave: 5 },
  { id: 'ca', label: 'Català', flag: '🇦🇩', status: 'live', wave: 5 },
  { id: 'tr', label: 'Türkçe', flag: '🇹🇷', status: 'live', wave: 5 },
]);

export function liveEuropeCountries() {
  return EUROPE_COUNTRIES.filter((c) => c.status === 'live');
}

export function plannedEuropeCountries() {
  return EUROPE_COUNTRIES.filter((c) => c.status === 'planned');
}

export function liveEuropeLanguages() {
  return EUROPE_LANGUAGES.filter((l) => l.status === 'live');
}

export function plannedEuropeLanguages() {
  return EUROPE_LANGUAGES.filter((l) => l.status === 'planned');
}

export function europeCountryById(id) {
  return EUROPE_COUNTRIES.find((c) => c.id === id) || null;
}

export function europeCoverageSummary() {
  const countriesLive = liveEuropeCountries().length;
  const countriesPlanned = plannedEuropeCountries().length;
  const langsLive = liveEuropeLanguages().length;
  const langsPlanned = plannedEuropeLanguages().length;
  return {
    countriesLive,
    countriesPlanned,
    countriesTotal: EUROPE_COUNTRIES.length,
    langsLive,
    langsPlanned,
    langsTotal: EUROPE_LANGUAGES.length,
  };
}
