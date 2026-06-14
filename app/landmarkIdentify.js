/**
 * AR-скан пам’ятки (камера + розпізнавання):
 * 1) Google Cloud Vision LANDMARK_DETECTION — якщо задано expo.extra.googleVisionApiKey у app.json
 * 2) Wikipedia за назвою з Vision (кілька спроб формулювання)
 * 3) Найближчі статті Wikipedia за GPS — кілька радіусів пошуку
 * 4) Підзаголовок з координат: зворотне геокодування Nominatim (OSM, безкоштовно)
 *
 * Ключ Vision у клієнті лише для dev/demo — у production краще проксі на бекенді.
 */
import Constants from 'expo-constants';
import { appLangBase } from './appLang';

const UA = {
  'User-Agent': 'KRAÏNA/1.0 (landmark-scanner; https://example.com/contact)',
};

const EXTRACT_MAX = 2200;
const MINI_EXTRACT_MAX = 340;
const WIKI_NEARBY_RADII_M = [1200, 4500, 15000];

function trimExtract(text) {
  if (!text || typeof text !== 'string') return '';
  const s = text.trim();
  if (s.length <= EXTRACT_MAX) return s;
  return `${s.slice(0, EXTRACT_MAX)}…`;
}

/** Короткий уривок для міні-картки після скану (перший абзац / обрізка по словах). */
export function buildMiniExtract(text) {
  const s = (text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= MINI_EXTRACT_MAX) return s;
  const cut = s.lastIndexOf(' ', MINI_EXTRACT_MAX);
  const end = cut > 220 ? cut : MINI_EXTRACT_MAX;
  return `${s.slice(0, end).trim()}…`;
}

function withMiniExtract(result) {
  return { ...result, miniExtract: buildMiniExtract(result.extract) };
}

function makeLandmarkRequestRef() {
  const seg = (max, w) => String(Math.floor(Math.random() * max)).padStart(w, '0');
  return `${seg(10000, 4)}.${seg(100, 2)}.${seg(10000, 4)}.${Math.floor(Math.random() * 10)}.${seg(100, 2)}`;
}

/**
 * Немає статті / розпізнавання — показуємо UI «ще немає в базі».
 * @param {{ latitude?: number | null, longitude?: number | null, visionHintTitle?: string | null }} coordsHint
 */
export function buildNotFoundLandmarkResult(coordsHint = {}) {
  const ref = makeLandmarkRequestRef();
  const lat = typeof coordsHint.latitude === 'number' ? coordsHint.latitude : null;
  const lng = typeof coordsHint.longitude === 'number' ? coordsHint.longitude : null;
  const hint =
    coordsHint.visionHintTitle && String(coordsHint.visionHintTitle).trim()
      ? String(coordsHint.visionHintTitle).trim()
      : null;
  return {
    notFound: true,
    source: 'none',
    requestRef: ref,
    title: ref,
    subtitle: null,
    extract: '',
    miniExtract: '',
    wikipediaUrl: null,
    visionHintTitle: hint,
    latitude: lat,
    longitude: lng,
  };
}

function getVisionKey() {
  const extra = Constants.expoConfig?.extra;
  if (extra && typeof extra.googleVisionApiKey === 'string' && extra.googleVisionApiKey.trim()) {
    return extra.googleVisionApiKey.trim();
  }
  return '';
}

async function visionLandmarkTitle(base64Image) {
  const key = getVisionKey();
  if (!key || !base64Image) return null;
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`;
  const body = {
    requests: [
      {
        image: { content: base64Image },
        features: [{ type: 'LANDMARK_DETECTION', maxResults: 8 }],
      },
    ],
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (json?.responses?.[0]?.error) return null;
  const list = json?.responses?.[0]?.landmarkAnnotations;
  if (!Array.isArray(list) || list.length === 0) return null;
  const best = list.reduce((a, b) => ((b.score || 0) > (a.score || 0) ? b : a));
  return best?.description || null;
}

async function wikiSearchFirstTitle(query, wikiLang) {
  const origin = `https://${wikiLang}.wikipedia.org`;
  const u = `${origin}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json`;
  const res = await fetch(u, { headers: UA });
  if (!res.ok) return null;
  const json = await res.json();
  const t = json?.query?.search?.[0]?.title;
  return t ? { origin, title: t } : null;
}

async function wikiExtractByTitle(origin, title) {
  const u = `${origin}/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(title)}&format=json`;
  const res = await fetch(u, { headers: UA });
  if (!res.ok) return { extract: '', pageTitle: title };
  const json = await res.json();
  const pages = json?.query?.pages;
  const page = pages && Object.values(pages)[0];
  const extract = page?.extract || '';
  const pageTitle = page?.title || title;
  return { extract, pageTitle };
}

