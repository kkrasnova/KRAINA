import { Platform } from 'react-native';
import { useAuthStore } from './auth/authStore';
import { db } from './firebaseConfig';
import { backendAuthFetch, backendAuthUpload, hasBackendSession } from './backendAuthApi';
import { normalizeLocalFileUri } from './feedMediaPersist';
import { getKrainaRestApiBase } from './krainaApiBase';

const CHAT_FETCH_TIMEOUT_MS = 12000;

export function hasMessageApiToken() {
  return hasBackendSession();
}

/** Спроба відновити JWT перед серверними чатами (Firebase / Google / email). */
export async function ensureMessageApiReady(localUser) {
  if (hasBackendSession()) {
    if (__DEV__) console.log('[messageApi] already has backend session');
    return true;
  }
  if (!useAuthStore.getState().hydrated) {
    if (__DEV__) console.log('[messageApi] hydrating auth store before recovery');
    await useAuthStore.getState().hydrate();
  }
  if (hasBackendSession()) {
    if (__DEV__) console.log('[messageApi] session established after hydration');
    return true;
  }
  const { ensureBackendSession } = require('./syncBackendSessionBridge');
  if (__DEV__) console.log('[messageApi] calling ensureBackendSession');
  return ensureBackendSession(localUser);
}

function currentUid() {
  return String(useAuthStore.getState().user?.id || '');
}

export function formatMessagePreview(content, langUk) {
  const text = String(content || '').trim();
  if (!text) return '';
  try {
    const parsed = JSON.parse(text);
    if (parsed?.type === 'kraina_saved_route') {
      return String(parsed.title || (langUk ? 'Маршрут' : 'Route'));
    }
    if (parsed?.type === 'kraina_voice') {
      return langUk ? 'Голосове' : 'Voice';
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
    const data = await backendAuthFetch('GET', `/api/messages/threads?folder=${f}`, null, {
      timeoutMs: CHAT_FETCH_TIMEOUT_MS,
    });
    const rows = Array.isArray(data?.threads) ? data.threads : [];
    return rows.map((row) => ({
      ...row,
      last_content: formatMessagePreview(row.last_content, langUk),
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
  const data = await backendAuthFetch('POST', '/api/messages/threads/open', body, {
    timeoutMs: CHAT_FETCH_TIMEOUT_MS,
  });
  if (!data?.id) throw new Error('thread_create_failed');
  return data;
}

/** Отримати повідомлення треда (REST API). */
export async function messagesListMessages(threadId, limit = 80) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 80));
  const data = await backendAuthFetch(
    'GET',
    `/api/messages/threads/${encodeURIComponent(String(threadId))}/messages?limit=${lim}`,
    null,
    { timeoutMs: CHAT_FETCH_TIMEOUT_MS },
  );
  return Array.isArray(data?.messages) ? data.messages : [];
}

/** Надіслати текстове повідомлення в тред (REST API). */
export async function messagesSendText(threadId, content) {
  const text = String(content || '').trim();
  if (!text) throw new Error('empty_message');
  if (!threadId) throw new Error('no_thread_id');
  
  if (__DEV__) console.log('[messageApi.messagesSendText] starting:', { threadId: threadId.substring(0, 10), textLen: text.length });
  
  try {
    const data = await backendAuthFetch(
      'POST',
      `/api/messages/threads/${encodeURIComponent(String(threadId))}/messages`,
      { content: text },
      { timeoutMs: CHAT_FETCH_TIMEOUT_MS },
    );
    if (__DEV__) console.log('[messageApi.messagesSendText] backend response:', { messageId: data?.message?.id, ok: !!data?.message });
    const fallbackId = `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return data?.message || { id: fallbackId, sender_id: currentUid(), content: text };
  } catch (err) {
    if (__DEV__) console.error('[messageApi.messagesSendText] error:', err?.message, { threadId: threadId.substring(0, 10) });
    throw err;
  }
}
/** Позначити тред як прочитаний (REST API). */
export async function messagesMarkRead(threadId) {
  await backendAuthFetch(
    'POST',
    `/api/messages/threads/${encodeURIComponent(String(threadId))}/read`,
    null,
    { timeoutMs: CHAT_FETCH_TIMEOUT_MS },
  );
}

/** Прийняти запит на листування (REST API). */
export async function messagesAcceptThread(threadId) {
  const data = await backendAuthFetch(
    'POST',
    `/api/messages/threads/${encodeURIComponent(String(threadId))}/accept`,
  );
  return data || { ok: true };
}

/** Очистити повідомлення в треді (REST API). */
export async function messagesClearThread(threadId) {
  await backendAuthFetch(
    'DELETE',
    `/api/messages/threads/${encodeURIComponent(String(threadId))}/messages`,
  );
  return { ok: true };
}

/** Завантажити фото на бекенд (REST API). */
export async function messagesUploadImage(localUri, mimeType = '') {
  const uri = normalizeLocalFileUri(localUri);
  if (!uri) throw new Error('empty_image');
  const mime = String(mimeType || '').toLowerCase();
  const lower = uri.toLowerCase();
  const isPng = mime.includes('png') || /\.png(\?|$)/i.test(lower);
  const isWebp = mime.includes('webp') || /\.webp(\?|$)/i.test(lower);
  const isHeic = mime.includes('heic') || mime.includes('heif') || /\.heic|\.heif(\?|$)/i.test(lower);
  const type = isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg';
  const ext = isPng ? 'png' : isWebp ? 'webp' : isHeic ? 'jpg' : 'jpg';
  const data = await backendAuthUpload('/api/feed/upload', () => {
    const formData = new FormData();
    formData.append('file', {
      uri,
      type,
      name: `chat_${Date.now()}.${ext}`,
    });
    return formData;
  });
  const url = data?.url || data?.media_url;
  if (!url) throw new Error('upload_failed');
  return String(url);
}

function normalizeUploadUri(uri) {
  return normalizeLocalFileUri(uri);
}

/** Завантажити голосове на бекенд (REST API). */
export async function messagesUploadVoice(localUri) {
  const uri = normalizeUploadUri(localUri);
  if (!uri) throw new Error('empty_voice');
  const lower = uri.toLowerCase();
  const isCaf = /\.caf(\?|$)/i.test(lower);
  const mime = isCaf
    ? 'audio/x-caf'
    : Platform.OS === 'ios'
      ? 'audio/m4a'
      : 'audio/mp4';
  const ext = isCaf ? 'caf' : 'm4a';
  const formData = new FormData();
  formData.append('file', {
    uri,
    type: mime,
    name: `voice_${Date.now()}.${ext}`,
  });
  const data = await backendAuthUpload('/api/feed/upload', formData);
  const url = data?.url || data?.media_url;
  if (!url) throw new Error('upload_failed');
  return String(url);
}

/** Видалити чат (REST API). */
export async function messagesDeleteThread(threadId) {
  await backendAuthFetch(
    'DELETE',
    `/api/messages/threads/${encodeURIComponent(String(threadId))}`,
  );
  return { ok: true };
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
