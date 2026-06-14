import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { config } from '../config.js';
import { HttpError } from '../errors/HttpError.js';
const client = jwksRsa({
    jwksUri: 'https://appleid.apple.com/auth/keys',
    cache: true,
    rateLimit: true,
});
export async function verifyAppleIdentityToken(identityToken) {
    if (!config.appleClientId) {
        throw new HttpError(400, 'invalid_token');
    }
    const decoded = jwt.decode(identityToken, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
        throw new HttpError(400, 'invalid_token');
    }
    const key = await client.getSigningKey(decoded.header.kid);
    const pub = key.getPublicKey();
    let payload;
    try {
        payload = jwt.verify(identityToken, pub, {
            algorithms: ['RS256'],
            issuer: 'https://appleid.apple.com',
            audience: config.appleClientId,
        });
    }
    catch {
        throw new HttpError(400, 'invalid_token');
    }
    const sub = payload.sub;
    if (!sub) {
        throw new HttpError(400, 'invalid_token');
    }
    let email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!email) {
        email = `apple_${sub}@privaterelay.kraina.local`;
    }
    return { email, sub, name: undefined };
}
//# sourceMappingURL=appleVerify.js.map