import { useAuthStore } from './auth/authStore';
import { API_BASE_URL } from './auth/config';
import { ApiError } from './auth/types';
import { logError } from './errorLogger';

/** JWT має формат header.payload.signature — не Firebase UID. */
export function isBackendJwt(token) {
  return typeof token === 'string' && token.split('.').length === 3 && token.length > 40;
}

export function hasBackendJwt() {
  return isBackendJwt(useAuthStore.getState().accessToken);
}

export function hasBackendSession() {
  const hasBase = !!API_BASE_URL;
  const hasJwt = hasBackendJwt();
  const hasUser = !!useAuthStore.getState().user?.id;
  const result = hasBase && hasJwt && hasUser;
  if (__DEV__ && !result) {
    console.log('[backendAuthApi] hasBackendSession check failed:', { hasBase, hasJwt, hasUser, API_BASE_URL });
  }
  return result;
}

/** JWT є, але локальний user.id ще не гідратований — достатньо для read-only REST. */
export function canUseBackendApi() {
  return !!API_BASE_URL && hasBackendJwt();
}

async function parseApiError(res) {
  const data = await res.json().catch(() => ({}));
  throw new ApiError(res.status, data, data?.error || data?.message || res.statusText);
}

/**
 * Безкоштовний інстанс Render «засинає» після ~15 хв простою; перший запит будить його
 * 30–60 с. Без таймауту fetch висить безкінечно — кнопка «Увійти» зависає без відповіді.
 * 
 * ⚡ Оптимізовано: 15s для login (критично), 30s для інших операцій.
 */
const AUTH_FETCH_TIMEOUT_MS = 15000; // Скорочено з 60000
/** Multipart upload (аватар, стрічка) — довший таймаут для cold start Render і великих фото. */
const UPLOAD_FETCH_TIMEOUT_MS = 90000;

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (timedOut) {
      const te = new Error('NETWORK_ERROR');
      te.name = 'TimeoutError';
      throw te;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Швидкий збій мережі (не таймаут, не серверна помилка) — варто повторити один раз. */
function isFastNetworkFailure(e) {
  if (e?.name === 'TimeoutError') return false;
  const m = String(e?.message || '').toLowerCase();
  return (
    m.includes('network request failed') ||
    m.includes('failed to fetch') ||
    m.includes('network error') ||
    e?.name === 'TypeError'
  );
}

async function fetchWithNetworkRetry(url, opts, timeoutMs) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetchWithTimeout(url, opts, timeoutMs);
    } catch (e) {
      if (attempt === 0 && isFastNetworkFailure(e)) {
        // ⚡ Коротша пауза перед повтором (800ms замість 1500ms)
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      if (attempt === 0 && (e?.name === 'TimeoutError' || String(e?.message || '').includes('aborted'))) {
        // ⚡ Якщо таймаут — одразу повертаємо помилку, не чекаємо 3s
        if (__DEV__) console.warn('[backendAuthApi] timeout on attempt 1, giving up');
        throw new ApiError(0, { error: 'NETWORK_ERROR' }, 'NETWORK_ERROR');
      }
      if (__DEV__) console.warn('[backendAuthApi] network', e?.name, e?.message);
      throw new ApiError(0, { error: 'NETWORK_ERROR' }, 'NETWORK_ERROR');
    }
  }
  throw new ApiError(0, { error: 'NETWORK_ERROR' }, 'NETWORK_ERROR');
}

async function postJson(path, body, token) {
  if (!API_BASE_URL) throw new ApiError(0, { error: 'NETWORK_ERROR' }, 'NETWORK_ERROR');
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const opts = { method: 'POST', headers, body: JSON.stringify(body) };
  const url = `${API_BASE_URL}${path}`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, opts, AUTH_FETCH_TIMEOUT_MS);
      if (!res.ok) await parseApiError(res);
      return res.json();
    } catch (e) {
      // Реальна відповідь сервера (4xx/5xx) — не повторюємо, повертаємо як є.
      if (e instanceof ApiError) throw e;
      // Лише швидкий мережевий збій на першій спробі повторюємо (після короткої паузи).
      if (attempt === 0 && isFastNetworkFailure(e)) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (attempt === 0 && (e?.name === 'TimeoutError' || String(e?.message || '').includes('aborted'))) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      if (__DEV__) console.warn('[backendAuthApi] network', e?.name, e?.message);
      throw new ApiError(0, { error: 'NETWORK_ERROR' }, 'NETWORK_ERROR');
    }
  }
  throw new ApiError(0, { error: 'NETWORK_ERROR' }, 'NETWORK_ERROR');
}

