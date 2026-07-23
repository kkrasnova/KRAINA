/**
 * Аудіогід уздовж маршруту: Wikipedia (реальні факти біля GPS) + опційний AI-скрипт.
 */
import { appLangBase } from './appLang';
import { apiHttp } from './apiHttp';
import { buildMiniExtract, fetchWikipediaNearbyWalk } from './landmarkIdentify';
import { reverseGeocodeStreetInfo } from './googleGeocode';
import { getLandmarkInRegion } from './routeRegionsData';
import { getLandmarkWikiStory } from './landmarkWikiStories';
import { stripGuideHtml } from './routeStreetGuide';

export const WALK_GUIDE_MOVE_M = 55;
export const WALK_GUIDE_COOLDOWN_MS = 18000;
export const WALK_GUIDE_FETCH_TIMEOUT_MS = 12000;

function langUk(language) {
  return appLangBase(language) !== 'en';
}

function clipGuideText(text, max = 520) {
  const s = stripGuideHtml(text);
  if (!s) return '';
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastDot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (lastDot > 180) return cut.slice(0, lastDot + 1).trim();
  return `${cut.trim()}…`;
}

/** Локальний скрипт без AI — з Wikipedia extract. */
export function buildWalkGuideScriptFallback({ title, extract, street, language }) {
  const uk = langUk(language);
  const place = String(title || '').trim();
  const body = clipGuideText(extract || buildMiniExtract(extract), 480);
  const road = String(street || '').trim();
  if (!place && !body) return '';

  if (uk) {
    const lead = road
      ? `Ви проходите повз ${place || 'цю локацію'} на вулиці ${road}.`
      : `Ви проходите повз ${place || 'цю локацію'}.`;
    return body ? `${lead} ${body}` : lead;
  }

  const lead = road
    ? `You’re passing ${place || 'this place'} on ${road}.`
    : `You’re passing ${place || 'this place'}.`;
  return body ? `${lead} ${body}` : lead;
}

/** Каталогова історія зупинки маршруту (якщо є). */
export function buildCatalogStopWalkScript(plan, stop, language) {
  if (!stop || plan?.aiGenerated) return null;
  const uk = langUk(language);
  const lm = getLandmarkInRegion(plan?.regionId, stop.id);
  const wiki = lm ? getLandmarkWikiStory(plan.regionId, stop.id) : null;
  const title = uk
    ? String(lm?.titleUk || stop.title || '').trim()
    : String(lm?.titleEn || stop.title || '').trim();
  const extract = uk
    ? stripGuideHtml(wiki?.audioScriptUk || wiki?.introPage1Uk || lm?.shortIntroUk || '')
    : stripGuideHtml(wiki?.audioScriptEn || wiki?.introPage1En || lm?.shortIntroEn || '');
  if (!title || !extract) return null;
  return {
    key: `catalog:${plan.regionId}:${stop.id}`,
    title,
    script: buildWalkGuideScriptFallback({ title, extract, street: '', language }),
    source: 'catalog',
    usedAi: false,
  };
}

async function polishWithAi(payload) {
  try {
    const { data } = await apiHttp.post(
      '/api/ai/walk-narrate',
      {
        title: payload.title || '',
        extract: String(payload.extract || '').slice(0, 1800),
        street: payload.street || '',
        city: payload.city || '',
        language: langUk(payload.language) ? 'uk' : 'en',
      },
      { timeout: 14000 },
    );
    const script = String(data?.script || '').trim();
    if (!script) return null;
    return { script, usedAi: data?.usedAi === true };
  } catch {
    return null;
  }
}

/**
 * Знаходить історію біля GPS і готує текст для озвучки.
 * @returns {Promise<null | { key: string, title: string, script: string, source: string, usedAi: boolean }>}
 */
export async function fetchWalkAudioGuideStory({
  latitude,
  longitude,
  language,
  streetHint = '',
}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const streetInfo = await reverseGeocodeStreetInfo(latitude, longitude, language).catch(() => null);
  const street = String(streetHint || streetInfo?.street || '').trim();
  const city = String(streetInfo?.city || streetInfo?.neighborhood || '').trim();

  const wiki = await fetchWikipediaNearbyWalk(latitude, longitude, language);
  if (!wiki?.title || !wiki?.extract) {
    if (!street) return null;
    const uk = langUk(language);
    const script = uk
      ? `Ви йдете вулицею ${street}${city ? ` у районі ${city}` : ''}. Звертайте увагу на фасади й меморіальні таблички — тут часто збережена міська історія.`
      : `You’re walking along ${street}${city ? ` in ${city}` : ''}. Watch for façades and memorial plaques — local history often lives on this street.`;
    return {
      key: `street:${street}|${city}`,
      title: street,
      script,
      source: 'street',
      usedAi: false,
    };
  }

  const polished = await polishWithAi({
    title: wiki.title,
    extract: wiki.extract,
    street,
    city,
    language,
  });

  const script =
    polished?.script ||
    buildWalkGuideScriptFallback({
      title: wiki.title,
      extract: wiki.extract,
      street,
      language,
    });

  return {
    key: `wiki:${wiki.wikipediaUrl || wiki.title}`,
    title: wiki.title,
    script,
    source: wiki.source || 'wiki',
    usedAi: polished?.usedAi === true,
    subtitle: wiki.subtitle || '',
  };
}
