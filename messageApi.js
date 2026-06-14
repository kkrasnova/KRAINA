import { API_BASE_URL } from './auth/config';
import { useAuthStore } from './auth/authStore';
import { getIsOnline } from './offline/networkStatus';
import { enqueueOutbox } from './offline/outboxStore';
import { registerOutboxHandler } from './offline/syncEngine';

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export function hasMessageApiToken() {
  return !!useAuthStore.getState().accessToken;
}

function canTryNow() {
  return getIsOnline() && !!useAuthStore.getState().accessToken;
}

async function queueMessageAction(type, payload, dedupeKey, allowMerge = true) {
  return enqueueOutbox({
    type,
    payload,
    dedupeKey,
    allowMerge,
    authUserId: String(useAuthStore.getState().user?.id || ''),
  });
}

async function _remoteMessagesSendText(threadId, content, tokenOverride = '', idempotencyKey = '') {
  const token = tokenOverride || useAuthStore.getState().accessToken;
  if (!token) throw new Error('no_token');
  const res = await fetch(
    `${API_BASE_URL}/api/messages/threads/${encodeURIComponent(threadId)}/messages`,
    {
      method: 'POST',
      headers: {
        ...authHeaders(token),
        ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
      },
      body: JSON.stringify({ content }),
    },
  );
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.message;
}

async function _remoteMessagesOpenThread({ peerUsername, peerUserId }, tokenOverride = '', idempotencyKey = '') {
  const token = tokenOverride || useAuthStore.getState().accessToken;
  if (!token) throw new Error('no_token');
  const body =
    peerUserId != null
      ? { peer_user_id: peerUserId }
      : { peer_username: String(peerUsername || '').replace(/^@/, '').trim() };
  const res = await fetch(`${API_BASE_URL}/api/messages/threads/open`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function _remoteMessagesAcceptThread(threadId, tokenOverride = '', idempotencyKey = '') {
  const token = tokenOverride || useAuthStore.getState().accessToken;
  if (!token) throw new Error('no_token');
  const res = await fetch(
    `${API_BASE_URL}/api/messages/threads/${encodeURIComponent(threadId)}/accept`,
    {
      method: 'POST',
      headers: {
        ...authHeaders(token),
        ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
      },
    },
  );
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function messagesListThreads(folder) {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;
  const res = await fetch(
    `${API_BASE_URL}/api/messages/threads?folder=${encodeURIComponent(folder)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.threads || [];
}

export async function messagesOpenThread({ peerUsername, peerUserId }) {
  if (!canTryNow()) {
    throw new Error('offline_cannot_open_thread');
  }
  return _remoteMessagesOpenThread({ peerUsername, peerUserId });
}

export async function messagesListMessages(threadId, limit = 80) {
  const token = useAuthStore.getState().accessToken;
  if (!token) throw new Error('no_token');
  const res = await fetch(
    `${API_BASE_URL}/api/messages/threads/${encodeURIComponent(threadId)}/messages?limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.messages || [];
}

export async function messagesSendText(threadId, content) {
  if (!canTryNow()) {
    throw new Error('offline_cannot_send_message');
  }
  return _remoteMessagesSendText(threadId, content);
}

export async function messagesMarkRead(threadId) {
  const token = useAuthStore.getState().accessToken;
  if (!token) return;
  await fetch(`${API_BASE_URL}/api/messages/threads/${encodeURIComponent(threadId)}/read`, {
    method: 'POST',
    headers: authHeaders(token),
  }).catch(() => {});
}

export async function messagesAcceptThread(threadId) {
  if (!canTryNow()) {
    throw new Error('offline_cannot_accept_thread');
  }
  return _remoteMessagesAcceptThread(threadId);
}

registerOutboxHandler('messages.sendText', async (item, token, ctx) => {
  await _remoteMessagesSendText(item.payload?.threadId, item.payload?.content || '', token, ctx?.idempotencyKey || '');
});
registerOutboxHandler('messages.openThread', async (item, token, ctx) => {
  await _remoteMessagesOpenThread(item.payload || {}, token, ctx?.idempotencyKey || '');
});
registerOutboxHandler('messages.acceptThread', async (item, token, ctx) => {
  await _remoteMessagesAcceptThread(item.payload?.threadId, token, ctx?.idempotencyKey || '');
});

export async function socialListMutuals() {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;
  const res = await fetch(`${API_BASE_URL}/api/social/mutuals`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) return [];
  return data.users || [];
}
