import AsyncStorage from '@react-native-async-storage/async-storage';
import { stableUserKey } from './countryStorage';
import { resolveFeedLocalUser } from './feedLocalUser';

const DELETED_PREFIX = '@kraina_feed_deleted_v1:';

const memByUser = new Map();
const loadPromises = new Map();

function userKey(user) {
  return stableUserKey(resolveFeedLocalUser(user) || user);
}

function storageKey(userKeyStr) {
  return `${DELETED_PREFIX}${userKeyStr}`;
}

async function ensureLoaded(user) {
  const uk = userKey(user);
  if (memByUser.has(uk)) return memByUser.get(uk);
  let pending = loadPromises.get(uk);
  if (!pending) {
    pending = (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey(uk));
        const arr = raw ? JSON.parse(raw) : [];
        const set = new Set(Array.isArray(arr) ? arr.map(String) : []);
        memByUser.set(uk, set);
        return set;
      } catch {
        const set = new Set();
        memByUser.set(uk, set);
        return set;
      } finally {
        loadPromises.delete(uk);
      }
    })();
    loadPromises.set(uk, pending);
  }
  return pending;
}

/** Запам'ятати id видалених постів (щоб reload не повертав їх з кешу / локального сховища). */
export async function rememberDeletedFeedPostIds(user, ids) {
  const uk = userKey(user);
  const set = await ensureLoaded(user);
  let changed = false;
  for (const id of ids || []) {
    const s = String(id || '').trim();
    if (!s) continue;
    if (!set.has(s)) {
      set.add(s);
      changed = true;
    }
  }
  if (changed) {
    try {
      await AsyncStorage.setItem(storageKey(uk), JSON.stringify([...set]));
    } catch {
      /* */
    }
  }
  return set;
}

export async function getDeletedFeedPostIdSet(user) {
  return ensureLoaded(user);
}

export function peekDeletedFeedPostIdSet(user) {
  const uk = userKey(user);
  return memByUser.get(uk) || null;
}

export function isFeedPostIdDeleted(user, postId) {
  const set = peekDeletedFeedPostIdSet(user);
  if (!set || !set.size) return false;
  return set.has(String(postId || ''));
}

export function filterDeletedFeedPostRows(user, rows) {
  const set = peekDeletedFeedPostIdSet(user);
  if (!set || !set.size) return Array.isArray(rows) ? rows : [];
  return (Array.isArray(rows) ? rows : []).filter((row) => !set.has(String(row?.id || '')));
}
