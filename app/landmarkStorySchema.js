/**
 * Розширені поля однієї пам'ятки: слайди (вікторина, фото+факт, до/після, фінал).
 * Дані лежать у знімку AsyncStorage адміна й потрапляють у ROUTE_REGIONS[].landmarks[].story.
 *
 * Озвучка (TTS) — варіанти без бекенду: `expo-speech` (безкоштовно на пристрої,
 * голоси залежать від мови ОС; переклади — окремі тексти UK/EN тощо).
 * Хмара: Google Cloud TTS / Amazon Polly (~$4–16 за 1 млн символів) + збереження
 * згенерованих mp3 у CDN; для «читає при переході слайду» — плейлист URI по кроках
 * або один файл з мітками часу.
 */

const emptyOption = () => ({ textUk: '', textEn: '', correct: false });

export function emptyLandmarkStory() {
  return {
    builtAt: '',
    shortIntroUk: '',
    shortIntroEn: '',
    quiz: {
      questionUk: '',
      questionEn: '',
      options: [emptyOption(), emptyOption(), emptyOption(), emptyOption()],
      explanationUk: '',
      explanationEn: '',
      multiHintUk: '',
      multiHintEn: '',
      xpReward: 0,
    },
    photoFact: {
      bgUri: '',
      titleUk: '',
      titleEn: '',
      bodyUk: '',
      bodyEn: '',
    },
    beforeAfter: {
      oldUri: '',
      newUri: '',
    },
    secondFact: {
      titleUk: '',
      titleEn: '',
      bodyUk: '',
      bodyEn: '',
    },
    closingUk: '',
    closingEn: '',
    audioUri: '',
    audioScriptUk: '',
    audioScriptEn: '',
    miniPreviewUk: '',
    miniPreviewEn: '',
    introPagesUk: [],
    introPagesEn: [],
    introPage1Uk: '',
    introPage1En: '',
    introPage1PhotoUri: '',
    personMentions: [],
    wikipediaUrl: '',
    sourceUrls: [],
    ttsEnabled: false,
  };
}

function clampUri(s) {
  const t = typeof s === 'string' ? s.trim() : '';
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return '';
}

function normalizePersonMention(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const nameUk = typeof raw.nameUk === 'string' ? raw.nameUk.trim() : '';
  const nameEn = typeof raw.nameEn === 'string' ? raw.nameEn.trim() : '';
  const photoUri = clampUri(raw.photoUri);
  if ((!nameUk && !nameEn) || !photoUri) return null;
  return {
    nameUk,
    nameEn,
    photoUri,
    wikiUrl: clampUri(raw.wikiUrl),
    blurbUk: typeof raw.blurbUk === 'string' ? raw.blurbUk.trim() : '',
    blurbEn: typeof raw.blurbEn === 'string' ? raw.blurbEn.trim() : '',
  };
}

/** Maidan-style layout for story page 3 (introPages index 1). */
export const INTRO_PAGE3_COMPARE_LAYOUT = {
  introCompareRounded: true,
  compareHeroHeightRatio: 0.6,
  compareHeroHeightMax: 540,
  compareHeroTopInset: 22,
  heroStackGap: 22,
  compareBeforePosition: { left: '50%', top: '42%' },
  compareAfterPosition: { left: '50%', top: '42%' },
};

function pageHasComparePair(page) {
  if (!page || typeof page !== 'object') return false;
  if (page.compareBeforeThumb && page.compareAfterThumb) return true;
  if (typeof page.compareBeforeAsset === 'number' && typeof page.compareAfterAsset === 'number') {
    return true;
  }
  return !!(clampUri(page.compareBeforeUri) && clampUri(page.compareAfterUri));
}

/**
 * Ensure intro page index 1 is a vertical before/after (old bottom, new top) like Maidan.
 * Uses story.beforeAfter when page lacks compare media; syncs beforeAfter from the page when needed.
 */
