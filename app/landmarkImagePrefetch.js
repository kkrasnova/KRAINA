import { Image } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { HERO_THUMB_MAP, resolveHeroThumbRef } from './krainaHeroThumbs';

const BATCH_SIZE = 10;
let allPrefetchPromise = null;

function uriFromSource(source) {
  if (typeof source === 'number') {
    const resolved = Image.resolveAssetSource(source);
    return resolved?.uri ? String(resolved.uri) : null;
  }
  if (source && typeof source === 'object' && typeof source.uri === 'string') {
    const uri = source.uri.trim();
    if (uri) return uri;
  }
  return null;
}

function collectUniqueUris(sources) {
  const uris = new Set();
  for (const src of sources) {
    const uri = uriFromSource(src);
    if (uri) uris.add(uri);
  }
  return [...uris];
}

async function prefetchUriBatch(uris) {
  if (!uris.length) return;
  try {
    await ExpoImage.prefetch(uris, { cachePolicy: 'memory-disk' });
  } catch {
    /* optional */
  }
}

async function prefetchInBatches(uris) {
  for (let i = 0; i < uris.length; i += BATCH_SIZE) {
    await prefetchUriBatch(uris.slice(i, i + BATCH_SIZE));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function pushThumbRef(sources, ref) {
  const asset = resolveHeroThumbRef(ref);
  if (typeof asset === 'number') sources.push(asset);
}

function pushIntroPageMedia(sources, page) {
  if (!page || typeof page !== 'object') return;
  if (typeof page.photoAsset === 'number') sources.push(page.photoAsset);
  pushThumbRef(sources, page.heroThumb);
  pushThumbRef(sources, page.secondaryHeroThumb);
  pushThumbRef(sources, page.tertiaryHeroThumb);
  pushThumbRef(sources, page.compareBeforeThumb);
  pushThumbRef(sources, page.compareAfterThumb);
  pushThumbRef(sources, page.illustrationThumb);
}

/** Усі bundled / remote джерела фото пам’яток для warm-кешу expo-image. */
export function collectAllLandmarkImageSources() {
  const sources = Object.values(HERO_THUMB_MAP);
  try {
    const { ROUTE_REGIONS } = require('./routeRegionsData');
    const { HOME_COUNTRY_HERO_REFS } = require('./homeExploreData');
    sources.push(...Object.values(HOME_COUNTRY_HERO_REFS));
    for (const region of Object.values(ROUTE_REGIONS)) {
      if (region?.heroThumb) sources.push(region.heroThumb);
      if (typeof region?.heroThumbUrl === 'string' && region.heroThumbUrl.trim()) {
        sources.push({ uri: region.heroThumbUrl.trim() });
      }
      for (const lm of region?.landmarks || []) {
        if (lm?.thumb) sources.push(lm.thumb);
        const story = lm?.story;
        if (!story || typeof story !== 'object') continue;
        for (const key of ['introPagesUk', 'introPagesEn', 'pageMedia']) {
          const pages = story[key];
          if (!Array.isArray(pages)) continue;
          for (const page of pages) pushIntroPageMedia(sources, page);
        }
      }
    }
  } catch {
    /* optional */
  }
  return sources;
}

export function prefetchLandmarkImageSources(sources) {
  const uris = collectUniqueUris(sources);
  if (!uris.length) return Promise.resolve();
  return prefetchInBatches(uris);
}

/** Прогріває весь каталог фото локацій (один раз за сесію). */
export function prefetchAllLandmarkImages() {
  if (!allPrefetchPromise) {
    allPrefetchPromise = prefetchLandmarkImageSources(collectAllLandmarkImageSources());
  }
  return allPrefetchPromise;
}

/** Прогріває фото конкретної локації перед відкриттям LandmarkResult. */
export function prefetchLandmarkResultParams(params) {
  if (!params || typeof params !== 'object') return Promise.resolve();
  const sources = [];
  if (typeof params.photoAsset === 'number') sources.push(params.photoAsset);
  if (params.photoUri) sources.push({ uri: params.photoUri });
  if (Array.isArray(params.introPages)) {
    for (const page of params.introPages) pushIntroPageMedia(sources, page);
  }
  return prefetchLandmarkImageSources(sources);
}
