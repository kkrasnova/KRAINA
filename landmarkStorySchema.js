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
      options: [emptyOption(), emptyOption(), emptyOption()],
      multiHintUk: '',
      multiHintEn: '',
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
    ttsEnabled: false,
  };
}

function clampUri(s) {
  const t = typeof s === 'string' ? s.trim() : '';
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return '';
}

export function normalizeLandmarkStory(raw) {
  const e = emptyLandmarkStory();
  if (!raw || typeof raw !== 'object') return e;
  const opts = Array.isArray(raw.quiz?.options) ? raw.quiz.options : [];
  const options = [0, 1, 2].map((i) => {
    const o = opts[i] && typeof opts[i] === 'object' ? opts[i] : {};
    return {
      textUk: typeof o.textUk === 'string' ? o.textUk : '',
      textEn: typeof o.textEn === 'string' ? o.textEn : '',
      correct: !!o.correct,
    };
  });
  return {
    builtAt: typeof raw.builtAt === 'string' ? raw.builtAt : '',
    shortIntroUk: typeof raw.shortIntroUk === 'string' ? raw.shortIntroUk : '',
    shortIntroEn: typeof raw.shortIntroEn === 'string' ? raw.shortIntroEn : '',
    quiz: {
      questionUk: typeof raw.quiz?.questionUk === 'string' ? raw.quiz.questionUk : '',
      questionEn: typeof raw.quiz?.questionEn === 'string' ? raw.quiz.questionEn : '',
      options,
      multiHintUk: typeof raw.quiz?.multiHintUk === 'string' ? raw.quiz.multiHintUk : '',
      multiHintEn: typeof raw.quiz?.multiHintEn === 'string' ? raw.quiz.multiHintEn : '',
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
    ttsEnabled: !!raw.ttsEnabled,
  };
}