export function ensureIntroPage3Compare(story) {
  if (!story || typeof story !== 'object') return story;
  let oldUri = clampUri(story.beforeAfter?.oldUri);
  let newUri = clampUri(story.beforeAfter?.newUri);

  const patchPages = (pages) => {
    if (!Array.isArray(pages) || pages.length < 2) return Array.isArray(pages) ? pages : [];
    const next = pages.map((p) => (p && typeof p === 'object' ? { ...p } : p));
    const page = next[1] && typeof next[1] === 'object' ? next[1] : { body: '' };

    if (pageHasComparePair(page)) {
      const before = clampUri(page.compareBeforeUri) || oldUri;
      const after = clampUri(page.compareAfterUri) || newUri;
      if (before && !oldUri) oldUri = before;
      if (after && !newUri) newUri = after;
      next[1] = {
        ...page,
        ...INTRO_PAGE3_COMPARE_LAYOUT,
      };
      delete next[1].photoUri;
      return next;
    }

    const pagePhoto = clampUri(page.photoUri);
    let before = oldUri;
    let after = newUri;
    if (!after && pagePhoto) after = pagePhoto;
    if (!before) {
      before =
        next
          .map((p) => clampUri(p?.photoUri || p?.secondaryPhotoUri))
          .find((u) => u && u !== after) || '';
    }
    if (!after) {
      after =
        next
          .map((p) => clampUri(p?.photoUri || p?.secondaryPhotoUri))
          .find((u) => u && u !== before) || '';
    }
    if (!before || !after || before === after) return next;

    oldUri = before;
    newUri = after;
    next[1] = {
      ...page,
      ...INTRO_PAGE3_COMPARE_LAYOUT,
      compareBeforeUri: before,
      compareAfterUri: after,
    };
    delete next[1].photoUri;
    delete next[1].heroThumb;
    delete next[1].secondaryHeroThumb;
    delete next[1].secondaryPhotoUri;
    return next;
  };

  return {
    ...story,
    introPagesUk: patchPages(story.introPagesUk),
    introPagesEn: patchPages(story.introPagesEn),
    beforeAfter: {
      oldUri: oldUri || '',
      newUri: newUri || '',
    },
  };
}

function normalizeQuizOption(o) {
  const src = o && typeof o === 'object' ? o : {};
  return {
    textUk: typeof src.textUk === 'string' ? src.textUk : '',
    textEn: typeof src.textEn === 'string' ? src.textEn : '',
    correct: !!src.correct,
  };
}

function quizOptionHasText(o) {
  return !!(String(o?.textUk || '').trim() || String(o?.textEn || '').trim());
}

function normalizeQuizQuestion(rawQ) {
  const opts = Array.isArray(rawQ?.options) ? rawQ.options : [];
  const filled = opts
    .map(normalizeQuizOption)
    .filter(quizOptionHasText)
    .filter((o) => !/^(варіант|вариант|option)\s*\d+$/i.test(String(o.textUk || o.textEn || '').trim()))
    .slice(0, 4);
  // Keep only real answers — never invent blank/placeholder slots.
  if (filled.length < 3) {
    return {
      questionUk: typeof rawQ?.questionUk === 'string' ? rawQ.questionUk : '',
      questionEn: typeof rawQ?.questionEn === 'string' ? rawQ.questionEn : '',
      options: filled,
      explanationUk: typeof rawQ?.explanationUk === 'string' ? rawQ.explanationUk : '',
      explanationEn: typeof rawQ?.explanationEn === 'string' ? rawQ.explanationEn : '',
      multiHintUk: typeof rawQ?.multiHintUk === 'string' ? rawQ.multiHintUk : '',
      multiHintEn: typeof rawQ?.multiHintEn === 'string' ? rawQ.multiHintEn : '',
    };
  }
  if (!filled.some((o) => o.correct)) filled[0].correct = true;
  else {
    let seen = false;
    for (const o of filled) {
      if (o.correct && seen) o.correct = false;
      else if (o.correct) seen = true;
    }
  }
  return {
    questionUk: typeof rawQ?.questionUk === 'string' ? rawQ.questionUk : '',
    questionEn: typeof rawQ?.questionEn === 'string' ? rawQ.questionEn : '',
    options: filled,
    explanationUk: typeof rawQ?.explanationUk === 'string' ? rawQ.explanationUk : '',
    explanationEn: typeof rawQ?.explanationEn === 'string' ? rawQ.explanationEn : '',
    multiHintUk: typeof rawQ?.multiHintUk === 'string' ? rawQ.multiHintUk : '',
    multiHintEn: typeof rawQ?.multiHintEn === 'string' ? rawQ.multiHintEn : '',
  };
}

function normalizeIntroPage(page) {
  const src = page && typeof page === 'object' ? page : {};
  const out = {
    body: typeof src.body === 'string' ? src.body : '',
  };
  ['photoUri', 'secondaryPhotoUri', 'compareBeforeUri', 'compareAfterUri', 'illustrationUri'].forEach((key) => {
    const uri = clampUri(src[key]);
    if (uri) out[key] = uri;
  });
  ['compareBeforeThumb', 'compareAfterThumb', 'heroThumb', 'secondaryHeroThumb'].forEach((key) => {
    if (typeof src[key] === 'string' && src[key].trim()) out[key] = src[key].trim();
  });
  [
    'heroHeightRatio',
    'heroHeightMax',
    'compareHeroHeightRatio',
    'compareHeroHeightMax',
    'compareHeroTopInset',
    'heroStackGap',
    'secondaryStackGap',
    'secondaryHeroHeightRatio',
    'secondaryHeroHeightMax',
  ].forEach((key) => {
    const n = Number(src[key]);
    if (Number.isFinite(n)) out[key] = n;
  });
  ['introHeroInsetRounded', 'introCompareRounded', 'introHeroBleedTop', 'introHeroAfterText', 'introFactCard'].forEach(
    (key) => {
      if (typeof src[key] === 'boolean') out[key] = src[key];
    },
  );
  ['heroPosition', 'secondaryHeroPosition', 'compareBeforePosition', 'compareAfterPosition'].forEach((key) => {
    if (src[key] && typeof src[key] === 'object') out[key] = src[key];
  });
  return out.body || out.photoUri || out.compareBeforeUri || out.compareAfterUri || out.compareBeforeThumb
    ? out
    : null;
}

