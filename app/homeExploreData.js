import { ROUTE_REGIONS, regionTitle, collectAllCountriesWithRegions } from './routeRegionsData';
import { countriesForSelectCountryScreen, COUNTRY_DISPLAY_LABELS, appLangBase } from './appLang';
import { normalizeHeroImageSource } from './krainaHeroThumbs';
import { resolveOfflineUriSync } from './offline/localCacheStore';

/** Картка країни на головній: прев’ю t1–t4 або URL (керується з адмін-панелі). */
export const HOME_COUNTRY_HERO_REFS = {
  UA: require('./assets/kyiv-main-hero.png'),
  ES: require('./assets/spain-card-hero.png'),
  FR: require('./assets/france-card-hero.png'),
  IT: require('./assets/italy-card-hero.png'),
  DE: require('./assets/germany-card-hero.png'),
  PL: require('./assets/poland-card-hero.png'),
  NL: require('./assets/netherlands-card-hero.png'),
  RO: require('./assets/romania-card-hero.png'),
  LT: require('./assets/lithuania-card-hero.png'),
  LV: require('./assets/latvia-card-hero.png'),
  AM: require('./assets/armenia-card-hero.png'),
};
/** Окремий URL фото картки країни (має пріоритет над прев’ю). */
export const HOME_COUNTRY_HERO_URIS = {};
/** Вбудовані fallback-фото карток (працюють навіть якщо адмін-перевизначення порожні). */
const HOME_COUNTRY_HERO_DEFAULTS = {
  UA: require('./assets/kyiv-main-hero.png'),
  ES: require('./assets/spain-card-hero.png'),
  FR: require('./assets/france-card-hero.png'),
  IT: require('./assets/italy-card-hero.png'),
  DE: require('./assets/germany-card-hero.png'),
  PL: require('./assets/poland-card-hero.png'),
  NL: require('./assets/netherlands-card-hero.png'),
  RO: require('./assets/romania-card-hero.png'),
  LT: require('./assets/lithuania-card-hero.png'),
  LV: require('./assets/latvia-card-hero.png'),
  AM: require('./assets/armenia-card-hero.png'),
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

/** Фото міста для списків: hero URL → heroThumb → перша пам’ятка. */
export function resolveRegionHeroSource(region) {
  if (!region) return null;
  const u = typeof region.heroUri === 'string' ? region.heroUri.trim() : '';
  if (u && /^https?:\/\//i.test(u)) return { uri: resolveOfflineUriSync(u) };
  if (region.heroThumb) return region.heroThumb;
  const thumb = region.landmarks?.[0]?.thumb;
  if (!thumb) return null;
  if (typeof thumb === 'object' && typeof thumb.uri === 'string') {
    return { uri: resolveOfflineUriSync(thumb.uri) };
  }
  return thumb;
}
