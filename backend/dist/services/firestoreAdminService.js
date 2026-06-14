import admin from 'firebase-admin';
let dbInstance;
export function getFirestoreAdminDb() {
    if (dbInstance !== undefined)
        return dbInstance;
    dbInstance = null;
    const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '').trim();
    if (!raw) {
        return null;
    }
    try {
        const cred = JSON.parse(raw);
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(cred),
                projectId: cred.project_id,
            });
        }
        dbInstance = admin.firestore();
        return dbInstance;
    }
    catch (e) {
        console.warn('[firestoreAdminService] init failed', e);
        return null;
    }
}
export async function verifyIncomingFirestoreFollowRequest(followerId, followeeId) {
    const fs = getFirestoreAdminDb();
    if (!fs)
        return 'no_admin';
    const docId = `${followerId}__${followeeId}`;
    const snap = await fs.collection('socialFollowRequests').doc(docId).get();
    return snap.exists ? 'verified' : 'missing';
}
//# sourceMappingURL=firestoreAdminService.js.map