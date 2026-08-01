import { ROUTE_REGIONS, regionTitle, collectAllCountriesWithRegions, BUILTIN_REGION_HERO_THUMBS } from './routeRegionsData';
import { countriesForSelectCountryScreen, COUNTRY_DISPLAY_LABELS, appLangBase } from './appLang';
import { normalizeHeroImageSource, HERO_THUMB_MAP } from './krainaHeroThumbs';
import { resolveOfflineUriSync } from './offline/localCacheStore';
import { EUROPE_COUNTRY_CARD_HEROES, EUROPE_CITY_HEROES } from './europeHeroAssets';

/** Картка країни на головній: прев’ю t1–t4 або URL (керується з адмін-панелі). */
export const HOME_COUNTRY_HERO_REFS = {
  UA: require('./assets/ukraine-card-hero.webp'),
  ES: require('./assets/spain-card-hero.webp'),
  FR: require('./assets/france-card-hero.webp'),
  IT: require('./assets/italy-card-hero.webp'),
  DE: require('./assets/germany-card-hero.webp'),
  PL: require('./assets/poland-card-hero.webp'),
  NL: require('./assets/netherlands-card-hero.webp'),
  RO: require('./assets/romania-card-hero.webp'),
  LT: require('./assets/lithuania-card-hero.webp'),
  LV: require('./assets/latvia-card-hero.webp'),
  AM: require('./assets/armenia-card-hero.webp'),
  ...EUROPE_COUNTRY_CARD_HEROES,
};
/** Окремий URL фото картки країни (має пріоритет над прев’ю). */
export const HOME_COUNTRY_HERO_URIS = {};
/** Вбудовані fallback-фото карток (працюють навіть якщо адмін-перевизначення порожні). */
const HOME_COUNTRY_HERO_DEFAULTS = {
  UA: require('./assets/ukraine-card-hero.webp'),
  ES: require('./assets/spain-card-hero.webp'),
  FR: require('./assets/france-card-hero.webp'),
  IT: require('./assets/italy-card-hero.webp'),
  DE: require('./assets/germany-card-hero.webp'),
  PL: require('./assets/poland-card-hero.webp'),
  NL: require('./assets/netherlands-card-hero.webp'),
  RO: require('./assets/romania-card-hero.webp'),
  LT: require('./assets/lithuania-card-hero.webp'),
  LV: require('./assets/latvia-card-hero.webp'),
  AM: require('./assets/armenia-card-hero.webp'),
  ...EUROPE_COUNTRY_CARD_HEROES,
};

/**
 * Країни на головній (карусель) — той самий набір, що й у каталозі маршрутів.
 * Нові країни/міста в routeRegionsData.js з’являються тут автоматично.
 */
const HOME_COUNTRY_GROUPS = collectAllCountriesWithRegions();

export const HOME_REGION_IDS_BY_COUNTRY_ID = Object.fromEntries(
  HOME_COUNTRY_GROUPS.map((g) => [g.countryId, g.regionIds]),
);

/** Порядок карток (UA залишається першою в collectAllCountriesWithRegions). */
export const HOME_COUNTRY_ORDER = HOME_COUNTRY_GROUPS.map((g) => g.countryId);

let carouselCacheKey = '';
let carouselCache = null;

/** Invalidate carousel cache when admin edits locations. */
export function invalidateHomeExploreCache() {
  carouselCacheKey = '';
  carouselCache = null;
}

export function getHomeRegionsForCountry(countryId) {
  const ids = HOME_REGION_IDS_BY_COUNTRY_ID[countryId];
  if (!ids?.length) return [];
  return ids.map((id) => ROUTE_REGIONS[id]).filter(Boolean);
}

/** Актуальна кількість локацій міста з runtime-каталогу. */
export function countRegionLandmarks(region) {
  return Array.isArray(region?.landmarks) ? region.landmarks.length : 0;
}

export function isValidHomeRegionForCountry(countryId, regionId) {
  return HOME_REGION_IDS_BY_COUNTRY_ID[countryId]?.includes(regionId) === true;
}

/**
 * Дані для горизонтальної каруселі країн на головній.
 * @param {string} language — код мови UI
 */
