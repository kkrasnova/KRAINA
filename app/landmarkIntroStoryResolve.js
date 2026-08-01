import { appLangBase } from './appLang';
import { pickI18n } from './i18nBundle';
import { MAIDAN_INTRO_I18N } from './landmarkIntroI18n/maidan';
import { SOPHIA_INTRO_I18N } from './landmarkIntroI18n/sophia';
import { LAVRA_INTRO_I18N } from './landmarkIntroI18n/lavra';
import { KHANENKO_INTRO_I18N } from './landmarkIntroI18n/khanenko';
import { introPagesFromStoryLegacy } from './landmarkIntroPagesLegacy';
import { splitIntroBodyAtHero } from './landmarkTextUtils';
import { stripIntroSectionLead } from './landmarkIntroSectionLabels';

const INTRO_I18N_BY_KEY = {
  'kyiv:maidan': MAIDAN_INTRO_I18N,
  'kyiv:sophia': SOPHIA_INTRO_I18N,
  'kyiv:lavra': LAVRA_INTRO_I18N,
  'kyiv:khanenko_museum': KHANENKO_INTRO_I18N,
};

export function getLandmarkIntroI18n(regionId, landmarkId) {
  const key = `${String(regionId || '').trim()}:${String(landmarkId || '').trim()}`;
  return INTRO_I18N_BY_KEY[key] || null;
}

function pickRow(lang, row) {
  return pickI18n(lang, row);
}

