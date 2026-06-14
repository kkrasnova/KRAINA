import { useAuthStore } from './auth/authStore';
import { API_BASE_URL } from './auth/config';
import { ApiError } from './auth/types';

/** JWT має формат header.payload.signature — не Firebase UID. */
export function isBackendJwt(token) {
  return typeof token === 'string' && token.split('.').length === 3 && token.length > 40;
}

export function hasBackendJwt() {
  return isBackendJwt(useAuthStore.getState().accessToken);
}

export function hasBackendSession() {
  return !!API_BASE_URL && hasBackendJwt() && !!useAuthStore.getState().user?.id;
}

async function parseApiError(res) {
  const data = await res.json().catch(() => ({}));
  throw new ApiError(res.status, data, data?.error || data?.message || res.statusText);
}

async function postJson(path, body, token) {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseApiError(res);
  return res.json();
}

export async function backendLogin(email, password) {
  return postJson('/api/auth/login', { email, password });
}

export async function backendRegister(email, password, username) {
  const u = String(username || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
  return postJson('/api/auth/register', { email, password, username: u });
}

export async function backendGoogle(id_token) {
  return postJson('/api/auth/google', { id_token });
}

export async function backendApple(identity_token, user) {
  const body = { identity_token };
  if (user?.name) body.user = { name: user.name };
  return postJson('/api/auth/apple', body);
}

export async function backendRefresh(refresh_token) {
  return postJson('/api/auth/refresh', { refresh_token });
}

export async function signInFirebaseCustomToken(customToken) {
  const token = String(customToken || '').trim();
  if (!token) return;
  try {
    const { auth, firebaseEnabled } = require('./firebaseConfig');
    if (!firebaseEnabled || !auth) return;
    const { signInWithCustomToken } = require('firebase/auth');
    await signInWithCustomToken(auth, token);
  } catch (e) {
    if (__DEV__) console.warn('[backendAuthApi] firebase custom token', e?.message);
  }
}

export async function getValidBackendAccessToken() {
  const current = useAuthStore.getState().accessToken;
  if (isBackendJwt(current)) return current;
  const ok = await useAuthStore.getState().refreshSession();
  if (ok && isBackendJwt(useAuthStore.getState().accessToken)) {
    return useAuthStore.getState().accessToken;
  }
  return null;
}

/**
 * Авторизований REST-виклик до KRAÏNA API (Bearer JWT + auto-refresh на 401).
 */
export async function backendAuthFetch(method, path, body) {
  const base = API_BASE_URL;
  if (!base) throw new ApiError(503, { error: 'API_UNAVAILABLE' }, 'API_UNAVAILABLE');

  let token = await getValidBackendAccessToken();
  if (!token) throw new ApiError(401, { error: 'UNAUTHORIZED' }, 'UNAUTHORIZED');

  const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
  const opts = { method, headers };
  if (body != null) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  let res = await fetch(`${base}${path}`, opts);
  if (res.status === 401) {
    const refreshed = await useAuthStore.getState().refreshSession();
    if (refreshed) {
      token = useAuthStore.getState().accessToken;
      if (isBackendJwt(token)) {
        headers.Authorization = `Bearer ${token}`;
        res = await fetch(`${base}${path}`, opts);
      }
    }
  }
  if (!res.ok) await parseApiError(res);
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function backendGetProfileMe() {
  return backendAuthFetch('GET', '/api/profile/me');
}
