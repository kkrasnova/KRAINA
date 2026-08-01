import { Image } from 'react-native';
import { appLangBase } from './appLang';
import {
  resolveCatalogLandmarkTitle,
  resolveCatalogRegionTitle,
} from './catalogDisplayI18n';
import { dominantVisitCategoryFromLandmark } from './visitStatsStorage';
import { storyQuizForLandmarkRoute, hasPlayableStoryQuiz, ensureThreeQuizQuestions } from './landmarkQuizUtils';
import { normalizeLandmarkStory } from './landmarkStorySchema';
import { resolveOfflineUriSync } from './offline/localCacheStore';
import { HERO_THUMB_MAP, resolveHeroThumbRef } from './krainaHeroThumbs';
import { resolveHomeLandmarkThumbSource } from './homeLandmarkDisplay';
import {
  composeRichLandmarkIntroPage1,
  introPagesFromStory,
  resolveIntroStoryField,
  resolveIntroStoryQuiz,
} from './landmarkIntroStoryResolve';
import { enrichThinIntroPageBody, takeLeadingParagraphs, allocateParagraphsAcrossPages, markParagraphKeys, isThinPlaceholderBody, stripIntroSectionLead, dedupeBodyAgainstUsed } from './landmarkIntroSectionLabels';
import { splitIntroBodyForMidHero } from './landmarkTextUtils';
import { normalizeLandmarkStoryProse } from './landmarkStoryProse';

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
 * Пріоритет: photoUri (реальне фото) → photoAsset → heroThumb → каталог lm.
 * Ніколи не віддаємо generic t1, якщо є URI на сторінці.
 */
export function resolveLandmarkHeroPhotoSource({ photoAsset, photoUri, heroThumb, lm } = {}) {
  const remoteUri = remotePhotoUriOnly(photoUri);
  if (remoteUri) return { uri: remoteUri };
  const localUri = localPhotoUriOnly(photoUri);
  if (localUri) return { uri: localUri };

  const bundledAsset = normalizeBundledPhotoAsset(photoAsset);
  if (typeof bundledAsset === 'number') return bundledAsset;

  const thumbRef = typeof heroThumb === 'string' ? heroThumb.trim() : '';
  // Maidan/Lavra/Sophia bundled thumbs only for those landmarks — never leak onto AI imports
  const lmId = String(lm?.id || '').trim();
  const isBuiltinKyiv =
    lmId === 'maidan' || lmId === 'sophia' || lmId === 'lavra' || lmId === 'khanenko_museum';
  if (thumbRef && (isBuiltinKyiv || !/^(maidan|sophia|lavra|khanenko)/i.test(thumbRef))) {
    const fromRef = resolveHeroThumbRef(thumbRef);
    if (typeof fromRef === 'number') {
      // Skip generic hikers placeholder when landmark has a real thumb URI
      if (fromRef === HERO_THUMB_MAP.t1) {
        const fromLmUri = resolveHomeLandmarkThumbSource(lm);
        if (fromLmUri && typeof fromLmUri === 'object' && fromLmUri.uri) return fromLmUri;
      } else {
        return fromRef;
      }
    }
  }

  const fromLandmark = lm ? resolveLandmarkHeroPhotoSourceFromLandmark(lm) : null;
  if (fromLandmark && fromLandmark !== HERO_THUMB_MAP.t1) return fromLandmark;

  const fromLmUri = lm ? resolveHomeLandmarkThumbSource(lm) : null;
  if (fromLmUri && typeof fromLmUri === 'object' && fromLmUri.uri) return fromLmUri;
  if (typeof fromLmUri === 'number' && fromLmUri !== HERO_THUMB_MAP.t1) return fromLmUri;

  return null;
}

/**
 * Normalize Wikimedia URLs so thumb/full of the same file count as one photo.
 * e.g. .../thumb/e/e7/Foo.jpg/1280px-Foo.jpg  ≈  .../e/e7/Foo.jpg
 */
