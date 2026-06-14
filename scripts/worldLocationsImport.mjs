
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'app/worldLocations.json');

function usage() {
  console.log('Usage: node scripts/worldLocationsImport.mjs 
}

function parseArgs(argv) {
  let file = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '
      file = path.isAbsolute(argv[i + 1]) ? argv[i + 1] : path.join(ROOT, argv[i + 1]);
      i += 1;
    }
  }
  return { file };
}

function toRow(raw) {
  const lat = Number(raw?.lat);
  const lng = Number(raw?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const id = String(raw?.id || '').trim();
  const title = String(raw?.title || raw?.title_en || raw?.title_uk || '').trim();
  if (!id || !title) return null;
  const facts = Array.isArray(raw?.facts)
    ? raw.facts.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 20)
    : [];
  return {
    id,
    title,
    title_en: String(raw?.title_en || title).trim(),
    title_uk: String(raw?.title_uk || title).trim(),
    city: String(raw?.city || '').trim(),
    country: String(raw?.country || '').trim(),
    category: String(raw?.category || 'monument').trim(),
    lat,
    lng,
    extract: String(raw?.extract || '').trim(),
    facts,
    cover_image_url: raw?.cover_image_url ? String(raw.cover_image_url).trim() : undefined,
    source: String(raw?.source || 'world-json').trim(),
  };
}

async function main() {
  const { file } = parseArgs(process.argv.slice(2));
  if (!file) {
    usage();
    process.exit(1);
  }
  const inputRaw = await readFile(file, 'utf8');
  const inputJson = JSON.parse(inputRaw);
  if (!Array.isArray(inputJson)) {
    throw new Error('Input JSON must be an array');
  }
  const targetRaw = await readFile(TARGET, 'utf8');
  const targetJson = JSON.parse(targetRaw);
  const byId = new Map(Array.isArray(targetJson) ? targetJson.map((x) => [String(x.id), x]) : []);

  let imported = 0;
  for (const item of inputJson) {
    const row = toRow(item);
    if (!row) continue;
    byId.set(row.id, row);
    imported += 1;
  }

  const merged = Array.from(byId.values()).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  await writeFile(TARGET, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  console.log(`Imported ${imported} locations. Total in app/worldLocations.json: ${merged.length}`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