export function introPagesFromStory(story, languageOrLangUk, context = {}) {
  const legacyLangUk =
    typeof languageOrLangUk === 'boolean'
      ? languageOrLangUk
      : String(languageOrLangUk || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const language =
    typeof languageOrLangUk === 'string' || languageOrLangUk == null
      ? languageOrLangUk
      : legacyLangUk
        ? 'uk'
        : 'en';
  const lang = appLangBase(language);
  const { regionId, landmarkId } = context;
  const pack = getLandmarkIntroI18n(regionId, landmarkId);

  const ukPages = introPagesFromStoryLegacy(story, true);
  const enPages = introPagesFromStoryLegacy(story, false);
  const basePages = (Array.isArray(ukPages) && ukPages.length ? ukPages : enPages) || undefined;
  if (!basePages || basePages.length === 0) return undefined;

  if (pack) {
    const bodies = Array.isArray(pack.pageBodies) ? pack.pageBodies : [];
    const illustrationLink = pickRow(lang, pack.illustrationLink);
    const illustrationCaption = pickRow(lang, pack.illustrationCaption);

    return basePages.map((page, i) => {
      const rawBody = stripIntroSectionLead(pickRow(lang, bodies[i]));
      const { body, bodyAfterHero } = splitIntroBodyAtHero(rawBody);
      const next = { ...page, ...(body ? { body } : {}) };
      if (bodyAfterHero) {
        next.bodyAfterHero = stripIntroSectionLead(bodyAfterHero);
        next.introHeroAfterText = true;
      } else {
        delete next.bodyAfterHero;
      }
      if (i === 0) {
        if (illustrationLink) next.illustrationLink = illustrationLink;
        if (illustrationCaption) next.illustrationCaption = illustrationCaption;
      }
      return next;
    });
  }

  // AI import: full per-language page bodies
  const bodiesI18n = Array.isArray(story?.introPagesBodiesI18n) ? story.introPagesBodiesI18n : null;
  if (bodiesI18n && bodiesI18n.length) {
    return basePages.map((page, i) => {
      const rawBody = stripIntroSectionLead(
        pickRow(lang, bodiesI18n[i]) ||
          (lang === 'uk'
            ? String(page?.body || '').trim()
            : String(enPages?.[i]?.body || page?.body || '').trim()),
      );
      if (!rawBody && page?.compareOnly) return page;
      const { body, bodyAfterHero } = splitIntroBodyAtHero(rawBody);
      const next = { ...page, ...(body ? { body } : {}) };
      if (bodyAfterHero) {
        next.bodyAfterHero = stripIntroSectionLead(bodyAfterHero);
        next.introHeroAfterText = true;
      } else {
        delete next.bodyAfterHero;
      }
      return next;
    });
  }

  return (lang === 'uk' ? ukPages || basePages : enPages || basePages).map((page) => {
    if (!page || typeof page !== 'object') return page;
    const body = stripIntroSectionLead(page.body);
    const bodyAfterHero = stripIntroSectionLead(page.bodyAfterHero);
    return {
      ...page,
      ...(body ? { body } : {}),
      ...(bodyAfterHero ? { bodyAfterHero } : {}),
    };
  });
}

export function resolveIntroStoryField(story, field, language, context = {}) {
  const lang = appLangBase(language);
  const { regionId, landmarkId } = context;
  const pack = getLandmarkIntroI18n(regionId, landmarkId);
  if (pack?.[field]) return pickRow(lang, pack[field]);

  if (field === 'shortIntro') {
    if (story?.shortIntroI18n && typeof story.shortIntroI18n === 'object') {
      const t = pickRow(lang, story.shortIntroI18n);
      if (t) return t;
    }
    return lang === 'uk'
      ? String(story?.shortIntroUk || '').trim()
      : String(story?.shortIntroEn || story?.shortIntroUk || '').trim();
  }
  if (field === 'miniPreview') {
    if (story?.miniPreviewI18n && typeof story.miniPreviewI18n === 'object') {
      const t = pickRow(lang, story.miniPreviewI18n);
      if (t) return t;
    }
    return lang === 'uk'
      ? String(story?.miniPreviewUk || '').trim()
      : String(story?.miniPreviewEn || story?.miniPreviewUk || '').trim();
  }
  if (field === 'introPage1') {
    if (story?.introPage1I18n && typeof story.introPage1I18n === 'object') {
      const t = pickRow(lang, story.introPage1I18n);
      if (t) return t;
    }
    return lang === 'uk'
      ? String(story?.introPage1Uk || '').trim()
      : String(story?.introPage1En || story?.introPage1Uk || '').trim();
  }
  return '';
}

function normIntroBlob(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function pushUniqueParagraph(parts, text) {
  const t = String(text || '').trim();
  if (!t) return;
  const n = normIntroBlob(t);
  if (!n) return;
  if (parts.some((p) => {
    const pn = normIntroBlob(p);
    return pn === n || pn.startsWith(n) || n.startsWith(pn);
  })) {
    return;
  }
  parts.push(t);
}

/**
 * First story page should feel full — merge introPage1 + unique desc paragraphs
 * when the welcome text alone is too thin. Never dump audio / other pages here
 * (that caused the same facts to repeat across the guide).
 */
export function composeRichLandmarkIntroPage1({
  introPage1 = '',
  shortIntro = '',
  desc = '',
  title = '',
  usedKeys = null,
} = {}) {
  const parts = [];
  const titleN = normIntroBlob(title);

  const addBlock = (block) => {
    String(block || '')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .forEach((p) => {
        if (titleN && normIntroBlob(p) === titleN) return;
        const key = normIntroBlob(p).slice(0, 96);
        if (usedKeys && key && [...usedKeys].some((u) => {
          if (!u) return false;
          return u === key || (u.length > 36 && (key.startsWith(u) || u.startsWith(key)));
        })) {
          return;
        }
        pushUniqueParagraph(parts, p);
      });
  };

  addBlock(introPage1);
  // Cap page 1 so later slides still receive real facts from the same sources
  if (parts.length < 3 || parts.join(' ').length < 420) {
    addBlock(desc);
  }
  if (
    (parts.length < 3 || parts.join(' ').length < 520) &&
    String(shortIntro || '').trim().length > 120
  ) {
    addBlock(shortIntro);
  }

  const capped = parts.slice(0, 3);
  const out = capped.join('\n\n').trim();
  if (usedKeys && typeof usedKeys.add === 'function') {
    capped.forEach((p) => {
      const k = normIntroBlob(p).slice(0, 96);
      if (k) usedKeys.add(k);
    });
  }
  return out;
}

export function resolveIntroStoryQuiz(story, language, context = {}) {
  const { regionId, landmarkId } = context;
  const pack = getLandmarkIntroI18n(regionId, landmarkId);
  const base = story?.quiz;
  if (!base || typeof base !== 'object') return null;

  const attachQuestionI18n = (q, fallbackParent = false) => {
    if (!q || typeof q !== 'object') return q;
    const questionI18n =
      q.questionI18n && typeof q.questionI18n === 'object'
        ? q.questionI18n
        : fallbackParent && base.questionI18n
          ? base.questionI18n
          : {
              uk: q.questionUk || base.questionUk,
              en: q.questionEn || base.questionEn,
            };
    const multiHintI18n =
      q.multiHintI18n && typeof q.multiHintI18n === 'object'
        ? q.multiHintI18n
        : fallbackParent && base.multiHintI18n
          ? base.multiHintI18n
          : {
              uk: q.multiHintUk || base.multiHintUk,
              en: q.multiHintEn || base.multiHintEn,
            };
    const optionsSrc = Array.isArray(q.options) ? q.options : [];
    const _optionsI18n = optionsSrc.map((o, i) => ({
      text:
        o?.textI18n && typeof o.textI18n === 'object'
          ? o.textI18n
          : fallbackParent && base.options?.[i]?.textI18n
            ? base.options[i].textI18n
            : { uk: o?.textUk, en: o?.textEn },
      correct: o?.correct === true,
    }));
    return {
      ...q,
      _questionI18n: questionI18n,
      _multiHintI18n: multiHintI18n,
      _optionsI18n,
    };
  };

  // Prefer questions[] with per-question i18n (AI enrich + translate).
  if (Array.isArray(base.questions) && base.questions.length > 0) {
    const questions = base.questions.map((q, i) => attachQuestionI18n(q, i === 0));
    return {
      ...base,
      ...questions[0],
      questions,
      _questionI18n: questions[0]?._questionI18n,
      _multiHintI18n: questions[0]?._multiHintI18n,
      _optionsI18n: questions[0]?._optionsI18n,
    };
  }

  // AI full i18n maps on legacy single quiz
  if (
    (base.questionI18n && typeof base.questionI18n === 'object') ||
    (Array.isArray(base.options) && base.options.some((o) => o?.textI18n))
  ) {
    return attachQuestionI18n(base, false);
  }

  if (!pack?.quiz) return base;

  return {
    ...base,
    _questionI18n: pack.quiz.question,
    _multiHintI18n: pack.quiz.multiHint,
    _optionsI18n: (pack.quiz.options || []).map((o) => ({
      text: o.text,
      correct: o.correct === true,
    })),
  };
}

export function resolveLandmarkTitleI18n(lm, language, context = {}) {
  const lang = appLangBase(language);
  const { regionId, landmarkId } = context;
  const pack = getLandmarkIntroI18n(regionId, landmarkId);
  if (pack?.title) {
    const t = pickRow(lang, pack.title);
    if (t) return t;
  }
  const langUk = lang === 'uk';
  return langUk ? lm?.titleUk || lm?.titleEn || '' : lm?.titleEn || lm?.titleUk || '';
}

export function resolveLandmarkDescI18n(lm, language, context = {}) {
  const lang = appLangBase(language);
  const { regionId, landmarkId } = context;
  const pack = getLandmarkIntroI18n(regionId, landmarkId);
  if (pack?.desc) {
    const t = pickRow(lang, pack.desc);
    if (t) return t;
  }
  const langUk = lang === 'uk';
  return langUk
    ? String(lm?.descUk || lm?.descEn || '').trim()
    : String(lm?.descEn || lm?.descUk || '').trim();
}
