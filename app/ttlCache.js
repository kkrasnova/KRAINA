// Minimal TTL memoization cache. Stub for missing file referenced from feedApi.js.
const cache = new Map();

export async function ttlMemo(key, ttlMs, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await fn();
  cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function ttlInvalidate(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
