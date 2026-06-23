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

export function resolveLandmarkDescI18n(lm, language, context = {}) {
  const lang = appLangBase(language);
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
  const fromIntro = resolveLandmarkTitleI18n(lm, language, context);
  if (fromIntro) return fromIntro;
  const { regionId, landmarkId } = context;
  const catalog = landmarkCatalogTitleRow(regionId, landmarkId);
  if (catalog) {
    const t = pickI18n(appLangBase(language), catalog);
    if (t) return t;
  }
  const lang = appLangBase(language);
  if (lang === 'uk') return String(lm?.titleUk || lm?.titleEn || '').trim();
  return String(lm?.titleEn || lm?.titleUk || '').trim();
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
