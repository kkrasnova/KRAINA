

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const OUT_PATH = path.join(ROOT, 'app', 'landmarkTitleBundle.js');
const CACHE_PATH = path.join(ROOT, 'scripts', '.landmark-gtx-cache.json');
const EXTRA_PATH = path.join(ROOT, 'app', 'extraUkraineLandmarks.js');
const ROUTE_PATH = path.join(ROOT, 'app', 'routeRegionsData.js');
const WORLD_JSON_PATH = path.join(ROOT, 'app', 'worldLocations.json');
const WORLD_CODE_PATH = path.join(ROOT, 'app', 'worldLocationsCode.js');

const TARGET_LANGS = ['de', 'pl', 'nl', 'es', 'lt', 'lv', 'ro', 'it', 'hy'];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeJsStr(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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

function extractWorldJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
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

async function gtxTranslate(text, tl, cache, stats) {
  const ck = `${tl}::${text}`;
  if (cache[ck] != null && cache[ck] !== '') return cache[ck];

  const q = text.slice(0, 480);

  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt > 0) await sleep(350 * attempt);
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
        const cleaned = out.trim();
        cache[ck] = cleaned;
        return cleaned;
      }
    } catch (e) {
      if (attempt === 7) throw e;
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(`gtx empty for "${text.slice(0, 40)}…" → ${tl}`);
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
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

  const keys = [...byKey.keys()].sort();
  const uniqueEn = new Set();
  for (const key of keys) {
    const { uk, en } = byKey.get(key);
    uniqueEn.add(en || uk);
  }

  process.stderr.write(`Unique EN sources: ${uniqueEn.size} / ${keys.length} keys\n`);

  
  const transByEn = {};
  const uniqArr = [...uniqueEn];
  let uidx = 0;
  for (const srcEn of uniqArr) {
    uidx++;
    process.stderr.write(`\rTranslating unique EN ${uidx}/${uniqArr.length}`.padEnd(60));
    transByEn[srcEn] = {};
    for (const batch of chunk(TARGET_LANGS, 3)) {
      await Promise.all(
        batch.map(async (to) => {
          try {
            transByEn[srcEn][to] = await gtxTranslate(srcEn, to, cache, stats);
          } catch (e) {
            process.stderr.write(`\nWARN ${srcEn.slice(0, 40)} → ${to}: ${e.message}\n`);
            transByEn[srcEn][to] = srcEn;
          }
        }),
      );
      await sleep(80);
    }
    await sleep(100);
  }
  process.stderr.write('\n');

  saveCache(cache);

  const bundle = {};
  for (const key of keys) {
    const { uk, en } = byKey.get(key);
    const srcEn = en || uk;
    const row = {
      uk: uk || en,
      en: srcEn,
    };
    const t = transByEn[srcEn];
    for (const to of TARGET_LANGS) {
      row[to] = (t && t[to]) || srcEn;
    }
    bundle[key] = row;
  }

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
  process.stderr.write(`Wrote ${OUT_PATH} (${stats.requests} HTTP requests)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
