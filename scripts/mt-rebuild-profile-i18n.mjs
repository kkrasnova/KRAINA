

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const PROFILE_PATH = path.join(process.cwd(), 'app', 'profileI18n.js');
const CACHE_PATH = path.join(process.cwd(), 'scripts', '.profile-i18n-mt-cache.json');

const TARGET_LANGS = ['de', 'pl', 'nl', 'es', 'lt', 'lv', 'ro', 'it', 'hy'];
const LANG_ORDER = ['uk', 'en', ...TARGET_LANGS];

function escapeJsStr(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function extractQuoted(str, lang) {
  const sq = new RegExp(`\\b${lang}:\\s*'((?:\\\\'|[^'])*)'`);
  const dq = new RegExp(`\\b${lang}:\\s*"((?:\\\\"|[^"])*)"`);
  let m = str.match(sq);
  if (m) return m[1].replace(/\\'/g, "'");
  m = str.match(dq);
  if (m) return m[1].replace(/\\"/g, '"');
  return null;
}


function parseBundleKeys(src) {
  const start = src.indexOf('const S = {');
  if (start < 0) throw new Error('const S = { not found');
  let i = start + 'const S = {'.length;
  const entries = [];
  const len = src.length;
  while (i < len) {
    i = skipNoise(src, i);
    if (/^\s*fillBundleMissingLangs/.test(src.slice(i))) break;
    if (src.slice(i, i + 2) === '};') break;
    const mk = src.slice(i).match(/^([a-zA-Z0-9_]+)\s*:\s*\{/);
    if (!mk) break;
    const key = mk[1];
    i += mk[0].length - 1;
    let depth = 0;
    const objStart = i;
    for (; i < len; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') {
        depth
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    const block = src.slice(objStart, i);
    while (i < len && (src[i] === ',' || /\s/.test(src[i]))) i++;
    entries.push({ key, block });
  }
  return entries;
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}



function indexAfterConstSBlock(src) {
  const m = src.indexOf('const S = ');
  if (m < 0) throw new Error('const S = not found');
  const open = src.indexOf('{', m);
  if (open < 0) throw new Error('const S = { not found');
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth
      if (depth === 0) {
        let j = i + 1;
        while (j < src.length && /\s/.test(src[j])) j++;
        if (src[j] === ';') return j + 1;
        return i + 1;
      }
    }
  }
  throw new Error('unbalanced braces in const S');
}

function skipNoise(src, i) {
  const len = src.length;
  while (i < len) {
    if (/\s/.test(src[i])) {
      i++;
      continue;
    }
    if (src[i] === '/' && src[i + 1] === '/') {
      i += 2;
      while (i < len && src[i] !== '\n') i++;
      continue;
    }
    if (src[i] === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < len - 1 && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    break;
  }
  return i;
}

async function mymemoryTranslate(text, to) {
  const pair = `en|${to}`;
  const q = encodeURIComponent(text.slice(0, 480));
  const url = `https://api.mymemory.translated.net/get?q=${q}&langpair=${pair}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) {
      await sleep(2500 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const out = j?.responseData?.translatedText;
    if (!out || typeof out !== 'string') throw new Error(JSON.stringify(j).slice(0, 200));
    return out.replace(/^MYSMEMORY WARNING:[\s\S]*$/m, '').trim();
  }
  throw new Error('HTTP 429 — too many retries');
}

async function translateEn(text, to, cache, stats) {
  const ck = `${to}::${text}`;
  if (cache[ck] != null && cache[ck] !== '') return cache[ck];
  await sleep(450);
  stats.requests++;
  const tr = await mymemoryTranslate(text, to);
  cache[ck] = tr;
  return tr;
}

async function main() {
  const dry = process.argv.includes('
  const src = fs.readFileSync(PROFILE_PATH, 'utf8');
  const sStart = src.indexOf('const S = {');
  if (sStart < 0) throw new Error('const S = { not found');
  const header = src.slice(0, sStart);
  const afterS = indexAfterConstSBlock(src);
  const footer = src.slice(afterS);
  if (!footer.includes('fillBundleMissingLangs(S)')) {
    throw new Error('expected fillBundleMissingLangs(S) in file tail after const S');
  }

  const parsed = parseBundleKeys(src);
  if (dry) {
    console.log(`Parsed keys: ${parsed.length}`);
    process.exit(0);
  }
  const cache = loadCache();
  const stats = { requests: 0 };

  const lines = ['const S = {'];

  for (const { key, block } of parsed) {
    const inner = block.slice(1, -1).trim();
    const uk = extractQuoted(inner, 'uk');
    const en = extractQuoted(inner, 'en');
    if (uk == null || en == null) {
      console.warn(`skip ${key}: missing uk or en`);
      lines.push(`  ${key}: ${block},`);
      continue;
    }

    const row = { uk, en };
    for (const to of TARGET_LANGS) {
      const had = extractQuoted(inner, to);
      if (had != null && had !== en && had.trim() !== '') {
        row[to] = had;
        continue;
      }
      try {
        row[to] = await translateEn(en, to, cache, stats);
      } catch (e) {
        console.warn(key, to, e.message);
        row[to] = en;
      }
    }

    const parts = LANG_ORDER.map((id) => `${id}: '${escapeJsStr(row[id])}'`);
    lines.push(`  ${key}: { ${parts.join(', ')} },`);
  }

  lines.push('};');
  lines.push('');
  const out = header + lines.join('\n') + footer;
  fs.writeFileSync(PROFILE_PATH, out, 'utf8');
  saveCache(cache);
  console.log(
    `Done. Keys: ${parsed.length}. MT HTTP requests this run: ${stats.requests}. Cache: ${CACHE_PATH}`,
  );
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
