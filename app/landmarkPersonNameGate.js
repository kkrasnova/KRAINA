/**
 * Shared filters so we only treat REAL people as tappable portrait targets —
 * not streets, places, or random multi-word phrases.
 */

const PLACE_OR_NON_PERSON_RE =
  /\b(вул(?:иця|иці|ицею|ицю)?|просп(?:ект|екті|екту)?|площа|площі|майдан|набережн\w*|перевулок|alley|street|st\.|ave\.|avenue|road|square|plaza|park|парк|сад|монастир|церкв\w*|костел|собор|храм|каплиц\w*|castle|palace|museum|музей|міст|bridge|район|область|країна|city|місто|город|київ|kyiv|києві|києва)\b/i;

const ROLE_HINT_RE =
  /\b(архітектор|architect|художник|artist|painter|письменник|writer|граф|графін\w*|prince|king|queen|корол\w*|єпископ|bishop|інженер|engineer|меценат|засновник|founder|композитор|composer|скульптор|sculptor|поет|poet|генерал|гетьман|міністр|сенатор|магнат|шляхт\w*|nobility|countess|count)\b/i;

export function isPlaceOrNonPersonPhrase(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (PLACE_OR_NON_PERSON_RE.test(t)) return true;
  // Adjective street forms like «Великій Васильківській» (no given name shape)
  if (/ій$/i.test(t.split(/\s+/).pop() || '') && t.split(/\s+/).length <= 3 && !ROLE_HINT_RE.test(t)) {
    const words = t.split(/\s+/);
    if (words.every((w) => /[іїєь]$/i.test(w) || /ській|цькій|ній$/i.test(w))) return true;
  }
  return false;
}

/** True for likely historical person full names (2–4 words, not places). */
export function isLikelyRealPersonName(text) {
  const t = String(text || '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length < 5 || t.length > 72) return false;
  if (isPlaceOrNonPersonPhrase(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  // Reject if any word is too short / looks like a particle only
  if (words.some((w) => w.length < 2)) return false;
  const caps = words.filter((w) => /^[A-ZА-ЯІЇЄҐ]/.test(w)).length;
  if (caps < 2) return false;
  // Need at least one word that looks like a surname/given name (not only adjectives)
  const hasNameyWord = words.some(
    (w) =>
      /^[A-ZА-ЯІЇЄҐ][a-zа-яіїєґ''-]{2,}$/u.test(w) &&
      !/ській|цькій|ській|ська|цька|ський|цький$/i.test(w),
  );
  return hasNameyWord;
}
