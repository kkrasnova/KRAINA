// TTL memoization cache with AsyncStorage persistence.
// - ttlMemo: in-memory only (fast, for API response caching)
// - ttlGetItem/ttlSetItem: memory + AsyncStorage (survives app restart)
// - ttlInvalidate/ttlRemoveItem: clear by prefix or exact key

import AsyncStorage from '@react-native-async-storage/async-storage';

const cache = new Map();
const ASYNC_STORAGE_PREFIX = '@kraina_ttl:';

/**
 * In-memory memoization (existing). Fast, short-lived API response cache.
 * @param {string} key
 * @param {number} ttlMs  Time-to-live in milliseconds
 * @param {() => Promise<any>} fn  Async function to compute value if cache miss
 * @returns {Promise<any>}
 */
export async function ttlMemo(key, ttlMs, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await fn();
  cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

/**
 * Invalidate all cache entries whose key starts with the given prefix.
 * Clears both in-memory and AsyncStorage caches.
 * @param {string} prefix  Empty string clears everything.
 */
export function ttlInvalidate(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  // AsyncStorage: best-effort bulk clear (async, fire-and-forget)
  if (prefix === '') {
    // Full invalidation: clear all TTL keys
    clearAllTtlStorage().catch(() => {});
  } else {
    removeTtlKeysByPrefix(prefix).catch(() => {});
  }
}

/**
 * AsyncStorage-backed TTL get: try memory → AsyncStorage → fetchFn.
 * Best for data that should survive app restarts (e.g. landmarks, visit stats).
 *
 * @param {string} key      Cache key
 * @param {number} ttlMs    Time-to-live in milliseconds from now
 * @param {() => Promise<any>} fetchFn  Called on cache miss
 * @returns {Promise<any>}
 */
export async function ttlGetItem(key, ttlMs, fetchFn) {
  const now = Date.now();
  const storageKey = ASYNC_STORAGE_PREFIX + key;

  // 1. In-memory hit
  const memHit = cache.get(key);
  if (memHit && memHit.expiresAt > now) return memHit.value;

  // 2. AsyncStorage hit (restore to memory)
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.expiresAt > now) {
        cache.set(key, { value: parsed.value, expiresAt: parsed.expiresAt });
        return parsed.value;
      }
    }
  } catch {
    // AsyncStorage error — fall through to fetch
  }

  // 3. Fetch fresh value
  const value = await fetchFn();
  const expiresAt = now + ttlMs;
  const record = { value, expiresAt };
  cache.set(key, record);

  // 4. Persist to AsyncStorage (best-effort)
  try {
    await AsyncStorage.setItem(storageKey, JSON.stringify(record));
  } catch {
    // Storage full or unavailable — memory cache still works
  }

  return value;
}

/**
 * Store a value with TTL in both memory and AsyncStorage.
 * @param {string} key
 * @param {any} value
 * @param {number} ttlMs
 */
export async function ttlSetItem(key, value, ttlMs) {
  const expiresAt = Date.now() + ttlMs;
  const record = { value, expiresAt };
  cache.set(key, record);
  try {
    await AsyncStorage.setItem(ASYNC_STORAGE_PREFIX + key, JSON.stringify(record));
  } catch {
    // best-effort
  }
}

/**
 * Remove a specific key from both memory and AsyncStorage.
 * @param {string} key
 */
export async function ttlRemoveItem(key) {
  cache.delete(key);
  try {
    await AsyncStorage.removeItem(ASYNC_STORAGE_PREFIX + key);
  } catch {
    // best-effort
  }
}

/**
 * Remove all keys matching a prefix from AsyncStorage.
 * Used internally by ttlInvalidate.
 */
async function removeTtlKeysByPrefix(prefix) {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const ttlKeys = allKeys.filter(
      (k) => k.startsWith(ASYNC_STORAGE_PREFIX) && k.startsWith(ASYNC_STORAGE_PREFIX + prefix),
    );
    if (ttlKeys.length > 0) {
      await AsyncStorage.multiRemove(ttlKeys);
    }
  } catch {
    // best-effort
  }
}

/**
 * Clear ALL TTL-prefixed keys from AsyncStorage.
 */
async function clearAllTtlStorage() {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const ttlKeys = allKeys.filter((k) => k.startsWith(ASYNC_STORAGE_PREFIX));
    if (ttlKeys.length > 0) {
      await AsyncStorage.multiRemove(ttlKeys);
    }
  } catch {
    // best-effort
  }
}
