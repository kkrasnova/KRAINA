/** Спільна нормалізація та збіг рядка пошуку з країнами (SelectCountry, головна). */

export const COUNTRY_SEARCH_QUERY_MAX_LEN = 48;

export function normalizeForSearch(v) {
  return String(v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_'`".,;:!?()[\]{}\\/|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function translitCyrToLat(input) {
  const map = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    ґ: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    є: 'ye',
    ж: 'zh',
    з: 'z',
    и: 'i',
    і: 'i',
    ї: 'yi',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'kh',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'shch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
  };
  return String(input || '')
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('');
}

/**
 * Рос. «и» (U+0438) vs укр. «і» (U+0456) на різних клавіатурах — додаємо варіанти запиту,
 * щоб «исп» знаходило «Іспанія» тощо.
 */
function cyrillicKeyboardVariants(s) {
  const str = String(s || '');
  if (!str) return [];
  const ruI = str.replace(/\u0456/g, '\u0438');
  const ukI = str.replace(/\u0438/g, '\u0456');
  return ruI !== ukI ? [ruI, ukI] : [ruI];
}

function buildSearchForms(v) {
  const base = normalizeForSearch(v);
  if (!base) return [];
  const cyrToLat = normalizeForSearch(translitCyrToLat(base));
  const kb = cyrillicKeyboardVariants(base).map((x) => normalizeForSearch(x));
  return [...new Set([base, cyrToLat, ...kb].filter(Boolean))];
}

function fieldFormMatchesCountry(fieldForm, qf) {
  if (!qf || !fieldForm) return false;
  if (fieldForm === qf) return true;
  if (qf.length <= 2) return fieldForm.startsWith(qf);
  return fieldForm.includes(qf);
}

/** Збіг довільного набору рядків (місто, пам’ятка, опис) з тим самим токенізатором, що й для країн. */
export function multiFieldMatchesSearchQuery(fields, searchRaw) {
  const raw = normalizeForSearch(String(searchRaw || '').trim());
  if (!raw) return true;
  const tokens = raw
    .split(/\s+/)
    .map((t) => t.slice(0, COUNTRY_SEARCH_QUERY_MAX_LEN))
    .filter(Boolean);
  if (!tokens.length) return true;
  const fieldFormsArrays = fields
    .filter((f) => f != null && String(f).trim() !== '')
    .map((field) => buildSearchForms(String(field)));
  if (!fieldFormsArrays.length) return false;
  return tokens.every((token) => {
    const qForms = buildSearchForms(token);
    return qForms.some(
      (qf) =>
        qf &&
        fieldFormsArrays.some((forms) => forms.some((ff) => fieldFormMatchesCountry(ff, qf))),
    );
  });
}

const COUNTRY_SEARCH_ALIASES = {
  UA: [
    'ukraine',
    'ukraina',
    'ukrainian',
    'україна',
    'украина',
    'укр',
    'ua',
  ],
  DE: ['germany', 'deutschland', 'german', 'deutsch', 'allemand', 'niemcy', 'німеччина', 'фрг'],
  NL: ['netherlands', 'holland', 'dutch', 'nederland', 'niederlande', 'pays-bas', 'нидерланды', 'нідерланди'],
  PL: ['poland', 'polska', 'polish', 'polen', 'pologne', 'polonia', 'польща', 'польша'],
  ES: ['spain', 'espana', 'españa', 'spanish', 'spanien', 'hiszpania', 'испания', 'іспанія'],
  LT: ['lithuania', 'lietuva', 'lietuvos', 'litauen', 'литва', 'литовська'],
  LV: ['latvia', 'latvija', 'latvian', 'lettland', 'letonia', 'латвія', 'латвия'],
  RO: ['romania', 'rumania', 'roumanie', 'romanian', 'румыния', 'румунія', 'românia'],
  IT: ['italy', 'italia', 'italian', 'italiano', 'italien', 'wlochy', 'włochy', 'италия', 'італія'],
  AM: [
    'armenia',
    'armenian',
    'hayastan',
    'армения',
    'арменія',
    'вірменія',
    'հայաստան',
  ],
};

export function countryMatchesSearchQuery(country, searchRaw) {
  const raw = normalizeForSearch(String(searchRaw || '').trim());
  if (!raw) return true;
  const extras = COUNTRY_SEARCH_ALIASES[country.id] || [];
  const fields = [country.id, country.label, ...extras];
  return multiFieldMatchesSearchQuery(fields, searchRaw);
}