function resolveCarouselHeroForCountry(countryId, regions) {
  const cUri = HOME_COUNTRY_HERO_URIS[countryId];
  const cRef = HOME_COUNTRY_HERO_REFS[countryId];
  const fromCountry =
    (typeof cRef === 'number' ? cRef : null) ||
    (cRef && typeof cRef === 'object' && typeof cRef.uri === 'string' ? cRef : null) ||
    normalizeHeroImageSource(cRef, cUri);
  if (fromCountry) return fromCountry;
  const defaultHero = HOME_COUNTRY_HERO_DEFAULTS[countryId];
  if (defaultHero) return defaultHero;
  const first = regions[0];
  if (!first) return null;
  if (first.heroUri) {
    const u = normalizeHeroImageSource(null, first.heroUri);
    if (u) return u;
  }
  if (first.heroThumb) return first.heroThumb;
  return first.landmarks?.[0]?.thumb ?? null;
}

/** Те саме фото картки країни, що й у каруселі на головній. */
export function getHomeCountryHeroAsset(countryId) {
  const regions = getHomeRegionsForCountry(countryId);
  return resolveCarouselHeroForCountry(countryId, regions);
}

export function getHomeCountriesForCarousel(language, locationsEpoch = 0) {
  const langKey = appLangBase(language || 'en');
  const cacheKey = `${langKey}:${locationsEpoch}`;
  if (carouselCacheKey === cacheKey && carouselCache) return carouselCache;
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const list = countriesForSelectCountryScreen(language);
  const byId = Object.fromEntries(list.map((c) => [c.id, c]));
  const labelPack = COUNTRY_DISPLAY_LABELS[appLangBase(language)] || COUNTRY_DISPLAY_LABELS.en;
  const result = HOME_COUNTRY_ORDER.filter((id) => HOME_REGION_IDS_BY_COUNTRY_ID[id]).map((id) => {
    const regions = getHomeRegionsForCountry(id);
    const first = regions[0];
    const heroThumb = resolveCarouselHeroForCountry(id, regions);
    const total = regions.reduce((n, r) => n + countRegionLandmarks(r), 0);
    return {
      id,
      countryLabel: byId[id]?.label || labelPack[id] || id,
      flag: first?.flag || '🏳️',
      heroThumb,
      cityCount: regions.length,
      primaryCityTitle: first ? regionTitle(first, langUk) : '',
      locationCount: total,
    };
  });
  carouselCacheKey = cacheKey;
  carouselCache = result;
  return result;
}

/** Фото міста для списків: hero URL → dedicated asset → heroThumb → перша пам’ятка. */
export function resolveRegionHeroSource(region) {
  if (!region) return null;
  const rid = String(region.id || '').trim();
  const u = typeof region.heroUri === 'string' ? region.heroUri.trim() : '';
  if (u && /^https?:\/\//i.test(u)) return { uri: resolveOfflineUriSync(u) };

  const dedicated =
    (rid && BUILTIN_REGION_HERO_THUMBS[rid]) ||
    (rid && EUROPE_CITY_HEROES[rid]) ||
    null;
  const placeholder = HERO_THUMB_MAP.t1;

  // Prefer a real city hero over the generic hikers placeholder (t1).
  if (typeof region.heroThumb === 'number' && region.heroThumb !== placeholder) {
    return region.heroThumb;
  }
  if (dedicated) return dedicated;
  if (typeof region.heroThumb === 'number') return region.heroThumb;

  if (typeof region.heroThumb === 'string') {
    const mapped = normalizeHeroImageSource(region.heroThumb, null);
    if (mapped && mapped !== placeholder) return mapped;
  }
  if (region.heroThumb && typeof region.heroThumb === 'object') {
    if (typeof region.heroThumb.uri === 'string') {
      return { uri: resolveOfflineUriSync(region.heroThumb.uri) };
    }
    return region.heroThumb;
  }
  const thumb = region.landmarks?.[0]?.thumb;
  if (!thumb) return dedicated || null;
  if (typeof thumb === 'number') {
    if (thumb === placeholder && dedicated) return dedicated;
    return thumb;
  }
  if (typeof thumb === 'string') {
    const mapped = normalizeHeroImageSource(thumb, null);
    if (mapped) return mapped;
  }
  if (typeof thumb === 'object' && typeof thumb.uri === 'string') {
    return { uri: resolveOfflineUriSync(thumb.uri) };
  }
  return thumb || dedicated || null;
}
