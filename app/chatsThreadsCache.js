import { chatUserKey } from './chatService';
import { hasMessageApiToken } from './messageApi';

const store = new Map();

export function chatsCacheKey(user, folder, langUk) {
  const apiMode = hasMessageApiToken() ? 'api' : 'local';
  const f = folder === 'requests' ? 'requests' : 'inbox';
  return `${chatUserKey(user)}:${apiMode}:${f}:${langUk ? 'uk' : 'en'}`;
}

export function readChatsCache(key) {
  const row = store.get(key);
  if (!row) return null;
  return {
    threads: Array.isArray(row.threads) ? row.threads : [],
    requestCount: Number(row.requestCount) || 0,
  };
}

export function writeChatsCache(key, threads, requestCount = 0) {
  store.set(key, {
    threads: Array.isArray(threads) ? threads : [],
    requestCount: Number(requestCount) || 0,
    at: Date.now(),
  });
}
