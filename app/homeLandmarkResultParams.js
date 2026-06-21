import { Image } from 'react-native';
import { landmarkTitle, regionTitle } from './routeRegionsData';
import { dominantVisitCategoryFromLandmark } from './visitStatsStorage';
import { storyQuizForLandmarkRoute } from './landmarkQuizUtils';
import { normalizeLandmarkStory } from './landmarkStorySchema';
import { resolveOfflineUriSync } from './offline/localCacheStore';
import { HERO_THUMB_MAP, resolveHeroThumbRef } from './krainaHeroThumbs';

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

function introPagesFromStory(story, langUk) {
  const key = langUk ? 'introPagesUk' : 'introPagesEn';
  const raw = story?.[key];
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const pages = raw
    .map((page) => {
      const compareBeforeThumb =
        typeof page?.compareBeforeThumb === 'string' ? page.compareBeforeThumb.trim() : '';
      const compareAfterThumb =
        typeof page?.compareAfterThumb === 'string' ? page.compareAfterThumb.trim() : '';
      const compareBeforeAsset = resolveHeroThumbRef(compareBeforeThumb);
      const compareAfterAsset = resolveHeroThumbRef(compareAfterThumb);
      const hasCompare =
        typeof compareBeforeAsset === 'number' && typeof compareAfterAsset === 'number';
      const body = typeof page?.body === 'string' ? page.body.trim() : '';
      if (!body && hasCompare) {
        return {
          compareOnly: true,
          compareBeforeAsset,
          compareAfterAsset,
          compareBeforeThumb,
          compareAfterThumb,
        };
      }
      if (!body) return null;
      const heroThumb = typeof page?.heroThumb === 'string' ? page.heroThumb.trim() : '';
      const secondaryHeroThumb =
        typeof page?.secondaryHeroThumb === 'string' ? page.secondaryHeroThumb.trim() : '';
      const photoAsset = resolveHeroThumbRef(heroThumb);
      const secondaryPhotoAsset = resolveHeroThumbRef(secondaryHeroThumb);
      const illustrationThumb =
        typeof page?.illustrationThumb === 'string' ? page.illustrationThumb.trim() : '';
      const illustrationAsset = resolveHeroThumbRef(illustrationThumb);
      const illustrationLink = langUk
        ? String(page?.illustrationLinkUk || page?.illustrationLinkEn || '').trim()
        : String(page?.illustrationLinkEn || page?.illustrationLinkUk || '').trim();
      const illustrationCaption = langUk
        ? String(page?.illustrationCaptionUk || page?.illustrationCaptionEn || '').trim()
        : String(page?.illustrationCaptionEn || page?.illustrationCaptionUk || '').trim();
      const photoUri =
        typeof page?.photoUri === 'string' && page.photoUri.trim()
          ? resolveOfflineUriSync(page.photoUri.trim())
          : photoAsset
            ? Image.resolveAssetSource(photoAsset)?.uri || undefined
            : undefined;
      const compareHeroHeightRatio = Number(page?.compareHeroHeightRatio);
      const compareHeroHeightMax = Number(page?.compareHeroHeightMax);
      const compareHeroTopInset = Number(page?.compareHeroTopInset);
      const heroHeightRatio = Number(page?.heroHeightRatio);
      const heroHeightMax = Number(page?.heroHeightMax);
      return {
        body,
        ...(hasCompare
          ? {
              compareBeforeAsset,
              compareAfterAsset,
              compareBeforeThumb,
              compareAfterThumb,
              ...(Number.isFinite(compareHeroHeightRatio) && compareHeroHeightRatio > 0
                ? { compareHeroHeightRatio }
                : {}),
              ...(Number.isFinite(compareHeroHeightMax) && compareHeroHeightMax > 0
                ? { compareHeroHeightMax }
                : {}),
              ...(Number.isFinite(compareHeroTopInset) && compareHeroTopInset > 0
                ? { compareHeroTopInset }
                : {}),
            }
          : {}),
        ...(heroThumb ? { heroThumb } : {}),
        ...(secondaryHeroThumb ? { secondaryHeroThumb } : {}),
        ...(photoAsset ? { photoAsset } : {}),
        ...(secondaryPhotoAsset ? { secondaryPhotoAsset } : {}),
        ...(Number.isFinite(heroHeightRatio) && heroHeightRatio > 0 ? { heroHeightRatio } : {}),
        ...(Number.isFinite(heroHeightMax) && heroHeightMax > 0 ? { heroHeightMax } : {}),
        ...(photoUri ? { photoUri } : {}),
        ...(typeof illustrationAsset === 'number' ? { illustrationAsset } : {}),
        ...(illustrationLink ? { illustrationLink } : {}),
        ...(illustrationCaption ? { illustrationCaption } : {}),
        ...(page?.introFullBleedPhoto ? { introFullBleedPhoto: true } : {}),
        ...(page?.introHeroAfterText ? { introHeroAfterText: true } : {}),
        ...(page?.introHeroBleedTop ? { introHeroBleedTop: true } : {}),
        ...(page?.introFactCard ? { introFactCard: true } : {}),
        ...(page?.introHeroInsetRounded ? { introHeroInsetRounded: true } : {}),
      };
    })
    .filter(Boolean);
  return pages.length > 0 ? pages : undefined;
}

/**
 * Спільні поля для LandmarkResult, коли є локальна пам’ятка `lm` + регіон `region` + countryId.
 * Використовується з головної, профілю (збережені), маршруту тощо.
 */
