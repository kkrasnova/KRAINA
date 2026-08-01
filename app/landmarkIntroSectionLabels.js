/**
 * Slide theme labels that should never appear as on-screen story headings.
 * Keep in sync with backend SLIDE_LABELS_* (enrichment).
 */
export const INTRO_SLIDE_LABELS_UK = [
  'історичний контекст',
  'тоді і зараз',
  'люди та події',
  'культурне значення',
  'цікаві факти',
  'як виглядає сьогодні',
  'що побачити поруч',
  'легенди та історії',
  'символи місця',
  'практичні деталі',
  'атмосфера візиту',
  'на прощання',
  'деталі',
];

export const INTRO_SLIDE_LABELS_EN = [
  'historic context',
  'historic context / location',
  'then and now',
  'before / after comparison',
  'people and events',
  'architectural details',
  'interior views',
  'cultural significance',
  'interesting facts',
  'how it looks today',
  'what to see nearby',
  'nearby attractions',
  'legends and stories',
  'symbols of the place',
  'practical details',
  'visit atmosphere',
  'historical timeline',
  'local traditions',
  'modern day relevance',
  'closing note',
  'details',
];

const LABEL_SET = new Set(
  [...INTRO_SLIDE_LABELS_UK, ...INTRO_SLIDE_LABELS_EN].map((s) => s.toLowerCase()),
);

function normLabel(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function looksLikeSectionLabel(text) {
  const n = normLabel(text);
  if (!n || n.length > 64) return false;
  return LABEL_SET.has(n);
}

/** Generic scaffold / failed-wiki filler — must not be shown as story text. */
export function isThinPlaceholderBody(body) {
  const raw = stripIntroSectionLead(body);
  if (!raw) return true;
  const compact = raw.replace(/\s+/g, ' ').trim();
  if (
    /це місце варто побачити на власні очі/i.test(compact) ||
    /this place is worth seeing in person/i.test(compact)
  ) {
    return true;
  }
  // Title — label + tiny remnant
  if (/^\*\*[^*]+\*\*\s*[—\-–]\s*.{0,80}$/u.test(compact) && compact.length < 160) {
    return true;
  }
  const paras = raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !looksLikeSectionLabel(p));
  const chars = paras.join(' ').length;
  // One solid sourced paragraph with a date is real story text — do NOT refill from the pool
  // (that caused St Nicholas slide 9 to replay 1954 after 2021).
  if (paras.length === 1 && chars >= 120 && /\b(1[0-9]{3}|20[0-2][0-9])\b/.test(paras[0])) {
    return false;
  }
  return paras.length < 2 && chars < 220;
}

/**
 * Strip a leading section label line from intro body text.
 */
export function stripIntroSectionLead(body) {
  let raw = String(body || '').trim();
  if (!raw) return '';
  const lines = raw.split(/\n/);
  if (lines.length >= 2 && looksLikeSectionLabel(lines[0])) {
    raw = lines.slice(1).join('\n').replace(/^\s+/, '');
  }
  const paras = raw.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paras.length >= 2 && looksLikeSectionLabel(paras[0])) {
    return paras.slice(1).join('\n\n').trim();
  }
  return raw;
}

export function paragraphKey(text) {
  return normLabel(text).slice(0, 96);
}

export function markParagraphKeys(usedKeys, text) {
  if (!usedKeys || typeof usedKeys.add !== 'function') return;
  String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((p) => {
      const k = paragraphKey(p);
      if (k) usedKeys.add(k);
    });
}

/** Keep only the first N paragraphs (page-1 quota so later slides still get facts). */
export function takeLeadingParagraphs(text, maxParas = 3) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, Math.max(1, maxParas))
    .join('\n\n')
    .trim();
}

