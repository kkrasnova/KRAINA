import { getFirestoreAdmin } from './firebaseAdmin.js';
export async function verifyIncomingFirestoreFollowRequest(followerId, followeeId) {
    const fs = getFirestoreAdmin();
    if (!fs)
        return 'no_admin';
    const docId = `${followerId}__${followeeId}`;
    const snap = await fs.collection('socialFollowRequests').doc(docId).get();
    return snap.exists ? 'verified' : 'missing';
}
//# sourceMappingURL=firestoreAdminService.js.map