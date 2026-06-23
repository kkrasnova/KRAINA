import { Image } from 'react-native';
import { appLangBase } from './appLang';
import {
  resolveCatalogLandmarkTitle,
  resolveCatalogRegionTitle,
} from './catalogDisplayI18n';
import { dominantVisitCategoryFromLandmark } from './visitStatsStorage';
import { storyQuizForLandmarkRoute, hasPlayableStoryQuiz } from './landmarkQuizUtils';
import { normalizeLandmarkStory } from './landmarkStorySchema';
import { resolveOfflineUriSync } from './offline/localCacheStore';
import { HERO_THUMB_MAP } from './krainaHeroThumbs';
import {
  introPagesFromStory,
  resolveIntroStoryField,
  resolveIntroStoryQuiz,
} from './landmarkIntroStoryResolve';

export { introPagesFromStory };

export function homeHeroLayoutFromStory(rawStory) {
  if (!rawStory || typeof rawStory !== 'object') return {};
  const ratio = Number(rawStory.homeHeroHeightRatio);
  const max = Number(rawStory.homeHeroHeightMax);
  const pos = rawStory.homeHeroContentPosition;
  const fit = typeof rawStory.homeHeroContentFit === 'string' ? rawStory.homeHeroContentFit.trim() : '';
  return {
    ...(Number.isFinite(ratio) && ratio > 0 ? { homeHeroHeightRatio: ratio } : {}),
    ...(Number.isFinite(max) && max > 0 ? { homeHeroHeightMax: max } : {}),
    ...(pos && typeof pos === 'object' ? { homeHeroContentPosition: pos } : {}),
    ...(fit ? { homeHeroContentFit: fit } : {}),
  };
}

function storyFactSlidesForLandmarkRoute(lm) {
  const raw = lm?.story;
  if (!raw || typeof raw !== 'object') return undefined;
  const story = normalizeLandmarkStory(raw);
  const slides = [];

  if (story.photoFact?.bgUri) {
    const bodyUk = String(story.photoFact.bodyUk || '').trim();
    const bodyEn = String(story.photoFact.bodyEn || '').trim();
    if (bodyUk || bodyEn) {
      slides.push({
        id: 'story-photo-fact',
        photoUri: resolveOfflineUriSync(story.photoFact.bgUri),
        titleUk: String(story.photoFact.titleUk || '').trim(),
        titleEn: String(story.photoFact.titleEn || '').trim(),
        factUk: bodyUk,
        factEn: bodyEn,
      });
    }
  }

  if (story.beforeAfter?.newUri || story.beforeAfter?.oldUri) {
    const bodyUk = String(story.secondFact?.bodyUk || '').trim();
    const bodyEn = String(story.secondFact?.bodyEn || '').trim();
    slides.push({
      id: 'story-before-after',
      photoUri: resolveOfflineUriSync(story.beforeAfter.newUri || story.beforeAfter.oldUri),
      beforePhotoUri: resolveOfflineUriSync(story.beforeAfter.oldUri || ''),
      afterPhotoUri: resolveOfflineUriSync(story.beforeAfter.newUri || story.beforeAfter.oldUri || ''),
      titleUk: String(story.secondFact?.titleUk || '').trim(),
      titleEn: String(story.secondFact?.titleEn || '').trim(),
      factUk: bodyUk || 'Було / стало',
      factEn: bodyEn || 'Before / after',
    });
  }

  return slides.length > 0 ? slides : undefined;
}

function introContext(region, lm) {
  return {
    regionId: String(region?.id || '').trim(),
    landmarkId: String(lm?.id || '').trim(),
  };
}

function localizedStoryQuiz(lm, language, region) {
  const raw = lm?.story;
  if (!raw || typeof raw !== 'object') return undefined;
  const ctx = introContext(region, lm);
  const quiz = resolveIntroStoryQuiz(raw, language, ctx) || normalizeLandmarkStory(raw).quiz;
  return hasPlayableStoryQuiz(quiz) ? quiz : undefined;
}

