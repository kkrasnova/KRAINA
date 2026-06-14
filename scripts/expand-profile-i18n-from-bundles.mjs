

import fs from 'fs';
import path from 'path';

const APP_DIR = path.join(process.cwd(), 'app');
const PROFILE_PATH = path.join(APP_DIR, 'profileI18n.js');

const APP_LANG_IDS = [
  'en',
  'uk',
  'de',
  'pl',
  'nl',
  'es',
  'lt',
  'lv',
  'ro',
  'it',
  'hy',
];

function escapeJsStr(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function parseRowObject(line) {
  const rest = line.slice(line.indexOf('{'));
  const row = {};
  for (const id of APP_LANG_IDS) {
    const re = new RegExp(`\\b${id}:\\s*'((?:\\\\'|[^'])*)'`);
    const m = rest.match(re);
    if (m) row[id] = m[1].replace(/\\'/g, "'");
  }
  return row;
}


function indexBundleFile(absPath, index) {
  const text = fs.readFileSync(absPath, 'utf8');
  const lines = text.split(/\n/);
  let inS = false;
  let brace = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^const S = \{/.test(trimmed)) {
      inS = true;
      brace =
        (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      continue;
    }
    if (!inS) continue;
    brace += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    if (brace <= 0 && line.includes('};')) break;
    const m = trimmed.match(/^([a-zA-Z0-9_]+):\s*\{/);
    if (!m || !trimmed.includes('en:')) continue;
    const row = parseRowObject(line);
    if (Object.keys(row).length < APP_LANG_IDS.length) continue;
    const enVal = row.en;
    if (enVal == null || enVal === '') continue;
    if (!index[enVal]) index[enVal] = { ...row };
  }
}

function parseUkEnLine(line) {
  const t = line.trim();
  const m1 = t.match(
    /^([a-zA-Z0-9_]+):\s*\{\s*uk:\s*'((?:\\'|[^'])*)',\s*en:\s*'((?:\\'|[^'])*)'\s*\},?$/,
  );
  if (m1)
    return {
      key: m1[1],
      uk: m1[2].replace(/\\'/g, "'"),
      en: m1[3].replace(/\\'/g, "'"),
    };
  const m2 = t.match(
    /^([a-zA-Z0-9_]+):\s*\{\s*en:\s*'((?:\\'|[^'])*)',\s*uk:\s*'((?:\\'|[^'])*)'\s*\},?$/,
  );
  if (m2)
    return {
      key: m2[1],
      uk: m2[3].replace(/\\'/g, "'"),
      en: m2[2].replace(/\\'/g, "'"),
    };
  return null;
}

function expandProfile() {
  const index = Object.create(null);
  const bundleFiles = fs
    .readdirSync(APP_DIR)
    .filter((f) => f.endsWith('I18n.js') && f !== 'profileI18n.js')
    .map((f) => path.join(APP_DIR, f));

  for (const f of bundleFiles) {
    try {
      indexBundleFile(f, index);
    } catch (e) {
      console.warn('skip', f, e.message);
    }
  }

  const text = fs.readFileSync(PROFILE_PATH, 'utf8');
  const lines = text.split(/\n/);
  const out = [];
  let fallbackCount = 0;
  let lookupCount = 0;

  for (const line of lines) {
    const parsed = parseUkEnLine(line);
    if (parsed) {
      const { key, uk, en } = parsed;
      const found = index[en];
      const row = {};
      if (found) {
        lookupCount++;
        for (const id of APP_LANG_IDS) {
          if (id === 'uk') row[id] = uk;
          else row[id] = found[id] ?? en;
        }
      } else {
        fallbackCount++;
        for (const id of APP_LANG_IDS) {
          if (id === 'uk') row[id] = uk;
          else row[id] = en;
        }
      }
      const parts = APP_LANG_IDS.map(
        (id) => `${id}: '${escapeJsStr(row[id])}'`,
      );
      const comma = line.trimEnd().endsWith(',') ? ',' : '';
      out.push(`  ${key}: { ${parts.join(', ')} }${comma}`);
      continue;
    }
    out.push(line);
  }

  fs.writeFileSync(PROFILE_PATH, out.join('\n'), 'utf8');
  console.log(
    `profileI18n.js: en lookup hits=${lookupCount}, en-only fallback for rest langs=${fallbackCount} keys`,
  );
  console.log(`index size (unique English strings): ${Object.keys(index).length}`);
}

expandProfile();
