


import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const jiti = createJiti(import.meta.url, { interopDefault: true });
const {
  appendNewLocationFromExportJson,
  validateLocationExportJson,
} = jiti(path.join(ROOT, 'app/landmarkLocationJsonMapper.js'));

const MINIMAL_BUNDLE_BASE = {
  homeCountryOrder: ['UA'],
  homeRegionIdsByCountry: { UA: [] },
  regions: {},
  homeCountryHeroRefs: {},
  homeCountryHeroUris: {},
};

const DEFAULT_BUNDLE_BASE_PATH = path.join(ROOT, 'data/landmarks/bundle_base.json');
const INBOX_DIR = path.join(ROOT, 'data/landmarks/inbox');
const MANIFEST_PATH = path.join(INBOX_DIR, 'manifest.json');
const OUT_INJECT = path.join(ROOT, 'app/location_bundle.injected.json');
const OUT_EXPORT = path.join(ROOT, 'data/landmarks/out/kraina_admin_location_bundle.json');

function parseArgs(argv) {
  const out = { basePath: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '
      out.basePath = path.isAbsolute(argv[i + 1]) ? argv[i + 1] : path.join(ROOT, argv[i + 1]);
      i += 1;
    }
  }
  return out;
}

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(p) {
  const raw = await readFile(p, 'utf8');
  return JSON.parse(raw);
}

async function loadBaseSnapshot(baseArg) {
  if (baseArg) {
    if (!(await fileExists(baseArg))) {
      throw new Error(`
    }
    return readJsonFile(baseArg);
  }
  if (await fileExists(DEFAULT_BUNDLE_BASE_PATH)) {
    return readJsonFile(DEFAULT_BUNDLE_BASE_PATH);
  }
  return JSON.parse(JSON.stringify(MINIMAL_BUNDLE_BASE));
}

async function listInboxJsonFiles() {
  if (!(await fileExists(INBOX_DIR))) {
    return [];
  }
  const names = await readdir(INBOX_DIR);
  return names
    .filter((n) => n.endsWith('.json') && n !== 'manifest.json')
    .sort();
}


async function readManifest() {
  if (!(await fileExists(MANIFEST_PATH))) return null;
  const m = await readJsonFile(MANIFEST_PATH);
  if (!m || !Array.isArray(m.items) || m.items.length === 0) return null;
  return m;
}

function normalizeItems(manifest, fallbackFiles) {
  if (manifest?.items?.length) {
    return manifest.items
      .map((it) => ({
        file: String(it?.file || '').trim(),
        countryId: it?.countryId != null ? String(it.countryId).trim() : 'UA',
        attachToRegionId: it?.attachToRegionId == null || it.attachToRegionId === '' ? null : String(it.attachToRegionId).trim(),
      }))
      .filter((it) => it.file);
  }
  return fallbackFiles.map((file) => ({
    file,
    countryId: 'UA',
    attachToRegionId: null,
  }));
}

export async function buildBundleFromInboxMain(argv = process.argv.slice(2)) {
  const { basePath } = parseArgs(argv);
  const base = await loadBaseSnapshot(basePath);
  const inDirFiles = await listInboxJsonFiles();
  if (!inDirFiles.length) {
    throw new Error(
      `Немає JSON у inbox.\n  Папка: ${INBOX_DIR}\n  Покладіть сюди *.json або: npm run location:inbox:copy-example   (копія data/landmarks/sofia_cathedral.json)`,
    );
  }
  const manifest = await readManifest();
  const items = normalizeItems(manifest, inDirFiles);
  if (!items.length) throw new Error('manifest.json порожній або невалідний');

  let snap = base;
  const applied = [];

  for (const it of items) {
    const fp = path.join(INBOX_DIR, it.file);
    if (!(await fileExists(fp))) {
      throw new Error(`Немає файлу: ${it.file} (шлях ${fp})`);
    }
    const json = await readJsonFile(fp);
    const v = validateLocationExportJson(json);
    if (!v.ok) {
      throw new Error(`${it.file}: ${v.errors.join(', ')}`);
    }
    if (it.attachToRegionId && !snap.regions?.[it.attachToRegionId]) {
      throw new Error(
        `${it.file}: attachToRegionId "${it.attachToRegionId}" — такого регіону немає в бандлі. Додайте data/landmarks/bundle_base.json з повною картою або зніміть прив'язку.`,
      );
    }
    const { snapshot: next, regionId, landmarkId } = appendNewLocationFromExportJson(snap, {
      json,
      countryId: it.countryId || 'UA',
      attachToRegionId: it.attachToRegionId || null,
    });
    snap = next;
    applied.push({ file: it.file, regionId, landmarkId });
  }

  const out = JSON.parse(JSON.stringify(snap));
  await mkdir(path.dirname(OUT_EXPORT), { recursive: true });
  const pretty = `${JSON.stringify(out, null, 2)}\n`;
  await writeFile(OUT_INJECT, pretty, 'utf8');
  await writeFile(OUT_EXPORT, pretty, 'utf8');
  return { applied, outPathInject: OUT_INJECT, outPathExport: OUT_EXPORT };
}

async function runCli() {
  try {
    const { applied, outPathInject, outPathExport } = await buildBundleFromInboxMain();
    const lines = applied.map(
      (a) => `  • ${a.file} → ${a.regionId}/${a.landmarkId}`,
    );
    
    console.log(
      `OK, ${applied.length} локаль(ок):\n${lines.join(
        '\n',
      )}\n\nзаписано:\n  ${outPathInject}\n  ${outPathExport}\n\nПерезавантажте Metro / додаток (dev), щоб підхопити знімок.`,
    );
  } catch (e) {
    
    console.error(e?.message || e);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli();
}
