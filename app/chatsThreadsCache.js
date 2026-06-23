import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { chatUserKey } from './chatService';
import { hasMessageApiToken } from './messageApi';

export const CHATS_CACHE_UPDATED = 'chats_cache_updated_v1';
export const CHATS_CACHE_TTL_MS = 120000;

const DISK_KEY_PREFIX = '@kraina_chats_threads_v2:';
const store = new Map();
let persistTimer = null;
let pendingPersistUser = null;
let pendingPersistLangUk = true;

export function chatsCacheKey(user, folder, langUk) {
  const apiMode = hasMessageApiToken() ? 'api' : 'local';
  const f = folder === 'requests' ? 'requests' : 'inbox';
  return `${chatUserKey(user)}:${apiMode}:${f}:${langUk ? 'uk' : 'en'}`;
}

function diskKeyFor(user, langUk) {
  const apiMode = hasMessageApiToken() ? 'api' : 'local';
  return `${DISK_KEY_PREFIX}${chatUserKey(user)}:${apiMode}:${langUk ? 'uk' : 'en'}`;
}

function rowFromStore(key) {
  return store.get(key) || null;
}

export function hasChatsCache(key) {
  return store.has(key);
}

export function isChatsCacheFresh(key, ttlMs = CHATS_CACHE_TTL_MS) {
  const row = rowFromStore(key);
  if (!row?.network) return false;
  return Date.now() - (Number(row.at) || 0) < ttlMs;
}

export function readChatsCache(key) {
  const row = rowFromStore(key);
  if (!row) return null;
  return {
    threads: Array.isArray(row.threads) ? row.threads : [],
    requestCount: Number(row.requestCount) || 0,
  };
}

export function writeChatsCache(key, threads, requestCount = 0, { persist = true, user, langUk } = {}) {
  store.set(key, {
    threads: Array.isArray(threads) ? threads : [],
    requestCount: Number(requestCount) || 0,
    at: Date.now(),
    network: true,
  });
  DeviceEventEmitter.emit(CHATS_CACHE_UPDATED, { key });
  if (persist && user) schedulePersistChatsDisk(user, langUk);
}

/** Порожній кеш — екран відкривається миттєво, дані підтягуються у фоні. */
export function seedChatsCachesIfMissing(user, langUk = true) {
  let seeded = false;
  for (const folder of ['inbox', 'requests']) {
    const key = chatsCacheKey(user, folder, langUk);
    if (store.has(key)) continue;
    store.set(key, {
      threads: [],
      requestCount: 0,
      at: 0,
      network: false,
    });
    seeded = true;
  }
  if (seeded) {
    DeviceEventEmitter.emit(CHATS_CACHE_UPDATED, {
      key: chatsCacheKey(user, 'inbox', langUk),
    });
  }
}

function schedulePersistChatsDisk(user, langUk = true) {
  pendingPersistUser = user;
  pendingPersistLangUk = langUk;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const u = pendingPersistUser;
    const lk = pendingPersistLangUk;
    pendingPersistUser = null;
    if (u) void persistChatsCachesToDisk(u, lk).catch(() => {});
  }, 400);
}

async function persistChatsCachesToDisk(user, langUk = true) {
  const inboxKey = chatsCacheKey(user, 'inbox', langUk);
  const requestsKey = chatsCacheKey(user, 'requests', langUk);
  const inbox = rowFromStore(inboxKey);
  const requests = rowFromStore(requestsKey);
  if (!inbox && !requests) return;
  const payload = {
    inbox: inbox
      ? {
          threads: inbox.threads,
          requestCount: inbox.requestCount,
          at: inbox.at,
          network: !!inbox.network,
        }
      : null,
    requests: requests
      ? {
          threads: requests.threads,
          requestCount: requests.requestCount,
          at: requests.at,
          network: !!requests.network,
        }
      : null,
  };
  await AsyncStorage.setItem(diskKeyFor(user, langUk), JSON.stringify(payload));
}

/** Відновити кеш з диска на cold start — до відкриття екрана чатів. */
export async function hydrateChatsCachesFromDisk(user, langUk = true) {
  if (!user) return;
  seedChatsCachesIfMissing(user, langUk);
  try {
    const raw = await AsyncStorage.getItem(diskKeyFor(user, langUk));
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const inboxKey = chatsCacheKey(user, 'inbox', langUk);
    const requestsKey = chatsCacheKey(user, 'requests', langUk);
    if (parsed?.inbox) {
      store.set(inboxKey, {
        threads: Array.isArray(parsed.inbox.threads) ? parsed.inbox.threads : [],
        requestCount: Number(parsed.inbox.requestCount) || 0,
        at: Number(parsed.inbox.at) || Date.now(),
        network: !!parsed.inbox.network,
      });
    }
    if (parsed?.requests) {
      store.set(requestsKey, {
        threads: Array.isArray(parsed.requests.threads) ? parsed.requests.threads : [],
        requestCount: Number(parsed.requests.requestCount) || 0,
        at: Number(parsed.requests.at) || Date.now(),
        network: !!parsed.requests.network,
      });
    }
    DeviceEventEmitter.emit(CHATS_CACHE_UPDATED, { key: inboxKey });
  } catch {
    /* ignore corrupt cache */
  }
}

export function chatsLangUkFromUser(user) {
  const lang = String(user?.appLanguage || 'uk').split(/[-_]/)[0].toLowerCase();
  return lang === 'uk';
}

/**
 * Підрахунок бейджа «нових повідомлень» у шапці — лише непрочитані в «Чати» (inbox).
 * Заявки («Запити») НЕ враховуються тут: вони мають власний бейдж на вкладці «Запити»
 * (див. ChatsPage). Інакше бейдж показує «N нових повідомлень», коли нових немає,
 * а є лише pending-заявки в окремій вкладці.
 */
export function computeUnreadBadgeFromApiRows(inboxRows, _requestRows) {
  let total = 0;
  for (const row of inboxRows || []) {
    total += Math.max(0, Number(row?.unread_count) || 0);
  }
  return total;
}

/**
 * Швидкий підрахунок бейджа непрочитаних із in-memory кешу (без мережі).
 * Лише inbox unreadCount — заявки враховуються окремим бейджем на вкладці «Запити».
 */
export function computeUnreadBadgeCount(user, langUk = true) {
  const inbox = readChatsCache(chatsCacheKey(user, 'inbox', langUk));
  let total = 0;
  for (const row of inbox?.threads || []) {
    total += Math.max(0, Number(row?.unreadCount) || 0);
  }
  return total;
}

/** Миттєво скинути unread у кеші після відкриття треду (бейдж оновлюється без мережі). */
export function clearThreadUnreadInCache(user, threadId, langUk = true) {
  const tid = String(threadId || '');
  if (!tid) return;
  for (const folder of ['inbox', 'requests']) {
    const key = chatsCacheKey(user, folder, langUk);
    const cached = readChatsCache(key);
    if (!hasChatsCache(key) || !cached?.threads?.length) continue;
    const idx = cached.threads.findIndex((t) => String(t.id) === tid);
    if (idx === -1) continue;
    const next = cached.threads.slice();
    next[idx] = { ...next[idx], unreadCount: 0 };
    writeChatsCache(key, next, cached.requestCount, { user, langUk });
  }
}
