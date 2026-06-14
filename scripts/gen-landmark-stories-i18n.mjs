

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractLandmarkStories } from './_extractStoriesSource.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ROUTE_PATH = path.join(ROOT, 'app', 'routeRegionsData.js');
const OUT_PATH = path.join(ROOT, 'app', 'landmarkStoriesI18n.js');
const CACHE_PATH = path.join(ROOT, 'scripts', '.landmark-stories-cache.json');

const TARGET_LANGS = ['de', 'pl', 'nl', 'es', 'lt', 'lv', 'ro', 'it', 'hy'];
const ALL_LANGS = ['uk', 'en', ...TARGET_LANGS];


const BEFORE_AFTER_HINT = {
  uk: 'Далі — порівняння двох фото: зараз і архівний знімок (початок ХХ ст.).',
  en: 'Next — comparing two photos: today and an archival shot (early 20th c.).',
};

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

async function gtxTranslate(text, tl, cache, stats) {
  const ck = `${tl}::${text}`;
  if (cache[ck] != null && cache[ck] !== '') return cache[ck];
  const q = text.slice(0, 4500);
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
  }
  return out.join('');
}

async function fillRow({ uk, en }, cache, stats, offline) {
  const row = {
    uk: uk || en || '',
    en: en || uk || '',
  };
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
    row[tl] = await translateLong(src, tl, cache, stats);
    await sleep(60);
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

function emitSlide(slideId, slide, indent = '      ') {
  let out = `${indent}'${slideId}': {\n`;
  if (slide.title) {
    out += emitRow('title', slide.title, `${indent}  `);
  } else {
    out += `${indent}  title: null,\n`;
  }
  out += emitRow('fact', slide.fact, `${indent}  `);
  out += `${indent}},\n`;
  return out;
}

async function main() {
  const offline = process.argv.includes('
  const cache = loadCache();
  const stats = { requests: 0 };

  const arr = extractLandmarkStories(ROUTE_PATH);
  const withStory = arr.filter((x) => x.story);
  process.stderr.write(`Landmarks with story blocks: ${withStory.length}\n`);

  
  const bundle = {};

  let lmIdx = 0;
  for (const lm of withStory) {
    lmIdx++;
    process.stderr.write(`\n[${lmIdx}/${withStory.length}] ${lm.key}\n`);

    const desc = await fillRow(lm.desc, cache, stats, offline);
    saveCache(cache);

    const story = lm.story;
    const slides = {};

    if (story.photoFact && (story.photoFact.bodyUk || story.photoFact.bodyEn)) {
      process.stderr.write('  · photoFact\n');
      slides['story-photo-fact'] = {
        title:
          story.photoFact.titleUk || story.photoFact.titleEn
            ? await fillRow(
                { uk: story.photoFact.titleUk, en: story.photoFact.titleEn },
                cache,
                stats,
                offline,
              )
            : null,
        fact: await fillRow(
          { uk: story.photoFact.bodyUk, en: story.photoFact.bodyEn },
          cache,
          stats,
          offline,
        ),
      };
      saveCache(cache);
    }

    if (story.hasBeforeAfter) {
      process.stderr.write('  · before/after hint\n');
      slides['story-before-after'] = {
        title: null,
        fact: await fillRow(BEFORE_AFTER_HINT, cache, stats, offline),
      };
      saveCache(cache);
    }

    if (story.secondFact && (story.secondFact.bodyUk || story.secondFact.bodyEn)) {
      const slideId = story.hasBeforeAfter ? 'story-historic-fact' : 'story-second-fact';
      process.stderr.write(`  · ${slideId}\n`);
      slides[slideId] = {
        title:
          story.secondFact.titleUk || story.secondFact.titleEn
            ? await fillRow(
                { uk: story.secondFact.titleUk, en: story.secondFact.titleEn },
                cache,
                stats,
                offline,
              )
            : null,
        fact: await fillRow(
          { uk: story.secondFact.bodyUk, en: story.secondFact.bodyEn },
          cache,
          stats,
          offline,
        ),
      };
      saveCache(cache);
    }

    if (story.thirdFact && (story.thirdFact.bodyUk || story.thirdFact.bodyEn)) {
      process.stderr.write('  · thirdFact\n');
      slides['story-third-fact'] = {
        title:
          story.thirdFact.titleUk || story.thirdFact.titleEn
            ? await fillRow(
                { uk: story.thirdFact.titleUk, en: story.thirdFact.titleEn },
                cache,
                stats,
                offline,
              )
            : null,
        fact: await fillRow(
          { uk: story.thirdFact.bodyUk, en: story.thirdFact.bodyEn },
          cache,
          stats,
          offline,
        ),
      };
      saveCache(cache);
    }

    if (story.fourthFact && (story.fourthFact.bodyUk || story.fourthFact.bodyEn)) {
      process.stderr.write('  · fourthFact\n');
      slides['story-fourth-fact'] = {
        title:
          story.fourthFact.titleUk || story.fourthFact.titleEn
            ? await fillRow(
                { uk: story.fourthFact.titleUk, en: story.fourthFact.titleEn },
                cache,
                stats,
                offline,
              )
            : null,
        fact: await fillRow(
          { uk: story.fourthFact.bodyUk, en: story.fourthFact.bodyEn },
          cache,
          stats,
          offline,
        ),
      };
      saveCache(cache);
    }

    if (story.closing && (story.closing.bodyUk || story.closing.bodyEn)) {
      process.stderr.write('  · closing\n');
      slides['story-closing'] = {
        title:
          story.closing.titleUk || story.closing.titleEn
            ? await fillRow(
                { uk: story.closing.titleUk, en: story.closing.titleEn },
                cache,
                stats,
                offline,
              )
            : null,
        fact: await fillRow(
          { uk: story.closing.bodyUk, en: story.closing.bodyEn },
          cache,
          stats,
          offline,
        ),
      };
      saveCache(cache);
    }

    let quiz = null;
    if (story.quiz && (story.quiz.questionUk || story.quiz.questionEn)) {
      process.stderr.write('  · quiz\n');
      const question = await fillRow(
        { uk: story.quiz.questionUk, en: story.quiz.questionEn },
        cache,
        stats,
        offline,
      );
      const hint = await fillRow(
        { uk: story.quiz.hintUk, en: story.quiz.hintEn },
        cache,
        stats,
        offline,
      );
      const options = [];
      for (const o of story.quiz.options || []) {
        options.push(await fillRow({ uk: o.uk, en: o.en }, cache, stats, offline));
      }
      quiz = { question, hint, options };
      saveCache(cache);
    }

    bundle[lm.key] = { desc, slides, quiz };
    saveCache(cache);
  }

  
  let js = '';
  js += '\nimport { APP_LANG_IDS } from \'./appLang\';\n\n';
  js += `const LANGS = ${JSON.stringify(ALL_LANGS)};\n\n`;
  js += '\n';
  js += 'export const LANDMARK_STORIES_I18N = {\n';
  for (const key of Object.keys(bundle).sort()) {
    const b = bundle[key];
    js += `  '${escapeJsStr(key)}': {\n`;
    js += emitRow('desc', b.desc, '    ');
    js += '    slides: {\n';
    for (const sid of Object.keys(b.slides)) {
      js += emitSlide(sid, b.slides[sid], '      ');
    }
    js += '    },\n';
    if (b.quiz) {
      js += '    quiz: {\n';
      js += emitRow('question', b.quiz.question, '      ');
      js += emitRow('hint', b.quiz.hint, '      ');
      js += '      options: [\n';
      for (const o of b.quiz.options) {
        js += '        {\n';
        for (const k of ALL_LANGS) {
          js += `          ${k}: '${escapeJsStr(o[k] ?? '')}',\n`;
        }
        js += '        },\n';
      }
      js += '      ],\n';
      js += '    },\n';
    } else {
      js += '    quiz: null,\n';
    }
    js += '  },\n';
  }
  js += '};\n\n';
  js += `function ensureRow(row) {\n`;
  js += `  if (!row || typeof row !== 'object') return row;\n`;
  js += `  const fb = row.en || row.uk || '';\n`;
  js += `  const out = { ...row };\n`;
  js += `  for (const id of APP_LANG_IDS) {\n`;
  js += `    if (out[id] == null || String(out[id]).trim() === '') out[id] = fb;\n`;
  js += `  }\n`;
  js += `  return out;\n`;
  js += `}\n\n`;
  js += `export function landmarkStoryEntry(regionId, landmarkId) {\n`;
  js += `  const key = String(regionId || '').trim() + ':' + String(landmarkId || '').trim();\n`;
  js += `  return LANDMARK_STORIES_I18N[key] || null;\n`;
  js += `}\n\n`;
  js += `export function landmarkDescRow(regionId, landmarkId) {\n`;
  js += `  const e = landmarkStoryEntry(regionId, landmarkId);\n`;
  js += `  if (!e || !e.desc) return null;\n`;
  js += `  return ensureRow(e.desc);\n`;
  js += `}\n\n`;
  js += `export function landmarkSlideRow(regionId, landmarkId, slideId, field) {\n`;
  js += `  const e = landmarkStoryEntry(regionId, landmarkId);\n`;
  js += `  if (!e || !e.slides) return null;\n`;
  js += `  const s = e.slides[slideId];\n`;
  js += `  if (!s) return null;\n`;
  js += `  const pack = field === 'title' ? s.title : s.fact;\n`;
  js += `  if (!pack) return null;\n`;
  js += `  return ensureRow(pack);\n`;
  js += `}\n\n`;
  js += `export function landmarkQuizPack(regionId, landmarkId) {\n`;
  js += `  const e = landmarkStoryEntry(regionId, landmarkId);\n`;
  js += `  if (!e || !e.quiz) return null;\n`;
  js += `  return {\n`;
  js += `    question: ensureRow(e.quiz.question),\n`;
  js += `    hint: ensureRow(e.quiz.hint),\n`;
  js += `    options: (e.quiz.options || []).map((o) => ensureRow(o)),\n`;
  js += `  };\n`;
  js += `}\n`;

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
