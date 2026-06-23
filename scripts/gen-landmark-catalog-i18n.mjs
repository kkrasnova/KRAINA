import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractLandmarkStories } from './_extractStoriesSource.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ROUTE_PATH = path.join(ROOT, 'app', 'routeRegionsData.js');
const CACHE_PATH = path.join(__dirname, '.landmark-stories-cache.json');
const CATALOG_OUT = path.join(ROOT, 'app', 'landmarkCatalogI18n.js');
const REGIONS_OUT = path.join(ROOT, 'app', 'regionTitlesI18n.js');

const TARGET_LANGS = ['de', 'pl', 'nl', 'es', 'lt', 'lv', 'ro', 'it', 'hy'];
const ALL_LANGS = ['uk', 'en', ...TARGET_LANGS];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(c) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(c), 'utf8');
}

function escapeJsStr(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

async function gtxTranslate(text, tl, cache, stats) {
  const src = String(text || '').trim();
  if (!src) return '';
  const ck = `${tl}::${src}`;
  if (cache[ck]) return cache[ck];
  const q = src.slice(0, 4500);
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await sleep(300 * attempt);
    try {
      const u = new URL('https://translate.googleapis.com/translate_a/single');
      u.searchParams.set('client', 'gtx');
      u.searchParams.set('sl', 'en');
      u.searchParams.set('tl', tl);
      u.searchParams.set('dt', 't');
      u.searchParams.set('q', q);
      stats.requests++;
      const res = await fetch(u);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const bits = Array.isArray(j?.[0])
        ? j[0].map((seg) => (Array.isArray(seg) ? seg[0] : '')).join('')
        : '';
      const out = bits || j?.[0]?.[0]?.[0];
      if (typeof out === 'string' && out.trim()) {
        cache[ck] = out.trim();
        return cache[ck];
      }
    } catch (e) {
      if (attempt === 5) throw e;
    }
    await sleep(250 * (attempt + 1));
  }
  return src;
}

async function fillRow({ uk, en }, cache, stats, offline) {
  const row = { uk: uk || en || '', en: en || uk || '' };
  const src = en || uk || '';
  for (const tl of TARGET_LANGS) {
    if (!src) {
      row[tl] = '';
      continue;
    }
    if (offline) {
      row[tl] = src;
      continue;
    }
    row[tl] = await gtxTranslate(src, tl, cache, stats);
    await sleep(35);
  }
  return row;
}

function emitRow(name, row, indent = '    ') {
  let out = `${indent}${name}: {\n`;
  for (const k of ALL_LANGS) {
    out += `${indent}  ${k}: '${escapeJsStr(row[k] ?? '')}',\n`;
  }
  out += `${indent}},\n`;
  return out;
}

function extractRegionTitles(routeSrc, regionIds) {
  const out = {};
  for (const regionId of regionIds) {
    const re = new RegExp(
      `^\\s{2}${regionId}:\\s*\\{[\\s\\S]*?^\\s{4}titleUk:\\s*'((?:\\\\'|[^'])*)'[\\s\\S]*?^\\s{4}titleEn:\\s*'((?:\\\\'|[^'])*)'`,
      'm',
    );
    const m = re.exec(routeSrc);
    if (m) {
      out[regionId] = {
        uk: m[1].replace(/\\'/g, "'"),
        en: m[2].replace(/\\'/g, "'"),
      };
    }
  }
  return out;
}

async function main() {
  const offline = process.argv.includes('--offline');
  const cache = loadCache();
  const stats = { requests: 0 };
  const routeSrc = fs.readFileSync(ROUTE_PATH, 'utf8');
  const landmarks = extractLandmarkStories(ROUTE_PATH);
  const regionIds = [...new Set(landmarks.map((lm) => lm.regionId))];
  const regionTitles = extractRegionTitles(routeSrc, regionIds);

  const catalog = {};

  for (const [regionId, titles] of Object.entries(regionTitles)) {
    process.stderr.write(`Region ${regionId}\n`);
    regionTitles[regionId] = await fillRow(titles, cache, stats, offline);
    saveCache(cache);
  }

  for (const lm of landmarks) {
    process.stderr.write(`  · ${lm.key}\n`);
    catalog[lm.key] = {
      title: await fillRow({ uk: lm.titleUk, en: lm.titleEn }, cache, stats, offline),
      desc: await fillRow(lm.desc, cache, stats, offline),
    };
    saveCache(cache);
  }

  let catalogBody = 'const LANDMARK_CATALOG_I18N = {\n';
  for (const key of Object.keys(catalog).sort()) {
    catalogBody += `  '${escapeJsStr(key)}': {\n`;
    catalogBody += emitRow('title', catalog[key].title, '    ');
    catalogBody += emitRow('desc', catalog[key].desc, '    ');
    catalogBody += '  },\n';
  }
  catalogBody += '};\n\n';

  let regionsBody = 'const REGION_TITLES_I18N = {\n';
  for (const id of Object.keys(regionTitles).sort()) {
    regionsBody += `  '${escapeJsStr(id)}': {\n`;
    for (const k of ALL_LANGS) {
      regionsBody += `    ${k}: '${escapeJsStr(regionTitles[id][k] ?? '')}',\n`;
    }
    regionsBody += '  },\n';
  }
  regionsBody += '};\n\n';

  const header = `/** Auto-generated — run: node scripts/gen-landmark-catalog-i18n.mjs */\n`;
  const shared = `
import { APP_LANG_IDS } from './appLang';

function ensureRow(row) {
  if (!row || typeof row !== 'object') return row;
  const fb = row.en || row.uk || '';
  const out = { ...row };
  for (const id of APP_LANG_IDS) {
    if (out[id] == null || String(out[id]).trim() === '') out[id] = fb;
  }
  return out;
}
`;

  fs.writeFileSync(
    CATALOG_OUT,
    `${header}${shared}\n${catalogBody}export function landmarkCatalogTitleRow(regionId, landmarkId) {
  const key = String(regionId || '').trim() + ':' + String(landmarkId || '').trim();
  const e = LANDMARK_CATALOG_I18N[key];
  return e?.title ? ensureRow(e.title) : null;
}

export function landmarkCatalogDescRow(regionId, landmarkId) {
  const key = String(regionId || '').trim() + ':' + String(landmarkId || '').trim();
  const e = LANDMARK_CATALOG_I18N[key];
  return e?.desc ? ensureRow(e.desc) : null;
}
`,
    'utf8',
  );

  fs.writeFileSync(
    REGIONS_OUT,
    `${header}${shared}\n${regionsBody}export function regionTitleRow(regionId) {
  const row = REGION_TITLES_I18N[String(regionId || '').trim()];
  return row ? ensureRow(row) : null;
}
`,
    'utf8',
  );

  saveCache(cache);
  process.stderr.write(
    `\nWrote catalog (${Object.keys(catalog).length} landmarks) + regions (${Object.keys(regionTitles).length}), HTTP: ${stats.requests}\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
