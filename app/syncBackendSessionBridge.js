import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { DeviceEventEmitter } from 'react-native';
import { useAuthStore } from './auth/authStore';
import { getSession, saveSession } from './db';
import { ApiError } from './auth/types';
import { hasBackendSession } from './backendAuthApi';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_SIGNIN_WEB_CLIENT_ID, hasGoogleConfig } from './authConfig';

const REMEMBER_ME_KEY = '@kraina_remember_me';
const REMEMBER_EMAIL_KEY = '@kraina_remember_email';
const REMEMBER_EMAIL_SECURE_KEY = 'kraina_remember_email_secure';
const REMEMBER_PASSWORD_SECURE_KEY = 'kraina_remember_password_secure';
const REMEMBER_EMAIL_SECURE_KEY_LEGACY = '@kraina_remember_email_secure';
const REMEMBER_PASSWORD_SECURE_KEY_LEGACY = '@kraina_remember_password_secure';
/**
 * Окремі ключі для тихого відновлення чат-сесії — зберігаються при кожному успішному
 * вході по email, незалежно від видимої галочки «Запамʼятати мене» (вона керує лише
 * автозаповненням форми). Без цього чати ламаються, коли JWT протухає, а refresh не
 * спрацьовує (cold start Render / ротація refresh-токена) і немає чим відновити сесію.
 */
const SESSION_RECOVERY_EMAIL_SECURE_KEY = 'kraina_session_recovery_email_secure';
const SESSION_RECOVERY_PASSWORD_SECURE_KEY = 'kraina_session_recovery_password_secure';
const SECURE_STORE_KEYCHAIN = { keychainService: 'kraina.saved-login' };
const GOOGLE_ID_TOKEN_RECOVERY_KEY = 'kraina_google_id_token_recovery';

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
    await persistSessionRecoveryCredentials(em, pw);
    await mergeBackendUserIntoLocalSession();
    await useAuthStore.getState().loadProfileMe().catch(() => {});
  } catch (e) {
    if (__DEV__) console.warn('[syncBackendSessionBridge] email auth', e?.message || e);
    // Не блокуємо локальний акаунт, якщо бекенд тимчасово недоступний.
    // Просто не синхронізували сесію з API — локальний вхід залишається робочим.
  }
}

export async function persistGoogleIdTokenForRecovery(idToken) {
  const t = String(idToken || '').trim();
  if (!t) return;
  try {
    await SecureStore.setItemAsync(GOOGLE_ID_TOKEN_RECOVERY_KEY, t, SECURE_STORE_KEYCHAIN);
  } catch {
    /* */
  }
}

export async function syncBackendSessionAfterGoogleIdToken(idToken, localUser) {
  const t = String(idToken || '').trim();
  if (!t || shouldSkipBackendSyncForLocalUser(localUser)) return;
  await persistGoogleIdTokenForRecovery(t);
  try {
    await useAuthStore.getState().loginWithGoogleIdToken(t);
    await mergeBackendUserIntoLocalSession();
    await useAuthStore.getState().loadProfileMe().catch(() => {});
  } catch (e) {
    if (__DEV__) console.warn('[syncBackendSessionBridge] google', e?.message || e);
  }
}

