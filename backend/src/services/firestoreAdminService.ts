import { getFirestoreAdmin } from './firebaseAdmin.js';

export type IncomingFollowRequestVerify = 'verified' | 'missing' | 'no_admin';

export async function verifyIncomingFirestoreFollowRequest(
  followerId: string,
  followeeId: string,
): Promise<IncomingFollowRequestVerify> {
  const fs = getFirestoreAdmin();
  if (!fs) return 'no_admin';
  const docId = `${followerId}__${followeeId}`;
  const snap = await fs.collection('socialFollowRequests').doc(docId).get();
  return snap.exists ? 'verified' : 'missing';
}
