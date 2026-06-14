const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();
function cleanup() {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
        if (now - v.createdAt > CACHE_TTL_MS)
            cache.delete(k);
    }
}
function keyFromReq(req) {
    const raw = String(req.headers['x-idempotency-key'] || '').trim();
    if (!raw)
        return '';
    const userId = String(req.authUser?.id || 'anon');
    return `${userId}:${raw}`;
}
export function withIdempotency(req, res, next) {
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
    res.json = ((body) => {
        const status = res.statusCode || 200;
        cache.set(key, { status, body, createdAt: Date.now() });
        return originalJson(body);
    });
    next();
}
//# sourceMappingURL=idempotency.js.map