export function landmarkResultExtrasFromResolvedLandmark({ lm, region, countryId, language, user }) {
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const title = landmarkTitle(lm, langUk);
  const headerTitle = title;

  const canSave = !!(countryId && region?.id && lm?.id);
  const visitLandmarkSave = canSave
    ? {
        countryId: String(countryId),
        regionId: String(region.id),
        landmarkId: String(lm.id),
        titleUk: landmarkTitle(lm, true),
        titleEn: landmarkTitle(lm, false),
        regionTitleUk: regionTitle(region, true),
        regionTitleEn: regionTitle(region, false),
        flag: String(typeof region?.flag === 'string' ? region.flag : ''),
      }
    : undefined;

  const visitLat = typeof lm?.lat === 'number' && Number.isFinite(lm.lat) ? lm.lat : undefined;
  const visitLng = typeof lm?.lng === 'number' && Number.isFinite(lm.lng) ? lm.lng : undefined;

  const photoAsset =
    lm?.id === 'maidan'
      ? HERO_THUMB_MAP.maidan
      : typeof lm?.thumb === 'number'
        ? lm.thumb
        : undefined;
  const photoUri =
    lm.thumb && typeof lm.thumb === 'object' && typeof lm.thumb.uri === 'string'
      ? resolveOfflineUriSync(lm.thumb.uri)
      : photoAsset
        ? Image.resolveAssetSource(photoAsset)?.uri || null
        : Image.resolveAssetSource(lm.thumb)?.uri || null;

  const storyQuiz = storyQuizForLandmarkRoute(lm);
  const factSlides = storyFactSlidesForLandmarkRoute(lm);
  const story = lm?.story ? normalizeLandmarkStory(lm.story) : null;
  const rawStory = lm?.story && typeof lm.story === 'object' ? lm.story : null;
  const audioScriptUk = story?.ttsEnabled ? String(story.audioScriptUk || '').trim() : '';
  const audioScriptEn = story?.ttsEnabled ? String(story.audioScriptEn || '').trim() : '';
  const introContinuationUk =
    typeof rawStory?.introContinuationUk === 'string' ? rawStory.introContinuationUk.trim() : '';
  const introContinuationEn =
    typeof rawStory?.introContinuationEn === 'string' ? rawStory.introContinuationEn.trim() : '';
  const introPagesUk = introPagesFromStory(rawStory, true);
  const introPagesEn = introPagesFromStory(rawStory, false);
  const introPages = langUk ? introPagesUk : introPagesEn;

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
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const cityName = regionTitle(region, langUk);
  const rawStory = lm?.story && typeof lm.story === 'object' ? lm.story : null;
  const story = rawStory ? normalizeLandmarkStory(rawStory) : null;
  const audioScriptUk = story?.ttsEnabled ? String(story.audioScriptUk || '').trim() : '';
  const audioScriptEn = story?.ttsEnabled ? String(story.audioScriptEn || '').trim() : '';
  const introPage1Uk =
    typeof rawStory?.introPage1Uk === 'string' ? rawStory.introPage1Uk.trim() : '';
  const introPage1En =
    typeof rawStory?.introPage1En === 'string' ? rawStory.introPage1En.trim() : '';
  const introContinuationUk =
    typeof rawStory?.introContinuationUk === 'string' ? rawStory.introContinuationUk.trim() : '';
  const introContinuationEn =
    typeof rawStory?.introContinuationEn === 'string' ? rawStory.introContinuationEn.trim() : '';
  const introPagesUk = introPagesFromStory(rawStory, true);
  const introPagesEn = introPagesFromStory(rawStory, false);
  const introPages = langUk ? introPagesUk : introPagesEn;
  const introContinuation =
    !introPages && (langUk ? introContinuationUk : introContinuationEn)
      ? langUk
        ? introContinuationUk
        : introContinuationEn
      : '';
  const extract = langUk
    ? introPage1Uk || audioScriptUk || lm.descUk || ''
    : introPage1En || audioScriptEn || lm.descEn || lm.descUk || '';
  const rawAudio = typeof lm?.story?.audioUri === 'string' ? lm.story.audioUri.trim() : '';
  const resolvedAudio = rawAudio ? resolveOfflineUriSync(rawAudio) : '';
  const audioGuideUrl =
    resolvedAudio &&
    (/^https?:\/\//i.test(resolvedAudio) || resolvedAudio.startsWith('file://'))
      ? resolvedAudio
      : undefined;
  const dist = lm?.distKm;
  const visitKm = dist != null && Number.isFinite(Number(dist)) ? Number(dist) : undefined;

  const panelTagline = langUk
    ? typeof story?.shortIntroUk === 'string'
      ? story.shortIntroUk.trim()
      : typeof lm?.story?.shortIntroUk === 'string'
        ? lm.story.shortIntroUk.trim()
        : ''
    : typeof story?.shortIntroEn === 'string'
      ? story.shortIntroEn.trim()
      : typeof lm?.story?.shortIntroEn === 'string'
        ? lm.story.shortIntroEn.trim()
        : '';
  const miniExtract = langUk
    ? String(story?.miniPreviewUk || '').trim()
    : String(story?.miniPreviewEn || '').trim();

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
    ...(panelTagline ? { panelTagline } : {}),
    ...(miniExtract ? { miniExtract, previewBodyLines: 4 } : {}),
    subtitle,
    extract,
    source: 'sourceDemo',
    startPhase: 'home',
    ...(introPages ? { introPages } : {}),
    ...(introContinuation ? { introContinuation } : {}),
    visitCity: cityName,
    visitCategory: dominantVisitCategoryFromLandmark(lm),
    ...(visitKm != null ? { visitKm } : {}),
    ...(countryId ? { countryId } : {}),
    ...(audioGuideUrl ? { audioGuideUrl } : {}),
  };
}
