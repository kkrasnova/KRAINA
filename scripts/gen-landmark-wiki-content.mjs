/**
 * Збирає тексти та фото з Wikipedia для пам'яток без готового контенту.
 * Пропускає 4 київські локації з повним аудіогідом.
 *
 *   node scripts/gen-landmark-wiki-content.mjs
 *   node scripts/gen-landmark-wiki-content.mjs --limit 5
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractLandmarkStories } from './_extractStoriesSource.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ROUTE_PATH = path.join(ROOT, 'app', 'routeRegionsData.js');
const OUT_PATH = path.join(ROOT, 'app', 'landmarkWikiStories.js');
const CACHE_PATH = path.join(ROOT, 'scripts', '.landmark-wiki-content-cache.json');

const SKIP_KEYS = new Set([
  'kyiv:sophia',
  'kyiv:lavra',
  'kyiv:maidan',
  'kyiv:khanenko_museum',
]);

const UA = 'KRAINA-LandmarkBot/1.0 (educational travel app)';

const SLIDE_LABELS_UK = [
  'історичний контекст',
  'порівняння «було / стало»',
  'архітектурні деталі',
  'інтер\'єр та атмосфера',
  'культурне значення',
  'околиці та контекст',
  'історична хронологія',
  'місцеві традиції',
  'сучасне життя',
  'цікаві факти',
  'фотогалерея',
  'завершення',
];

const SLIDE_LABELS_EN = [
  'historic context',
  'before / after',
  'architectural details',
  'interior and atmosphere',
  'cultural significance',
  'surroundings',
  'historical timeline',
  'local traditions',
  'modern life',
  'interesting facts',
  'photo gallery',
  'closing',
];

const LAYOUT_PRESETS = [
  { heroFit: 'cover', heroHeightRatio: 0.4, heroHeightMax: 340, introHeroInsetRounded: true, heroStackGap: 22 },
  { heroFit: 'cover', compareHeroHeightRatio: 0.6, compareHeroHeightMax: 540, compareHeroTopInset: 22, introCompareRounded: true, heroStackGap: 22 },
  { heroFit: 'cover', introHeroBleedTop: true },
  { heroFit: 'cover', introHeroBleedTop: true, heroHeightRatio: 0.68, heroHeightMax: 600, heroPosition: { left: '72%', top: '50%' } },
  { heroFit: 'cover', introHeroBleedTop: true, heroHeightRatio: 0.48, heroHeightMax: 400, heroPosition: { left: '50%', top: '34%' }, secondaryStackGap: 0, secondaryHeroPosition: { left: '50%', top: '40%' }, secondaryHeroHeightRatio: 0.3, secondaryHeroHeightMax: 260 },
  { heroFit: 'cover', introHeroInsetRounded: true, heroHeightRatio: 0.42, heroHeightMax: 360, heroStackGap: 18 },
  { heroFit: 'cover', introHeroInsetRounded: true, heroHeightRatio: 0.42, heroHeightMax: 360, heroStackGap: 18 },
  { heroFit: 'cover', introHeroAfterText: true, heroHeightRatio: 0.5, heroHeightMax: 420, introHeroInsetRounded: true },
  { heroFit: 'cover', introHeroBleedTop: true, heroHeightRatio: 0.44, heroHeightMax: 380, secondaryStackGap: 12, secondaryHeroHeightRatio: 0.28, secondaryHeroHeightMax: 240 },
  { heroFit: 'cover', introFactCard: true, introHeroBleedTop: true, heroHeightRatio: 0.55, heroHeightMax: 480 },
  { heroFit: 'cover', introHeroInsetRounded: true, heroHeightRatio: 0.36, heroHeightMax: 300, heroStackGap: 16, introHeroBleedTop: true },
  { heroFit: 'cover', introHeroInsetRounded: true, heroHeightRatio: 0.38, heroHeightMax: 320, heroStackGap: 20 },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, retries = 6) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 12000);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: ac.signal,
      });
      if (res.status === 429) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      await sleep(800 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(c) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(c, null, 2), 'utf8');
}

function escapeJs(s) {
  return JSON.stringify(s);
}

function parseRegions(text) {
  const map = {};
  const re = /^  (\w+): \{[\s\S]*?^    titleUk: '([^']*)',[\s\S]*?^    titleEn: '([^']*)',/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    map[m[1]] = { titleUk: m[2], titleEn: m[3] };
  }
  return map;
}

function chunkText(paragraphs, count) {
  if (!paragraphs.length) return Array(count).fill('');
  // Sequential blocks (not round-robin) so related facts stay on the same slide
  const base = Math.floor(paragraphs.length / count);
  const rem = paragraphs.length % count;
  const chunks = [];
  let idx = 0;
  for (let i = 0; i < count; i += 1) {
    const n = Math.max(1, base + (i < rem ? 1 : 0));
    const slice = paragraphs.slice(idx, idx + n);
    idx += slice.length;
    chunks.push(slice.join('\n\n'));
  }
  while (idx < paragraphs.length) {
    chunks[count - 1] = [chunks[count - 1], paragraphs[idx]].filter(Boolean).join('\n\n');
    idx += 1;
  }
  return chunks;
}

function buildPageBody(title, label, text, langUk) {
  const t = text?.trim() || '';
  if (!t) {
    return langUk
      ? `**${title}** — ${label}\n\nЦе місце варто побачити на власні очі.`
      : `**${title}** — ${label}\n\nThis place is worth seeing in person.`;
  }
  // Prefer plain facts — section labels are stripped in the app anyway
  return t;
}

function splitParagraphs(text) {
  let t = String(text || '');
  t = t.split(
    /\n==\s*(Примітки|Джерела|Посилання|Галерея|References|External links|See also|Notes)\s*==/i,
  )[0];
  t = t.replace(/\n==+\s*[^=\n]+\s*==+\n/g, '\n\n');
  const blocks = t
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 40);
  // Split very long blocks into ~2–3 sentence units
  const out = [];
  for (const block of blocks) {
    if (block.length <= 420) {
      out.push(block);
      continue;
    }
    const sents = block.split(/(?<=[.!?…])\s+(?=[A-ZА-ЯІЇЄҐ«"0-9])/).filter(Boolean);
    let buf = '';
    for (const s of sents) {
      const next = buf ? `${buf} ${s}` : s;
      if (next.length > 420 && buf.length >= 140) {
        out.push(buf);
        buf = s;
      } else buf = next;
    }
    if (buf.length > 40) out.push(buf);
  }
  return out;
}

async function wikiSearch(query, lang) {
  const origin = `https://${lang}.wikipedia.org`;
  const u = `${origin}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=8&format=json`;
  const json = await fetchJson(u);
  const hits = json?.query?.search || [];
  const qNorm = normalizeWikiTitle(query);
  const words = titleWords(query);
  const hit =
    hits.find((row) => normalizeWikiTitle(row?.title) === qNorm) ||
    hits.find((row) => words.length >= 2 && words.every((w) => normalizeWikiTitle(row?.title).includes(w)));
  return hit ? { origin, title: hit.title } : null;
}

async function wikiExtract(origin, title) {
  const u = `${origin}/w/api.php?action=query&redirects=1&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&format=json`;
  const json = await fetchJson(u);
  const page = Object.values(json?.query?.pages || {})[0];
  if (!page || page.missing) return { extract: '', pageTitle: title, missing: true };
  return { extract: page?.extract || '', pageTitle: page?.title || title };
}

function normalizeWikiTitle(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zа-яіїєґ0-9]+/gi, ' ')
    .trim();
}

function titleWords(s) {
  const stop = new Set(['the', 'of', 'and', 'in', 'lviv', 'львів', 'львові']);
  return normalizeWikiTitle(s)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
}

async function wikiExactTitle(title, lang) {
  const origin = `https://${lang}.wikipedia.org`;
  const data = await wikiExtract(origin, title);
  if (!data.missing && data.extract && data.extract.length > 80) {
    return { origin, title: data.pageTitle, data };
  }
  return null;
}

async function wikiSummaryImage(origin, title) {
  const slug = encodeURIComponent(title.replace(/ /g, '_'));
  const json = await fetchJson(`${origin}/api/rest_v1/page/summary/${slug}`);
  return json?.originalimage?.source || json?.thumbnail?.source || null;
}

async function wikiPageImages(origin, title, limit = 14) {
  const u = `${origin}/w/api.php?action=query&prop=images&titles=${encodeURIComponent(title)}&imlimit=${limit}&format=json`;
  const json = await fetchJson(u);
  const page = Object.values(json?.query?.pages || {})[0];
  const files = (page?.images || [])
    .map((x) => x?.title)
    .filter((t) => t && !/icon|logo|flag|map|locator|symbol|coat|emblem/i.test(t));
  if (!files.length) return [];
  const infoUrl = `${origin}/w/api.php?action=query&prop=imageinfo&iiprop=url&iiurlwidth=1200&titles=${files
    .slice(0, 12)
    .map(encodeURIComponent)
    .join('|')}&format=json`;
  const infoJson = await fetchJson(infoUrl);
  const urls = [];
  for (const p of Object.values(infoJson?.query?.pages || {})) {
    const url = p?.imageinfo?.[0]?.thumburl || p?.imageinfo?.[0]?.url;
    if (url && /^https?:\/\//i.test(url) && !/\.svg$/i.test(url)) urls.push(url);
  }
  return [...new Set(urls)];
}

async function commonsSearchImages(query, limit = 12) {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url&iiurlwidth=1200&format=json`;
  const json = await fetchJson(u);
  const urls = [];
  for (const p of Object.values(json?.query?.pages || {})) {
    const url = p?.imageinfo?.[0]?.thumburl || p?.imageinfo?.[0]?.url;
    if (url && /^https?:\/\//i.test(url) && !/\.svg$/i.test(url)) urls.push(url);
  }
  return [...new Set(urls)];
}

async function collectImages(enHit, ukHit, enTitle, ukTitle, lm, region) {
  const images = [];
  const push = (url) => {
    if (url && !images.includes(url)) images.push(url);
  };

  const titles = [enTitle, ukTitle, lm.titleEn, lm.titleUk].filter(Boolean);
  for (const title of titles) {
    push(await wikiSummaryImage('https://en.wikipedia.org', title));
    await sleep(300);
    push(await wikiSummaryImage('https://uk.wikipedia.org', title));
    await sleep(300);
  }

  if (enHit) {
    for (const url of await wikiPageImages(enHit.origin, enTitle)) push(url);
    await sleep(400);
  }
  if (ukHit) {
    for (const url of await wikiPageImages(ukHit.origin, ukTitle)) push(url);
    await sleep(400);
  }

  const commonsQueries = [
    `${lm.titleEn} ${region?.titleEn || ''}`,
    lm.titleEn,
    `${lm.titleUk} ${region?.titleUk || ''}`,
    lm.titleUk,
  ];
  for (const q of commonsQueries) {
    if (images.length >= 8) break;
    for (const url of await commonsSearchImages(q)) push(url);
    await sleep(350);
  }

  return images.slice(0, 14);
}

async function wikiMediaList(origin, title) {
  const slug = encodeURIComponent(title.replace(/ /g, '_'));
  const u = `${origin}/api/rest_v1/page/media-list/${slug}`;
  const json = await fetchJson(u, 2);
  const urls = [];
  for (const item of json?.items || []) {
    if (item?.type !== 'image') continue;
    const src =
      item?.original?.source ||
      item?.srcset?.[item.srcset.length - 1]?.src ||
      item?.thumbnail?.source;
    if (src && /^https?:\/\//i.test(src) && !/\.svg$/i.test(src)) {
      urls.push(src);
    }
  }
  return [...new Set(urls)];
}

async function fetchWikiBundle(lm, region, cache, imagesOnly = false) {
  const ck = lm.key;
  if (cache[ck]?.story && imagesOnly && (cache[ck].imageCount || 0) >= 3) return cache[ck];
  if (cache[ck]?.story && !imagesOnly) {
    const prevBodies = cache[ck].story?.introPagesUk || [];
    const stillPlaceholder = prevBodies.some((p) =>
      /варто побачити на власні очі|worth seeing in person/i.test(String(p?.body || '')),
    );
    if (!stillPlaceholder && !process.argv.includes('--force')) return cache[ck];
  }

  const cityUk = region?.titleUk || '';
  const cityEn = region?.titleEn || '';
  const queries = [
    `${lm.titleEn} ${cityEn}`,
    lm.titleEn,
    `${lm.titleUk} ${cityUk}`,
    lm.titleUk,
  ];

  let enHit = await wikiExactTitle(lm.titleEn, 'en');
  let ukHit = await wikiExactTitle(lm.titleUk, 'uk');
  for (const q of queries) {
    if (!enHit) enHit = await wikiSearch(q, 'en');
    if (!ukHit) ukHit = await wikiSearch(q, 'uk');
    if (enHit && ukHit) break;
    await sleep(120);
  }
  if (!enHit && ukHit) enHit = await wikiSearch(ukHit.title, 'en');
  if (!ukHit && enHit) ukHit = await wikiSearch(enHit.title, 'uk');

  const enData = enHit?.data || (enHit ? await wikiExtract(enHit.origin, enHit.title) : { extract: '', pageTitle: lm.titleEn });
  const ukData = ukHit?.data || (ukHit ? await wikiExtract(ukHit.origin, ukHit.title) : { extract: '', pageTitle: lm.titleUk });

  let images = await collectImages(enHit, ukHit, enData.pageTitle, ukData.pageTitle, lm, region);

  const extractEn = imagesOnly && cache[ck]?.story
    ? ''
    : enData.extract || lm.desc.en || '';
  const extractUk = imagesOnly && cache[ck]?.story
    ? ''
    : ukData.extract || lm.desc.uk || extractEn;
  if (imagesOnly && cache[ck]?.story) {
    const prev = cache[ck].story;
    const newImages = images;
    const story = rebuildStoryImages(prev, newImages);
    const entry = { story, imageCount: newImages.length, wikiTitle: cache[ck].wikiTitle };
    cache[ck] = entry;
    saveCache(cache);
    return entry;
  }
  const parasUk = splitParagraphs(extractUk);
  const parasEn = splitParagraphs(extractEn);
  const bodiesUk = chunkText(parasUk, 12).map((t, i) =>
    buildPageBody(lm.titleUk, SLIDE_LABELS_UK[i], t, true),
  );
  const bodiesEn = chunkText(parasEn, 12).map((t, i) =>
    buildPageBody(lm.titleEn, SLIDE_LABELS_EN[i], t, false),
  );

  const introUk = lm.desc.uk
    ? `Вітаємо біля **${lm.titleUk}**. ${lm.desc.uk}`
    : `Вітаємо біля **${lm.titleUk}**. ${(parasUk[0] || extractUk).slice(0, 400)}`;
  const introEn = lm.desc.en
    ? `Welcome to **${lm.titleEn}**. ${lm.desc.en}`
    : `Welcome to **${lm.titleEn}**. ${(parasEn[0] || extractEn).slice(0, 400)}`;

  const wrongUk = [];
  const wrongEn = [];
  const bundle = cache._regionLandmarks || {};
  const siblings = bundle[lm.regionId] || [];
  for (const s of siblings) {
    if (s.key === lm.key) continue;
    wrongUk.push(s.titleUk);
    wrongEn.push(s.titleEn);
    if (wrongUk.length >= 2) break;
  }
  while (wrongUk.length < 2) {
    wrongUk.push('Інша пам\'ятка');
    wrongEn.push('Another landmark');
  }

  const yearMatch = (extractEn + extractUk).match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
  const quiz = yearMatch
    ? {
        questionUk: `У якому році згадується ключова подія, пов\'язана з «${lm.titleUk}»?`,
        questionEn: `In which year is a key event related to "${lm.titleEn}" mentioned?`,
        options: [
          { textUk: yearMatch[1], textEn: yearMatch[1], correct: true },
          { textUk: String(Number(yearMatch[1]) - 37), textEn: String(Number(yearMatch[1]) - 37), correct: false },
          { textUk: String(Number(yearMatch[1]) + 53), textEn: String(Number(yearMatch[1]) + 53), correct: false },
        ],
        multiHintUk: `Перечитайте слайд про історію — рік **${yearMatch[1]}** згадується в тексті.`,
        multiHintEn: `Re-read the history slide — the year **${yearMatch[1]}** appears in the text.`,
      }
    : {
        questionUk: `Як називається ця локація?`,
        questionEn: `What is the name of this landmark?`,
        options: [
          { textUk: lm.titleUk, textEn: lm.titleEn, correct: true },
          { textUk: wrongUk[0], textEn: wrongEn[0], correct: false },
          { textUk: wrongUk[1], textEn: wrongEn[1], correct: false },
        ],
        multiHintUk: `Підказка: назва в заголовку — **${lm.titleUk}**.`,
        multiHintEn: `Hint: the title says **${lm.titleEn}**.`,
      };

  const story = buildStoryObject({
    shortIntroUk: lm.desc.uk || lm.titleUk,
    shortIntroEn: lm.desc.en || lm.titleEn,
    miniPreviewUk: (lm.desc.uk || parasUk[0] || '').slice(0, 180),
    miniPreviewEn: (lm.desc.en || parasEn[0] || '').slice(0, 180),
    introPage1Uk: introUk,
    introPage1En: introEn,
    pageBodiesUk: bodiesUk,
    pageBodiesEn: bodiesEn,
    images,
    quiz,
    wikipediaUrl: enHit
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(enData.pageTitle.replace(/ /g, '_'))}`
      : ukHit
        ? `https://uk.wikipedia.org/wiki/${encodeURIComponent(ukData.pageTitle.replace(/ /g, '_'))}`
        : '',
  });

  const entry = { story, imageCount: images.length, wikiTitle: enData.pageTitle };
  cache[ck] = entry;
  saveCache(cache);
  return entry;
}

function pickImage(images, index, fallback) {
  if (images?.[index]) return images[index];
  if (images?.[0]) return images[0];
  return fallback || '';
}

function buildStoryObject(input) {
  const {
    shortIntroUk,
    shortIntroEn,
    miniPreviewUk,
    miniPreviewEn,
    introPage1Uk,
    introPage1En,
    pageBodiesUk,
    pageBodiesEn,
    images,
    quiz,
    wikipediaUrl,
  } = input;

  const introPagesUk = pageBodiesUk
    .map((body, i) => {
      const layout = LAYOUT_PRESETS[i] || {};
      const img = pickImage(images, i, '');
      const img2 = pickImage(images, i + 1, img);
      const page = { body, ...layout };
      if (i === 0 && img) {
        page.photoUri = img;
        if (images[1]) page.illustrationUri = images[1];
      } else if (i === 1 && img && img2) {
        page.compareBeforeUri = img;
        page.compareAfterUri = img2;
      } else if (i === 4 && img) {
        page.photoUri = img;
        if (img2 && img2 !== img) page.secondaryPhotoUri = img2;
      } else if (i === 8 && img) {
        page.photoUri = img;
        if (img2 && img2 !== img) page.secondaryPhotoUri = img2;
      } else if (img) {
        page.photoUri = img;
      }
      return page;
    })
    .filter((p) => p.body);

  const introPagesEn = pageBodiesEn
    .map((body, i) => {
      const layout = LAYOUT_PRESETS[i] || {};
      const ukPage = introPagesUk[i];
      if (!ukPage) return null;
      return {
        body,
        ...layout,
        ...(ukPage.photoUri ? { photoUri: ukPage.photoUri } : {}),
        ...(ukPage.secondaryPhotoUri ? { secondaryPhotoUri: ukPage.secondaryPhotoUri } : {}),
        ...(ukPage.compareBeforeUri ? { compareBeforeUri: ukPage.compareBeforeUri } : {}),
        ...(ukPage.compareAfterUri ? { compareAfterUri: ukPage.compareAfterUri } : {}),
        ...(ukPage.illustrationUri ? { illustrationUri: ukPage.illustrationUri } : {}),
      };
    })
    .filter(Boolean);

  return {
    shortIntroUk,
    shortIntroEn,
    miniPreviewUk,
    miniPreviewEn,
    introPage1Uk,
    introPage1En,
    introPagesUk,
    introPagesEn,
    quiz,
    audioScriptUk: [introPage1Uk, ...pageBodiesUk].join('\n\n'),
    audioScriptEn: [introPage1En, ...pageBodiesEn].join('\n\n'),
    ttsEnabled: true,
    audioUri: '',
    wikipediaUrl,
    _introBuilt: true,
    _wikiGenerated: true,
  };
}

function emitStoriesJs(stories) {
  let js = '/** Auto-generated by scripts/gen-landmark-wiki-content.mjs — do not edit by hand */\n\n';
  js += 'const LANDMARK_WIKI_STORIES = ';
  js += JSON.stringify(stories, null, 2);
  js += ';\n\n';
  js += `export function getLandmarkWikiStory(regionId, landmarkId) {
  const key = String(regionId || '').trim() + ':' + String(landmarkId || '').trim();
  return LANDMARK_WIKI_STORIES[key] || null;
}

export function landmarkWikiStoryKeys() {
  return Object.keys(LANDMARK_WIKI_STORIES);
}
`;
  fs.writeFileSync(OUT_PATH, js, 'utf8');
}

