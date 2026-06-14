import { APP_LANG_IDS, appLangBase } from './appLang';

/** Resolve a per-language string from a row keyed by locale (uk/en/…). */
export function pickI18n(lang, row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return '';
  const b = appLangBase(lang);
  return row[b] ?? row.en ?? row.uk ?? '';
}

/**
 * Ensures every `APP_LANG_IDS` key exists on each string row (missing → en, then uk).
 * Mutates `bundle` in place.
 */
export function fillBundleMissingLangs(bundle) {
  if (!bundle || typeof bundle !== 'object') return bundle;
  for (const key of Object.keys(bundle)) {
    const row = bundle[key];
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const fb = row.en ?? row.uk ?? '';
    const next = { ...row };
    for (const id of APP_LANG_IDS) {
      if (next[id] === undefined || next[id] === null || next[id] === '') {
        next[id] = fb;
      }
    }
    bundle[key] = next;
  }
  return bundle;
}
