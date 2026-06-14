import { useAuthStore } from './auth/authStore';
import { db } from './firebaseConfig';
import { backendAuthFetch, hasBackendSession } from './backendAuthApi';
import { getKrainaRestApiBase } from './krainaApiBase';

export function hasMessageApiToken() {
  return hasBackendSession();
}

function currentUid() {
  return String(useAuthStore.getState().user?.id || '');
}

function formatPreview(content, langUk) {
  const text = String(content || '').trim();
  if (!text) return '';
  try {
    const parsed = JSON.parse(text);
    if (parsed?.type === 'kraina_saved_route') {
      return String(parsed.title || (langUk ? 'Маршрут' : 'Route'));
    }
  } catch {
    /* not json */
  }
  if (/^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?|$)/i.test(text)) {
    return langUk ? 'Фото' : 'Photo';
  }
  if (text.startsWith('📍')) return langUk ? 'Геолокація' : 'Location';
  return text;
}

/** Отримати список тредів з бекенду (REST API). */
export async function messagesListThreads(folder, langUk = true) {
  try {
    const f = folder === 'requests' ? 'requests' : 'inbox';
    const data = await backendAuthFetch('GET', `/api/messages/threads?folder=${f}`);
    const rows = Array.isArray(data?.threads) ? data.threads : [];
    return rows.map((row) => ({
      ...row,
      last_content: formatPreview(row.last_content, langUk),
    }));
  } catch (e) {
    if (__DEV__) console.warn('[messageApi] listThreads', e?.message);
    throw e;
  }
}

/** Відкрити або створити тред з користувачем (REST API). */
export async function messagesOpenThread({ peerUsername, peerUserId }) {
  const body = {};
  if (peerUserId) body.peer_user_id = String(peerUserId);
  else if (peerUsername) body.peer_username = String(peerUsername).replace(/^@/, '').trim();
  else throw new Error('invalid_peer');
  const data = await backendAuthFetch('POST', '/api/messages/threads/open', body);
  if (!data?.id) throw new Error('thread_create_failed');
  return data;
}

/** Отримати повідомлення треда (REST API). */
export async function messagesListMessages(threadId, limit = 80) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 80));
  const data = await backendAuthFetch(
    'GET',
    `/api/messages/threads/${encodeURIComponent(String(threadId))}/messages?limit=${lim}`,
  );
  return Array.isArray(data?.messages) ? data.messages : [];
}

/** Надіслати текстове повідомлення в тред (REST API). */
export async function messagesSendText(threadId, content) {
  const text = String(content || '').trim();
  if (!text) throw new Error('empty_message');
  const data = await backendAuthFetch(
    'POST',
    `/api/messages/threads/${encodeURIComponent(String(threadId))}/messages`,
    { content: text },
  );
  const fallbackId = `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return data?.message || { id: fallbackId, sender_id: currentUid(), content: text };
}

/** Позначити тред як прочитаний (REST API). */
export async function messagesMarkRead(threadId) {
  await backendAuthFetch('POST', `/api/messages/threads/${encodeURIComponent(String(threadId))}/read`);
}

/** Прийняти запит на листування (REST API). */
export async function messagesAcceptThread(threadId) {
  const data = await backendAuthFetch(
    'POST',
    `/api/messages/threads/${encodeURIComponent(String(threadId))}/accept`,
  );
  return data || { ok: true };
}

/** Отримати список взаємних підписок (мьючуалів) з бекенду. */
export async function socialListMutuals() {
  const data = await backendAuthFetch('GET', '/api/social/mutuals');
  return Array.isArray(data?.users) ? data.users : [];
}

/** Чи доступний бекенд для чатів (URL + JWT). */
export function isMessageApiConfigured() {
  return !!getKrainaRestApiBase();
}

/** Firestore fallback uid — лише для сумісності. */
export function messageApiDb() {
  return db;
}
