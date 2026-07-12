import { LANDMARK_INTRO_LAYOUT_TEMPLATE } from './landmarkIntroLayoutTemplate';
import { stripIntroEmphasis } from './landmarkTextUtils';

/**
 * @typedef {Object} LandmarkPageMedia
 * @property {string} [heroThumb]
 * @property {string} [secondaryHeroThumb]
 * @property {string} [compareBeforeThumb]
 * @property {string} [compareAfterThumb]
 * @property {string} [illustrationThumb]
 * @property {string} [illustrationLinkUk]
 * @property {string} [illustrationLinkEn]
 * @property {string} [illustrationCaptionUk]
 * @property {string} [illustrationCaptionEn]
 * @property {boolean} [introNoHero]
 * @property {string} [photoUri]
 * @property {string} [secondaryPhotoUri]
 * @property {string} [compareBeforeUri]
 * @property {string} [compareAfterUri]
 * @property {string} [illustrationUri]
 */

/**
 * @typedef {Object} BuildLandmarkIntroStoryInput
 * @property {string} [shortIntroUk]
 * @property {string} [shortIntroEn]
 * @property {string} [miniPreviewUk]
 * @property {string} [miniPreviewEn]
 * @property {string} introPage1Uk
 * @property {string} [introPage1En]
 * @property {string[]} pageBodiesUk — 12 текстів для слайдів 2–13
 * @property {string[]} [pageBodiesEn]
 * @property {LandmarkPageMedia[]} pageMedia — 12 об’єктів з ключами фото
 * @property {Object} [quiz]
 * @property {boolean} [ttsEnabled]
 */

function mergePage(layout, media, body, langUk) {
  const m = media && typeof media === 'object' ? media : {};
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) return null;

  const illustrationLink = langUk
    ? String(m.illustrationLinkUk || m.illustrationLinkEn || '').trim()
    : String(m.illustrationLinkEn || m.illustrationLinkUk || '').trim();
  const illustrationCaption = langUk
    ? String(m.illustrationCaptionUk || m.illustrationCaptionEn || '').trim()
    : String(m.illustrationCaptionEn || m.illustrationCaptionUk || '').trim();

  return {
    body: text,
    ...layout,
    ...(m.introNoHero ? { introNoHero: true, introHeroBleedTop: false } : {}),
    ...(m.heroThumb ? { heroThumb: m.heroThumb } : {}),
    ...(m.secondaryHeroThumb ? { secondaryHeroThumb: m.secondaryHeroThumb } : {}),
    ...(m.compareBeforeThumb && m.compareAfterThumb
      ? {
          compareBeforeThumb: m.compareBeforeThumb,
          compareAfterThumb: m.compareAfterThumb,
        }
      : {}),
    ...(m.illustrationThumb ? { illustrationThumb: m.illustrationThumb } : {}),
    ...(m.photoUri ? { photoUri: m.photoUri } : {}),
    ...(m.secondaryPhotoUri ? { secondaryPhotoUri: m.secondaryPhotoUri } : {}),
    ...(m.compareBeforeUri && m.compareAfterUri
      ? { compareBeforeUri: m.compareBeforeUri, compareAfterUri: m.compareAfterUri }
      : {}),
    ...(m.illustrationUri ? { illustrationUri: m.illustrationUri } : {}),
    ...(illustrationLink
      ? langUk
        ? { illustrationLinkUk: illustrationLink }
        : { illustrationLinkEn: illustrationLink }
      : {}),
    ...(illustrationCaption
      ? langUk
        ? { illustrationCaptionUk: illustrationCaption }
        : { illustrationCaptionEn: illustrationCaption }
      : {}),
  };
}

function buildIntroPages(bodies, mediaList, langUk) {
  if (!Array.isArray(bodies) || bodies.length === 0) return undefined;
  const pages = bodies
    .map((body, i) => mergePage(LANDMARK_INTRO_LAYOUT_TEMPLATE[i], mediaList?.[i], body, langUk))
    .filter(Boolean);
  return pages.length > 0 ? pages : undefined;
}

/**
 * Збирає повний об’єкт `story` для пам’ятки з текстів і ключів фото.
 * Використовуйте для будь-якої локації за зразком Майдану.
 */
export function buildLandmarkIntroStory(input) {
  const {
    shortIntroUk = '',
    shortIntroEn = '',
    miniPreviewUk = '',
    miniPreviewEn = '',
    introPage1Uk = '',
    introPage1En = '',
    pageBodiesUk = [],
    pageBodiesEn = [],
    pageMedia = [],
    quiz,
    ttsEnabled = true,
  } = input || {};

  const introPagesUk = buildIntroPages(pageBodiesUk, pageMedia, true);
  const introPagesEn = buildIntroPages(pageBodiesEn, pageMedia, false);

  const audioParts = [
    stripIntroEmphasis(introPage1Uk),
    ...pageBodiesUk.map(stripIntroEmphasis),
  ].filter(Boolean);
  const audioScriptUk = ttsEnabled ? audioParts.join('\n\n') : '';

  const audioPartsEn = [
    ...(introPage1En ? [stripIntroEmphasis(introPage1En)] : []),
    ...(Array.isArray(pageBodiesEn) ? pageBodiesEn.map(stripIntroEmphasis) : []),
  ].filter(Boolean);
  const audioScriptEn = ttsEnabled && audioPartsEn.length > 0
    ? audioPartsEn.join('\n\n')
    : '';

  return {
    shortIntroUk,
    shortIntroEn,
    miniPreviewUk,
    miniPreviewEn,
    introPage1Uk,
    ...(introPage1En ? { introPage1En } : {}),
    ...(introPagesUk ? { introPagesUk } : {}),
    ...(introPagesEn ? { introPagesEn } : {}),
    ...(quiz ? { quiz } : {}),
    audioScriptUk,
    audioScriptEn,
    ttsEnabled: !!ttsEnabled,
    audioUri: '',
    _introBuilt: true,
  };
}