export async function backendLogin(email, password) {
  return postJson('/api/auth/login', { email, password });
}

function isEmailTakenError(err) {
  if (!(err instanceof ApiError)) return false;
  const code = String(err.payload?.error || '').toLowerCase();
  return code === 'email_taken' || code === 'email_exists';
}

/** Fallback when production API has not deployed /email-exists yet. */
async function backendProbeEmailExists(email) {
  const probeUsername = `x${Date.now().toString(36).slice(-7)}`.slice(0, 32);
  try {
    await postJson('/api/auth/register', {
      email,
      password: 'probe1234',
      username: probeUsername,
    });
    return false;
  } catch (err) {
    if (isEmailTakenError(err)) return true;
    if (err instanceof ApiError && err.status === 400) return false;
    throw err;
  }
}

function isRetryableAuthNetworkError(err) {
  if (!(err instanceof ApiError)) return true;
  if (err.status === 0) return true;
  return err.status === 408 || err.status === 429 || err.status === 502 || err.status === 503 || err.status === 504;
}

export async function backendEmailExists(email) {
  if (!API_BASE_URL) return false;
  const normalized = String(email || '').trim().toLowerCase();
  const retryDelaysMs = [0, 2000, 5000];
  for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
    if (retryDelaysMs[attempt] > 0) {
      await new Promise((r) => setTimeout(r, retryDelaysMs[attempt]));
    }
    try {
      const data = await postJson('/api/auth/email-exists', { email: normalized });
      return !!data?.exists;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return backendProbeEmailExists(normalized);
      }
      if (attempt < retryDelaysMs.length - 1 && isRetryableAuthNetworkError(err)) {
        if (__DEV__) console.warn('[backendAuthApi] email-exists retry', attempt + 1, err?.message);
        continue;
      }
      throw err;
    }
  }
  return false;
}

