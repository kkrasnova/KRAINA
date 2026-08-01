#!/usr/bin/env node
/**
 * Rebuild Kyiv St. Nicholas cathedral story text from Wikipedia
 * (replaces placeholder «Це місце варто побачити…» bodies).
 *
 * Writes app/landmarkWikiStoriesManual.json override + updates wiki cache.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MANUAL_PATH = path.join(ROOT, 'app/landmarkWikiStoriesManual.json');
const CACHE_PATH = path.join(ROOT, 'scripts/.landmark-wiki-content-cache.json');
const KEY = 'kyiv:st_nicholas_cathedral';

const TITLE_UK = 'Костел Святого Миколая';
const TITLE_EN = 'St. Nicholas Roman Catholic Cathedral';

async function wikiExtract(lang, title) {
  const origin = `https://${lang}.wikipedia.org`;
  const u = `${origin}/w/api.php?action=query&redirects=1&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&format=json`;
  const j = await fetch(u).then((r) => r.json());
  const p = Object.values(j?.query?.pages || {})[0];
  return p?.extract || '';
}

function cleanExtract(text) {
  let t = String(text || '');
  t = t.split(
    /\n==\s*(Примітки|Джерела|Посилання|Галерея|References|External links|See also|Notes)\s*==/i,
  )[0];
  return t
    .replace(/\n==+\s*[^=\n]+\s*==+\n/g, '\n\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitSentences(p) {
  return p
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+(?=[A-ZА-ЯІЇЄҐ«"0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function expandToUnits(text, minChars = 140, maxChars = 420) {
  const blocks = cleanExtract(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 40);
  const units = [];
  for (const block of blocks) {
    if (block.length <= maxChars) {
      if (block.length >= 60) units.push(block);
      continue;
    }
    const sents = splitSentences(block);
    let buf = '';
    for (const s of sents) {
      const next = buf ? `${buf} ${s}` : s;
      if (next.length > maxChars && buf.length >= minChars) {
        units.push(buf);
        buf = s;
      } else {
        buf = next;
      }
    }
    if (buf.length >= 60) units.push(buf);
  }
  return units;
}

function chunkEven(units, count) {
  const out = Array.from({ length: count }, () => []);
  if (!units.length) return out.map(() => '');
  const base = Math.floor(units.length / count);
  const rem = units.length % count;
  let idx = 0;
  for (let i = 0; i < count; i += 1) {
    const n = Math.max(1, base + (i < rem ? 1 : 0));
    const slice = units.slice(idx, idx + n);
    idx += slice.length;
    out[i] = slice;
  }
  while (idx < units.length) {
    out[count - 1].push(units[idx]);
    idx += 1;
  }
  return out.map((arr) => arr.filter(Boolean).join('\n\n'));
}

function layoutTemplateUk() {
  return [
    { heroHeightRatio: 0.4, heroHeightMax: 340, introHeroInsetRounded: true, heroStackGap: 22 },
    {
      compareHeroHeightRatio: 0.6,
      compareHeroHeightMax: 540,
      compareHeroTopInset: 22,
      introCompareRounded: true,
      heroStackGap: 22,
    },
    { introHeroBleedTop: true },
    {
      introHeroBleedTop: true,
      heroHeightRatio: 0.68,
      heroHeightMax: 600,
      heroPosition: { left: '72%', top: '50%' },
    },
    {
      introHeroBleedTop: true,
      heroHeightRatio: 0.48,
      heroHeightMax: 400,
      heroPosition: { left: '50%', top: '34%' },
    },
    {
      introHeroInsetRounded: true,
      heroHeightRatio: 0.42,
      heroHeightMax: 360,
      heroStackGap: 18,
    },
    {
      introHeroInsetRounded: true,
      heroHeightRatio: 0.42,
      heroHeightMax: 360,
      heroStackGap: 18,
    },
    {
      introHeroAfterText: true,
      heroHeightRatio: 0.5,
      heroHeightMax: 420,
      introHeroInsetRounded: true,
    },
    {
      introHeroBleedTop: true,
      heroHeightRatio: 0.44,
      heroHeightMax: 380,
    },
    {
      introFactCard: true,
      introHeroBleedTop: true,
      heroHeightRatio: 0.55,
      heroHeightMax: 480,
    },
    {
      introHeroInsetRounded: true,
      heroHeightRatio: 0.36,
      heroHeightMax: 300,
      heroStackGap: 16,
    },
    {
      introHeroInsetRounded: true,
      heroHeightRatio: 0.38,
      heroHeightMax: 320,
      heroStackGap: 20,
    },
  ];
}

async function main() {
  const ukRaw = await wikiExtract('uk', 'Костел Святого Миколая (Київ)');
  const enRaw = await wikiExtract('en', 'St. Nicholas Roman Catholic Cathedral, Kyiv');
  const unitsUk = expandToUnits(ukRaw);
  const unitsEn = expandToUnits(enRaw);
  if (unitsUk.length < 6) {
    throw new Error(`Too few UK wiki units (${unitsUk.length})`);
  }
  const intro1Uk = [
    `Вітаємо біля **${TITLE_UK}**.`,
    unitsUk[0],
    unitsUk[1] || '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const intro1En = [
    `Welcome to **${TITLE_EN}**.`,
    unitsEn[0] || unitsUk[0],
    unitsEn[1] || unitsUk[1] || '',
  ]
    .filter(Boolean)
    .join('\n\n');

  // Page bodies start AFTER intro1 units so facts never repeat page 1.
  // Reserve the last 2 units for post-quiz fact cards when possible.
  const pageUnitsUkAll = unitsUk.slice(2);
  const pageUnitsEnAll = (unitsEn.length >= 8 ? unitsEn : unitsUk).slice(2);
  const factUk = pageUnitsUkAll.length >= 3 ? pageUnitsUkAll[pageUnitsUkAll.length - 2] : '';
  const fact2Uk = pageUnitsUkAll.length >= 2 ? pageUnitsUkAll[pageUnitsUkAll.length - 1] : '';
  const factEn =
    pageUnitsEnAll.length >= 3 ? pageUnitsEnAll[pageUnitsEnAll.length - 2] : factUk;
  const fact2En =
    pageUnitsEnAll.length >= 2 ? pageUnitsEnAll[pageUnitsEnAll.length - 1] : fact2Uk;
  const pageUnitsUk =
    pageUnitsUkAll.length >= 3 ? pageUnitsUkAll.slice(0, -2) : pageUnitsUkAll;
  const pageUnitsEn =
    pageUnitsEnAll.length >= 3 ? pageUnitsEnAll.slice(0, -2) : pageUnitsEnAll;
  const bodiesUk = chunkEven(pageUnitsUk.length ? pageUnitsUk : unitsUk.slice(2), 12);
  const bodiesEn = chunkEven(pageUnitsEn.length ? pageUnitsEn : pageUnitsUk, 12);

  const layouts = layoutTemplateUk();

  const introPagesUk = bodiesUk.map((body, i) => ({
    ...layouts[i],
    body,
  }));
  const introPagesEn = bodiesEn.map((body, i) => ({
    ...layouts[i],
    body,
  }));

  // Merge any leftover thin page into previous so we don't show 1-sentence stubs
  for (const pages of [introPagesUk, introPagesEn]) {
    for (let i = 1; i < pages.length; i += 1) {
      const b = String(pages[i].body || '').trim();
      if (b && b.length < 140 && pages[i - 1]?.body) {
        pages[i - 1].body = `${pages[i - 1].body}\n\n${b}`.trim();
        pages[i].body = '';
      }
    }
    // Refill emptied pages from the fattest donor
    for (let i = 0; i < pages.length; i += 1) {
      if (String(pages[i].body || '').trim()) continue;
      let donorIdx = -1;
      let donorLen = 0;
      pages.forEach((p, idx) => {
        const len = String(p.body || '').length;
        if (len > donorLen) {
          donorLen = len;
          donorIdx = idx;
        }
      });
      if (donorIdx < 0) continue;
      const paras = String(pages[donorIdx].body)
        .split(/\n\s*\n/)
        .map((x) => x.trim())
        .filter(Boolean);
      if (paras.length < 2) continue;
      pages[i].body = paras.pop();
      pages[donorIdx].body = paras.join('\n\n');
    }
  }

  const shortUk =
    'Неоготичний костел 1899–1909 років архітектора Владислава Городецького; вежі близько 60 м, органна зала й католицька парафія.';
  const shortEn =
    'Neo-Gothic church built 1899–1909 by Władysław Horodecki; twin towers ~60 m, shared with the National Organ Hall.';

  const story = {
    shortIntroUk: shortUk,
    shortIntroEn: shortEn,
    miniPreviewUk: shortUk,
    miniPreviewEn: shortEn,
    introPage1Uk: intro1Uk,
    introPage1En: intro1En,
    introPagesUk,
    introPagesEn,
    ...(factUk
      ? {
          photoFact: {
            titleUk: 'Цікаво знати',
            titleEn: 'Did you know?',
            bodyUk: factUk,
            bodyEn: factEn || factUk,
          },
        }
      : {}),
    ...(fact2Uk && fact2Uk !== factUk
      ? {
          secondFact: {
            titleUk: 'Ще один штрих',
            titleEn: 'One more detail',
            bodyUk: fact2Uk,
            bodyEn: fact2En || fact2Uk,
          },
        }
      : {}),
    quiz: {
      questionUk: 'Хто був головним архітектором костелу Святого Миколая в Києві?',
      questionEn: 'Who was the lead architect of St. Nicholas Cathedral in Kyiv?',
      options: [
        { textUk: 'Владислав Городецький', textEn: 'Władysław Horodecki', correct: true },
        { textUk: 'Вікентій Беретті', textEn: 'Vincenzo Beretti', correct: false },
        { textUk: 'Андрій Меленський', textEn: 'Andriy Melenskyi', correct: false },
      ],
      multiHintUk: 'Погляньте на табличку біля входу — ім’я **Городецького** згадується в історії будівництва.',
      multiHintEn: 'Look for **Horodecki** — he finalized the Gothic design after the 1898 competition.',
    },
    ttsEnabled: true,
    audioScriptUk: [intro1Uk, ...bodiesUk].join('\n\n'),
    audioScriptEn: [intro1En, ...bodiesEn].join('\n\n'),
    wikipediaUrl: 'https://uk.wikipedia.org/wiki/Костел_Святого_Миколая_(Київ)',
    _introBuilt: true,
    _wikiGenerated: true,
    _wikiTextRebuilt: true,
  };

  let manual = {};
  try {
    manual = JSON.parse(fs.readFileSync(MANUAL_PATH, 'utf8'));
  } catch {
    manual = {};
  }
  manual[KEY] = story;
  fs.writeFileSync(MANUAL_PATH, JSON.stringify(manual, null, 2), 'utf8');

  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    cache = {};
  }
  cache[KEY] = {
    ...(cache[KEY] || {}),
    story: {
      ...(cache[KEY]?.story || {}),
      ...story,
    },
    wikiTitle: 'Костел Святого Миколая (Київ)',
    imageCount: cache[KEY]?.imageCount || 0,
  };
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');

  const empty = bodiesUk.filter((b) => !b || b.length < 80).length;
  console.log(
    `Wrote ${MANUAL_PATH}\nUK units=${unitsUk.length} EN units=${unitsEn.length} emptyPages=${empty}`,
  );
  bodiesUk.forEach((b, i) => console.log(`  page ${i + 1}: ${b.length} chars`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
