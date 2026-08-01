import { resolveOfflineUriSync } from './offline/localCacheStore';
import { isLikelyRealPersonName, isPlaceOrNonPersonPhrase } from './landmarkPersonNameGate';

const UA = { 'User-Agent': 'KRAINA-App/1.0 (landmark person mentions)', Accept: 'application/json' };

function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zа-яіїєґ0-9]+/gi, ' ')
    .trim();
}

/**
 * @typedef {{ nameUk?: string, nameEn?: string, photoUri?: string, wikiUrl?: string, blurbUk?: string, blurbEn?: string }} PersonMention
 */

/** Find a stored mention matching displayed name (UK or EN). */
export function findPersonMention(mentions, displayName) {
  const list = Array.isArray(mentions) ? mentions : [];
  const key = normKey(displayName);
  if (!key || key.length < 3) return null;
  for (const m of list) {
    const kUk = normKey(m?.nameUk);
    const kEn = normKey(m?.nameEn);
    if (kUk && (kUk === key || key.includes(kUk) || kUk.includes(key))) return m;
    if (kEn && (kEn === key || key.includes(kEn) || kEn.includes(key))) return m;
  }
  return null;
}

/** Longest name strings from mentions (for in-text highlighting). */
export function personMentionNameForms(mentions) {
  const list = Array.isArray(mentions) ? mentions : [];
  const names = [];
  for (const m of list) {
    for (const n of [m?.nameUk, m?.nameEn]) {
      const t = String(n || '').trim();
      if (t.length >= 4) names.push(t);
    }
  }
  return [...new Set(names)].sort((a, b) => b.length - a.length);
}

export function personMentionCaption(mention, language = 'uk') {
  if (!mention || typeof mention !== 'object') return '';
  const langUk = String(language || 'uk').toLowerCase().startsWith('uk');
  const name = langUk
    ? String(mention.nameUk || mention.nameEn || '').trim()
    : String(mention.nameEn || mention.nameUk || '').trim();
  const blurb = langUk
    ? String(mention.blurbUk || mention.blurbEn || '').trim()
    : String(mention.blurbEn || mention.blurbUk || '').trim();
  return [name, blurb].filter(Boolean).join('\n');
}

export function personMentionPhotoSource(mention) {
  const uri =
    typeof mention?.photoUri === 'string' ? resolveOfflineUriSync(mention.photoUri.trim()) : '';
  if (uri && /^(https?:\/\/|file:\/\/)/i.test(uri)) return { uri };
  return null;
}

/** Soften Ukrainian/Russian case endings for Wikipedia search. */
export function personNameQueryVariants(name) {
  const n = String(name || '').trim();
  if (!n) return [];
  const out = [n];
  const softened = n
    .replace(/\b([А-ЯІЇЄҐA-Z][а-яіїєґa-z''-]{2,})ого\b/giu, '$1ий')
    .replace(/\b([А-ЯІЇЄҐA-Z][а-яіїєґa-z''-]{2,})ому\b/giu, '$1ий')
    .replace(/\b([А-ЯІЇЄҐA-Z][а-яіїєґa-z''-]{2,})ою\b/giu, '$1а')
    .replace(/\b([А-ЯІЇЄҐA-Z][а-яіїєґa-z''-]{2,})им\b/giu, '$1ий')
    .replace(/\b([А-ЯІЇЄҐA-Z][а-яіїєґa-z''-]{2,})(а|у|ю)\b/giu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (softened && softened !== n) out.push(softened);
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]
      .replace(/ого$/i, 'ий')
      .replace(/ому$/i, 'ий')
      .replace(/ою$/i, 'а')
      .replace(/им$/i, 'ий');
    const first = parts[0].replace(/(а|у|ю)$/i, '');
    if (first.length >= 3 && last.length >= 3) out.push(`${first} ${last}`);
  }
  return [...new Set(out)];
}

