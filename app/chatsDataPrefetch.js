import {
  hasMessageApiToken,
  messagesListMessages,
  messagesListThreads,
  formatMessagePreview,
  socialListMutuals,
} from './messageApi';
import { chatUserKey } from './chatService';
import {
  chatsCacheKey,
  isChatsCacheFresh,
  seedChatsCachesIfMissing,
  writeChatsCache,
} from './chatsThreadsCache';
import { hasThreadCache, readThreadCache, threadCacheKey, writeThreadCache } from './chatThreadCache';
import {
  peerAvatarUriFromMeta,
  peerDisplayNameFromMeta,
  peerUsernameFromMeta,
} from './chatPeerDisplay';
import { mapBackendMessage } from './chatMessageTypes';

export function mapInboxThreadRow(row) {
  return {
    id: row.id,
    peerUserId: row.peer_user_id,
    peerName: peerUsernameFromMeta(row),
    peerDisplayName: peerDisplayNameFromMeta(row),
    peerUsername: peerUsernameFromMeta(row),
    peerAvatarUri: peerAvatarUriFromMeta(row),
    lastMessagePreview: row.last_content || '',
    lastAt: row.last_sent_at ? new Date(row.last_sent_at).getTime() : 0,
    unreadCount: row.unread_count || 0,
    lastFromMe: row.last_from_me === true,
    lastIsRead: row.last_is_read === true,
    useMessageApi: true,
    pendingForMe: row.pending_for_me,
  };
}

/**
 * Оновити список тредів локально після WS new_message (без повного reload).
 * Повертає null, якщо тред не знайдено — тоді потрібен повний reload.
 */
export function applyWsMessageToThreadList(threads, data, { currentUserId, langUk, hiddenIds }) {
  const threadId = String(data?.threadId || '');
  const rawMsg = data?.message;
  if (!threadId || !rawMsg) return null;
  if (hiddenIds?.has?.(threadId)) return threads;

  const idx = threads.findIndex((t) => String(t.id) === threadId);
  if (idx === -1) return null;

  const fromMe = String(rawMsg.sender_id) === String(currentUserId);
  const preview = formatMessagePreview(rawMsg.content, langUk);
  const sentAt = rawMsg.sent_at ? new Date(rawMsg.sent_at).getTime() : Date.now();
  const existing = threads[idx];
  const updated = {
    ...existing,
    lastMessagePreview: preview,
    lastAt: sentAt,
    lastFromMe: fromMe,
    lastIsRead: fromMe ? existing.lastIsRead : false,
    unreadCount: fromMe ? (existing.unreadCount || 0) : (existing.unreadCount || 0) + 1,
  };

  const next = threads.slice();
  next.splice(idx, 1);
  next.unshift(updated);
  return next;
}

function mapApiThreads(list) {
  return list.map((row) => mapInboxThreadRow(row));
}

const mutualsStore = new Map();

export function mutualsCacheKey(user) {
  return `${chatUserKey(user)}:mutuals`;
}

export function readMutualsCache(user) {
  const row = mutualsStore.get(mutualsCacheKey(user));
  if (!row) return null;
  return Array.isArray(row.list) ? row.list : [];
}

export function writeMutualsCache(user, list) {
  mutualsStore.set(mutualsCacheKey(user), {
    list: Array.isArray(list) ? list : [],
    at: Date.now(),
  });
}

/** Попереднє завантаження списку взаємних друзів для StartChat. */
export async function warmMutualsCache(user) {
  const key = mutualsCacheKey(user);
  if (mutualsStore.has(key)) return readMutualsCache(user) || [];
  if (!hasMessageApiToken()) return [];
  try {
    const list = await socialListMutuals();
    writeMutualsCache(user, list);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    if (__DEV__) console.warn('[warmMutualsCache]', e?.message);
    return [];
  }
}

let warmChatsPromise = null;

/** Фонове наповнення кешу вхідних — лише для авторизованих серверних чатів. */
export async function warmChatsInboxCache(user, langUk = true, { force = false } = {}) {
  if (!user) return;
  seedChatsCachesIfMissing(user, langUk);
  const inboxKey = chatsCacheKey(user, 'inbox', langUk);
  const requestsKey = chatsCacheKey(user, 'requests', langUk);
  if (!force && isChatsCacheFresh(inboxKey) && isChatsCacheFresh(requestsKey)) return;
  if (!hasMessageApiToken()) return;
  if (warmChatsPromise && !force) return warmChatsPromise;

  warmChatsPromise = (async () => {
    try {
      const [list, reqList] = await Promise.all([
        messagesListThreads('inbox', langUk),
        messagesListThreads('requests', langUk).catch(() => []),
      ]);
      const mapped = list.map((row) => mapInboxThreadRow(row));
      mapped.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
      const reqMapped = (Array.isArray(reqList) ? reqList : []).map((row) => mapInboxThreadRow(row));
      reqMapped.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
      writeChatsCache(inboxKey, mapped, reqMapped.length, { user, langUk });
      writeChatsCache(requestsKey, reqMapped, reqMapped.length, { user, langUk });
    } catch (e) {
      if (__DEV__) console.warn('[warmChatsInboxCache]', e?.message);
    } finally {
      warmChatsPromise = null;
    }
  })();
  return warmChatsPromise;
}

/** Префетч перед навігацією на Chats — seed + warm у фоні. */
export function prefetchChatsForUser(user, langUk = true) {
  seedChatsCachesIfMissing(user, langUk);
  void warmChatsInboxCache(user, langUk).catch(() => {});
}

function mapApiThreadMessages(list, langUk = true) {
  const language = langUk ? 'uk' : 'en';
  return list.map((raw) => mapBackendMessage(raw, language));
}

/** Попереднє завантаження повідомлень треда — лише серверні чати. */
export async function warmChatThreadCache(
  user,
  threadId,
  langUk = true,
  useMessageApi = false,
  meta = {},
) {
  const key = threadCacheKey(threadId, useMessageApi);
  if (hasThreadCache(key)) return;
  if (!useMessageApi || !hasMessageApiToken()) return;
  try {
    const msgs = await messagesListMessages(threadId);
    writeThreadCache(key, {
      messages: mapApiThreadMessages(msgs, langUk),
      peerName: meta.peerUsername || meta.peerName || '',
      peerDisplayName: meta.peerDisplayName || meta.peerName || '',
      peerUsername: meta.peerUsername || meta.peerName || '',
      peerAvatarUrl: meta.peerAvatarUrl || '',
      pendingForMe: !!meta.pendingForMe,
    });
  } catch (e) {
    if (__DEV__) console.warn('[warmChatThreadCache]', e?.message);
  }
}