/**
 * Спільні поля для LandmarkResult, коли є локальна пам’ятка `lm` + регіон `region` + countryId.
 * Використовується з головної, профілю (збережені), маршруту тощо.
 */
export function landmarkResultExtrasFromResolvedLandmark({ lm, region, countryId, language, user }) {
  const lang = appLangBase(language);
  const langUk = lang === 'uk';
  const ctx = introContext(region, lm);
  const title = resolveCatalogLandmarkTitle(lm, language, ctx);
  const headerTitle = title;

  const canSave = !!(countryId && region?.id && lm?.id);
  const visitLandmarkSave = canSave
    ? {
        countryId: String(countryId),
        regionId: String(region.id),
        landmarkId: String(lm.id),
        titleUk: resolveCatalogLandmarkTitle(lm, 'uk', ctx),
        titleEn: resolveCatalogLandmarkTitle(lm, 'en', ctx),
        regionTitleUk: resolveCatalogRegionTitle(region, 'uk'),
        regionTitleEn: resolveCatalogRegionTitle(region, 'en'),
        flag: String(typeof region?.flag === 'string' ? region.flag : ''),
      }
    : undefined;

  const visitLat = typeof lm?.lat === 'number' && Number.isFinite(lm.lat) ? lm.lat : undefined;
  const visitLng = typeof lm?.lng === 'number' && Number.isFinite(lm.lng) ? lm.lng : undefined;

  const photoAsset =
    lm?.id === 'maidan'
      ? HERO_THUMB_MAP.maidan
      : lm?.id === 'sophia'
        ? HERO_THUMB_MAP.sophia
        : lm?.id === 'lavra'
          ? HERO_THUMB_MAP.lavra
          : lm?.id === 'khanenko_museum'
            ? HERO_THUMB_MAP.khanenko
            : typeof lm?.thumb === 'number'
              ? lm.thumb
              : undefined;
  const photoUri =
    lm.thumb && typeof lm.thumb === 'object' && typeof lm.thumb.uri === 'string'
      ? resolveOfflineUriSync(lm.thumb.uri)
      : photoAsset
        ? Image.resolveAssetSource(photoAsset)?.uri || null
        : Image.resolveAssetSource(lm.thumb)?.uri || null;

  const storyQuiz = localizedStoryQuiz(lm, language, region) || storyQuizForLandmarkRoute(lm);
  const factSlides = storyFactSlidesForLandmarkRoute(lm);
  const story = lm?.story ? normalizeLandmarkStory(lm.story) : null;
  const rawStory = lm?.story && typeof lm.story === 'object' ? lm.story : null;
  const audioScriptUk = story?.ttsEnabled ? String(story.audioScriptUk || '').trim() : '';
  const audioScriptEn = story?.ttsEnabled ? String(story.audioScriptEn || '').trim() : '';
  const introContinuationUk =
    typeof rawStory?.introContinuationUk === 'string' ? rawStory.introContinuationUk.trim() : '';
  const introContinuationEn =
    typeof rawStory?.introContinuationEn === 'string' ? rawStory.introContinuationEn.trim() : '';
  const introPages = introPagesFromStory(rawStory, language, ctx);
  const introPagesUk = introPagesFromStory(rawStory, 'uk', ctx);
  const introPagesEn = introPagesFromStory(rawStory, 'en', ctx);
  const homeHeroLayout =
    lm?.id === 'khanenko_museum'
      ? {
          homeHeroHeightRatio: 1,
          homeHeroHeightMax: 9999,
          homeHeroContentFit: 'cover',
          homeHeroContentPosition: 'center',
        }
      : homeHeroLayoutFromStory(rawStory);

  return {
    title,
    headerTitle,
    ...(visitLandmarkSave ? { visitLandmarkSave } : {}),
    ...(visitLat != null && visitLng != null ? { visitLat, visitLng } : {}),
    ...(photoAsset ? { photoAsset } : {}),
    ...(photoUri ? { photoUri } : {}),
    ...(user && (user.id || user.firebaseUid) ? { user } : {}),
    ...(storyQuiz ? { storyQuiz } : {}),
    ...(factSlides ? { factSlides } : {}),
    ...(audioScriptUk ? { audioScriptUk } : {}),
    ...(audioScriptEn ? { audioScriptEn } : {}),
    ...(introPages ? { introPages } : {}),
    ...(introContinuationUk && !introPagesUk ? { introContinuation: introContinuationUk } : {}),
    ...(introContinuationEn && !introPagesEn ? { introContinuationEn } : {}),
    ...homeHeroLayout,
  };
}