async function wikiSummaryForName(name, lang) {
  const origin = `https://${lang}.wikipedia.org`;
  for (const q of personNameQueryVariants(name)) {
    try {
      const searchUrl = `${origin}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        q,
      )}&srlimit=6&format=json`;
      const sRes = await fetch(searchUrl, { headers: UA });
      if (!sRes.ok) continue;
      const sJson = await sRes.json();
      const hits = Array.isArray(sJson?.query?.search) ? sJson.query.search : [];
      const qKey = normKey(q);
      let title = '';
      for (const h of hits) {
        const t = String(h?.title || '');
        const tk = normKey(t);
        if (!t) continue;
        if (/значення|disambiguation|список|list of|категорія|category/i.test(t)) continue;
        if (tk === qKey || tk.includes(qKey) || qKey.includes(tk) || tk.split(' ')[0] === qKey.split(' ')[0]) {
          title = t;
          break;
        }
      }
      if (!title && hits[0]?.title) title = String(hits[0].title);
      if (!title) continue;

      const sumUrl = `${origin}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
      const sumRes = await fetch(sumUrl, { headers: UA });
      if (!sumRes.ok) continue;
      const sum = await sumRes.json();
      const photo = sum?.originalimage?.source || sum?.thumbnail?.source || '';
      const extract = String(sum?.extract || '').trim().slice(0, 280);
      const wikiUrl = String(
        sum?.content_urls?.desktop?.page ||
          `${origin}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      );
      const pageTitle = String(sum?.title || title).trim();
      const desc = String(sum?.description || extract || '').toLowerCase();
      const looksHuman =
        /person|politician|architect|artist|painter|writer|count|граф|графіфиня|архітектор|художник|письменник|корол|prince|king|queen|bishop|engineer|scientist|composer|actor|actress|історик|поет|інженер|nobility|noble|philanthropist|меценат|засновник|founder|діяч|генерал|гетьман|граф |герба|народив|помер|польськ|українськ|російськ|син |доньк|дочка|офіцер|міністр|сенатор|посол|магнат|шляхт/i.test(
          desc,
        ) || /\b(1[5-9]\d{2}|20[0-2]\d)\b.*\b(1[5-9]\d{2}|20[0-2]\d)\b/.test(extract);
      if (!photo) continue;
      // Strict: must look like a human biography page — never street / building / place pages
      if (!looksHuman) continue;
      if (/street|avenue|square|church|cathedral|building|вулиця|площа|костел|церква|храм/i.test(pageTitle + ' ' + desc)) {
        continue;
      }
      return {
        title: pageTitle,
        photoUri: photo,
        wikiUrl,
        blurb: extract,
        looksHuman: true,
      };
    } catch {
      /* try next variant */
    }
  }
  return null;
}

/**
 * Live Wikipedia lookup when story has no preloaded personMentions.
 * Tries UK then EN (and PL for Central European nobility).
 */
export async function lookupPersonMentionLive(displayName, preferredLang = 'uk') {
  const name = String(displayName || '').trim();
  if (name.length < 4) return null;
  if (isPlaceOrNonPersonPhrase(name) || !isLikelyRealPersonName(name)) return null;
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;

  const order =
    preferredLang === 'uk'
      ? ['uk', 'en', 'pl']
      : preferredLang === 'pl'
        ? ['pl', 'en', 'uk']
        : ['en', 'uk', 'pl'];
  let hit = null;
  for (const lang of order) {
    hit = await wikiSummaryForName(name, lang);
    if (hit?.photoUri) break;
  }
  if (!hit?.photoUri) return null;
  return {
    nameUk: preferredLang === 'uk' ? name : hit.title,
    nameEn: preferredLang === 'en' ? name : hit.title,
    photoUri: hit.photoUri,
    wikiUrl: hit.wikiUrl,
    blurbUk: preferredLang === 'uk' ? hit.blurb : '',
    blurbEn: preferredLang === 'en' ? hit.blurb : hit.blurb,
  };
}
