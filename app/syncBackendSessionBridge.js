import { DeviceEventEmitter } from 'react-native';
import { useAuthStore } from './auth/authStore';
import { getSession, saveSession } from './db';
import { ApiError } from './auth/types';

const ADMIN_LOCAL_ID = 'kraina_gate_admin_v1';

export async function mergeBackendUserIntoLocalSession() {
  const backendUser = useAuthStore.getState().user;
  const s = await getSession();
  if (!backendUser?.id) return;
  const sameUser = !!s?.user && String(s.user.id) === String(backendUser.id);
  if (!s?.user || !sameUser) {
    // No cached user, or cached user belongs to a different account — replace fully.
    // Otherwise the UI would briefly show name/avatar from the previous account.
    await saveSession({
      id: backendUser.id,
      email: backendUser.email,
      name: backendUser.email ? String(backendUser.email).split('@')[0] : 'User',
      role: backendUser.role || 'user',
      status: backendUser.status || 'active',
      provider: s?.user?.provider || 'email',
    });
    DeviceEventEmitter.emit('kraina_backend_session_merged_v1');
    return;
  }
  const merged = {
    ...s.user,
    id: backendUser.id,
    email: backendUser.email || s.user.email,
  };
  await saveSession(merged);
  DeviceEventEmitter.emit('kraina_backend_session_merged_v1');
}

function deriveBackendUsername(displayName, email) {
  const fromEmail = String(email || '')
    .split('@')[0]
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 28);
  let s = String(displayName || '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28);
  if (s.length < 3) s = fromEmail;
  if (s.length < 3) s = 'user';
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${s}_${rnd}`.slice(0, 32);
}

function shouldSkipBackendSyncForLocalUser(user) {
  if (user == null) return false;
  if (typeof user !== 'object') return true;
  if (user.isAdmin || user.role === 'admin') return true;
  if (String(user.id) === ADMIN_LOCAL_ID) return true;
  return false;
}

/**
 * Після email/пароль на ThirdPage — JWT у SecureStore + id бекенду в локальній сесії (стрічка, пости, чати).
 */
export async function syncBackendSessionAfterThirdPageEmailAuth({
  email,
  password,
  displayName,
  mode,
  localUser,
}) {
  const em = String(email || '').trim();
  const pw = String(password || '');
  if (!em || !pw || shouldSkipBackendSyncForLocalUser(localUser)) return;

  try {
    if (mode === 'register') {
      let registered = false;
      for (let attempt = 0; attempt < 4 && !registered; attempt++) {
        const username = deriveBackendUsername(displayName, em);
        try {
          await useAuthStore.getState().registerWithPassword(em, pw, username, username);
          registered = true;
        } catch (e) {
          const emailTaken =
            e instanceof ApiError &&
            (e.payload?.error === 'email_taken' ||
              e.payload?.error === 'email_exists' ||
              /email_taken|email_exists/i.test(String(e.payload?.error || '')));
          if (emailTaken) {
            await useAuthStore.getState().loginWithPassword(em, pw);
            registered = true;
          } else if (e instanceof ApiError && e.payload?.error === 'username_taken' && attempt < 3) {
            continue;
          } else {
            throw e;
          }
        }
      }
    } else {
      await useAuthStore.getState().loginWithPassword(em, pw);
    }
    await mergeBackendUserIntoLocalSession();
    await useAuthStore.getState().loadProfileMe().catch(() => {});
  } catch (e) {
    if (__DEV__) console.warn('[syncBackendSessionBridge] email auth', e?.message || e);
    // Не блокуємо локальний акаунт, якщо бекенд тимчасово недоступний.
    // Просто не синхронізували сесію з API — локальний вхід залишається робочим.
  }
}

export async function syncBackendSessionAfterGoogleIdToken(idToken, localUser) {
  const t = String(idToken || '').trim();
  if (!t || shouldSkipBackendSyncForLocalUser(localUser)) return;
  try {
    await useAuthStore.getState().loginWithGoogleIdToken(t);
    await mergeBackendUserIntoLocalSession();
    await useAuthStore.getState().loadProfileMe().catch(() => {});
  } catch (e) {
    if (__DEV__) console.warn('[syncBackendSessionBridge] google', e?.message || e);
  }
}

export async function syncBackendSessionAfterAppleIdentityToken(identityToken, fullName, localUser) {
  const t = String(identityToken || '').trim();
  if (!t || shouldSkipBackendSyncForLocalUser(localUser)) return;
  try {
    await useAuthStore.getState().loginWithAppleIdentityToken(t, fullName || null);
    await mergeBackendUserIntoLocalSession();
    await useAuthStore.getState().loadProfileMe().catch(() => {});
  } catch (e) {
    if (__DEV__) console.warn('[syncBackendSessionBridge] apple', e?.message || e);
  }
}
