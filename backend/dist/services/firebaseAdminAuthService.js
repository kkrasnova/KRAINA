import { getAdminAuth } from './firebaseAdmin.js';
import { logger } from '../logger.js';
export async function createFirebaseCustomToken(uid, claims) {
    const a = getAdminAuth();
    if (!a)
        return null;
    const id = String(uid || '').trim();
    if (!id)
        return null;
    try {
        return await a.createCustomToken(id, claims);
    }
    catch (e) {
        logger.warn('[firebaseAdminAuth] createCustomToken failed', {
            error: e instanceof Error ? e.message : String(e),
        });
        return null;
    }
}
//# sourceMappingURL=firebaseAdminAuthService.js.map