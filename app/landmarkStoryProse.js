/**
 * Heal story copy so mid-sentence breaks (e.g. "…за проектом С." / "Валовського…")
 * never show up as separate paragraphs.
 */

const INITIAL_END_RE = /(?:^|[\s(«"'])[A-ZА-ЯІЇЄҐЁA-Za-z]\.\s*$/u;
const LOWER_START_RE = /^[a-zа-яіїєґёäöüßàáâãåæçèéêëìíîïñòóôõøùúûüýÿ]/u;
const ABBREV_PROTECT_RE =
  /(?<![\p{L}\p{N}])(вул|просп|пл|смт|обл|рис|англ|пол|нім|фр|італ|укр|рос|ім|др|проф|гр|стр|ст)\./giu;

function protectAbbreviations(text) {
  return String(text || '')
    // Single-letter initials before a name: "С. Валовського" / "W. Horodecki"
    // (JS \b does not treat Cyrillic as word chars — use explicit lookbehind)
    .replace(
      /(?<![\p{L}\p{N}])([A-ZА-ЯІЇЄҐЁ])\.(?=\s*[\p{L}])/gu,
      '$1\uE000',
    )
    .replace(ABBREV_PROTECT_RE, (m) => m.replace(/\./g, '\uE000'));
}

function restoreAbbreviations(text) {
  return String(text || '').replace(/\uE000/g, '.');
}

/** Drop UI/meta prompts ("turn on audio guide") — never show as story facts. */
export function stripLandmarkMetaUiHints(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((p) => {
      if (/як дізнатися більше/i.test(p)) return false;
      if (/увімкніть аудіогід/i.test(p)) return false;
      if (/історія навколо вас/i.test(p) && /аудіогід/i.test(p)) return false;
      if (/how to learn more/i.test(p)) return false;
      if (/tap the audio guide/i.test(p)) return false;
      if (/turn on the audio guide/i.test(p)) return false;
      if (/history around you/i.test(p) && /audio guide/i.test(p)) return false;
      if (/👆|👉/.test(p) && /аудіогід|audio guide/i.test(p)) return false;
      if (/збереж(іть|и)|поділ(іться|итись)/i.test(p) && /джерел/i.test(p)) return false;
      if (/save or share/i.test(p)) return false;
      if (/open sources/i.test(p) && /verif/i.test(p)) return false;
      if (/порівняйте.{0,40}(фото|вигляд|слайдер)/i.test(p)) return false;
      if (/compare the (historic|photos|views)/i.test(p)) return false;
      if (/це місце варто побачити на власні очі/i.test(p)) return false;
      return true;
    })
    .join('\n\n')
    .trim();
}

/** Split into real sentences — does not break on "С." / "вул." etc. */
export function splitLandmarkSentences(text) {
  const blob = String(text || '').replace(/\s+/g, ' ').trim();
  if (!blob) return [];
  const protectedText = protectAbbreviations(blob);
  const raw = protectedText.match(/[^.!?…]+[.!?…]+(?:\s+|$)|[^.!?…]+$/g) || [protectedText];
  return raw
    .map((s) => restoreAbbreviations(s).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function endsIncomplete(para) {
  const t = String(para || '').trim();
  if (!t) return true;
  if (INITIAL_END_RE.test(t)) return true;
  if (/[,:;–—\-]$/u.test(t)) return true;
  // No terminal sentence punctuation
  if (!/[.!?…»"”']$/u.test(t)) return true;
  // Ends with a dangling single initial even with trailing quote quirks
  if (/(?:^|\s)[A-ZА-ЯІЇЄҐЁ]\.$/u.test(t)) return true;
  return false;
}

function startsContinuation(para) {
  const t = String(para || '').trim();
  if (!t) return false;
  if (LOWER_START_RE.test(t)) return true;
  // Orphan name fragment: "Валовського (або Воловського)."
  if (t.length <= 90 && /^[A-ZА-ЯІЇЄҐЁ][a-zа-яіїєґё'’-]/u.test(t)) {
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length <= 8) return true;
  }
  return false;
}

function shouldMergeParagraphs(prev, next) {
  if (!prev || !next) return false;
  if (endsIncomplete(prev)) return true;
  if (startsContinuation(next) && (INITIAL_END_RE.test(prev.trim()) || prev.trim().length > 40)) {
    return true;
  }
  // Next is a tiny fragment — almost always a bad break
  if (String(next).trim().length < 48 && !/[.!?…].*[.!?…]/u.test(next)) return true;
  return false;
}

/**
 * Merge broken mid-sentence paragraphs, then optionally regroup into
 * readable multi-sentence paragraphs (never single orphan lines).
 */
export function normalizeLandmarkStoryProse(text, { maxParas = 5 } = {}) {
  const raw = stripLandmarkMetaUiHints(
    String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
  if (!raw) return '';

  // First pass: heal blank-line breaks
  const rough = raw
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const merged = [];
  for (const p of rough) {
    if (!merged.length) {
      merged.push(p);
      continue;
    }
    const prev = merged[merged.length - 1];
    if (shouldMergeParagraphs(prev, p)) {
      const glue = INITIAL_END_RE.test(prev) || /[,:;–—\-]$/u.test(prev) ? ' ' : ' ';
      merged[merged.length - 1] = `${prev}${glue}${p}`.replace(/\s+/g, ' ').trim();
    } else {
      merged.push(p);
    }
  }

  // Second pass: catch leftovers still broken after first merge
  const healed = [];
  for (const p of merged) {
    if (!healed.length) {
      healed.push(p);
      continue;
    }
    const prev = healed[healed.length - 1];
    if (shouldMergeParagraphs(prev, p)) {
      healed[healed.length - 1] = `${prev} ${p}`.replace(/\s+/g, ' ').trim();
    } else {
      healed.push(p);
    }
  }

  // If everything collapsed to one blob and it's long, split on real sentences
  // into 2–4 balanced paragraphs (each with ≥2 sentences when possible).
  if (healed.length === 1 && healed[0].length > 420) {
    const sentences = splitLandmarkSentences(healed[0]);
    if (sentences.length >= 4) {
      const target = Math.min(maxParas, Math.max(2, Math.min(4, Math.floor(sentences.length / 2))));
      const per = Math.ceil(sentences.length / target);
      const groups = [];
      for (let i = 0; i < sentences.length; i += per) {
        groups.push(sentences.slice(i, i + per).join(' '));
      }
      return groups.slice(0, maxParas).join('\n\n');
    }
  }

  return healed.slice(0, maxParas).join('\n\n');
}
