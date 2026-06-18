import { getThreads } from './chatService';
import { hasMessageApiToken, messagesListMessages, messagesListThreads } from './messageApi';
import { chatsCacheKey, readChatsCache, writeChatsCache } from './chatsThreadsCache';
import { readThreadCache, threadCacheKey, writeThreadCache } from './chatThreadCache';
import {
  peerAvatarUriFromMeta,
  peerDisplayNameFromMeta,
  peerUsernameFromMeta,
} from './chatPeerDisplay';
import { mapBackendMessage } from './chatMessageTypes';

function mapApiThreads(list) {
  return list.map((row) => mapInboxThreadRow(row));
}

function mapInboxThreadRow(row) {
  return {
    id: row.id,
    peerName: peerUsernameFromMeta(row),
    peerDisplayName: peerDisplayNameFromMeta(row),
    peerUsername: peerUsernameFromMeta(row),
    peerAvatarUri: peerAvatarUriFromMeta(row),
    lastMessagePreview: row.last_content || '',
    lastAt: row.last_sent_at ? new Date(row.last_sent_at).getTime() : 0,
    unreadCount: row.unread_count || 0,
    useMessageApi: true,
    pendingForMe: row.pending_for_me,
  };
}

/** Фонове наповнення кешу вхідних — щоб екран «Повідомлення» відкрився зі списком. */
export async function warmChatsInboxCache(user, langUk = true) {
  const key = chatsCacheKey(user, 'inbox', langUk);
  if (readChatsCache(key)?.threads?.length) return;
  try {
    if (hasMessageApiToken()) {
      const [list, reqList] = await Promise.all([
        messagesListThreads('inbox', langUk),
        messagesListThreads('requests', langUk).catch(() => []),
      ]);
      const mapped = list.map((row) => mapInboxThreadRow(row));
      mapped.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
      writeChatsCache(key, mapped, Array.isArray(reqList) ? reqList.length : 0);
      return;
    }
    const list = await getThreads(user, langUk);
    writeChatsCache(
      key,
      [...list].sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)),
      0,
    );
    const top = [...list].sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0))[0];
    if (top?.id) {
      void warmChatThreadCache(user, top.id, langUk, false, {
        peerName: top.peerName,
        peerDisplayName: top.peerName,
        peerUsername: top.peerName,
        peerAvatarUrl: top.peerAvatarUri || '',
      });
    }
  } catch (e) {
    if (__DEV__) console.warn('[warmChatsInboxCache]', e?.message);
  }
}

function mapApiThreadMessages(list, langUk = true) {
  const language = langUk ? 'uk' : 'en';
  return list.map((raw) => mapBackendMessage(raw, language));
}

/** Попереднє завантаження повідомлень треда — чат відкривається миттєво. */
export async function warmChatThreadCache(
  user,
  threadId,
  langUk = true,
  useMessageApi = false,
  meta = {},
) {
  const key = threadCacheKey(threadId, useMessageApi);
  if (readThreadCache(key)?.messages?.length) return;
  try {
    if (useMessageApi && hasMessageApiToken()) {
      const msgs = await messagesListMessages(threadId);
      writeThreadCache(key, {
        messages: mapApiThreadMessages(msgs, langUk),
        peerName: meta.peerUsername || meta.peerName || '',
        peerDisplayName: meta.peerDisplayName || meta.peerName || '',
        peerUsername: meta.peerUsername || meta.peerName || '',
        peerAvatarUrl: meta.peerAvatarUrl || '',
        pendingForMe: !!meta.pendingForMe,
      });
      return;
    }
    const threads = await getThreads(user, langUk);
    const th = threads.find((t) => String(t.id) === String(threadId));
    if (th?.messages?.length) {
      writeThreadCache(key, {
        messages: th.messages,
        peerName: meta.peerUsername || meta.peerName || th.peerName || '',
        peerDisplayName: meta.peerDisplayName || meta.peerName || th.peerName || '',
        peerUsername: meta.peerUsername || meta.peerName || th.peerName || '',
        peerAvatarUrl: meta.peerAvatarUrl || th.peerAvatarUri || '',
        pendingForMe: false,
      });
    }
  } catch (e) {
    if (__DEV__) console.warn('[warmChatThreadCache]', e?.message);
  }
}
