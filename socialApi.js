/**
 * Соціальні дії через бекенд (потрібен токен з auth/authStore — той самий, що й для стрічки).
 */
import { API_BASE_URL } from './auth/config';
import { normalizeBackendAssetUrl } from './auth/config';
import { useAuthStore } from './auth/authStore';
import { getIsOnline } from './offline/networkStatus';
import { enqueueOutbox } from './offline/outboxStore';
import { registerOutboxHandler } from './offline/syncEngine';

function authJson(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export function hasSocialApi() {
  return !!useAuthStore.getState().accessToken;
}

function canTryNow() {
  return getIsOnline() && !!useAuthStore.getState().accessToken;
}

function normalizeProfileRow(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    avatar_url: normalizeBackendAssetUrl(String(row.avatar_url || '')),
  };
}

async function queueSocialAction(type, payload, dedupeKey) {
  return enqueueOutbox({
    type,
    payload,
    dedupeKey,
    authUserId: String(useAuthStore.getState().user?.id || ''),
  });
}

async function _remoteSocialFollow(username, tokenOverride = '', idempotencyKey = '') {
  const token = tokenOverride || useAuthStore.getState().accessToken;
  if (!token) throw new Error('no_token');
  const u = String(username || '')
    .trim()
    .replace(/^@/, '');
  const res = await fetch(`${API_BASE_URL}/api/social/follow`, {
    method: 'POST',
    headers: {
      ...authJson(token),
      ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify({ username: u }),
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

async function _remoteSocialUnfollow(username, tokenOverride = '', idempotencyKey = '') {
  const token = tokenOverride || useAuthStore.getState().accessToken;
  if (!token) throw new Error('no_token');
  const u = String(username || '')
    .trim()
    .replace(/^@/, '');
  const res = await fetch(`${API_BASE_URL}/api/social/follow/${encodeURIComponent(u)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
    },
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

export async function socialSearchProfiles(q, limit = 24) {
  const token = useAuthStore.getState().accessToken;
  const qt = String(q ?? '').trim();
  if (!qt) return [];
  const lim = Math.min(40, Math.max(1, Number(limit) || 24));
  const endpoint = token ? '/api/profile/search' : '/api/profile/search-public';
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API_BASE_URL}${endpoint}?q=${encodeURIComponent(qt)}&limit=${lim}`, {
    headers,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) return [];
  return Array.isArray(data.users) ? data.users.map(normalizeProfileRow) : [];
}

export async function socialGetPublicProfile(username) {
  const token = useAuthStore.getState().accessToken;
  const u = String(username || '')
    .trim()
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9_]/g, '');
  if (!u) throw new Error('invalid_username');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API_BASE_URL}/api/profile/${encodeURIComponent(u)}`, { headers });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return normalizeProfileRow(data.profile);
}

export async function socialGetPublicProfileFull(username, limit = 80) {
  const token = useAuthStore.getState().accessToken;
  const u = String(username || '')
    .trim()
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9_]/g, '');
  if (!u) throw new Error('invalid_username');
  const lim = Math.min(120, Math.max(1, Number(limit) || 80));
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API_BASE_URL}/api/profile/${encodeURIComponent(u)}/full?limit=${lim}`, { headers });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return {
    profile: data.profile ? normalizeProfileRow(data.profile) : null,
    followers: Array.isArray(data.followers) ? data.followers.map(normalizeProfileRow) : [],
    following: Array.isArray(data.following) ? data.following.map(normalizeProfileRow) : [],
    friends: Array.isArray(data.friends) ? data.friends.map(normalizeProfileRow) : [],
  };
}

export async function socialFollowUsername(username) {
  if (canTryNow()) {
    try {
      return await _remoteSocialFollow(username);
    } catch {
      /* queue below */
    }
  }
  await queueSocialAction('social.follow', { username }, `social.follow:${String(username || '').toLowerCase()}`);
  return { ok: true, _offlineQueued: true };
}

export async function socialUnfollowUsername(username) {
  if (canTryNow()) {
    try {
      return await _remoteSocialUnfollow(username);
    } catch {
      /* queue below */
    }
  }
  await queueSocialAction('social.unfollow', { username }, `social.unfollow:${String(username || '').toLowerCase()}`);
  return { ok: true, _offlineQueued: true };
}

export async function socialListIncomingRequests() {
  const token = useAuthStore.getState().accessToken;
  if (!token) return [];
  const res = await fetch(`${API_BASE_URL}/api/social/requests/incoming`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* */ }
  if (!res.ok) return [];
  return data.requests || [];
}

export async function socialListOutgoingRequests() {
  const token = useAuthStore.getState().accessToken;
  if (!token) return [];
  const res = await fetch(`${API_BASE_URL}/api/social/requests/outgoing`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* */ }
  if (!res.ok) return [];
  return data.requests || [];
}

export async function socialAcceptRequest(userId) {
  const token = useAuthStore.getState().accessToken;
  if (!token) throw new Error('no_token');
  const res = await fetch(`${API_BASE_URL}/api/social/requests/${encodeURIComponent(userId)}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* */ }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function socialDeclineRequest(userId) {
  const token = useAuthStore.getState().accessToken;
  if (!token) throw new Error('no_token');
  const res = await fetch(`${API_BASE_URL}/api/social/requests/${encodeURIComponent(userId)}/decline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* */ }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

registerOutboxHandler('social.follow', async (item, token, ctx) => {
  await _remoteSocialFollow(item.payload?.username, token, ctx?.idempotencyKey || '');
});

registerOutboxHandler('social.unfollow', async (item, token, ctx) => {
  await _remoteSocialUnfollow(item.payload?.username, token, ctx?.idempotencyKey || '');
});