export async function syncBackendSessionAfterFacebookAccessToken(accessToken, localUser) {
  const t = String(accessToken || '').trim();
  if (!t || shouldSkipBackendSyncForLocalUser(localUser)) return;
  try {
    await useAuthStore.getState().loginWithFacebookAccessToken(t);
    await mergeBackendUserIntoLocalSession();
    await useAuthStore.getState().loadProfileMe().catch(() => {});
  } catch (e) {
    if (__DEV__) console.warn('[syncBackendSessionBridge] facebook', e?.message || e);
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

/**
 * Зберігає логін/пароль у Keychain для тихого відновлення чат-сесії після успішного входу
 * по email. Викликається завжди (не лише при «Запамʼятати мене»), бо JWT короткоживучий і
 * без цього чати неможливо відновити, коли refresh не спрацьовує.
 */
export async function persistSessionRecoveryCredentials(email, password) {
  const em = String(email || '').trim();
  const pw = String(password || '');
  if (!em || !pw) return;
  try {
    await SecureStore.setItemAsync(SESSION_RECOVERY_EMAIL_SECURE_KEY, em, SECURE_STORE_KEYCHAIN);
    await SecureStore.setItemAsync(SESSION_RECOVERY_PASSWORD_SECURE_KEY, pw, SECURE_STORE_KEYCHAIN);
  } catch {
    /* */
  }
}

export async function clearSessionRecoveryCredentials() {
  try {
    await SecureStore.deleteItemAsync(SESSION_RECOVERY_EMAIL_SECURE_KEY, SECURE_STORE_KEYCHAIN);
    await SecureStore.deleteItemAsync(SESSION_RECOVERY_PASSWORD_SECURE_KEY, SECURE_STORE_KEYCHAIN);
  } catch {
    /* */
  }
}

async function readRememberedCredentials(localUser) {
  try {
    const remember = await AsyncStorage.getItem(REMEMBER_ME_KEY);
    const emailFromSession = String(localUser?.email || '').trim();
    const email =
      (await SecureStore.getItemAsync(REMEMBER_EMAIL_SECURE_KEY, SECURE_STORE_KEYCHAIN)) ||
      (await SecureStore.getItemAsync(REMEMBER_EMAIL_SECURE_KEY_LEGACY, SECURE_STORE_KEYCHAIN)) ||
      (await AsyncStorage.getItem(REMEMBER_EMAIL_KEY)) ||
      emailFromSession;
    const password =
      (await SecureStore.getItemAsync(REMEMBER_PASSWORD_SECURE_KEY, SECURE_STORE_KEYCHAIN)) ||
      (await SecureStore.getItemAsync(REMEMBER_PASSWORD_SECURE_KEY_LEGACY, SECURE_STORE_KEYCHAIN));
    const em = String(email || '').trim();
    const pw = String(password || '');
    if (em && pw && (remember === 'true' || !emailFromSession || em.toLowerCase() === emailFromSession.toLowerCase())) {
      return { email: em, password: pw };
    }
    // Резервне джерело — облікові дані для відновлення сесії (зберігаються при кожному вході).
    const recEmail = String(
      (await SecureStore.getItemAsync(SESSION_RECOVERY_EMAIL_SECURE_KEY, SECURE_STORE_KEYCHAIN)) || '',
    ).trim();
    const recPw = String(
      (await SecureStore.getItemAsync(SESSION_RECOVERY_PASSWORD_SECURE_KEY, SECURE_STORE_KEYCHAIN)) || '',
    );
    if (!recEmail || !recPw) return null;
    if (emailFromSession && recEmail.toLowerCase() !== emailFromSession.toLowerCase()) return null;
    return { email: recEmail, password: recPw };
  } catch {
    return null;
  }
}

async function tryRecoverEmailBackendSession(localUser) {
  const saved = await readRememberedCredentials(localUser);
  if (!saved) return false;
  try {
    await useAuthStore.getState().loginWithPassword(saved.email, saved.password);
    await mergeBackendUserIntoLocalSession();
    DeviceEventEmitter.emit('kraina_backend_session_merged_v1');
    return hasBackendSession();
  } catch (e) {
    if (__DEV__) console.warn('[syncBackendSessionBridge] email recover', e?.message || e);
    return false;
  }
}

async function tryRecoverViaFirebaseIdToken() {
  try {
    const { auth, firebaseAuthEnabled } = require('./firebaseConfig');
    if (!firebaseAuthEnabled || !auth?.currentUser) return false;
    const idToken = await auth.currentUser.getIdToken(true);
    if (!idToken) return false;
    await useAuthStore.getState().loginWithFirebaseIdToken(idToken);
    await mergeBackendUserIntoLocalSession();
    DeviceEventEmitter.emit('kraina_backend_session_merged_v1');
    return hasBackendSession();
  } catch (e) {
    if (__DEV__) console.warn('[syncBackendSessionBridge] firebase recover', e?.message || e);
    return false;
  }
}

async function tryRecoverFromStoredGoogleIdToken(localUser) {
  try {
    const t = await SecureStore.getItemAsync(GOOGLE_ID_TOKEN_RECOVERY_KEY, SECURE_STORE_KEYCHAIN);
    if (!t) return false;
    await syncBackendSessionAfterGoogleIdToken(t, localUser);
    if (hasBackendSession()) return true;
    await SecureStore.deleteItemAsync(GOOGLE_ID_TOKEN_RECOVERY_KEY, SECURE_STORE_KEYCHAIN).catch(() => {});
    return false;
  } catch {
    return false;
  }
}

async function tryRecoverGoogleBackendSession(localUser) {
  if (!hasGoogleConfig) return false;
  try {
    const mod = require('@react-native-google-signin/google-signin');
    const GoogleSignin = mod.GoogleSignin || mod.default?.GoogleSignin;
    if (!GoogleSignin) return false;
    GoogleSignin.configure({
      webClientId: GOOGLE_SIGNIN_WEB_CLIENT_ID,
      ...(GOOGLE_IOS_CLIENT_ID ? { iosClientId: GOOGLE_IOS_CLIENT_ID } : {}),
    });
    try {
      await GoogleSignin.signInSilently();
    } catch {
      /* already signed in or needs interactive sign-in */
    }
    const tokens = await GoogleSignin.getTokens();
    const idToken = String(tokens?.idToken || '').trim();
    if (!idToken) return false;
    await syncBackendSessionAfterGoogleIdToken(idToken, localUser);
    return hasBackendSession();
  } catch (e) {
    if (__DEV__) console.warn('[syncBackendSessionBridge] google recover', e?.message || e);
    return false;
  }
}

/**
 * Локальна сесія (Google/Apple/email) без JWT — пробуємо refresh, Firebase, Google або email.
 */
export async function ensureBackendSession(localUser) {
  if (hasBackendSession()) return true;

  if (!useAuthStore.getState().hydrated) {
    await useAuthStore.getState().hydrate();
  }

  const user = localUser || (await getSession())?.user;
  if (!user || shouldSkipBackendSyncForLocalUser(user)) return false;

  const refreshed = await useAuthStore.getState().refreshSession();
  if (refreshed && hasBackendSession()) return true;

  if (await tryRecoverViaFirebaseIdToken()) return true;
  if (await tryRecoverFromStoredGoogleIdToken(user)) return true;

  const provider = String(user.provider || '').toLowerCase();
  if (provider === 'google') {
    if (await tryRecoverGoogleBackendSession(user)) return true;
  }

  if (provider === 'email' || provider === 'password' || !provider) {
    if (await tryRecoverEmailBackendSession(user)) return true;
  }

  if (await tryRecoverEmailBackendSession(user)) return true;

  return hasBackendSession();
}
