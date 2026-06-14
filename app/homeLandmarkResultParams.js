import { Image } from 'react-native';
import { countriesForSelectCountryScreen } from './appLang';
import { landmarkTitle, regionTitle } from './routeRegionsData';
import { dominantVisitCategoryFromLandmark } from './visitStatsStorage';
import { storyQuizForLandmarkRoute } from './landmarkQuizUtils';
import { normalizeLandmarkStory } from './landmarkStorySchema';
import { resolveOfflineUriSync } from './offline/localCacheStore';

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

/**
 * Спільні поля для LandmarkResult, коли є локальна пам’ятка `lm` + регіон `region` + countryId.
 * Використовується з головної, профілю (збережені), маршруту тощо.
 */
export function landmarkResultExtrasFromResolvedLandmark({ lm, region, countryId, language, user }) {
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const title = landmarkTitle(lm, langUk);
  const countries = countriesForSelectCountryScreen(language);
  const countryRow = countryId ? countries.find((c) => c.id === countryId) : null;
  const countryLabel = (countryRow?.label || String(countryId || '')).trim();
  const headerTitle = countryLabel && title ? `${countryLabel} - ${title}` : title;

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

  const photoUri =
    lm.thumb && typeof lm.thumb === 'object' && typeof lm.thumb.uri === 'string'
      ? resolveOfflineUriSync(lm.thumb.uri)
      : Image.resolveAssetSource(lm.thumb)?.uri || null;

  const storyQuiz = storyQuizForLandmarkRoute(lm);
  const factSlides = storyFactSlidesForLandmarkRoute(lm);

  return {
    title,
    headerTitle,
    ...(visitLandmarkSave ? { visitLandmarkSave } : {}),
    ...(visitLat != null && visitLng != null ? { visitLat, visitLng } : {}),
    ...(photoUri ? { photoUri } : {}),
    ...(user && (user.id || user.firebaseUid) ? { user } : {}),
    ...(storyQuiz ? { storyQuiz } : {}),
    ...(factSlides ? { factSlides } : {}),
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
  const extract = langUk ? lm.descUk || '' : lm.descEn || lm.descUk || '';
  const rawAudio = typeof lm?.story?.audioUri === 'string' ? lm.story.audioUri.trim() : '';
  const audioGuideUrl = /^https?:\/\//i.test(rawAudio) ? rawAudio : undefined;
  const dist = lm?.distKm;
  const visitKm = dist != null && Number.isFinite(Number(dist)) ? Number(dist) : undefined;

  const panelTagline = langUk
    ? typeof lm?.story?.shortIntroUk === 'string'
      ? lm.story.shortIntroUk.trim()
      : ''
    : typeof lm?.story?.shortIntroEn === 'string'
      ? lm.story.shortIntroEn.trim()
      : '';

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
    subtitle,
    extract,
    source: 'sourceDemo',
    startPhase: 'home',
    visitCity: cityName,
    visitCategory: dominantVisitCategoryFromLandmark(lm),
    ...(visitKm != null ? { visitKm } : {}),
    ...(countryId ? { countryId } : {}),
    ...(audioGuideUrl ? { audioGuideUrl } : {}),
  };
}