/**
 * Параметри для LandmarkResult з головної / пошуку: локація (не маршрут),
 * перший екран — повноекранне фото + нижній лист (startPhase: 'home').
 */
export function buildLandmarkResultParamsFromHomeLandmark({
  lm,
  region,
  countryId,
  language,
  appTheme,
  user,
}) {
  const lang = appLangBase(language);
  const langUk = lang === 'uk';
  const ctx = introContext(region, lm);
  const cityName = resolveCatalogRegionTitle(region, language);
  const rawStory = lm?.story && typeof lm.story === 'object' ? lm.story : null;
  const story = rawStory ? normalizeLandmarkStory(rawStory) : null;
  const audioScriptUk = story?.ttsEnabled ? String(story.audioScriptUk || '').trim() : '';
  const audioScriptEn = story?.ttsEnabled ? String(story.audioScriptEn || '').trim() : '';
  const introPage1 = resolveIntroStoryField(rawStory, 'introPage1', language, ctx);
  const introContinuationUk =
    typeof rawStory?.introContinuationUk === 'string' ? rawStory.introContinuationUk.trim() : '';
  const introContinuationEn =
    typeof rawStory?.introContinuationEn === 'string' ? rawStory.introContinuationEn.trim() : '';
  const introPages = introPagesFromStory(rawStory, language, ctx);
  const introContinuation =
    !introPages && (langUk ? introContinuationUk : introContinuationEn)
      ? langUk
        ? introContinuationUk
        : introContinuationEn
      : '';
  const extract =
    introPage1 ||
    (langUk ? audioScriptUk : audioScriptEn) ||
    (langUk ? lm.descUk : lm.descEn || lm.descUk) ||
    '';
  const rawAudio = typeof lm?.story?.audioUri === 'string' ? lm.story.audioUri.trim() : '';
  const resolvedAudio = rawAudio ? resolveOfflineUriSync(rawAudio) : '';
  const audioGuideUrl =
    resolvedAudio &&
    (/^https?:\/\//i.test(resolvedAudio) || resolvedAudio.startsWith('file://'))
      ? resolvedAudio
      : undefined;
  const panelTagline = resolveIntroStoryField(rawStory, 'shortIntro', language, ctx);
  const miniExtract = resolveIntroStoryField(rawStory, 'miniPreview', language, ctx);
  const title = resolveCatalogLandmarkTitle(lm, language, ctx);

  const flag = typeof region?.flag === 'string' ? region.flag : '';
  const subtitle = `${flag} ${cityName}`.trim();

  const extras = landmarkResultExtrasFromResolvedLandmark({
    lm,
    region,
    countryId,
    language,
    user,
  });

  return {
    language,
    appTheme,
    ...extras,
    title,
    headerTitle: title,
    ...(panelTagline ? { panelTagline } : {}),
    ...(miniExtract
      ? { miniExtract, previewBodyLines: lm.id === 'lavra' ? 3 : 4 }
      : {}),
    subtitle,
    extract,
    source: 'sourceDemo',
    startPhase: 'home',
    ...(introPages ? { introPages } : {}),
    ...(introContinuation ? { introContinuation } : {}),
    visitCity: cityName,
    visitCategory: dominantVisitCategoryFromLandmark(lm),
    ...(countryId ? { countryId } : {}),
    ...(audioGuideUrl ? { audioGuideUrl } : {}),
  };
}
