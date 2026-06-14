import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function hashRefreshToken(raw: string): string {
  return createHash('sha256')
    .update(raw + config.refreshPepper)
    .digest('hex');
}

export function randomOpaqueToken(): string {
  return randomBytes(48).toString('hex');
}

export interface AccessPayload {
  sub: string;
  email: string;
  role: string;
}

export function signAccessToken(userId: string, email: string, role: string): string {
  return jwt.sign({ sub: userId, email, role }, config.jwtSecret, {
    expiresIn: config.accessTokenTtlSec,
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
  if (!decoded.sub || !decoded.email || !decoded.role) {
    throw new Error('invalid_token');
  }
  return {
    sub: decoded.sub,
    email: String(decoded.email),
    role: String(decoded.role),
  };
}
