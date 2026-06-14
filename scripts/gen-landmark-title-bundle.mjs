

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const OUT_PATH = path.join(ROOT, 'app', 'landmarkTitleBundle.js');
const CACHE_PATH = path.join(ROOT, 'scripts', '.landmark-title-mt-cache.json');
const EXTRA_PATH = path.join(ROOT, 'app', 'extraUkraineLandmarks.js');
const ROUTE_PATH = path.join(ROOT, 'app', 'routeRegionsData.js');
const WORLD_JSON_PATH = path.join(ROOT, 'app', 'worldLocations.json');
const WORLD_CODE_PATH = path.join(ROOT, 'app', 'worldLocationsCode.js');

const TARGET_LANGS = ['de', 'pl', 'nl', 'es', 'lt', 'lv', 'ro', 'it', 'hy'];

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
  fs.writeFileSync(CACHE_PATH, JSON.stringify(c, null, 0), 'utf8');
}

function escapeJsStr(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function mymemoryTranslate(text, to) {
  const pair = `en|${to}`;
  const q = encodeURIComponent(text.slice(0, 480));
  const url = `https://api.mymemory.translated.net/get?q=${q}&langpair=${pair}`;
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) {
      await sleep(2600 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const out = j?.responseData?.translatedText;
    if (!out || typeof out !== 'string') throw new Error(JSON.stringify(j).slice(0, 220));
    return out.replace(/^MYSMEMORY WARNING:[\s\S]*$/m, '').trim();
  }
  throw new Error('429 — too many retries');
}

async function translateEn(cache, text, to, stats) {
  const ck = `${to}::${text}`;
  if (cache[ck] != null && cache[ck] !== '') return cache[ck];
  await sleep(420);
  stats.requests++;
  const tr = await mymemoryTranslate(text, to);
  cache[ck] = tr;
  return tr;
}


function parseQuotedTail(line, field) {
  const idx = line.indexOf(`${field}:`);
  if (idx < 0) return null;
  let j = idx + field.length + 1;
  while (j < line.length && /\s/.test(line[j])) j++;
  const q = line[j];
  if (q !== "'" && q !== '"') return null;
  j++;
  let out = '';
  while (j < line.length) {
    const c = line[j];
    if (c === '\\') {
      j++;
      out += line[j] || '';
      j++;
      continue;
    }
    if (c === q) break;
    out += c;
    j++;
  }
  return out;
}

function extractExtraUa(src) {
  const rows = [];
  for (const line of src.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{') || !t.includes('id:')) continue;
    if (t.startsWith('//')) continue;
    const id = parseQuotedTail(line, 'id');
    const titleUk = parseQuotedTail(line, 'title_uk');
    const titleEn = parseQuotedTail(line, 'title_en');
    if (id && (titleUk || titleEn)) rows.push({ key: id, uk: titleUk || '', en: titleEn || titleUk || '' });
  }
  return rows;
}

function extractRouteLandmarks(src) {
  const lines = src.split('\n');
  const out = [];
  let regionKey = null;
  let inLandmarks = false;
  let curId = null;
  let curUk = null;

  for (const line of lines) {
    const tr = line.match(/^  (\w+): \{$/);
    if (tr) {
      regionKey = tr[1];
      inLandmarks = false;
      curId = null;
      curUk = null;
      continue;
    }
    if (/^    landmarks: \[$/.test(line)) {
      inLandmarks = true;
      curId = null;
      curUk = null;
      continue;
    }
    if (inLandmarks && /^    \],/.test(line)) {
      inLandmarks = false;
      continue;
    }
    if (!inLandmarks || !regionKey) continue;

    const idm = line.match(/^        id: '([^']+)',?\s*$/);
    if (idm) {
      curId = idm[1];
      curUk = null;
      continue;
    }
    const tuk = line.match(/^        titleUk:/);
    if (tuk && curId) {
      curUk = parseQuotedTail(line, 'titleUk');
      continue;
    }
    const ten = line.match(/^        titleEn:/);
    if (ten && curId) {
      const en = parseQuotedTail(line, 'titleEn');
      const uk = curUk || '';
      if (en && regionKey && curId) out.push({ key: `${regionKey}:${curId}`, uk, en });
      curId = null;
      curUk = null;
    }
  }
  return out;
}

function extractWorldJson(path) {
  const raw = fs.readFileSync(path, 'utf8');
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => x && x.id)
    .map((x) => ({
      key: String(x.id),
      uk: String(x.title_uk || '').trim(),
      en: String(x.title_en || x.title || '').trim(),
    }))
    .filter((x) => x.en || x.uk);
}

function extractWorldCode(src) {
  const i = src.indexOf('export const WORLD_LOCATIONS_CODE');
  if (i < 0) return [];
  const block = src.slice(i);
  const id = parseQuotedTail(block, 'id');
  const titleUk = parseQuotedTail(block, 'title_uk');
  const titleEn = parseQuotedTail(block, 'title_en');
  if (!id || (!titleUk && !titleEn)) return [];
  return [{ key: id, uk: titleUk || '', en: titleEn || titleUk || '' }];
}

async function main() {
  const offline = process.argv.includes('
  const cache = loadCache();
  const stats = { requests: 0 };

  const extra = extractExtraUa(fs.readFileSync(EXTRA_PATH, 'utf8'));
  const route = extractRouteLandmarks(fs.readFileSync(ROUTE_PATH, 'utf8'));
  const worldJ = extractWorldJson(WORLD_JSON_PATH);
  const worldC = extractWorldCode(fs.readFileSync(WORLD_CODE_PATH, 'utf8'));

  const merged = [...extra, ...route, ...worldJ, ...worldC];
  const byKey = new Map();
  for (const r of merged) {
    if (!r.key) continue;
    const en = String(r.en || '').trim();
    const uk = String(r.uk || '').trim();
    if (!en && !uk) continue;
    byKey.set(r.key, { uk: uk || en, en: en || uk });
  }

  const bundle = {};
  const keys = [...byKey.keys()].sort();
  let i = 0;
  for (const key of keys) {
    const { uk, en } = byKey.get(key);
    const srcEn = en || uk;
    process.stderr.write(`\r${++i}/${keys.length} ${key.slice(0, 52).padEnd(52)}`);
    const row = { uk: uk || en, en: srcEn };
    for (const to of TARGET_LANGS) {
      if (offline) {
        row[to] = srcEn;
      } else {
        row[to] = await translateEn(cache, srcEn, to, stats);
      }
    }
    bundle[key] = row;
  }

  if (!offline) saveCache(cache);
  process.stderr.write(
    offline ? `\ndone (
  );

  let js =
    '\nexport const LANDMARK_TITLE_I18N = {\n';

  for (const key of keys) {
    const row = bundle[key];
    js += `  '${escapeJsStr(key)}': {\n`;
    js += `    uk: '${escapeJsStr(row.uk)}',\n`;
    js += `    en: '${escapeJsStr(row.en)}',\n`;
    for (const to of TARGET_LANGS) {
      js += `    ${to}: '${escapeJsStr(row[to])}',\n`;
    }
    js += '  },\n';
  }
  js += '};\n';
  fs.writeFileSync(OUT_PATH, js, 'utf8');
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