export async function backendStoreAppPasswordResetOtp(email, code, expiresAtMs) {
  if (!API_BASE_URL) return;
  try {
    await postJson('/api/auth/app-password-reset/otp', {
      email: String(email || '').trim().toLowerCase(),
      code: String(code || '').replace(/\s/g, ''),
      expires_at: expiresAtMs,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return;
    throw err;
  }
}

export async function backendResetPasswordWithAppOtp(email, code, newPassword) {
  if (!API_BASE_URL) return { ok: false, reason: 'NO_API' };
  try {
    await postJson('/api/auth/app-password-reset/confirm', {
      email: String(email || '').trim().toLowerCase(),
      code: String(code || '').replace(/\s/g, ''),
      new_password: newPassword,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return { ok: false, reason: 'BACKEND_OUTDATED' };
    }
    throw err;
  }
}

export async function backendRegister(email, password, opts = {}) {
  const body = { email, password };
  const u = String(opts.username || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
  if (u.length >= 3) body.username = u;
  const displayName = String(opts.display_name || '').trim();
  if (displayName) body.display_name = displayName;
  return postJson('/api/auth/register', body);
}

export async function backendGoogle(id_token) {
  return postJson('/api/auth/google', { id_token });
}

export async function backendFirebase(id_token) {
  return postJson('/api/auth/firebase', { id_token });
}

export async function backendFacebook(access_token) {
  return postJson('/api/auth/facebook', { access_token });
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
 * @param {{ timeoutMs?: number }} [opts]
 */
export async function backendAuthFetch(method, path, body, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? AUTH_FETCH_TIMEOUT_MS;
  const base = API_BASE_URL;
  if (!base) throw new ApiError(503, { error: 'API_UNAVAILABLE' }, 'API_UNAVAILABLE');

  let token = await getValidBackendAccessToken();
  if (!token) throw new ApiError(401, { error: 'UNAUTHORIZED' }, 'UNAUTHORIZED');

  const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
  const fetchOpts = { method, headers };
  if (body != null) {
    headers['Content-Type'] = 'application/json';
    fetchOpts.body = JSON.stringify(body);
  }

  let res = await fetchWithNetworkRetry(`${base}${path}`, fetchOpts, timeoutMs);
  if (res.status === 401) {
    const refreshed = await useAuthStore.getState().refreshSession();
    if (refreshed) {
      token = useAuthStore.getState().accessToken;
      if (isBackendJwt(token)) {
        headers.Authorization = `Bearer ${token}`;
        res = await fetchWithNetworkRetry(`${base}${path}`, fetchOpts, timeoutMs);
      }
    }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    logError('chat_api', `${method} ${path} failed: ${res.status}`, {
      status: res.status,
      errorCode: data?.error || data?.message,
      method,
      path,
    });
    throw new ApiError(res.status, data, data?.error || data?.message || res.statusText);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Multipart upload (voice, images) — не ставить Content-Type вручную. */
export async function backendAuthUpload(path, formDataOrBuilder, opts = {}) {
  const base = API_BASE_URL;
  if (!base) throw new ApiError(503, { error: 'API_UNAVAILABLE' }, 'API_UNAVAILABLE');

  const timeoutMs = opts.timeoutMs ?? UPLOAD_FETCH_TIMEOUT_MS;

  let token = await getValidBackendAccessToken();
  if (!token) throw new ApiError(401, { error: 'UNAUTHORIZED' }, 'UNAUTHORIZED');

  const buildBody = () =>
    typeof formDataOrBuilder === 'function' ? formDataOrBuilder() : formDataOrBuilder;

  const uploadOnce = async (authToken) => {
    const headers = { Accept: 'application/json', Authorization: `Bearer ${authToken}` };
    return fetchWithNetworkRetry(
      `${base}${path}`,
      { method: 'POST', headers, body: buildBody() },
      timeoutMs,
    );
  };

  let res = await uploadOnce(token);
  if (res.status === 401) {
    const refreshed = await useAuthStore.getState().refreshSession();
    if (refreshed) {
      token = useAuthStore.getState().accessToken;
      if (isBackendJwt(token)) {
        res = await uploadOnce(token);
      }
    }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    logError('chat_api', `UPLOAD ${path} failed: ${res.status}`, {
      status: res.status,
      errorCode: data?.error || data?.message,
      path,
    });
    throw new ApiError(res.status, data, data?.error || data?.message || res.statusText);
  }
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

export async function backendPatchProfileMe(patch) {
  return backendAuthFetch('PATCH', '/api/profile/me', patch);
}

export async function backendPostProfileAvatar(localUri, mimeType = '') {
  const { ensureUploadableImageUri } = require('./feedMediaPersist');
  const normalizedUri = await ensureUploadableImageUri(localUri, { mimeType });
  if (!normalizedUri) {
    throw new ApiError(400, { error: 'invalid_format' }, 'invalid_format');
  }
  const mime = String(mimeType || '').toLowerCase();
  const lower = String(normalizedUri || '').toLowerCase();
  const isPng = mime.includes('png') || /\.png(\?|$)/i.test(lower);
  const isWebp = mime.includes('webp') || /\.webp(\?|$)/i.test(lower);
  const type = isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg';
  const ext = isPng ? 'png' : isWebp ? 'webp' : 'jpg';
  return backendAuthUpload(
    '/api/profile/me/avatar',
    () => {
      const form = new FormData();
      form.append('file', {
        uri: normalizedUri,
        type,
        name: `avatar_${Date.now()}.${ext}`,
      });
      return form;
    },
    { timeoutMs: UPLOAD_FETCH_TIMEOUT_MS },
  );
}

export async function backendDeleteProfileAvatar() {
  return backendAuthFetch('DELETE', '/api/profile/me/avatar');
}
