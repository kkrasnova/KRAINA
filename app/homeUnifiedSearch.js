import { countriesForSelectCountryScreen, appLangBase } from './appLang';
import { HOME_COUNTRY_ORDER, getHomeRegionsForCountry } from './homeExploreData';
import { regionTitle, landmarkTitle } from './routeRegionsData';
import {
  countryMatchesSearchQuery,
  multiFieldMatchesSearchQuery,
  normalizeForSearch,
} from './countrySearch';

const TYPE_ORDER = { country: 0, city: 1, landmark: 2, profile: 3 };
const MAX_RESULTS = 60;

/** Тексти з вкладеної «історії» пам’ятки (квіз, інтро, факти) — для пошуку за описом. */
function collectLandmarkStorySearchChunks(lm) {
  const story = lm?.story;
  if (!story || typeof story !== 'object') return [];
  const chunks = [
    story.shortIntroUk,
    story.shortIntroEn,
    story.closingUk,
    story.closingEn,
    story.quiz?.questionUk,
    story.quiz?.questionEn,
    story.quiz?.multiHintUk,
    story.quiz?.multiHintEn,
    story.photoFact?.titleUk,
    story.photoFact?.titleEn,
    story.photoFact?.bodyUk,
    story.photoFact?.bodyEn,
    story.secondFact?.titleUk,
    story.secondFact?.titleEn,
    story.secondFact?.bodyUk,
    story.secondFact?.bodyEn,
  ];
  const opts = Array.isArray(story.quiz?.options) ? story.quiz.options : [];
  for (const o of opts) {
    if (o && typeof o === 'object') {
      chunks.push(o.textUk, o.textEn);
    }
  }
  return chunks.filter((x) => typeof x === 'string' && String(x).trim());
}

/**
 * Об’єднує локальні місця та рядки профілів з API з урахуванням чекбоксів фільтра.
 * Якщо обидва вимкнені — показуємо лише місця (захист від порожнього UI).
 */
export function mergeLocalAndProfileRows(localRows, profileRows, { showPlaces = true, showProfiles = true } = {}) {
  const places = showPlaces ? localRows : [];
  const profiles = showProfiles ? profileRows : [];
  const merged = [...places, ...profiles];
  merged.sort((a, b) => {
    const ta = TYPE_ORDER[a.type] ?? 9;
    const tb = TYPE_ORDER[b.type] ?? 9;
    if (ta !== tb) return ta - tb;
    return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
  });
  return merged.slice(0, MAX_RESULTS);
}

/**
 * Фільтр локальних рядків пошуку (країна / місто / пам’ятка). Якщо всі вимкнені — показуємо все (захист від порожнього UI).
 */
export function filterHomeSearchRowsByKinds(
  rows,
  { countries = true, cities = true, landmarks = true } = {},
) {
  if (!countries && !cities && !landmarks) return rows;
  return rows.filter((r) => {
    if (r.type === 'country') return countries;
    if (r.type === 'city') return cities;
    if (r.type === 'landmark') return landmarks;
    return true;
  });
}

/**
 * Результати пошуку на головній: країна, місто (регіон) або пам’ятка з локальних даних.
 * Порожній запит — лише список країн (як раніше).
 */
