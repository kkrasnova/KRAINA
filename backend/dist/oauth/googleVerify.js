import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';
import { HttpError } from '../errors/HttpError.js';
const client = new OAuth2Client();
export async function verifyGoogleIdToken(idToken) {
    if (!config.googleClientId) {
        throw new HttpError(400, 'invalid_token');
    }
    try {
        const ticket = await client.verifyIdToken({
            idToken,
            audience: config.googleClientId,
        });
        const payload = ticket.getPayload();
        if (!payload) {
            throw new HttpError(400, 'invalid_token');
        }
        const email = payload.email?.trim().toLowerCase();
        if (!email) {
            throw new HttpError(400, 'email_required');
        }
        return { email, name: payload.name ?? undefined };
    }
    catch (e) {
        if (e instanceof HttpError)
            throw e;
        throw new HttpError(400, 'invalid_token');
    }
}
//# sourceMappingURL=googleVerify.js.map