function rebuildStoryImages(story, images) {
  const next = JSON.parse(JSON.stringify(story));
  const applyToPages = (pages) => {
    if (!Array.isArray(pages)) return;
    pages.forEach((page, i) => {
      const img = pickImage(images, i, '');
      const img2 = pickImage(images, i + 1, img);
      delete page.photoUri;
      delete page.secondaryPhotoUri;
      delete page.compareBeforeUri;
      delete page.compareAfterUri;
      delete page.illustrationUri;
      if (i === 0 && img) {
        page.photoUri = img;
        if (images[1]) page.illustrationUri = images[1];
      } else if (i === 1 && img && img2) {
        page.compareBeforeUri = img;
        page.compareAfterUri = img2;
      } else if (i === 4 && img) {
        page.photoUri = img;
        if (img2 && img2 !== img) page.secondaryPhotoUri = img2;
      } else if (i === 8 && img) {
        page.photoUri = img;
        if (img2 && img2 !== img) page.secondaryPhotoUri = img2;
      } else if (img) {
        page.photoUri = img;
      }
    });
  };
  applyToPages(next.introPagesUk);
  applyToPages(next.introPagesEn);
  return next;
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit'));
  const limit = limitArg ? Number(limitArg.split('=')[1] || process.argv[process.argv.indexOf('--limit') + 1]) : 0;
  const imagesOnly = process.argv.includes('--images-only');

  const routeText = fs.readFileSync(ROUTE_PATH, 'utf8');
  const regions = parseRegions(routeText);
  const all = extractLandmarkStories(ROUTE_PATH).filter((x) => !SKIP_KEYS.has(x.key));

  const cache = loadCache();
  cache._regionLandmarks = {};
  for (const lm of all) {
    if (!cache._regionLandmarks[lm.regionId]) cache._regionLandmarks[lm.regionId] = [];
    cache._regionLandmarks[lm.regionId].push(lm);
  }
  saveCache(cache);

  const targets = (limit > 0 ? all.slice(0, limit) : all).filter((lm) => {
    if (!imagesOnly) return true;
    return (cache[lm.key]?.imageCount || 0) < 3;
  });
  process.stderr.write(`Generating wiki content for ${targets.length} landmarks${imagesOnly ? ' (images only)' : ''}...\n`);

  const stories = {};
  for (const lm of all) {
    const cached = cache[lm.key]?.story;
    if (cached) stories[lm.key] = cached;
  }
  let i = 0;
  for (const lm of targets) {
    i++;
    process.stderr.write(`[${i}/${targets.length}] ${lm.key} — ${lm.titleEn}\n`);
    try {
      const entry = await fetchWikiBundle(lm, regions[lm.regionId], cache, imagesOnly);
      if (entry?.story) stories[lm.key] = entry.story;
      process.stderr.write(`  ✓ ${entry.imageCount || 0} images, wiki: ${entry.wikiTitle || '?'}\n`);
    } catch (e) {
      process.stderr.write(`  ✗ ${e.message}\n`);
    }
    await sleep(imagesOnly ? 1400 : 500);
  }

  emitStoriesJs(stories);
  process.stderr.write(`\nWrote ${OUT_PATH} (${Object.keys(stories).length} stories)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
