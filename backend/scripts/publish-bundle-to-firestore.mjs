

import dotenv from 'dotenv';
import admin from 'firebase-admin';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoEnvPath = path.join(__dirname, '../../.env');
const backendEnvPath = path.join(__dirname, '../.env');

dotenv.config({ path: repoEnvPath });
dotenv.config({ path: backendEnvPath });

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  let accountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (raw && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error(
        `Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${e.message}. ` +
          'Use FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/service-account.json',
      );
    }
  }

  if (accountPath && accountPath.trim()) {
    accountPath = path.resolve(accountPath.trim());
    if (!fs.existsSync(accountPath)) {
      throw new Error(
        `Файл ключа Firebase не знайдено за шляхом:\n  ${accountPath}\n` +
          `Перевірте шлях до JSON із Firebase Console (Generate new private key). ` +
          `Не використовуйте placeholder «path/to/…» з прикладу документації.`,
      );
    }
    const content = fs.readFileSync(accountPath, 'utf8');
    try {
      return JSON.parse(content);
    } catch (e) {
      throw new Error(`Invalid JSON in FIREBASE_SERVICE_ACCOUNT_PATH (${accountPath}): ${e.message}`);
    }
  }

  throw new Error(
    `Не задані облікові дані Firebase.\n\n` +
      `Надійний спосіб — рядок у backend/.env або .env у корені репозиторію:\n` +
      `  FIREBASE_SERVICE_ACCOUNT_PATH=/повний/шлях/до
function makeDocId(regionId, landmarkId) {
  const safe = (s) =>
    String(s || '')
      .trim()
      .replace(/[^\w.-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 100);
  const a = safe(regionId);
  const b = safe(landmarkId);
  const id = `${a}__${b}`;
  return id || 'unknown';
}

function pickCoverUrl(lm) {
  const thumb = typeof lm.thumbUri === 'string' ? lm.thumbUri.trim() : '';
  if (/^https?:\/\//i.test(thumb)) return thumb;
  if (Array.isArray(lm.galleryUris)) {
    for (const u of lm.galleryUris) {
      const s = typeof u === 'string' ? u.trim() : '';
      if (/^https?:\/\//i.test(s)) return s;
    }
  }
  return null;
}

function normalizeFacts(lm) {
  if (!Array.isArray(lm?.facts)) return [];
  return lm.facts
    .map((f) => (f && typeof f === 'object' ? String(f.text || '').trim() : String(f || '').trim()))
    .filter(Boolean)
    .slice(0, 20);
}


export function bundleSnapshotToFirestoreWrites(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return [];
  const regions = snapshot.regions;
  if (!regions || typeof regions !== 'object') return [];

  const out = [];
  for (const [regionId, region] of Object.entries(regions)) {
    if (!region || typeof region !== 'object') continue;
    const cityUk = String(region.titleUk || '').trim();
    const cityEn = String(region.titleEn || '').trim();
    const countryUk = String(region.countryUk || '').trim();
    const countryEn = String(region.countryEn || '').trim();
    const landmarks = Array.isArray(region.landmarks) ? region.landmarks : [];

    for (const lm of landmarks) {
      if (!lm || typeof lm !== 'object') continue;
      const lat = Number(lm.lat);
      const lng = Number(lm.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const lmId = String(lm.id || '').trim();
      if (!lmId) continue;

      const titleUk = String(lm.titleUk || '').trim();
      const titleEn = String(lm.titleEn || '').trim();
      const extract = String(lm.extract || lm.descUk || '').trim();
      const facts = normalizeFacts(lm);
      const docId = makeDocId(regionId, lmId);
      const cat = String(lm.category || 'monument').trim() || 'monument';

      out.push({
        docId,
        data: {
          title: titleUk || titleEn || lmId,
          title_uk: titleUk,
          title_en: titleEn,
          city: cityUk || cityEn || regionId,
          country: countryUk || countryEn || '',
          category: cat,
          lat,
          lng,
          cover_image_url: pickCoverUrl(lm),
          extract,
          facts,
          published: true,
          source: 'kraina-bundle',
          region_id: regionId,
          landmark_id: lmId,
          updated_at: new Date().toISOString(),
        },
      });
    }
  }
  return out;
}

const DEFAULT_BUNDLE = path.join(__dirname, '../../data/landmarks/out/kraina_admin_location_bundle.json');

async function main() {
  const argv = process.argv.slice(2);
  const { dryRun, file: fileArg } = parseArgs(argv);
  const bundlePath = fileArg || DEFAULT_BUNDLE;

  let raw;
  try {
    raw = await readFile(bundlePath, 'utf8');
  } catch (e) {
    console.error(`Не вдалося прочитати бандл: ${bundlePath}\n${e?.message || e}`);
    console.error('Спочатку зіберіть: npm run location:inbox:build   (з корня репозиторію)');
    process.exit(1);
  }

  let snapshot;
  try {
    snapshot = JSON.parse(raw);
  } catch (e) {
    console.error(`Невалідний JSON: ${e?.message || e}`);
    process.exit(1);
  }

  if (snapshot && snapshot._skip) {
    console.error(
      'Бандл містить "_skip": true (наприклад після location:inbox:reset). Зіберіть inbox або вкажіть 
    );
    process.exit(1);
  }

  const writes = bundleSnapshotToFirestoreWrites(snapshot);
  if (!writes.length) {
    console.warn(`У файлі немає локацій з валідними lat/lng: ${bundlePath}`);
    process.exit(0);
  }

  console.log(`Файл: ${bundlePath}`);
  console.log(`Документів для запису в locations: ${writes.length}`);
  if (writes.length <= 3) {
    writes.forEach((w) => console.log(`  • ${w.docId}: ${w.data.title}`));
  } else {
    writes.slice(0, 2).forEach((w) => console.log(`  • ${w.docId}: ${w.data.title}`));
    console.log(`  • … ще ${writes.length - 2}`);
  }

  if (dryRun) {
    console.log('[dry-run] Firebase не чіпали.');
    process.exit(0);
  }

  const serviceAccount = parseServiceAccount();
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || serviceAccount.project_id;
  const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
  }
  const db = admin.firestore(admin.app(), firestoreDatabaseId);
  db.settings({ ignoreUndefinedProperties: true });

  await db.collection('__migration_healthcheck').limit(1).get();
  console.log(`Firestore OK (project=${projectId}, database=${firestoreDatabaseId})`);

  const chunkSize = 450;
  for (let i = 0; i < writes.length; i += chunkSize) {
    const slice = writes.slice(i, i + chunkSize);
    const batch = db.batch();
    for (const { docId, data } of slice) {
      batch.set(db.collection('locations').doc(docId), data, { merge: true });
    }
    await batch.commit();
    console.log(`Записано ${Math.min(i + slice.length, writes.length)} / ${writes.length}`);
  }

  console.log('Готово. Перезапустіть застосунок або зачекайте TTL кешу каталогу (~5 хв), щоб побачити зміни на карті.');
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
