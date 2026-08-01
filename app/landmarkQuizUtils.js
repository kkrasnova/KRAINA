import { normalizeLandmarkStory } from './landmarkStorySchema';

function optionHasText(o) {
  if (!o || typeof o !== 'object') return false;
  const a = String(o.textUk || '').trim();
  const b = String(o.textEn || '').trim();
  return a.length > 0 || b.length > 0;
}

function isPlayableQuestion(q) {
  if (!q || typeof q !== 'object') return false;
  const opts = Array.isArray(q.options) ? q.options : [];
  const playableCount = opts.length >= 4 ? 4 : 3;
  if (opts.length < 3) return false;
  const hasQ = String(q.questionUk || '').trim() || String(q.questionEn || '').trim();
  if (!hasQ) return false;
  return opts.slice(0, playableCount).every(optionHasText);
}

/**
 * Список питань вікторини: `quiz.questions[]` або legacy одиночне питання.
 * @returns {object[]}
 */
export function getQuizQuestions(quiz) {
  if (!quiz || typeof quiz !== 'object') return [];
  if (Array.isArray(quiz.questions) && quiz.questions.length > 0) {
    return quiz.questions.filter(isPlayableQuestion);
  }
  return isPlayableQuestion(quiz) ? [quiz] : [];
}

/** Чи можна показати вікторину гравцю (хоча б одне питання). */
export function hasPlayableStoryQuiz(quiz) {
  return getQuizQuestions(quiz).length > 0;
}

/** Нормалізований блок quiz з пам’ятки для передачі в навігацію. */
export function storyQuizForLandmarkRoute(lm) {
  const raw = lm?.story;
  if (!raw || typeof raw !== 'object') return undefined;
  const q = normalizeLandmarkStory(raw).quiz;
  const ensured = ensureThreeQuizQuestions(q, {
    titleUk: String(lm?.titleUk || lm?.title || '').trim(),
    titleEn: String(lm?.titleEn || lm?.title || '').trim(),
    textUk: collectStoryTextUk(raw),
    textEn: collectStoryTextEn(raw),
  });
  return hasPlayableStoryQuiz(ensured) ? ensured : undefined;
}

/**
 * Індекс правильної відповіді. Якщо не позначено — 0.
 */
export function resolveCorrectOptionIndex(quizOrQuestion) {
  const opts = Array.isArray(quizOrQuestion?.options) ? quizOrQuestion.options : [];
  const idx = opts.findIndex((o) => o && o.correct);
  if (idx >= 0) return idx;
  return 0;
}

export const LANDMARK_QUIZ_XP_WIN = 5;

/** XP за одне правильне питання. */
export function resolveLandmarkQuizXpPerCorrect(quiz) {
  const custom = Number(quiz?.xpPerCorrect ?? quiz?.xpReward);
  if (Number.isFinite(custom) && custom > 0) return Math.round(custom);
  return LANDMARK_QUIZ_XP_WIN;
}

/** @deprecated use resolveLandmarkQuizXpPerCorrect */
export function resolveLandmarkQuizXpWin(quiz) {
  return resolveLandmarkQuizXpPerCorrect(quiz);
}