export function landmarkPhotoIdentityKey(uri) {
  const raw = typeof uri === 'string' ? uri.trim() : '';
  if (!raw) return '';
  try {
    const u = new URL(raw);
    let path = decodeURIComponent(u.pathname);
    // /wikipedia/commons/thumb/a/ab/Name.jpg/1280px-Name.jpg → Name.jpg
    const thumb = path.match(/\/wikipedia\/commons\/thumb\/.\/..\/([^/]+)\/[^/]+$/i);
    if (thumb) return thumb[1].toLowerCase();
    // /wikipedia/commons/a/ab/Name.jpg → Name.jpg
    const full = path.match(/\/wikipedia\/commons\/.\/..\/([^/]+)$/i);
    if (full) return full[1].toLowerCase();
    return path.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

/** Реальні URI фото локації (без generic t1 / asset-only). */
export function collectLandmarkRemotePhotoUris(lm) {
  const out = [];
  const seenKeys = new Set();
  const pushUri = (u) => {
    const s = typeof u === 'string' ? resolveOfflineUriSync(u.trim()) : '';
    if (!s || !/^(https?:\/\/|file:\/\/)/i.test(s)) return;
    const key = landmarkPhotoIdentityKey(s) || s;
    if (seenKeys.has(key) || out.includes(s)) return;
    seenKeys.add(key);
    out.push(s);
  };
  if (!lm || typeof lm !== 'object') return out;
  pushUri(lm.thumbUri);
  if (Array.isArray(lm.galleryUris)) lm.galleryUris.forEach(pushUri);
  if (Array.isArray(lm.photos)) {
    lm.photos.forEach((p) => {
      if (typeof p === 'string') pushUri(p);
      else if (p && typeof p === 'object') {
        pushUri(p.uri || p.url || p.photoUri || p.src);
      }
    });
  }
  if (Array.isArray(lm.extraPhotos)) {
    lm.extraPhotos.forEach((p) => {
      if (typeof p === 'string') pushUri(p);
      else if (p && typeof p === 'object') pushUri(p.uri || p.url || p.photoUri);
    });
  }
  pushUri(lm.story?.introPage1PhotoUri);
  const storyPages = lm.story?.introPagesUk || lm.story?.introPagesEn;
  if (Array.isArray(storyPages)) {
    storyPages.forEach((p) => {
      pushUri(p?.photoUri);
      pushUri(p?.compareAfterUri);
      pushUri(p?.compareBeforeUri);
      pushUri(p?.secondaryPhotoUri);
      pushUri(p?.tertiaryPhotoUri);
    });
  }
  // Also collect from the other language pack when present
  if (Array.isArray(lm.story?.introPagesUk) && Array.isArray(lm.story?.introPagesEn)) {
    lm.story.introPagesEn.forEach((p) => {
      pushUri(p?.photoUri);
      pushUri(p?.compareAfterUri);
      pushUri(p?.compareBeforeUri);
    });
  }
  pushUri(lm.story?.photoFact?.bgUri);
  pushUri(lm.story?.secondFact?.bgUri);
  pushUri(lm.story?.beforeAfter?.oldUri);
  pushUri(lm.story?.beforeAfter?.newUri);
  pushUri(lm.story?.compareAfterUri);
  pushUri(lm.story?.compareBeforeUri);
  return out;
}

/**
 * Assign a unique remote photo for each slot. Prefers unused URIs from `pool`.
 * Treats Commons thumb/full of the same file as the same photo.
 * Only reuses when the gallery is exhausted (then cycles).
 */
export function pickUniquePhotoUri(preferred, pool, used) {
  const usedSet = used instanceof Set ? used : new Set();
  const isUsed = (s) => {
    if (!s) return true;
    if (usedSet.has(s)) return true;
    const key = landmarkPhotoIdentityKey(s);
    if (!key) return false;
    for (const u of usedSet) {
      if (landmarkPhotoIdentityKey(u) === key) return true;
    }
    return false;
  };
  const markUsed = (s) => {
    if (!s) return;
    usedSet.add(s);
  };
  const tryOne = (raw) => {
    const s = typeof raw === 'string' ? resolveOfflineUriSync(raw.trim()) : '';
    if (!s || !/^(https?:\/\/|file:\/\/)/i.test(s)) return '';
    if (isUsed(s)) return '';
    markUsed(s);
    return s;
  };
  const fromPreferred = tryOne(preferred);
  if (fromPreferred) return fromPreferred;
  const list = Array.isArray(pool) ? pool : [];
  for (let i = 0; i < list.length; i += 1) {
    const hit = tryOne(list[i]);
    if (hit) return hit;
  }
  // Exhausted — cycle so every page still has a photo
  for (let i = 0; i < list.length; i += 1) {
    const s = typeof list[i] === 'string' ? resolveOfflineUriSync(list[i].trim()) : '';
    if (s && /^(https?:\/\/|file:\/\/)/i.test(s)) {
      markUsed(s);
      return s;
    }
  }
  return '';
}

/**
 * Фото для фінальної (actions) сторінки: лише реальна локація, без hikers t1.
 */
export function resolveActionsHeroPhotoSource({ photoAsset, photoUri, heroThumb, lm } = {}) {
  const primary = resolveLandmarkHeroPhotoSource({ photoAsset, photoUri, heroThumb, lm });
  if (primary && primary !== HERO_THUMB_MAP.t1) return primary;
  const uris = collectLandmarkRemotePhotoUris(lm);
  if (uris.length) return { uri: uris[0] };
  if (primary && primary !== HERO_THUMB_MAP.t1) return primary;
  return null;
}

export function formatLandmarkAddressLine({
  street,
  cityName,
  countryName,
  language,
} = {}) {
  const streetPart = String(street || '').trim();
  const city = String(cityName || '').trim();
  const country = String(countryName || '').trim();
  const place = [city, country].filter(Boolean).join(', ');
  if (streetPart && place) return `${place} · ${streetPart}`;
  if (streetPart) return streetPart;
  return place;
}

export function resolveLandmarkStreetAddress(lm, language) {
  if (!lm || typeof lm !== 'object') return '';
  const langUk = appLangBase(language) === 'uk';
  const primary = langUk
    ? String(lm.address || lm.addressUk || lm.addressEn || '').trim()
    : String(lm.addressEn || lm.address || lm.addressUk || '').trim();
  return primary;
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
  const gallery = collectLandmarkRemotePhotoUris(lm);
  const usedPhotoUris = new Set();
  const usedFactKeys = new Set();
  const noteFact = (t) => {
    String(t || '')
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 96))
      .filter((k) => k.length > 36)
      .forEach((k) => usedFactKeys.add(k));
  };
  const factIsNew = (t) => {
    const parts = String(t || '')
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (!parts.length) return false;
    return parts.every((p) => {
      const k = p.toLowerCase().slice(0, 96);
      if (usedFactKeys.has(k)) return false;
      for (const u of usedFactKeys) {
        if (u.length > 36 && (k.startsWith(u) || u.startsWith(k) || k.includes(u.slice(0, 48)))) {
          return false;
        }
      }
      return true;
    });
  };
  // Reserve cover + intro page photos so post-quiz slides stay different
  const cover =
    resolveOfflineUriSync(String(story.introPage1PhotoUri || lm?.thumbUri || '').trim()) || '';
  if (cover && /^(https?:\/\/|file:\/\/)/i.test(cover)) usedPhotoUris.add(cover);
  noteFact(story.introPage1Uk);
  noteFact(story.introPage1En);
  [story.introPagesUk, story.introPagesEn].filter(Array.isArray).forEach((pages) => {
    pages.forEach((p) => {
      noteFact(p?.body);
      noteFact(p?.bodyAfterHero);
      const u = resolveOfflineUriSync(String(p?.photoUri || '').trim());
      if (u && /^(https?:\/\/|file:\/\/)/i.test(u)) usedPhotoUris.add(u);
      const before = resolveOfflineUriSync(String(p?.compareBeforeUri || '').trim());
      const after = resolveOfflineUriSync(String(p?.compareAfterUri || '').trim());
      if (before && /^(https?:\/\/|file:\/\/)/i.test(before)) usedPhotoUris.add(before);
      if (after && /^(https?:\/\/|file:\/\/)/i.test(after)) usedPhotoUris.add(after);
    });
  });
  const pickPhoto = (preferred) => pickUniquePhotoUri(preferred, gallery, usedPhotoUris);

  if (story.photoFact?.bgUri || story.photoFact?.bodyUk || story.photoFact?.bodyEn) {
    const bodyUk = String(story.photoFact.bodyUk || '').trim();
    const bodyEn = String(story.photoFact.bodyEn || '').trim();
    if ((bodyUk || bodyEn || story.photoFact.bodyI18n) && (factIsNew(bodyUk) || factIsNew(bodyEn))) {
      noteFact(bodyUk);
      noteFact(bodyEn);
      slides.push({
        id: 'story-photo-fact',
        photoUri: pickPhoto(story.photoFact.bgUri),
        titleUk: String(story.photoFact.titleUk || '').trim(),
        titleEn: String(story.photoFact.titleEn || '').trim(),
        factUk: bodyUk,
        factEn: bodyEn,
        factLayout: 'overlay',
        ...(story.photoFact.titleI18n && typeof story.photoFact.titleI18n === 'object'
          ? { titleI18n: story.photoFact.titleI18n }
          : {}),
        ...(story.photoFact.bodyI18n && typeof story.photoFact.bodyI18n === 'object'
          ? { factI18n: story.photoFact.bodyI18n }
          : {}),
      });
    }
  }

  // Skip duplicate then/now after quiz when intro page 3 already has the compare slider
  const introHasCompare = [story.introPagesUk, story.introPagesEn]
    .filter(Array.isArray)
    .some((pages) =>
      pages.some(
        (p) =>
          p &&
          p.compareBeforeUri &&
          p.compareAfterUri &&
          String(p.compareBeforeUri).trim() &&
          String(p.compareAfterUri).trim() &&
          String(p.compareBeforeUri).trim() !== String(p.compareAfterUri).trim(),
      ),
    );

  if (
    !introHasCompare &&
    (story.beforeAfter?.newUri || story.beforeAfter?.oldUri) &&
    story.beforeAfter?.newUri !== story.beforeAfter?.oldUri
  ) {
    const after = pickPhoto(story.beforeAfter.newUri || story.beforeAfter.oldUri);
    const before =
      pickUniquePhotoUri(story.beforeAfter.oldUri, gallery, usedPhotoUris) || after;
    slides.push({
      id: 'story-before-after',
      photoUri: after,
      beforePhotoUri: before,
      afterPhotoUri: after,
      titleUk: 'Тоді і зараз',
      titleEn: 'Then and now',
      factUk: 'Потягніть слайдер: знизу — історичний вигляд, зверху — сучасний.',
      factEn: 'Drag the slider: historic view below, modern view on top.',
    });
  }

  // Closing wow-fact only — never a bibliography slide (sources live on the final «Джерела» button).
  const fact2Uk = String(story.secondFact?.bodyUk || '').trim();
  const fact2En = String(story.secondFact?.bodyEn || '').trim();
  const fact2TitleUk = String(story.secondFact?.titleUk || '').trim();
  const fact2TitleEn = String(story.secondFact?.titleEn || '').trim();
  const looksLikeSourcesBib =
    /джерел|sources?\s+and\s+context|^sources$/i.test(`${fact2TitleUk} ${fact2TitleEn}`) ||
    /матеріал зібрано з відкритих|collected from public sources|wikipedia\s*\(/i.test(
      `${fact2Uk}\n${fact2En}`,
    );
  if (
    !looksLikeSourcesBib &&
    (fact2Uk || fact2En || story.secondFact?.bodyI18n) &&
    (factIsNew(fact2Uk) || factIsNew(fact2En))
  ) {
    noteFact(fact2Uk);
    noteFact(fact2En);
    slides.push({
      id: 'story-wow-fact',
      photoUri: pickPhoto(
        story.secondFact?.bgUri || story.beforeAfter?.newUri || story.photoFact?.bgUri,
      ),
      titleUk: fact2TitleUk || 'Цікаво знати',
      titleEn: fact2TitleEn || 'Did you know?',
      factUk: fact2Uk,
      factEn: fact2En,
      // Different from the previous «Цікаво знати» overlay card
      factLayout: 'sheet',
      ...(story.secondFact?.titleI18n && typeof story.secondFact.titleI18n === 'object'
        ? { titleI18n: story.secondFact.titleI18n }
        : {}),
      ...(story.secondFact?.bodyI18n && typeof story.secondFact.bodyI18n === 'object'
        ? { factI18n: story.secondFact.bodyI18n }
        : {}),
    });
  }

  return slides.length > 0 ? slides : undefined;
}

function friendlySourceLabel(url) {
  try {
    const u = new URL(String(url || '').trim());
    const host = u.hostname.replace(/^www\./, '');
    if (/wikipedia\.org$/i.test(host)) {
      const lang = host.split('.')[0] || 'en';
      const title = decodeURIComponent(u.pathname.replace(/^\/wiki\//, '').replace(/_/g, ' '));
      const short = title.length > 42 ? `${title.slice(0, 40)}…` : title;
      return short ? `Wikipedia (${lang.toUpperCase()}): ${short}` : `Wikipedia (${lang.toUpperCase()})`;
    }
    if (/wikimedia|commons/i.test(host)) return 'Wikimedia Commons';
    if (/wikidata/i.test(host)) return 'Wikidata';
    if (/openstreetmap|nominatim/i.test(host)) return 'OpenStreetMap';
    return host;
  } catch {
    return '';
  }
}

export { friendlySourceLabel };

function introContext(region, lm) {
  return {
    regionId: String(region?.id || '').trim(),
    landmarkId: String(lm?.id || '').trim(),
    region,
  };
}

function localizedStoryQuiz(lm, language, region) {
  const raw = lm?.story;
  if (!raw || typeof raw !== 'object') return undefined;
  const ctx = introContext(region, lm);
  const quiz = resolveIntroStoryQuiz(raw, language, ctx) || normalizeLandmarkStory(raw).quiz;
  if (!hasPlayableStoryQuiz(quiz)) return undefined;
  return ensureThreeQuizQuestions(quiz, {
    titleUk: resolveCatalogLandmarkTitle(lm, 'uk', ctx),
    titleEn: resolveCatalogLandmarkTitle(lm, 'en', ctx),
    textUk: [
      raw.introPage1Uk,
      ...(Array.isArray(raw.introPagesUk) ? raw.introPagesUk.map((p) => p?.body) : []),
      raw.shortIntroUk,
      raw.audioScriptUk,
    ]
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .join('\n'),
    textEn: [
      raw.introPage1En,
      ...(Array.isArray(raw.introPagesEn) ? raw.introPagesEn.map((p) => p?.body) : []),
      raw.shortIntroEn,
      raw.audioScriptEn,
    ]
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .join('\n'),
  });
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
  const wikipediaUrl = story?.wikipediaUrl || '';
  const sourceUrls = Array.isArray(story?.sourceUrls)
    ? story.sourceUrls.map((u) => String(u || '').trim()).filter((u) => /^https?:\/\//i.test(u))
    : [];
  const audioScriptUk = story?.ttsEnabled ? String(story.audioScriptUk || '').trim() : '';
  const audioScriptEn = story?.ttsEnabled ? String(story.audioScriptEn || '').trim() : '';
  const introContinuationUk =
    typeof rawStory?.introContinuationUk === 'string' ? rawStory.introContinuationUk.trim() : '';
  const introContinuationEn =
    typeof rawStory?.introContinuationEn === 'string' ? rawStory.introContinuationEn.trim() : '';
  const introPagesRaw = introPagesFromStory(rawStory, language, ctx);
  const introPagesUk = introPagesFromStory(rawStory, 'uk', ctx);
  const introPagesEn = introPagesFromStory(rawStory, 'en', ctx);
  const galleryForIntro = collectLandmarkRemotePhotoUris(lm);
  const usedForIntro = new Set();
  const reserve = (u) => {
    const s = typeof u === 'string' ? resolveOfflineUriSync(u.trim()) : '';
    if (s && /^(https?:\/\/|file:\/\/)/i.test(s)) usedForIntro.add(s);
  };
  reserve(photoUri);
  reserve(lm?.thumbUri);
  reserve(rawStory?.introPage1PhotoUri);
  const introPages = Array.isArray(introPagesRaw)
    ? introPagesRaw.map((page) => {
        if (!page || typeof page !== 'object') return page;
        if (page.compareBeforeUri && page.compareAfterUri) {
          reserve(page.compareBeforeUri);
          reserve(page.compareAfterUri);
          return page;
        }
        if (page.introNoHero) return page;
        const preferred = typeof page.photoUri === 'string' ? page.photoUri.trim() : '';
        const next = pickUniquePhotoUri(preferred, galleryForIntro, usedForIntro);
        if (!next) return page;
        return page.photoUri === next ? page : { ...page, photoUri: next };
      })
    : introPagesRaw;
  const visitAddress = resolveLandmarkStreetAddress(lm, language);
  return {
    title,
    headerTitle,
    ...(visitLandmarkSave ? { visitLandmarkSave } : {}),
    ...(visitLat != null && visitLng != null ? { visitLat, visitLng } : {}),
    ...(heroThumb ? { heroThumb } : {}),
    ...(photoAsset ? { photoAsset } : {}),
    ...(photoUri ? { photoUri } : {}),
    ...(visitAddress ? { visitAddress } : {}),
    ...(user && (user.id || user.firebaseUid) ? { user } : {}),
    ...(storyQuiz ? { storyQuiz } : {}),
    ...(factSlides ? { factSlides } : {}),
    ...(audioScriptUk ? { audioScriptUk } : {}),
    ...(audioScriptEn ? { audioScriptEn } : {}),
    ...(introPages ? { introPages } : {}),
    ...(introContinuationUk && !introPagesUk ? { introContinuation: introContinuationUk } : {}),
    ...(introContinuationEn && !introPagesEn ? { introContinuationEn } : {}),
    ...(wikipediaUrl ? { wikipediaUrl } : {}),
    ...(sourceUrls.length ? { sourceUrls } : {}),
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
  const introPage1 = resolveIntroStoryField(rawStory, 'introPage1', language, ctx);
  const introContinuationUk =
    typeof rawStory?.introContinuationUk === 'string' ? rawStory.introContinuationUk.trim() : '';
  const introContinuationEn =
    typeof rawStory?.introContinuationEn === 'string' ? rawStory.introContinuationEn.trim() : '';
  const panelTagline = resolveIntroStoryField(rawStory, 'shortIntro', language, ctx);
  const miniExtract = resolveIntroStoryField(rawStory, 'miniPreview', language, ctx);
  const title = resolveCatalogLandmarkTitle(lm, language, ctx);
  const descFallback = langUk ? lm.descUk : lm.descEn || lm.descUk;
  const audioFallback = langUk
    ? String(rawStory?.audioScriptUk || '').trim()
    : String(rawStory?.audioScriptEn || rawStory?.audioScriptUk || '').trim();
  const usedKeys = new Set();
  const extract = takeLeadingParagraphs(
    normalizeLandmarkStoryProse(
      composeRichLandmarkIntroPage1({
        introPage1: introPage1 || '',
        shortIntro: panelTagline,
        desc: descFallback,
        title,
        usedKeys,
      }) ||
        String(descFallback || '').trim() ||
        '',
    ),
    3,
  );
  const introPagesRaw = introPagesFromStory(rawStory, language, ctx);
  const pagesTextPool = Array.isArray(introPagesRaw)
    ? introPagesRaw
        .map((p) => [p?.body, p?.bodyAfterHero].filter(Boolean).join('\n\n'))
        .filter(Boolean)
        .join('\n\n')
    : '';
  // Shared factual pool for thin slides — never invent; only redistribute sourced text
  const fillPool = [descFallback, audioFallback, pagesTextPool].filter(Boolean).join('\n\n');
  const allocated = allocateParagraphsAcrossPages(
    fillPool,
    Array.isArray(introPagesRaw) ? introPagesRaw.length : 0,
    { parasPerPage: 3, skipLeading: 3 },
  );
  const introPages = Array.isArray(introPagesRaw)
    ? introPagesRaw.map((page, pageIndex) => {
        if (!page || typeof page !== 'object') return page;
        const pageBodyRaw = typeof page.body === 'string' ? page.body.trim() : '';
        const pageIsThin = isThinPlaceholderBody(pageBodyRaw);
        const allocatedBody = allocated[pageIndex] || '';
        const allocatedParas = allocatedBody
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean).length;
        let uniqueRich = !pageIsThin ? dedupeBodyAgainstUsed(pageBodyRaw, usedKeys) : '';
        if (!pageIsThin && !uniqueRich) {
          uniqueRich = enrichThinIntroPageBody('', fillPool, {
            pageIndex,
            minChars: 420,
            minParas: 2,
            maxParas: 3,
            usedKeys,
          });
        }
        let body = normalizeLandmarkStoryProse(
          uniqueRich
            ? uniqueRich
            : allocatedParas >= 2
              ? (() => {
                  const d = dedupeBodyAgainstUsed(allocatedBody, usedKeys);
                  return (
                    d ||
                    enrichThinIntroPageBody(pageBodyRaw, fillPool, {
                      pageIndex,
                      minChars: 420,
                      minParas: 3,
                      maxParas: 3,
                      usedKeys,
                    })
                  );
                })()
              : enrichThinIntroPageBody(pageBodyRaw, fillPool, {
                  pageIndex,
                  minChars: 420,
                  minParas: 3,
                  maxParas: 3,
                  usedKeys,
                }),
        );
        if (body) markParagraphKeys(usedKeys, body);
        let bodyAfterHero =
          typeof page.bodyAfterHero === 'string' && page.bodyAfterHero.trim()
            ? normalizeLandmarkStoryProse(
                enrichThinIntroPageBody(page.bodyAfterHero, fillPool, {
                  pageIndex,
                  minChars: 280,
                  minParas: 2,
                  maxParas: 3,
                  usedKeys,
                }),
              )
            : '';
        // Mid-hero only when there is enough text to keep 2+ paras under the photo
        const totalParas = `${body}\n\n${bodyAfterHero}`
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean).length;
        if ((page.introHeroAfterText || bodyAfterHero) && totalParas >= 4) {
          const mid = splitIntroBodyForMidHero(body, bodyAfterHero, {
            maxLeadParas: 1,
            maxLeadChars: 280,
          });
          body = mid.body;
          bodyAfterHero = mid.bodyAfterHero;
        }
        return {
          ...page,
          ...(body ? { body } : {}),
          ...(bodyAfterHero ? { bodyAfterHero, introHeroAfterText: true } : {}),
        };
      })
    : introPagesRaw;

  // Unique remote photo per intro page (cover reserved for page 1 / thumb)
  const galleryPool = collectLandmarkRemotePhotoUris(lm);
  const usedIntroPhotos = new Set();
  const reserveIntro = (u) => {
    const s = typeof u === 'string' ? resolveOfflineUriSync(u.trim()) : '';
    if (s && /^(https?:\/\/|file:\/\/)/i.test(s)) usedIntroPhotos.add(s);
  };
  reserveIntro(lm?.thumbUri);
  reserveIntro(rawStory?.introPage1PhotoUri);
  const introPagesUnique = Array.isArray(introPages)
    ? introPages.map((page) => {
        if (!page || typeof page !== 'object') return page;
        if (page.compareBeforeUri && page.compareAfterUri) {
          reserveIntro(page.compareBeforeUri);
          reserveIntro(page.compareAfterUri);
          return page;
        }
        if (page.introNoHero) return page;
        const preferred = typeof page.photoUri === 'string' ? page.photoUri.trim() : '';
        const next = pickUniquePhotoUri(preferred, galleryPool, usedIntroPhotos);
        if (!next) return page;
        return page.photoUri === next ? page : { ...page, photoUri: next };
      })
    : introPages;
  const introContinuation =
    !introPages && (langUk ? introContinuationUk : introContinuationEn)
      ? langUk
        ? introContinuationUk
        : introContinuationEn
      : '';
  const rawAudio = typeof lm?.story?.audioUri === 'string' ? lm.story.audioUri.trim() : '';
  const resolvedAudio = rawAudio ? resolveOfflineUriSync(rawAudio) : '';
  const audioGuideUrl =
    resolvedAudio &&
    (/^https?:\/\//i.test(resolvedAudio) || resolvedAudio.startsWith('file://'))
      ? resolvedAudio
      : undefined;

  const flag = typeof region?.flag === 'string' ? region.flag : '';
  const subtitle = `${flag} ${cityName}`.trim();

  const normPreview = (s) =>
    String(s || '')
      .replace(/\*\*/g, '')
      .replace(/[_`]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const samePreview = (a, b) => {
    const na = normPreview(a);
    const nb = normPreview(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.length >= 28 && (nb.startsWith(na) || na.startsWith(nb))) return true;
    if (nb.length >= 28 && (na.startsWith(nb) || nb.startsWith(na))) return true;
    // Near-duplicate catalog blurbs (one slightly longer)
    if (na.length >= 40 && nb.length >= 40) {
      const shorter = na.length <= nb.length ? na : nb;
      const longer = na.length > nb.length ? na : nb;
      if (longer.includes(shorter.slice(0, Math.min(48, shorter.length)))) return true;
    }
    return false;
  };
  // Home card: one text block only — never show shortIntro + miniPreview when they match
  let homeTagline = panelTagline || '';
  let homeBody = miniExtract || '';
  if (samePreview(homeTagline, homeBody)) homeTagline = '';
  if (!homeBody && homeTagline) {
    homeBody = homeTagline;
    homeTagline = '';
  }

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
    ...(homeTagline ? { panelTagline: homeTagline } : {}),
    ...(homeBody
      ? { miniExtract: homeBody, previewBodyLines: lm.id === 'lavra' ? 3 : 4 }
      : {}),
    subtitle,
    extract,
    source: 'sourceDemo',
    startPhase: 'home',
    ...(introPagesUnique ? { introPages: introPagesUnique } : {}),
    ...(introContinuation ? { introContinuation } : {}),
    visitCity: cityName,
    visitCategory: dominantVisitCategoryFromLandmark(lm),
    ...(countryId ? { countryId } : {}),
    ...(audioGuideUrl ? { audioGuideUrl } : {}),
  };
}
