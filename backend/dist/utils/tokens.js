import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
export function hashRefreshToken(raw) {
    return createHash('sha256')
        .update(raw + config.refreshPepper)
        .digest('hex');
}
export function randomOpaqueToken() {
    return randomBytes(48).toString('hex');
}
export function signAccessToken(userId, email, role) {
    return jwt.sign({ sub: userId, email, role }, config.jwtSecret, {
        expiresIn: config.accessTokenTtlSec,
    });
}
export function verifyAccessToken(token) {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (!decoded.sub || !decoded.email || !decoded.role) {
        throw new Error('invalid_token');
    }
    return {
        sub: decoded.sub,
        email: String(decoded.email),
        role: String(decoded.role),
    };
}
//# sourceMappingURL=tokens.js.map