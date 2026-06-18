import { DeviceEventEmitter } from 'react-native';
import { useAuthStore } from './auth/authStore';
import { getSession, saveSession } from './db';
import { ApiError } from './auth/types';

const ADMIN_LOCAL_ID = 'kraina_gate_admin_v1';

export async function mergeBackendUserIntoLocalSession() {
  const backendUser = useAuthStore.getState().user;
  const profile = useAuthStore.getState().profileMe?.profile;
  const s = await getSession();
  if (!backendUser?.id) return;
  const profileUsername = profile?.username ? String(profile.username).replace(/^@/, '') : '';
  const profileDisplayName = profile?.display_name ? String(profile.display_name).trim() : '';
  const sameUser = !!s?.user && String(s.user.id) === String(backendUser.id);
  if (!s?.user || !sameUser) {
    await saveSession({
      id: backendUser.id,
      email: backendUser.email,
      name: profileDisplayName || (backendUser.email ? String(backendUser.email).split('@')[0] : 'User'),
      accountUsername: profileUsername || undefined,
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
    ...(profileDisplayName ? { name: profileDisplayName } : {}),
    ...(profileUsername ? { accountUsername: profileUsername } : {}),
  };
  await saveSession(merged);
  DeviceEventEmitter.emit('kraina_backend_session_merged_v1');
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
      try {
        await useAuthStore.getState().registerWithPassword(em, pw, String(displayName || '').trim());
      } catch (e) {
        const emailTaken =
          e instanceof ApiError &&
          (e.payload?.error === 'email_taken' ||
            e.payload?.error === 'email_exists' ||
            /email_taken|email_exists/i.test(String(e.payload?.error || '')));
        if (emailTaken) {
          await useAuthStore.getState().loginWithPassword(em, pw);
        } else {
          throw e;
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
