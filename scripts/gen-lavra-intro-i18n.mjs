import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  LAVRA_SHORT_INTRO_UK,
  LAVRA_MINI_PREVIEW_UK,
  LAVRA_INTRO_PAGE1_UK,
  LAVRA_INTRO_PAGE_BODIES_UK,
  LAVRA_PAGE2_ILLUSTRATION_LINK_UK,
  LAVRA_PAGE2_ILLUSTRATION_CAPTION_UK,
} from './lavra-uk-source.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'app', 'landmarkIntroI18n', 'lavra.js');
const CACHE_PATH = path.join(ROOT, 'scripts', '.lavra-intro-i18n-cache.json');

const TARGET_LANGS = ['en', 'de', 'pl', 'nl', 'es', 'lt', 'lv', 'ro', 'it', 'hy'];
const ALL_LANGS = ['uk', ...TARGET_LANGS];

const QUIZ_UK = {
  question: 'У якому році засновано Лавру?',
  multiHint: 'Пам’ятайте рік заснування — він згадується на другому слайді про ченця Антонія.',
  options: [
    { text: '988', correct: false },
    { text: '1051', correct: true },
    { text: '1240', correct: false },
  ],
};

const TITLE_UK = 'Києво-Печерська лавра';
const DESC_UK = 'Монастирський комплекс із печерами та панорамою на Дніпро.';

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
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

async function gtxTranslate(text, tl, cache, stats, sl = 'uk') {
  const ck = `${sl}->${tl}::${text}`;
  if (cache[ck] != null && cache[ck] !== '') return cache[ck];
  const q = text.slice(0, 4500);
  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt > 0) await sleep(350 * attempt);
    try {
      const u = new URL('https://translate.googleapis.com/translate_a/single');
      u.searchParams.set('client', 'gtx');
      u.searchParams.set('sl', sl);
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
        cache[ck] = out;
        return out;
      }
    } catch (e) {
      if (attempt === 7) throw e;
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(`gtx empty for "${text.slice(0, 40)}…" → ${tl}`);
}

async function translateLong(text, tl, cache, stats) {
  const raw = String(text || '');
  if (!raw.trim()) return raw;
  const parts = raw.split(/(\n\n+)/);
  const out = [];
  for (const part of parts) {
    if (!part.trim()) {
      out.push(part);
      continue;
    }
    out.push(await gtxTranslate(part, tl, cache, stats));
    await sleep(60);
  }
  return out.join('');
}

async function fillRow(uk, cache, stats, offline) {
  const row = { uk: uk || '' };
  for (const tl of TARGET_LANGS) {
    if (!uk) {
      row[tl] = '';
      continue;
    }
    if (offline) {
      row[tl] = uk;
      continue;
    }
    row[tl] = await translateLong(uk, tl, cache, stats);
  }
  return row;
}

function emitRow(name, row, indent = '  ') {
  let out = `${indent}${name}: {\n`;
  for (const k of ALL_LANGS) {
    out += `${indent}  ${k}: '${escapeJsStr(row[k] ?? '')}',\n`;
  }
  out += `${indent}},\n`;
  return out;
}

async function main() {
  const offline = process.argv.includes('--offline');
  const cache = loadCache();
  const stats = { requests: 0 };

  process.stderr.write('Translating Lavra intro i18n from Ukrainian…\n');

  const shortIntro = await fillRow(LAVRA_SHORT_INTRO_UK, cache, stats, offline);
  saveCache(cache);
  const miniPreview = await fillRow(LAVRA_MINI_PREVIEW_UK, cache, stats, offline);
  saveCache(cache);
  const introPage1 = await fillRow(LAVRA_INTRO_PAGE1_UK, cache, stats, offline);
  saveCache(cache);
  const illustrationLink = await fillRow(LAVRA_PAGE2_ILLUSTRATION_LINK_UK, cache, stats, offline);
  saveCache(cache);
  const illustrationCaption = await fillRow(LAVRA_PAGE2_ILLUSTRATION_CAPTION_UK, cache, stats, offline);
  saveCache(cache);
  const title = await fillRow(TITLE_UK, cache, stats, offline);
  saveCache(cache);
  const desc = await fillRow(DESC_UK, cache, stats, offline);
  saveCache(cache);

  const pageBodies = [];
  for (let i = 0; i < LAVRA_INTRO_PAGE_BODIES_UK.length; i++) {
    process.stderr.write(`  page ${i + 2}/13\n`);
    pageBodies.push(await fillRow(LAVRA_INTRO_PAGE_BODIES_UK[i], cache, stats, offline));
    saveCache(cache);
  }

  const quizQuestion = await fillRow(QUIZ_UK.question, cache, stats, offline);
  saveCache(cache);
  const quizMultiHint = await fillRow(QUIZ_UK.multiHint, cache, stats, offline);
  saveCache(cache);
  const quizOptions = [];
  for (const opt of QUIZ_UK.options) {
    quizOptions.push({
      text: await fillRow(opt.text, cache, stats, offline),
      correct: opt.correct,
    });
    saveCache(cache);
  }

  let js = `/** Auto-generated Lavra intro translations — do not edit by hand. */\n\n`;
  js += `export const LAVRA_INTRO_I18N = {\n`;
  js += emitRow('title', title);
  js += emitRow('desc', desc);
  js += emitRow('shortIntro', shortIntro);
  js += emitRow('miniPreview', miniPreview);
  js += emitRow('introPage1', introPage1);
  js += emitRow('illustrationLink', illustrationLink);
  js += emitRow('illustrationCaption', illustrationCaption);
  js += `  pageBodies: [\n`;
  for (const row of pageBodies) {
    js += `    {\n`;
    for (const k of ALL_LANGS) {
      js += `      ${k}: '${escapeJsStr(row[k] ?? '')}',\n`;
    }
    js += `    },\n`;
  }
  js += `  ],\n`;
  js += `  quiz: {\n`;
  js += emitRow('question', quizQuestion, '    ');
  js += emitRow('multiHint', quizMultiHint, '    ');
  js += `    options: [\n`;
  for (const opt of quizOptions) {
    js += `      {\n`;
    js += `        correct: ${opt.correct ? 'true' : 'false'},\n`;
    js += emitRow('text', opt.text, '        ');
    js += `      },\n`;
  }
  js += `    ],\n`;
  js += `  },\n`;
  js += `};\n`;

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, js, 'utf8');
  saveCache(cache);
  process.stderr.write(
    offline
      ? `\nWrote ${OUT_PATH} (offline placeholders).\n`
      : `\nWrote ${OUT_PATH} (HTTP requests: ${stats.requests}).\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
