import { getLandmarkInRegion } from './routeRegionsData';
import { getLandmarkWikiStory } from './landmarkWikiStories';
import { haversineKm } from './routePlannerCore';
import { reverseGeocodeStreetInfo } from './googleGeocode';

export const GUIDE_SPEECH_COOLDOWN_MS = 5000;
export const LANDMARK_GUIDE_RADIUS_M = 140;
export const STREET_GUIDE_MOVE_M = 40;

export function stripGuideHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function streetNameFromStep(step) {
  const text = stripGuideHtml(step?.htmlInstructions);
  if (!text) return null;
  const onto = text.match(
    /(?:onto|on|toward|along|via|down|up|на|вул\.|вулиці|вулицею|вулиця)\s+([^,.]+)/i,
  );
  return onto ? onto[1].trim() : null;
}

export function buildStepGuidePhrase(step, language) {
  const text = stripGuideHtml(step?.htmlInstructions);
  if (!text) return '';
  const uk = language !== 'en';
  const street = streetNameFromStep(step);
  if (street) {
    return uk ? `Ви йдете вулицею ${street}` : `You are walking along ${street}`;
  }
  const trimmed = text.length > 220 ? `${text.slice(0, 217)}…` : text;
  return trimmed;
}

function pickIntroText(lm, wiki, uk) {
  if (uk) {
    return (
      lm?.shortIntroUk ||
      wiki?.shortIntroUk ||
      stripGuideHtml(wiki?.introPage1Uk || wiki?.audioScriptUk).slice(0, 240) ||
      ''
    );
  }
  return (
    lm?.shortIntroEn ||
    wiki?.shortIntroEn ||
    stripGuideHtml(wiki?.introPage1En || wiki?.audioScriptEn).slice(0, 240) ||
    ''
  );
}

export function buildLandmarkGuidePhrase(plan, stop, language) {
  if (!stop) return '';
  const uk = language !== 'en';
  const title = String(stop.title || '').trim();

  if (plan?.aiGenerated) {
    if (!title) return '';
    return uk ? `Поруч пам'ятка: ${title}` : `Nearby landmark: ${title}`;
  }

  const lm = getLandmarkInRegion(plan?.regionId, stop.id);
  const wiki = lm ? getLandmarkWikiStory(plan.regionId, stop.id) : null;
  const intro = pickIntroText(lm, wiki, uk);
  const placeTitle = uk
    ? String(lm?.titleUk || title).trim()
    : String(lm?.titleEn || title).trim();

  if (!placeTitle) return '';
  if (intro) {
    return uk
      ? `Поруч ${placeTitle}. ${intro}`
      : `Nearby: ${placeTitle}. ${intro}`;
  }
  return uk ? `Поруч ${placeTitle}` : `Nearby: ${placeTitle}`;
}

export function buildStreetEnteredPhrase(info, language) {
  const street = String(info?.street || '').trim();
  if (!street) return '';
  const uk = language !== 'en';
  const area = String(info?.neighborhood || info?.city || '').trim();
  if (area && area.toLowerCase() !== street.toLowerCase()) {
    return uk
      ? `Ви на вулиці ${street}. Район ${area}.`
      : `You are on ${street}, in the ${area} area.`;
  }
  return uk ? `Ви на вулиці ${street}` : `You are on ${street}`;
}

export function streetGuideKey(info) {
  if (!info?.street) return '';
  return `${info.street}|${info.neighborhood || ''}|${info.city || ''}`;
}

export function distanceMetersBetween(a, b) {
  if (!a || !b) return null;
  return haversineKm(a, b) * 1000;
}

export async function fetchStreetGuideInfo(lat, lng, language) {
  return reverseGeocodeStreetInfo(lat, lng, language);
}
