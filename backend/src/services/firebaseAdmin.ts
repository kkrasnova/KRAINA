import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from '../logger.js';

type ServiceAccount = admin.ServiceAccount & { project_id?: string };

// ---------------------------------------------------------------------------
// Service account loader — shared by all Firebase Admin consumers.
// Tries FIREBASE_SERVICE_ACCOUNT_JSON first, then FIREBASE_SERVICE_ACCOUNT_PATH.
// Returns null when neither is set (features degrade gracefully).
// ---------------------------------------------------------------------------

function loadServiceAccount(): ServiceAccount | null {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '').trim();
  if (raw) {
    try {
      return JSON.parse(raw) as ServiceAccount;
    } catch (e) {
      logger.warn('[firebaseAdmin] FIREBASE_SERVICE_ACCOUNT_JSON parse failed', {
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  const filePath = (process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? '').trim();
  if (filePath) {
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(abs)) {
      logger.warn('[firebaseAdmin] FIREBASE_SERVICE_ACCOUNT_PATH not found', { path: abs });
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(abs, 'utf8')) as ServiceAccount;
    } catch (e) {
      logger.warn('[firebaseAdmin] FIREBASE_SERVICE_ACCOUNT_PATH parse failed', {
        path: abs,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Default (unnamed) app — used by:
//   - firebaseAdminAuthService (custom auth tokens)
//   - firestoreAdminService (follow-request verification)
// ---------------------------------------------------------------------------

let defaultAppInitialized = false;

function ensureDefaultApp(account: ServiceAccount): boolean {
  if (defaultAppInitialized) return true;
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(account),
        projectId: account.project_id,
      });
    }
    defaultAppInitialized = true;
    return true;
  } catch (e) {
    logger.error('[firebaseAdmin] default app init failed', {
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Named publisher app — used by landmarkContentFirestorePublisher so it can
// target a specific Firestore database ID without affecting the default app.
// ---------------------------------------------------------------------------

const PUBLISHER_APP_NAME = 'kraina-landmark-publisher';
let publisherAppInitialized = false;

function ensurePublisherApp(account: ServiceAccount): boolean {
  if (publisherAppInitialized) return true;
  try {
    const existing = admin.apps.find((a) => a?.name === PUBLISHER_APP_NAME);
    if (!existing) {
      admin.initializeApp(
        {
          credential: admin.credential.cert(account),
          projectId:
            process.env.GOOGLE_CLOUD_PROJECT ||
            process.env.GCLOUD_PROJECT ||
            account.project_id,
        },
        PUBLISHER_APP_NAME,
      );
    }
    publisherAppInitialized = true;
    return true;
  } catch (e) {
    logger.error('[firebaseAdmin] publisher app init failed', {
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Cached singletons
// ---------------------------------------------------------------------------

let cachedAuth: admin.auth.Auth | null | undefined;
let cachedFirestore: ReturnType<typeof admin.firestore> | null | undefined;
let cachedPublisherDb: Firestore | null | undefined;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns an `admin.auth.Auth` instance, or `null` when Firebase is not
 * configured. The result is cached — subsequent calls are free.
 *
 * Used by auth routes to issue Firebase custom tokens so the mobile client
 * can authenticate with Firestore security rules.
 */
export function getAdminAuth(): admin.auth.Auth | null {
  if (cachedAuth !== undefined) return cachedAuth;

  const account = loadServiceAccount();
  if (!account) {
    cachedAuth = null;
    return null;
  }

  if (!ensureDefaultApp(account)) {
    cachedAuth = null;
    return null;
  }

  cachedAuth = admin.auth();
  return cachedAuth;
}

/**
 * Returns a Firestore client on the **default** database, or `null` when
 * Firebase is not configured. Cached.
 *
 * Used to verify incoming follow requests stored in Firestore by the mobile
 * client.
 */
export function getFirestoreAdmin(): ReturnType<typeof admin.firestore> | null {
  if (cachedFirestore !== undefined) return cachedFirestore;

  const account = loadServiceAccount();
  if (!account) {
    cachedFirestore = null;
    return null;
  }

  if (!ensureDefaultApp(account)) {
    cachedFirestore = null;
    return null;
  }

  cachedFirestore = admin.firestore();
  return cachedFirestore;
}

/**
 * Returns a **separate** Firestore client (on its own named app) targeting a
 * specific Firestore database, or `null` when Firebase is not configured.
 * Cached.
 *
 * Used by the landmark CMS publisher to write into a non-default database
 * without interfering with the default app's credentials or Firestore instance.
 */
export function getPublisherFirestoreDb(): Firestore | null {
  if (cachedPublisherDb !== undefined) return cachedPublisherDb;

  const account = loadServiceAccount();
  if (!account) {
    cachedPublisherDb = null;
    return null;
  }

  if (!ensurePublisherApp(account)) {
    cachedPublisherDb = null;
    return null;
  }

  const databaseId = (process.env.FIRESTORE_DATABASE_ID ?? '').trim() || '(default)';
  const app = admin.apps.find((a) => a?.name === PUBLISHER_APP_NAME);
  if (!app) {
    cachedPublisherDb = null;
    return null;
  }

  const db = getFirestore(app, databaseId);
  db.settings({ ignoreUndefinedProperties: true });
  cachedPublisherDb = db;
  return cachedPublisherDb;
}

/**
 * Returns true when a valid service account credential is available and
 * Firebase Admin can be initialized.
 */
export function isFirebaseConfigured(): boolean {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '').trim();
  if (raw) return true;
  const filePath = (process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? '').trim();
  if (filePath) {
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    return fs.existsSync(abs);
  }
  return false;
}
