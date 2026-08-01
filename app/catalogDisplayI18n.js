import { appLangBase } from './appLang';
import { pickI18n } from './i18nBundle';
import {
  getLandmarkIntroI18n,
  resolveLandmarkTitleI18n,
} from './landmarkIntroStoryResolve';
import {
  landmarkCatalogDescRow,
  landmarkCatalogTitleRow,
} from './landmarkCatalogI18n';
import { regionTitleRow } from './regionTitlesI18n';
import { regionTitle as regionTitleLegacy } from './routeRegionsData';

function pickRow(lang, row) {
  return pickI18n(lang, row);
}

/** «Костел (Київ)» / «Church — Kyiv» → лише назва локації. */
export function stripCitySuffixFromLandmarkTitle(title, region) {
  let t = String(title || '').trim();
  if (!t) return '';
  t = t.replace(/\s*[\(（][^)）]{0,48}[\)）]\s*$/u, '').trim();
  const cityNames = [];
  if (region && typeof region === 'object') {
    [region.titleUk, region.titleEn].forEach((n) => {
      const s = String(n || '').trim();
      if (s.length >= 2) cityNames.push(s);
    });
  }
  for (const name of cityNames) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`\\s*[—\\-–,|/]\\s*${esc}\\s*$`, 'iu'), '').trim();
  }
  return t || String(title || '').trim();
}

export function resolveLandmarkDescI18n(lm, language, context = {}) {
  const lang = appLangBase(language);
  if (lm?.descI18n && typeof lm.descI18n === 'object') {
    const t = pickRow(lang, lm.descI18n);
    if (t) return t;
  }
  const { regionId, landmarkId } = context;
  const intro = getLandmarkIntroI18n(regionId, landmarkId);
  if (intro?.desc) {
    const t = pickRow(lang, intro.desc);
    if (t) return t;
  }
  const catalog = landmarkCatalogDescRow(regionId, landmarkId);
  if (catalog) {
    const t = pickRow(lang, catalog);
    if (t) return t;
  }
  if (lang === 'uk') return String(lm?.descUk || lm?.descEn || '').trim();
  return String(lm?.descEn || lm?.descUk || '').trim();
}

export function resolveCatalogLandmarkTitle(lm, language, context = {}) {
  const lang = appLangBase(language);
  let title = '';
  if (lm?.titleI18n && typeof lm.titleI18n === 'object') {
    title = pickI18n(lang, lm.titleI18n) || '';
  }
  if (!title) {
    const fromIntro = resolveLandmarkTitleI18n(lm, language, context);
    if (fromIntro) title = fromIntro;
  }
  if (!title) {
    const { regionId, landmarkId } = context;
    const catalog = landmarkCatalogTitleRow(regionId, landmarkId);
    if (catalog) title = pickI18n(lang, catalog) || '';
  }
  if (!title) {
    title =
      lang === 'uk'
        ? String(lm?.titleUk || lm?.titleEn || '').trim()
        : String(lm?.titleEn || lm?.titleUk || '').trim();
  }
  return stripCitySuffixFromLandmarkTitle(title, context.region);
}

export function resolveCatalogRegionTitle(region, language) {
  const lang = appLangBase(language);
  const id = region?.id;
  const row = id ? regionTitleRow(id) : null;
  if (row) {
    const t = pickRow(lang, row);
    if (t) return t;
  }
  return regionTitleLegacy(region, lang);
}
