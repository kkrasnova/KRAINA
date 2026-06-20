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
    peerUserId: row.peer_user_id,
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

/** Фонове наповнення кешу вхідних — лише для авторизованих серверних чатів. */
export async function warmChatsInboxCache(user, langUk = true) {
  const key = chatsCacheKey(user, 'inbox', langUk);
  if (readChatsCache(key)?.threads?.length) return;
  if (!hasMessageApiToken()) return;
  try {
    const [list, reqList] = await Promise.all([
      messagesListThreads('inbox', langUk),
      messagesListThreads('requests', langUk).catch(() => []),
    ]);
    const mapped = list.map((row) => mapInboxThreadRow(row));
    mapped.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    writeChatsCache(key, mapped, Array.isArray(reqList) ? reqList.length : 0);
  } catch (e) {
    if (__DEV__) console.warn('[warmChatsInboxCache]', e?.message);
  }
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
  if (readThreadCache(key)?.messages?.length) return;
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