function wikiArticleUrl(origin, pageTitle) {
  const host = origin.replace(/^https?:\/\//, '');
  const path = encodeURIComponent(pageTitle.replace(/ /g, '_'));
  return `https://${host}/wiki/${path}`;
}

async function wikipediaFromQuery(query, wikiLang) {
  let found = await wikiSearchFirstTitle(query, wikiLang);
  if (!found && wikiLang !== 'en') {
    found = await wikiSearchFirstTitle(query, 'en');
  }
  if (!found) return null;
  const { extract, pageTitle } = await wikiExtractByTitle(found.origin, found.title);
  if (!extract) return null;
  return {
    source: 'vision_wiki',
    title: pageTitle,
    subtitle: null,
    extract: trimExtract(extract),
    wikipediaUrl: wikiArticleUrl(found.origin, pageTitle),
  };
}

/** Кілька варіантів запиту до Wikipedia після Vision. */
async function wikipediaFromQueryLoose(visionTitle, wikiLang) {
  const raw = String(visionTitle || '').trim();
  if (!raw) return null;
  const variants = [
    raw,
    raw.split(',')[0].trim(),
    raw.split('(')[0].trim(),
    raw.replace(/\s+/g, ' ').slice(0, 80).trim(),
  ];
  const seen = new Set();
  for (const q of variants) {
    if (!q || seen.has(q)) continue;
    seen.add(q);
    let r = await wikipediaFromQuery(q, wikiLang);
    if (r) return r;
    if (wikiLang !== 'en') {
      r = await wikipediaFromQuery(q, 'en');
      if (r) return r;
    }
  }
  return null;
}

function isoToFlagEmoji(iso2) {
  const cc = String(iso2 || '')
    .trim()
    .toUpperCase();
  if (cc.length !== 2 || !/^[A-Z]{2}$/.test(cc)) return '📍';
  const A = 0x1f1e6;
  const c0 = cc.charCodeAt(0) - 65 + A;
  const c1 = cc.charCodeAt(1) - 65 + A;
  return String.fromCodePoint(c0, c1);
}

/** Зворотне геокодування (Nominatim; дотримуйтесь ліміту 1 req/s у масових сценаріях). */
async function nominatimSubtitle(lat, lng, wikiLang) {
  try {
    const al = wikiLang === 'uk' ? 'uk,en' : 'en,uk';
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&accept-language=${encodeURIComponent(al)}`;
    const res = await fetch(u, { headers: UA });
    if (!res.ok) return null;
    const j = await res.json();
    const addr = j.address || {};
    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.hamlet ||
      addr.county ||
      '';
    const country = addr.country || '';
    const flag = isoToFlagEmoji(addr.country_code);
    const parts = [city, country].filter(Boolean);
    if (!parts.length) return null;
    return `${flag} ${parts.join(', ')}`.trim();
  } catch {
    return null;
  }
}

async function enrichWithGeoSubtitle(result, lat, lng, wikiLang) {
  if (!result || result.notFound) return result;
  if (result.subtitle && String(result.subtitle).trim()) return result;
  if (lat == null || lng == null) return result;
  const sub = await nominatimSubtitle(lat, lng, wikiLang);
  if (!sub) return result;
  return { ...result, subtitle: sub };
}

async function wikiNearbyAtRadius(lat, lng, wikiLang, radiusM) {
  const tryLang = async (lang) => {
    const origin = `https://${lang}.wikipedia.org`;
    const u = `${origin}/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lng}&gsradius=${radiusM}&gslimit=12&format=json`;
    const res = await fetch(u, { headers: UA });
    if (!res.ok) return null;
    const json = await res.json();
    const geo = json?.query?.geosearch;
    if (!Array.isArray(geo) || geo.length === 0) return null;
    const first = geo[0];
    const { extract, pageTitle } = await wikiExtractByTitle(origin, first.title);
    if (!extract) return null;
    const distM = typeof first.dist === 'number' ? Math.round(first.dist) : null;
    return {
      source: 'geo_wiki',
      title: pageTitle,
      subtitle:
        distM != null
          ? lang === 'uk'
            ? `~${distM} м від вас · Wikipedia`
            : `~${distM} m away · Wikipedia`
          : 'Wikipedia',
      extract: trimExtract(extract),
      wikipediaUrl: wikiArticleUrl(origin, pageTitle),
    };
  };

  let r = await tryLang(wikiLang);
  if (!r && wikiLang !== 'en') r = await tryLang('en');
  return r;
}

async function wikipediaNearby(lat, lng, wikiLang) {
  for (const r of WIKI_NEARBY_RADII_M) {
    const hit = await wikiNearbyAtRadius(lat, lng, wikiLang, r);
    if (hit) return hit;
  }
  return null;
}

/**
 * @param {{ base64?: string | null, latitude?: number | null, longitude?: number | null, language?: string }} opts
 */
export async function identifyLandmark(opts) {
  const lang = appLangBase(opts.language || 'uk');
  const wikiLang = lang === 'uk' ? 'uk' : 'en';

  const lat = typeof opts.latitude === 'number' ? opts.latitude : null;
  const lng = typeof opts.longitude === 'number' ? opts.longitude : null;

  const base64 = opts.base64 && typeof opts.base64 === 'string' ? opts.base64.replace(/^data:image\/\w+;base64,/, '') : null;

  if (base64 && getVisionKey()) {
    const vTitle = await visionLandmarkTitle(base64);
    if (vTitle) {
      let wiki = await wikipediaFromQueryLoose(vTitle, wikiLang);
      if (wiki) {
        return withMiniExtract(await enrichWithGeoSubtitle(wiki, lat, lng, wikiLang));
      }
      return buildNotFoundLandmarkResult({
        latitude: lat,
        longitude: lng,
        visionHintTitle: vTitle,
      });
    }
  }

  if (lat != null && lng != null) {
    const near = await wikipediaNearby(lat, lng, wikiLang);
    if (near) {
      return withMiniExtract(await enrichWithGeoSubtitle(near, lat, lng, wikiLang));
    }
  }

  return buildNotFoundLandmarkResult({ latitude: lat, longitude: lng });
}
