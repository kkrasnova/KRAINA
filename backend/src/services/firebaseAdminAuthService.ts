import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';

type ServiceAccount = admin.ServiceAccount & { project_id?: string };

let cachedAuth: admin.auth.Auth | null | undefined;

function loadServiceAccount(): ServiceAccount | null {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '').trim();
  if (raw) {
    try {
      return JSON.parse(raw) as ServiceAccount;
    } catch (e) {
      console.warn('[firebaseAdminAuth] FIREBASE_SERVICE_ACCOUNT_JSON parse failed', e);
      return null;
    }
  }
  const p = (process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? '').trim();
  if (p) {
    const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
    if (!fs.existsSync(abs)) {
      console.warn('[firebaseAdminAuth] FIREBASE_SERVICE_ACCOUNT_PATH not found:', abs);
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(abs, 'utf8')) as ServiceAccount;
    } catch (e) {
      console.warn('[firebaseAdminAuth] FIREBASE_SERVICE_ACCOUNT_PATH parse failed', e);
      return null;
    }
  }
  return null;
}

function getAdminAuth(): admin.auth.Auth | null {
  if (cachedAuth !== undefined) return cachedAuth;
  const account = loadServiceAccount();
  if (!account) {
    cachedAuth = null;
    return cachedAuth;
  }
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(account),
        projectId: account.project_id,
      });
    }
    cachedAuth = admin.auth();
    return cachedAuth;
  } catch (e) {
    console.warn('[firebaseAdminAuth] init failed', e);
    cachedAuth = null;
    return cachedAuth;
  }
}


export async function createFirebaseCustomToken(
  uid: string,
  claims?: Record<string, unknown>,
): Promise<string | null> {
  const a = getAdminAuth();
  if (!a) return null;
  const id = String(uid || '').trim();
  if (!id) return null;
  try {
    return await a.createCustomToken(id, claims);
  } catch (e) {
    console.warn('[firebaseAdminAuth] createCustomToken failed', e);
    return null;
  }
}