export function normalizeLandmarkStory(raw) {
  const e = emptyLandmarkStory();
  if (!raw || typeof raw !== 'object') return e;
  const legacyQ = normalizeQuizQuestion(raw.quiz || {});
  const rawQuestions = Array.isArray(raw.quiz?.questions) ? raw.quiz.questions : [];
  const questions =
    rawQuestions.length > 0
      ? rawQuestions.map(normalizeQuizQuestion)
      : legacyQ.questionUk || legacyQ.questionEn
        ? [legacyQ]
        : [];
  const xpRewardRaw = Number(raw.quiz?.xpReward);
  const xpPerCorrectRaw = Number(raw.quiz?.xpPerCorrect);
  const base = {
    builtAt: typeof raw.builtAt === 'string' ? raw.builtAt : '',
    shortIntroUk: typeof raw.shortIntroUk === 'string' ? raw.shortIntroUk : '',
    shortIntroEn: typeof raw.shortIntroEn === 'string' ? raw.shortIntroEn : '',
    quiz: {
      ...legacyQ,
      questions,
      xpReward: Number.isFinite(xpRewardRaw) && xpRewardRaw > 0 ? Math.round(xpRewardRaw) : 0,
      xpPerCorrect:
        Number.isFinite(xpPerCorrectRaw) && xpPerCorrectRaw > 0 ? Math.round(xpPerCorrectRaw) : 5,
    },
    photoFact: {
      bgUri: clampUri(raw.photoFact?.bgUri),
      titleUk: typeof raw.photoFact?.titleUk === 'string' ? raw.photoFact.titleUk : '',
      titleEn: typeof raw.photoFact?.titleEn === 'string' ? raw.photoFact.titleEn : '',
      bodyUk: typeof raw.photoFact?.bodyUk === 'string' ? raw.photoFact.bodyUk : '',
      bodyEn: typeof raw.photoFact?.bodyEn === 'string' ? raw.photoFact.bodyEn : '',
    },
    beforeAfter: {
      oldUri: clampUri(raw.beforeAfter?.oldUri),
      newUri: clampUri(raw.beforeAfter?.newUri),
    },
    secondFact: {
      titleUk: typeof raw.secondFact?.titleUk === 'string' ? raw.secondFact.titleUk : '',
      titleEn: typeof raw.secondFact?.titleEn === 'string' ? raw.secondFact.titleEn : '',
      bodyUk: typeof raw.secondFact?.bodyUk === 'string' ? raw.secondFact.bodyUk : '',
      bodyEn: typeof raw.secondFact?.bodyEn === 'string' ? raw.secondFact.bodyEn : '',
    },
    closingUk: typeof raw.closingUk === 'string' ? raw.closingUk : '',
    closingEn: typeof raw.closingEn === 'string' ? raw.closingEn : '',
    audioUri: clampUri(raw.audioUri),
    audioScriptUk: typeof raw.audioScriptUk === 'string' ? raw.audioScriptUk : '',
    audioScriptEn: typeof raw.audioScriptEn === 'string' ? raw.audioScriptEn : '',
    miniPreviewUk: typeof raw.miniPreviewUk === 'string' ? raw.miniPreviewUk : '',
    miniPreviewEn: typeof raw.miniPreviewEn === 'string' ? raw.miniPreviewEn : '',
    introPagesUk: Array.isArray(raw.introPagesUk) ? raw.introPagesUk.map(normalizeIntroPage).filter(Boolean) : [],
    introPagesEn: Array.isArray(raw.introPagesEn) ? raw.introPagesEn.map(normalizeIntroPage).filter(Boolean) : [],
    introPage1Uk: typeof raw.introPage1Uk === 'string' ? raw.introPage1Uk : '',
    introPage1En: typeof raw.introPage1En === 'string' ? raw.introPage1En : '',
    introPage1PhotoUri: clampUri(raw.introPage1PhotoUri),
    personMentions: Array.isArray(raw.personMentions)
      ? raw.personMentions.map(normalizePersonMention).filter(Boolean)
      : [],
    wikipediaUrl: clampUri(raw.wikipediaUrl),
    sourceUrls: Array.isArray(raw.sourceUrls) ? raw.sourceUrls.map(clampUri).filter(Boolean) : [],
    ttsEnabled: !!raw.ttsEnabled,
  };
  return ensureIntroPage3Compare(base);
}