function collectStoryTextUk(story) {
  if (!story || typeof story !== 'object') return '';
  const pages = Array.isArray(story.introPagesUk)
    ? story.introPagesUk.map((p) => String(p?.body || '')).join('\n')
    : '';
  return [
    story.introPage1Uk,
    pages,
    story.shortIntroUk,
    story.photoFact?.bodyUk,
    story.audioScriptUk,
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join('\n');
}

function collectStoryTextEn(story) {
  if (!story || typeof story !== 'object') return '';
  const pages = Array.isArray(story.introPagesEn)
    ? story.introPagesEn.map((p) => String(p?.body || '')).join('\n')
    : '';
  return [
    story.introPage1En,
    pages,
    story.shortIntroEn,
    story.photoFact?.bodyEn,
    story.audioScriptEn,
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join('\n');
}

function extractYears(text) {
  const years = [];
  const re = /\b(1[0-9]{3}|20[0-2][0-9])\b/g;
  let m;
  const src = String(text || '');
  while ((m = re.exec(src)) !== null) {
    const y = m[1];
    if (!years.includes(y)) years.push(y);
    if (years.length >= 6) break;
  }
  return years;
}

function extractBoldNames(text, titleHints = []) {
  const names = [];
  const re = /\*\*([^*]{4,64})\*\*/g;
  let m;
  const src = String(text || '');
  const titleNorms = [titleHints]
    .flat()
    .map((t) =>
      String(t || '')
        .toLowerCase()
        .replace(/[«»"'“”]/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
  const looksLikePlaceOrTitle = (n) => {
    const t = n.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!t) return true;
    if (titleNorms.some((h) => h && (t === h || h.includes(t) || t.includes(h.slice(0, 18))))) {
      return true;
    }
    if (
      /\b(костел|собор|церква|храм|музей|палац|замок|площа|майдан|парк|міст|вежа|cathedral|church|museum|palace|castle|tower|bridge|square)\b/i.test(
        n,
      )
    ) {
      return true;
    }
    const words = n.split(/\s+/).filter(Boolean);
    if (words.length < 2) return true;
    return false;
  };
  while ((m = re.exec(src)) !== null) {
    const n = String(m[1] || '').replace(/\s+/g, ' ').trim();
    if (!n || looksLikePlaceOrTitle(n)) continue;
    if (!names.includes(n)) names.push(n);
    if (names.length >= 4) break;
  }
  return names;
}

function distractorYears(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return ['1886', '1917', '1964'];
  const pool = [y - 31, y + 47, y - 12, y + 19, y - 55, y + 8, y - 7, y + 23]
    .map((n) => String(n))
    .filter((n) => n !== String(y) && /^(1[0-9]{3}|20[0-2][0-9])$/.test(n));
  const uniq = [...new Set(pool)];
  while (uniq.length < 3) uniq.push(String(1700 + uniq.length * 37));
  return uniq.slice(0, 3);
}

function questionFingerprint(q) {
  return String(q?.questionUk || q?.questionEn || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function buildPadQuestions(ctx, needed, existing) {
  if (needed <= 0) return [];
  const titleUk = String(ctx?.titleUk || ctx?.title || 'Памʼятка').trim() || 'Памʼятка';
  const titleEn = String(ctx?.titleEn || ctx?.title || 'Landmark').trim() || 'Landmark';
  const textUk = String(ctx?.textUk || '');
  const textEn = String(ctx?.textEn || textUk);
  const blob = `${textUk}\n${textEn}`;
  const years = extractYears(blob);
  const names = extractBoldNames(blob, [titleUk, titleEn]);
  const used = new Set(existing.map(questionFingerprint).filter(Boolean));
  const out = [];

  const tryPush = (q) => {
    if (!q || !isPlayableQuestion(q)) return;
    const fp = questionFingerprint(q);
    if (fp && used.has(fp)) return;
    // Never ask "who is mentioned" with the landmark title as the answer
    const correct = (Array.isArray(q.options) ? q.options : []).find((o) => o?.correct);
    const correctText = String(correct?.textUk || correct?.textEn || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    const titleL = titleUk.toLowerCase();
    if (
      correctText &&
      (correctText === titleL ||
        titleL.includes(correctText) ||
        correctText.includes(titleL.slice(0, 18)))
    ) {
      return;
    }
    if (fp) used.add(fp);
    out.push(q);
  };

  if (years[0]) {
    const year = years[0];
    const wrong = distractorYears(year);
    tryPush({
      questionUk: `Який рік справді повʼязаний з історією «${titleUk}»?`,
      questionEn: `Which year is truly tied to the story of "${titleEn}"?`,
      options: [
        { textUk: year, textEn: year, correct: true },
        { textUk: wrong[0], textEn: wrong[0], correct: false },
        { textUk: wrong[1], textEn: wrong[1], correct: false },
        { textUk: wrong[2], textEn: wrong[2], correct: false },
      ],
      multiHintUk: `У тексті гіда є рік **${year}**.`,
      multiHintEn: `The guide text mentions **${year}**.`,
    });
  }

  if (names[0]) {
    const person = names[0];
    const decoysUk = ['Інший майстер епохи', 'Міський інженер', 'Невідомий меценат'];
    const decoysEn = ['Another master of the era', 'A city engineer', 'An unknown patron'];
    tryPush({
      questionUk: `Хто згадується в історії «${titleUk}»?`,
      questionEn: `Who is mentioned in the story of "${titleEn}"?`,
      options: [
        { textUk: person.slice(0, 42), textEn: person.slice(0, 42), correct: true },
        { textUk: decoysUk[0], textEn: decoysEn[0], correct: false },
        { textUk: decoysUk[1], textEn: decoysEn[1], correct: false },
        { textUk: decoysUk[2], textEn: decoysEn[2], correct: false },
      ],
      multiHintUk: `У гідові імʼя виділене: **${person}**.`,
      multiHintEn: `The guide highlights this name: **${person}**.`,
    });
  }

  if (years[1] && years[1] !== years[0]) {
    const year = years[1];
    const wrong = distractorYears(year);
    tryPush({
      questionUk: `Яка ще дата важлива для цієї локації?`,
      questionEn: `Which other date matters for this place?`,
      options: [
        { textUk: year, textEn: year, correct: true },
        { textUk: wrong[0], textEn: wrong[0], correct: false },
        { textUk: wrong[1], textEn: wrong[1], correct: false },
        { textUk: wrong[2], textEn: wrong[2], correct: false },
      ],
      multiHintUk: `Друга ключова дата в тексті — **${year}**.`,
      multiHintEn: `Another key date in the text is **${year}**.`,
    });
  }

  tryPush({
    questionUk: `Що найточніше описує «${titleUk}»?`,
    questionEn: `What best describes "${titleEn}"?`,
    options: [
      {
        textUk: 'Культурна/історична памʼятка',
        textEn: 'A cultural/historical landmark',
        correct: true,
      },
      { textUk: 'Спортивна арена', textEn: 'A sports arena', correct: false },
      { textUk: 'Бізнес-центр', textEn: 'A business center', correct: false },
      { textUk: 'Торговий порт', textEn: 'A trade port', correct: false },
    ],
    multiHintUk: `${titleUk} має історичну або культурну цінність.`,
    multiHintEn: `${titleEn} has historical or cultural value.`,
  });

  tryPush({
    questionUk: `Навіщо варто уважно читати гід про «${titleUk}»?`,
    questionEn: `Why is it worth reading the guide about "${titleEn}" carefully?`,
    options: [
      {
        textUk: 'Щоб помітити деталі на місці',
        textEn: 'To notice details on site',
        correct: true,
      },
      {
        textUk: 'Щоб пропустити історію',
        textEn: 'To skip the history',
        correct: false,
      },
      {
        textUk: 'Щоб знайти лише кафе',
        textEn: 'To find only cafés',
        correct: false,
      },
      {
        textUk: 'Щоб ігнорувати дати',
        textEn: 'To ignore the dates',
        correct: false,
      },
    ],
    multiHintUk: 'Гід підказує, на що дивитись очима — деталі, дати й імена.',
    multiHintEn: 'The guide tells you what to look for — details, dates, and names.',
  });

  return out.slice(0, needed);
}

/**
 * Гарантує рівно 3 playable питання (бали за кожне правильне).
 * Якщо в CMS/AI вже є 3+ — беремо перші 3; якщо менше — добираємо з тексту гіда.
 */
export function ensureThreeQuizQuestions(quiz, ctx = {}) {
  const existing = getQuizQuestions(quiz);
  const xpPerCorrect = resolveLandmarkQuizXpPerCorrect(quiz);
  if (existing.length >= 3) {
    const questions = existing.slice(0, 3);
    return {
      ...(quiz && typeof quiz === 'object' ? quiz : {}),
      ...questions[0],
      questions,
      xpPerCorrect,
    };
  }
  const pads = buildPadQuestions(ctx, 3 - existing.length, existing);
  const questions = [...existing, ...pads].slice(0, 3);
  if (!questions.length) return quiz;
  return {
    ...(quiz && typeof quiz === 'object' ? quiz : {}),
    ...questions[0],
    questions,
    xpPerCorrect,
  };
}
