import admin from 'firebase-admin';
import { type Firestore } from 'firebase-admin/firestore';
/**
 * Returns an `admin.auth.Auth` instance, or `null` when Firebase is not
 * configured. The result is cached — subsequent calls are free.
 *
 * Used by auth routes to issue Firebase custom tokens so the mobile client
 * can authenticate with Firestore security rules.
 */
export declare function getAdminAuth(): admin.auth.Auth | null;
/**
 * Returns a Firestore client on the **default** database, or `null` when
 * Firebase is not configured. Cached.
 *
 * Used to verify incoming follow requests stored in Firestore by the mobile
 * client.
 */
export declare function getFirestoreAdmin(): ReturnType<typeof admin.firestore> | null;
/**
 * Returns a **separate** Firestore client (on its own named app) targeting a
 * specific Firestore database, or `null` when Firebase is not configured.
 * Cached.
 *
 * Used by the landmark CMS publisher to write into a non-default database
 * without interfering with the default app's credentials or Firestore instance.
 */
export declare function getPublisherFirestoreDb(): Firestore | null;
/**
 * Returns true when a valid service account credential is available and
 * Firebase Admin can be initialized.
 */
export declare function isFirebaseConfigured(): boolean;
//# sourceMappingURL=firebaseAdmin.d.ts.map