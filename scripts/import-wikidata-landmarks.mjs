/**
 * Imports notable city landmarks from Wikidata into app/routeRegionsData.js.
 *
 * Examples:
 *   node scripts/import-wikidata-landmarks.mjs --region lviv --limit 30
 *   node scripts/import-wikidata-landmarks.mjs --region paris --radius 10 --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ROUTE_PATH = path.join(ROOT, 'app', 'routeRegionsData.js');
const UA = 'KRAINA-LandmarkImporter/1.0 (educational travel app)';

const THUMBS = ['T1', 'T2', 'T3', 'T4'];
const EXISTING_EXTRA_BY_REGION = {
  lviv: {
    // Kept because Wikidata often returns the cemetery as a broad site without
    // the memorial-specific POIs visitors expect to see in Lviv.
    lviv_eaglets_cemetery: {
      titleUk: 'Меморіал львівських орлят',
      titleEn: 'Cemetery of the Defenders of Lviv',
      lat: 49.8326,
      lng: 24.0592,
      minutes: 35,
      free: true,
      thumb: 'T4',
      descUk: 'Меморіальна частина Личаківського цвинтаря з окремою історією Львова XX століття.',
      descEn: 'Memorial section of Lychakiv Cemetery tied to Lviv’s 20th-century history.',
    },
  },
};

function usage() {
  console.log(`Usage: node scripts/import-wikidata-landmarks.mjs --region <id> [--limit 30] [--radius 8] [--dry-run]`);
}

function parseArgs(argv) {
  const out = { region: '', limit: 30, radius: 8, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--region') out.region = String(argv[++i] || '').trim();
    else if (a.startsWith('--region=')) out.region = a.split('=')[1].trim();
    else if (a === '--limit') out.limit = Number(argv[++i] || out.limit);
    else if (a.startsWith('--limit=')) out.limit = Number(a.split('=')[1] || out.limit);
    else if (a === '--radius') out.radius = Number(argv[++i] || out.radius);
    else if (a.startsWith('--radius=')) out.radius = Number(a.split('=')[1] || out.radius);
    else if (a === '--dry-run') out.dryRun = true;
  }
  if (!Number.isFinite(out.limit) || out.limit < 1) out.limit = 30;
  if (!Number.isFinite(out.radius) || out.radius <= 0) out.radius = 8;
  return out;
}

function findRegionBlock(text, regionId) {
  const re = new RegExp(`^  ${regionId}: \\{`, 'm');
  const m = re.exec(text);
  if (!m) return null;
  let depth = 0;
  let inStr = null;
  for (let i = m.index; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { start: m.index, end: i + 1, body: text.slice(m.index, i + 1) };
    }
  }
  return null;
}

function readFieldString(block, field) {
  const m = new RegExp(`${field}:\\s*'([^']*)'`).exec(block);
  return m ? m[1] : '';
}

function readCenter(block) {
  const m = /center:\s*\{\s*latitude:\s*([-0-9.]+),\s*longitude:\s*([-0-9.]+)/.exec(block);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function existingLandmarks(block) {
  const ids = new Set();
  const titles = new Set();
  const coords = [];
  for (const m of block.matchAll(/id:\s*'([^']+)'[\s\S]*?titleUk:\s*'([^']*)'[\s\S]*?titleEn:\s*'([^']*)'[\s\S]*?lat:\s*([-0-9.]+),\s*lng:\s*([-0-9.]+)/g)) {
    ids.add(m[1]);
    titles.add(norm(m[2]));
    titles.add(norm(m[3]));
    coords.push({ lat: Number(m[4]), lng: Number(m[5]) });
  }
  return { ids, titles, coords };
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zа-яіїєґ0-9]+/gi, ' ')
    .trim();
}

function translitUk(s) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh', з: 'z',
    и: 'y', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
    р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
    щ: 'shch', ь: '', ю: 'yu', я: 'ya',
  };
  return String(s || '')
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('');
}

function makeId(regionId, title, taken) {
  const base = `${regionId}_${translitUk(title)}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 54);
  let id = base || `${regionId}_landmark`;
  let n = 2;
  while (taken.has(id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  taken.add(id);
  return id;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function jsString(s) {
  return `'${String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function categoryMinutes(type) {
  const t = norm(type);
  if (/museum|gallery|театр|theatre|opera/.test(t)) return { minutes: 55, free: false };
  if (/park|square|avenue|street|парк|площа|вулиц|проспект/.test(t)) return { minutes: 35, free: true };
  if (/cemetery|цвинтар|кладовищ/.test(t)) return { minutes: 50, free: true };
  if (/church|cathedral|monastery|synagogue|церк|собор|монастир|синагог/.test(t)) return { minutes: 40, free: true };
  return { minutes: 45, free: true };
}

function landmarkToCode(row, idx, center) {
  const distKm = haversineKm(center, { lat: row.lat, lng: row.lng });
  const meta = categoryMinutes(row.typeEn || row.typeUk);
  const thumb = row.thumb || THUMBS[idx % THUMBS.length];
  return `      {
        id: ${jsString(row.id)},
        titleUk: ${jsString(row.titleUk)},
        titleEn: ${jsString(row.titleEn)},
        lat: ${Number(row.lat.toFixed(6))},
        lng: ${Number(row.lng.toFixed(6))},
        minutes: ${row.minutes || meta.minutes},
        free: ${typeof row.free === 'boolean' ? row.free : meta.free},
        thumb: ${thumb},
        distKm: ${Number(distKm.toFixed(1))},
        descUk: ${jsString(row.descUk)},
        descEn: ${jsString(row.descEn)},
      }`;
}

async function fetchSparql(query) {
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': UA,
    },
  });
  if (!res.ok) throw new Error(`Wikidata SPARQL failed: ${res.status} ${res.statusText}`);
  return res.json();
}

function wikidataQuery({ lat, lng, radius, limit }) {
  return `
SELECT ?item ?itemLabel ?itemDescription ?itemLabelUk ?itemDescriptionUk ?coord ?image ?typeLabel ?typeLabelUk ?sitelinks WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coord.
    bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral.
    bd:serviceParam wikibase:radius "${radius}".
  }
  ?item wikibase:sitelinks ?sitelinks.
  OPTIONAL { ?item wdt:P18 ?image. }
  OPTIONAL { ?item wdt:P31 ?type. }
  OPTIONAL { ?item rdfs:label ?itemLabelUk FILTER(LANG(?itemLabelUk) = "uk"). }
  OPTIONAL { ?item schema:description ?itemDescriptionUk FILTER(LANG(?itemDescriptionUk) = "uk"). }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,uk". }
  FILTER(?sitelinks >= 2)
  FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q5. }
  FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q515. }
}
ORDER BY DESC(?sitelinks)
LIMIT ${Math.max(limit * 3, limit + 20)}
`;
}

function parsePoint(value) {
  const m = /Point\(([-0-9.]+) ([-0-9.]+)\)/.exec(value || '');
  if (!m) return null;
  return { lng: Number(m[1]), lat: Number(m[2]) };
}

async function fetchRows(regionId, center, radius, limit) {
  const json = await fetchSparql(wikidataQuery({ ...center, radius, limit }));
  return (json?.results?.bindings || [])
    .map((b) => {
      const point = parsePoint(b.coord?.value);
      const titleEn = String(b.itemLabel?.value || '').trim();
      const titleUk = String(b.itemLabelUk?.value || titleEn).trim();
      if (!point || !titleEn || /^Q[0-9]+$/.test(titleEn)) return null;
      const typeEn = String(b.typeLabel?.value || '').trim();
      const typeUk = String(b.typeLabelUk?.value || typeEn).trim();
      return {
        qid: String(b.item?.value || '').split('/').pop(),
        titleUk,
        titleEn,
        lat: point.lat,
        lng: point.lng,
        typeUk,
        typeEn,
        descUk: String(b.itemDescriptionUk?.value || typeUk || `Визначне місце у місті ${regionId}.`).trim(),
        descEn: String(b.itemDescription?.value || typeEn || `Notable place in ${regionId}.`).trim(),
      };
    })
    .filter(Boolean);
}

function mergeExtras(regionId, rows) {
  const extra = EXISTING_EXTRA_BY_REGION[regionId] || {};
  return [...rows, ...Object.entries(extra).map(([id, row]) => ({ id, ...row }))];
}

function insertRows(text, block, rows, center) {
  const marker = '\n    ],';
  const idx = block.body.lastIndexOf(marker);
  if (idx < 0) throw new Error('Could not find landmarks array closing marker');
  const existing = block.body.slice(0, idx).trimEnd();
  const prefix = text.slice(0, block.start);
  const suffix = text.slice(block.end);
  const relEnd = block.start + idx;
  const rowCode = rows.map((row, i) => landmarkToCode(row, i, center)).join(',\n');
  const comma = existing.endsWith('}') ? ',' : '';
  const nextRegion = `${block.body.slice(0, idx).trimEnd()}${comma}\n${rowCode}${block.body.slice(idx)}`;
  return `${prefix}${nextRegion}${suffix}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.region) {
    usage();
    process.exit(1);
  }
  const text = fs.readFileSync(ROUTE_PATH, 'utf8');
  const block = findRegionBlock(text, args.region);
  if (!block) throw new Error(`Region not found: ${args.region}`);
  const center = readCenter(block.body);
  if (!center) throw new Error(`Region has no center coordinates: ${args.region}`);
  const regionTitleUk = readFieldString(block.body, 'titleUk') || args.region;
  const regionTitleEn = readFieldString(block.body, 'titleEn') || args.region;
  const existing = existingLandmarks(block.body);

  const fetched = await fetchRows(args.region, center, args.radius, args.limit);
  const rows = [];
  for (const row of mergeExtras(args.region, fetched)) {
    if (existing.ids.has(row.id)) continue;
    if (existing.titles.has(norm(row.titleUk)) || existing.titles.has(norm(row.titleEn))) continue;
    if (existing.coords.some((c) => haversineKm(c, row) < 0.04)) continue;
    const titleForId = row.titleEn || row.titleUk;
    rows.push({
      ...row,
      id: row.id || makeId(args.region, titleForId, existing.ids),
      descUk: row.descUk || `Визначне місце у місті ${regionTitleUk}.`,
      descEn: row.descEn || `Notable place in ${regionTitleEn}.`,
    });
    existing.titles.add(norm(row.titleUk));
    existing.titles.add(norm(row.titleEn));
    existing.coords.push({ lat: row.lat, lng: row.lng });
    if (rows.length >= args.limit) break;
  }

  if (args.dryRun) {
    console.log(rows.map((r) => `${r.id}: ${r.titleEn} / ${r.titleUk}`).join('\n'));
    console.log(`Dry run: ${rows.length} new landmarks for ${args.region}`);
    return;
  }
  if (!rows.length) {
    console.log(`No new landmarks for ${args.region}`);
    return;
  }

  fs.writeFileSync(ROUTE_PATH, insertRows(text, block, rows, center), 'utf8');
  console.log(`Imported ${rows.length} landmarks into ${args.region}`);
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e);
  process.exit(1);
});