export function expandFillParagraphs(desc) {
  const descParas = String(desc || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter(
      (p) =>
        !/це місце варто побачити на власні очі/i.test(p) &&
        !/this place is worth seeing in person/i.test(p) &&
        !/як дізнатися більше|увімкніть аудіогід/i.test(p) &&
        !/how to learn more|tap the audio guide|turn on the audio guide/i.test(p),
    );
  const expanded = [];
  descParas.forEach((p) => {
    if (p.length > 220) {
      const sentences = p.match(/[^.!?…]+[.!?…]+(?:\s+|$)|[^.!?…]+$/g) || [p];
      const cleaned = sentences.map((s) => s.trim()).filter((s) => s.length > 35);
      if (cleaned.length >= 2) {
        // Build ~2-sentence paragraphs so each slide feels substantial
        let buf = '';
        cleaned.forEach((s, idx) => {
          buf = buf ? `${buf} ${s}` : s;
          const isLast = idx === cleaned.length - 1;
          if (buf.length >= 140 || isLast) {
            if (buf.length > 40) expanded.push(buf);
            buf = '';
          }
        });
        return;
      }
    }
    expanded.push(p);
  });
  return expanded;
}

function overlapsUsed(usedKeys, text) {
  if (!usedKeys || !usedKeys.size) return false;
  const n = paragraphKey(text);
  if (!n) return false;
  if (usedKeys.has(n)) return true;
  for (const u of usedKeys) {
    if (!u || u.length < 36) continue;
    if (n.startsWith(u) || u.startsWith(n) || n.includes(u.slice(0, 48)) || u.includes(n.slice(0, 48))) {
      return true;
    }
  }
  return false;
}

/**
 * Drop paragraphs already used earlier in the guide; mark survivors in usedKeys.
 * If everything was duplicate, returns '' (caller may then enrich from pool).
 */
export function dedupeBodyAgainstUsed(body, usedKeys) {
  const raw = stripIntroSectionLead(body);
  if (!raw) return '';
  const kept = [];
  raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((p) => {
      if (looksLikeSectionLabel(p)) return;
      if (overlapsUsed(usedKeys, p)) return;
      kept.push(p);
      const k = paragraphKey(p);
      if (k && usedKeys) usedKeys.add(k);
    });
  return kept.join('\n\n').trim();
}

/**
 * Ensure each story page has ~2–3 unique factual paragraphs.
 * Shared `usedKeys` prevents repeats across the guide.
 */
export function enrichThinIntroPageBody(
  body,
  desc,
  {
    minChars = 420,
    maxParas = 3,
    minParas = 3,
    pageIndex = 0,
    extraPool = '',
    usedKeys = null,
  } = {},
) {
  let raw = stripIntroSectionLead(body);
  const parts = raw
    ? raw
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .filter((p) => !overlapsUsed(usedKeys, p))
    : [];
  const has = (t) => {
    const n = normLabel(t);
    return parts.some((p) => {
      const pn = normLabel(p);
      return pn === n || (n.length > 40 && (pn.startsWith(n) || n.startsWith(pn)));
    });
  };

  parts.forEach((p) => {
    const k = paragraphKey(p);
    if (k && usedKeys) usedKeys.add(k);
  });

  if (parts.length < minParas || parts.join(' ').length < minChars) {
    const expanded = expandFillParagraphs(`${desc || ''}\n\n${extraPool || ''}`);
    const start = expanded.length ? pageIndex % expanded.length : 0;
    const rotated = expanded.length
      ? [...expanded.slice(start), ...expanded.slice(0, start)]
      : [];
    rotated.forEach((p) => {
      if (parts.length >= maxParas) return;
      if (looksLikeSectionLabel(p)) return;
      if (has(p)) return;
      if (overlapsUsed(usedKeys, p)) return;
      parts.push(p);
      const k = paragraphKey(p);
      if (k && usedKeys) usedKeys.add(k);
    });
  }
  const out = parts.slice(0, maxParas).join('\n\n').trim();
  if (out) return out;
  // Do NOT fall back to the original body if it was already used — that reintroduces repeats
  return '';
}

/**
 * Evenly allocate unique sourced paragraphs across story pages (3 each).
 * Returns an array of bodies the same length as `pageCount`.
 */
export function allocateParagraphsAcrossPages(
  fillPool,
  pageCount,
  { parasPerPage = 3, skipLeading = 0 } = {},
) {
  const unique = [];
  const seen = new Set();
  expandFillParagraphs(fillPool).forEach((p) => {
    if (!p || looksLikeSectionLabel(p)) return;
    if (overlapsUsed(seen, p)) return;
    markParagraphKeys(seen, p);
    unique.push(p);
  });
  const rest = unique.slice(Math.max(0, skipLeading));
  const n = Math.max(0, pageCount | 0);
  return Array.from({ length: n }, (_, i) => {
    const start = i * parasPerPage;
    return rest.slice(start, start + parasPerPage).join('\n\n').trim();
  });
}
