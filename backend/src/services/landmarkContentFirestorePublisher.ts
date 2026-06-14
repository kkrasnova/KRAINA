import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';



export type LandmarkFirestoreWrite = {
  docId: string;
  data: Record<string, unknown>;
};

export type PublishResult =
  | { status: 'published'; written: number }
  | { status: 'empty' }
  | { status: 'skipped'; reason: 'no_admin' | 'init_failed' | 'skip_flag' }
  | { status: 'error'; message: string };

function safeIdSegment(input: unknown): string {
  return String(input ?? '')
    .trim()
    .replace(/[^\w.-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100);
}

function makeDocId(regionId: unknown, landmarkId: unknown): string {
  const a = safeIdSegment(regionId);
  const b = safeIdSegment(landmarkId);
  const id = `${a}__${b}`;
  return id || 'unknown';
}

function pickCoverUrl(lm: Record<string, unknown>): string | null {
  const thumb = typeof lm.thumbUri === 'string' ? lm.thumbUri.trim() : '';
  if (/^https?:\/\//i.test(thumb)) return thumb;
  const gallery = lm.galleryUris;
  if (Array.isArray(gallery)) {
    for (const u of gallery) {
      const s = typeof u === 'string' ? u.trim() : '';
      if (/^https?:\/\//i.test(s)) return s;
    }
  }
  return null;
}

function normalizeFacts(lm: Record<string, unknown>): string[] {
  const factsRaw = lm.facts;
  if (!Array.isArray(factsRaw)) return [];
  return factsRaw
    .map((f) => (f && typeof f === 'object' ? String((f as Record<string, unknown>).text ?? '').trim() : String(f ?? '').trim()))
    .filter(Boolean)
    .slice(0, 20);
}

export function bundleSnapshotToFirestoreWrites(snapshot: unknown): LandmarkFirestoreWrite[] {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return [];
  const regions = (snapshot as Record<string, unknown>).regions;
  if (!regions || typeof regions !== 'object') return [];

  const out: LandmarkFirestoreWrite[] = [];
  for (const [regionId, regionRaw] of Object.entries(regions as Record<string, unknown>)) {
    if (!regionRaw || typeof regionRaw !== 'object') continue;
    const region = regionRaw as Record<string, unknown>;
    const cityUk = String(region.titleUk ?? '').trim();
    const cityEn = String(region.titleEn ?? '').trim();
    const countryUk = String(region.countryUk ?? '').trim();
    const countryEn = String(region.countryEn ?? '').trim();
    const landmarks = Array.isArray(region.landmarks) ? region.landmarks : [];

    for (const lmRaw of landmarks) {
      if (!lmRaw || typeof lmRaw !== 'object') continue;
      const lm = lmRaw as Record<string, unknown>;
      const lat = Number(lm.lat);
      const lng = Number(lm.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const lmId = String(lm.id ?? '').trim();
      if (!lmId) continue;

      const titleUk = String(lm.titleUk ?? '').trim();
      const titleEn = String(lm.titleEn ?? '').trim();
      const extract = String(lm.extract ?? lm.descUk ?? '').trim();
      const facts = normalizeFacts(lm);
      const docId = makeDocId(regionId, lmId);
      const cat = String(lm.category ?? 'monument').trim() || 'monument';

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

type ServiceAccount = admin.ServiceAccount & { project_id?: string };

function loadServiceAccount(): ServiceAccount | null {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '').trim();
  if (raw) {
    try {
      return JSON.parse(raw) as ServiceAccount;
    } catch (e) {
      console.warn('[landmarkPublisher] FIREBASE_SERVICE_ACCOUNT_JSON parse failed', e);
      return null;
    }
  }
  const accountPath = (process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? '').trim();
  if (accountPath) {
    const abs = path.isAbsolute(accountPath) ? accountPath : path.resolve(process.cwd(), accountPath);
    if (!fs.existsSync(abs)) {
      console.warn('[landmarkPublisher] FIREBASE_SERVICE_ACCOUNT_PATH not found:', abs);
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(abs, 'utf8')) as ServiceAccount;
    } catch (e) {
      console.warn('[landmarkPublisher] FIREBASE_SERVICE_ACCOUNT_PATH parse failed', e);
      return null;
    }
  }
  return null;
}

let cachedDb: Firestore | null | undefined;

function getLocationsDb(): Firestore | null {
  if (cachedDb !== undefined) return cachedDb;
  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    cachedDb = null;
    return cachedDb;
  }
  try {
    const projectId =
      process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || serviceAccount.project_id;
    const appName = 'kraina-landmark-publisher';
    const existing = admin.apps.find((a) => a?.name === appName) ?? null;
    const app =
      existing ||
      admin.initializeApp(
        {
          credential: admin.credential.cert(serviceAccount),
          projectId,
        },
        appName,
      );
    const databaseId = (process.env.FIRESTORE_DATABASE_ID ?? '').trim() || '(default)';
    const db = getFirestore(app, databaseId);
    db.settings({ ignoreUndefinedProperties: true });
    cachedDb = db;
    return cachedDb;
  } catch (e) {
    console.warn('[landmarkPublisher] init failed', e);
    cachedDb = null;
    return cachedDb;
  }
}


export async function publishLandmarkBundleToFirestore(snapshot: unknown): Promise<PublishResult> {
  if (snapshot && typeof snapshot === 'object' && (snapshot as Record<string, unknown>)._skip) {
    return { status: 'skipped', reason: 'skip_flag' };
  }
  const writes = bundleSnapshotToFirestoreWrites(snapshot);
  if (writes.length === 0) {
    return { status: 'empty' };
  }
  const db = getLocationsDb();
  if (!db) {
    return { status: 'skipped', reason: 'no_admin' };
  }
  try {
    const chunkSize = 450;
    for (let i = 0; i < writes.length; i += chunkSize) {
      const slice = writes.slice(i, i + chunkSize);
      const batch = db.batch();
      for (const { docId, data } of slice) {
        batch.set(db.collection('locations').doc(docId), data, { merge: true });
      }
      await batch.commit();
    }
    return { status: 'published', written: writes.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[landmarkPublisher] publish failed', message);
    return { status: 'error', message };
  }
}
