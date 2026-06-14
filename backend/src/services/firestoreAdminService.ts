import admin from 'firebase-admin';

let dbInstance: ReturnType<typeof admin.firestore> | null | undefined;


export function getFirestoreAdminDb(): ReturnType<typeof admin.firestore> | null {
  if (dbInstance !== undefined) return dbInstance;
  dbInstance = null;
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '').trim();
  if (!raw) {
    return null;
  }
  try {
    const cred = JSON.parse(raw) as admin.ServiceAccount & { project_id?: string };
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(cred),
        projectId: cred.project_id,
      });
    }
    dbInstance = admin.firestore();
    return dbInstance;
  } catch (e) {
    console.warn('[firestoreAdminService] init failed', e);
    return null;
  }
}

export type IncomingFollowRequestVerify = 'verified' | 'missing' | 'no_admin';

export async function verifyIncomingFirestoreFollowRequest(
  followerId: string,
  followeeId: string,
): Promise<IncomingFollowRequestVerify> {
  const fs = getFirestoreAdminDb();
  if (!fs) return 'no_admin';
  const docId = `${followerId}__${followeeId}`;
  const snap = await fs.collection('socialFollowRequests').doc(docId).get();
  return snap.exists ? 'verified' : 'missing';
}
