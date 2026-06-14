import type { NextFunction, Request, Response } from 'express';

type CacheRow = {
  status: number;
  body: unknown;
  createdAt: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, CacheRow>();

function cleanup() {
  const now = Date.now();
  for (const [k, v] of cache.entries()) {
    if (now - v.createdAt > CACHE_TTL_MS) cache.delete(k);
  }
}

function keyFromReq(req: Request): string {
  const raw = String(req.headers['x-idempotency-key'] || '').trim();
  if (!raw) return '';
  const userId = String(req.authUser?.id || 'anon');
  return `${userId}:${raw}`;
}

export function withIdempotency(req: Request, res: Response, next: NextFunction): void {
  cleanup();
  const key = keyFromReq(req);
  if (!key) {
    next();
    return;
  }
  const hit = cache.get(key);
  if (hit) {
    res.status(hit.status).json(hit.body);
    return;
  }
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    const status = res.statusCode || 200;
    cache.set(key, { status, body, createdAt: Date.now() });
    return originalJson(body);
  }) as Response['json'];
  next();
}
