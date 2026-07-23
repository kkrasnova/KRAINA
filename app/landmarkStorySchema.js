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
    ttsEnabled: false,
  };
}

function clampUri(s) {
  const t = typeof s === 'string' ? s.trim() : '';
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return '';
}

function normalizeQuizOption(o) {
  const src = o && typeof o === 'object' ? o : {};
  return {
    textUk: typeof src.textUk === 'string' ? src.textUk : '',
    textEn: typeof src.textEn === 'string' ? src.textEn : '',
    correct: !!src.correct,
  };
}

function normalizeQuizQuestion(rawQ) {
  const opts = Array.isArray(rawQ?.options) ? rawQ.options : [];
  const optionCount = opts.length >= 4 ? 4 : Math.max(3, opts.length || 3);
  const options = Array.from({ length: optionCount }, (_, i) => normalizeQuizOption(opts[i]));
  return {
    questionUk: typeof rawQ?.questionUk === 'string' ? rawQ.questionUk : '',
    questionEn: typeof rawQ?.questionEn === 'string' ? rawQ.questionEn : '',
    options,
    explanationUk: typeof rawQ?.explanationUk === 'string' ? rawQ.explanationUk : '',
    explanationEn: typeof rawQ?.explanationEn === 'string' ? rawQ.explanationEn : '',
    multiHintUk: typeof rawQ?.multiHintUk === 'string' ? rawQ.multiHintUk : '',
    multiHintEn: typeof rawQ?.multiHintEn === 'string' ? rawQ.multiHintEn : '',
  };
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
  return {
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
    ttsEnabled: !!raw.ttsEnabled,
  };
}