export function buildHomeSearchRows(query, language) {
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const list = countriesForSelectCountryScreen(language);
  const byId = Object.fromEntries(list.map((c) => [c.id, c]));
  const qNorm = normalizeForSearch(String(query || '').trim());

  if (!qNorm) {
    const rows = [];
    for (const countryId of HOME_COUNTRY_ORDER) {
      const c = byId[countryId];
      if (!c) continue;
      rows.push({
        type: 'country',
        key: `c-${countryId}`,
        countryId,
        title: c.label,
        detail: '',
        flag: c.flag || '🏳️',
      });
    }
    rows.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    return rows;
  }

  const rows = [];
  const searchRaw = String(query || '');

  for (const countryId of HOME_COUNTRY_ORDER) {
    const c = byId[countryId];
    if (!c) continue;

    if (countryMatchesSearchQuery(c, searchRaw)) {
      rows.push({
        type: 'country',
        key: `c-${countryId}`,
        countryId,
        title: c.label,
        detail: '',
        flag: c.flag || '🏳️',
      });
    }

    const regions = getHomeRegionsForCountry(countryId);
    for (const region of regions) {
      const cityTitle = regionTitle(region, langUk);
      const cityFields = [
        cityTitle,
        region.titleUk,
        region.titleEn,
        region.countryUk,
        region.countryEn,
        c.label,
      ];
      if (multiFieldMatchesSearchQuery(cityFields, searchRaw)) {
        rows.push({
          type: 'city',
          key: `r-${region.id}`,
          countryId,
          regionId: region.id,
          region,
          title: cityTitle,
          detail: c.label,
          flag: region.flag || c.flag || '🏳️',
        });
      }

      for (const lm of region.landmarks || []) {
        const lmTitle = landmarkTitle(lm, langUk);
        const lmFields = [
          lmTitle,
          lm.titleUk,
          lm.titleEn,
          cityTitle,
          c.label,
          region.countryUk,
          region.countryEn,
          lm.descUk,
          lm.descEn,
          ...collectLandmarkStorySearchChunks(lm),
        ];
        if (multiFieldMatchesSearchQuery(lmFields, searchRaw)) {
          rows.push({
            type: 'landmark',
            key: `l-${region.id}-${lm.id}`,
            countryId,
            regionId: region.id,
            region,
            landmark: lm,
            title: lmTitle,
            detail: `${cityTitle} · ${c.label}`,
            flag: region.flag || c.flag || '🏳️',
          });
        }
      }
    }
  }

  rows.sort((a, b) => {
    const ta = TYPE_ORDER[a.type] ?? 9;
    const tb = TYPE_ORDER[b.type] ?? 9;
    if (ta !== tb) return ta - tb;
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });
  return rows;
}

const browseRowsCache = new Map();
/** Cached full browse catalog — expensive; build once per language. */
export function buildHomeBrowseRows(language) {
  const key = appLangBase(language || 'en');
  const hit = browseRowsCache.get(key);
  if (hit) return hit;
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const list = countriesForSelectCountryScreen(language);
  const byId = Object.fromEntries(list.map((c) => [c.id, c]));
  const rows = [];

  for (const countryId of HOME_COUNTRY_ORDER) {
    const c = byId[countryId];
    if (!c) continue;
    rows.push({
      type: 'country',
      key: `c-${countryId}`,
      countryId,
      title: c.label,
      detail: '',
      flag: c.flag || '🏳️',
    });

    const regions = getHomeRegionsForCountry(countryId);
    for (const region of regions) {
      const cityTitle = regionTitle(region, langUk);
      rows.push({
        type: 'city',
        key: `r-${region.id}`,
        countryId,
        regionId: region.id,
        region,
        title: cityTitle,
        detail: c.label,
        flag: region.flag || c.flag || '🏳️',
      });

      for (const lm of region.landmarks || []) {
        const lmTitle = landmarkTitle(lm, langUk);
        rows.push({
          type: 'landmark',
          key: `l-${region.id}-${lm.id}`,
          countryId,
          regionId: region.id,
          region,
          landmark: lm,
          title: lmTitle,
          detail: `${cityTitle} · ${c.label}`,
          flag: region.flag || c.flag || '🏳️',
        });
      }
    }
  }

  rows.sort((a, b) => {
    const ta = TYPE_ORDER[a.type] ?? 9;
    const tb = TYPE_ORDER[b.type] ?? 9;
    if (ta !== tb) return ta - tb;
    return String(a.title || '').localeCompare(String(b.title || ''), undefined, {
      sensitivity: 'base',
    });
  });
  browseRowsCache.set(key, rows);
  return rows;
}
