#!/usr/bin/env node
/**
 * Download flag PNGs + create country/city hero webps for new Europe countries.
 * Heroes: clone an existing branded hero as structural placeholder (identical page layout),
 * then optionally overwritten later with real photos.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const assets = path.join(root, 'app', 'assets');
const flagsDir = path.join(assets, 'flags');
fs.mkdirSync(flagsDir, { recursive: true });

const TEMPLATE_CARD = path.join(assets, 'france-card-hero.webp');
const TEMPLATE_CITY = path.join(assets, 'paris-main-hero.webp');

/** id lowercase iso2 for flagcdn */
const NEW = [
  { iso: 'PT', city: 'lisbon', slug: 'portugal' },
  { iso: 'BE', city: 'brussels', slug: 'belgium' },
  { iso: 'AT', city: 'vienna', slug: 'austria' },
  { iso: 'CH', city: 'zurich', slug: 'switzerland' },
  { iso: 'CZ', city: 'prague', slug: 'czechia' },
  { iso: 'SK', city: 'bratislava', slug: 'slovakia' },
  { iso: 'HU', city: 'budapest', slug: 'hungary' },
  { iso: 'IE', city: 'dublin', slug: 'ireland' },
  { iso: 'GB', city: 'london', slug: 'united-kingdom' },
  { iso: 'SE', city: 'stockholm', slug: 'sweden' },
  { iso: 'NO', city: 'oslo', slug: 'norway' },
  { iso: 'DK', city: 'copenhagen', slug: 'denmark' },
  { iso: 'FI', city: 'helsinki', slug: 'finland' },
  { iso: 'IS', city: 'reykjavik', slug: 'iceland' },
  { iso: 'EE', city: 'tallinn', slug: 'estonia' },
  { iso: 'GR', city: 'athens', slug: 'greece' },
  { iso: 'BG', city: 'sofia', slug: 'bulgaria' },
  { iso: 'HR', city: 'zagreb', slug: 'croatia' },
  { iso: 'SI', city: 'ljubljana', slug: 'slovenia' },
  { iso: 'RS', city: 'belgrade', slug: 'serbia' },
  { iso: 'BA', city: 'sarajevo', slug: 'bosnia' },
  { iso: 'ME', city: 'podgorica', slug: 'montenegro' },
  { iso: 'MK', city: 'skopje', slug: 'north-macedonia' },
  { iso: 'AL', city: 'tirana', slug: 'albania' },
  { iso: 'XK', city: 'pristina', slug: 'kosovo' },
  { iso: 'MD', city: 'chisinau', slug: 'moldova' },
  { iso: 'LU', city: 'luxembourg', slug: 'luxembourg' },
  { iso: 'MT', city: 'valletta', slug: 'malta' },
  { iso: 'CY', city: 'nicosia', slug: 'cyprus' },
  { iso: 'MC', city: 'monaco', slug: 'monaco' },
  { iso: 'AD', city: 'andorra', slug: 'andorra' },
  { iso: 'LI', city: 'vaduz', slug: 'liechtenstein' },
  { iso: 'SM', city: 'san_marino', slug: 'san-marino' },
  { iso: 'VA', city: 'vatican', slug: 'vatican' },
];

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

function copyIfMissing(src, dest) {
  if (fs.existsSync(dest)) return false;
  fs.copyFileSync(src, dest);
  return true;
}

const flagMap = { GB: 'gb', XK: 'xk' };

async function main() {
  let cards = 0;
  let cities = 0;
  let flags = 0;
  for (const row of NEW) {
    const card = path.join(assets, `${row.slug}-card-hero.webp`);
    const city = path.join(assets, `${row.city}-main-hero.webp`);
    if (copyIfMissing(TEMPLATE_CARD, card)) cards++;
    if (copyIfMissing(TEMPLATE_CITY, city)) cities++;

    const code = (flagMap[row.iso] || row.iso.toLowerCase());
    const flagPath = path.join(flagsDir, `${code}.png`);
    if (!fs.existsSync(flagPath)) {
      try {
        await download(`https://flagcdn.com/w160/${code}.png`, flagPath);
        flags++;
      } catch (e) {
        console.warn('flag fail', row.iso, e.message);
      }
    }
  }
  // also ensure am flag if missing
  const am = path.join(flagsDir, 'am.png');
  if (!fs.existsSync(am)) {
    try {
      await download('https://flagcdn.com/w160/am.png', am);
      flags++;
    } catch (_) {}
  }
  console.log(JSON.stringify({ cards, cities, flags, total: NEW.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
