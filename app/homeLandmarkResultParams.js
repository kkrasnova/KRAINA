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
import { HERO_THUMB_MAP, resolveHeroThumbRef } from './krainaHeroThumbs';
import { resolveHomeLandmarkThumbSource } from './homeLandmarkDisplay';
import {
  introPagesFromStory,
  resolveIntroStoryField,
  resolveIntroStoryQuiz,
} from './landmarkIntroStoryResolve';

export { introPagesFromStory };

/** Перший екран з головної: фото на весь екран (нижній лист поверх). */
export const HOME_FULLSCREEN_HERO_LAYOUT = {
  homeHeroHeightRatio: 1,
  homeHeroHeightMax: 9999,
  homeHeroContentFit: 'cover',
  homeHeroContentPosition: 'center',
};

export const LANDMARK_HERO_ASSET_BY_ID = {
  maidan: 'maidan',
  sophia: 'sophia',
  lavra: 'lavra',
  khanenko_museum: 'khanenko',
  vangogh: 'vangoghMuseum',
  rijksmuseum: 'rijksmuseum',
  vondelpark: 'vondelpark',
  westerkerk: 'westerkerk',
  anne_frank: 'anneFrankHouse',
};

function normalizeBundledPhotoAsset(asset) {
  if (typeof asset === 'number' && Number.isFinite(asset)) return asset;
  if (typeof asset === 'string' && asset.trim()) {
    const parsed = Number(asset);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function remotePhotoUriOnly(uri) {
  const resolved = resolveOfflineUriSync(uri);
  return resolved && /^https?:\/\//i.test(resolved) ? resolved : null;
}

function localPhotoUriOnly(uri) {
  const resolved = resolveOfflineUriSync(uri);
  if (!resolved || typeof resolved !== 'string') return null;
  const trimmed = resolved.trim();
  return /^(file:\/\/|content:\/\/|asset:\/\/|ph:\/\/)/i.test(trimmed) ? trimmed : null;
}

/** ExpoImage на iOS надійніше з { uri } від resolveAssetSource, ніж з raw require-id. */
export function normalizeExpoImageSource(source) {
  if (source == null) return null;
  if (typeof source === 'number') {
    const resolved = Image.resolveAssetSource(source);
    if (resolved?.uri) return { uri: String(resolved.uri) };
    return source;
  }
  if (typeof source === 'object' && typeof source.uri === 'string') {
    const uri = resolveOfflineUriSync(source.uri) || source.uri.trim();
    if (uri) return { uri };
  }
  return null;
}

/** Головне фото пам’ятки з каталогу (без route.params). */
export function resolveLandmarkHeroPhotoSourceFromLandmark(lm) {
  if (!lm || typeof lm !== 'object') return null;
  const thumb = resolveHomeLandmarkThumbSource(lm);
  if (typeof thumb === 'number') return thumb;
  const namedKey = LANDMARK_HERO_ASSET_BY_ID[String(lm.id || '').trim()];
  if (namedKey) {
    const asset = HERO_THUMB_MAP[namedKey];
    if (typeof asset === 'number') return asset;
  }
  return null;
}

/**
 * Джерело для ExpoImage: asset (number) або { uri }.
 * Пріоритет: photoAsset → heroThumb → каталог lm → photoUri.
 */
export function resolveLandmarkHeroPhotoSource({ photoAsset, photoUri, heroThumb, lm } = {}) {
  const bundledAsset = normalizeBundledPhotoAsset(photoAsset);
  if (typeof bundledAsset === 'number') return bundledAsset;
  const thumbRef = typeof heroThumb === 'string' ? heroThumb.trim() : '';
  const fromRef = resolveHeroThumbRef(thumbRef);
  if (typeof fromRef === 'number') return fromRef;
  const fromLandmark = lm ? resolveLandmarkHeroPhotoSourceFromLandmark(lm) : null;
  if (fromLandmark) return fromLandmark;
  const remoteUri = remotePhotoUriOnly(photoUri);
  if (remoteUri) return { uri: remoteUri };
  const localUri = localPhotoUriOnly(photoUri);
  if (localUri) return { uri: localUri };
  return null;
}

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

  const heroThumb = LANDMARK_HERO_ASSET_BY_ID[String(lm?.id || '').trim()] || undefined;
  const heroSource = resolveLandmarkHeroPhotoSource({ lm, heroThumb });
  const photoAsset = typeof heroSource === 'number' ? heroSource : undefined;
  const photoUri =
    heroSource && typeof heroSource === 'object' && typeof heroSource.uri === 'string'
      ? remotePhotoUriOnly(heroSource.uri)
      : null;

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
  return {
    title,
    headerTitle,
    ...(visitLandmarkSave ? { visitLandmarkSave } : {}),
    ...(visitLat != null && visitLng != null ? { visitLat, visitLng } : {}),
    ...(heroThumb ? { heroThumb } : {}),
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
    ...HOME_FULLSCREEN_HERO_LAYOUT,
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
