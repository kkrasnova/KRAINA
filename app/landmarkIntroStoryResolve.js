import { appLangBase } from './appLang';
import { pickI18n } from './i18nBundle';
import { MAIDAN_INTRO_I18N } from './landmarkIntroI18n/maidan';
import { SOPHIA_INTRO_I18N } from './landmarkIntroI18n/sophia';
import { LAVRA_INTRO_I18N } from './landmarkIntroI18n/lavra';
import { KHANENKO_INTRO_I18N } from './landmarkIntroI18n/khanenko';
import { introPagesFromStoryLegacy } from './landmarkIntroPagesLegacy';
import { splitIntroBodyAtHero } from './landmarkTextUtils';

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
  if (!pack) {
    return legacyLangUk || lang === 'uk'
      ? ukPages
      : introPagesFromStoryLegacy(story, false);
  }
  if (!Array.isArray(ukPages) || ukPages.length === 0) return undefined;

  const bodies = Array.isArray(pack.pageBodies) ? pack.pageBodies : [];
  const illustrationLink = pickRow(lang, pack.illustrationLink);
  const illustrationCaption = pickRow(lang, pack.illustrationCaption);

  return ukPages.map((page, i) => {
    const rawBody = pickRow(lang, bodies[i]);
    const { body, bodyAfterHero } = splitIntroBodyAtHero(rawBody);
    const next = { ...page, ...(body ? { body } : {}) };
    if (bodyAfterHero) {
      next.bodyAfterHero = bodyAfterHero;
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

export function resolveIntroStoryField(story, field, language, context = {}) {
  const lang = appLangBase(language);
  const { regionId, landmarkId } = context;
  const pack = getLandmarkIntroI18n(regionId, landmarkId);
  if (pack?.[field]) return pickRow(lang, pack[field]);

  if (field === 'shortIntro') {
    return lang === 'uk'
      ? String(story?.shortIntroUk || '').trim()
      : String(story?.shortIntroEn || story?.shortIntroUk || '').trim();
  }
  if (field === 'miniPreview') {
    return lang === 'uk'
      ? String(story?.miniPreviewUk || '').trim()
      : String(story?.miniPreviewEn || story?.miniPreviewUk || '').trim();
  }
  if (field === 'introPage1') {
    return lang === 'uk'
      ? String(story?.introPage1Uk || '').trim()
      : String(story?.introPage1En || story?.introPage1Uk || '').trim();
  }
  return '';
}

export function resolveIntroStoryQuiz(story, language, context = {}) {
  const { regionId, landmarkId } = context;
  const pack = getLandmarkIntroI18n(regionId, landmarkId);
  const base = story?.quiz;
  if (!pack?.quiz || !base) return base || null;

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
