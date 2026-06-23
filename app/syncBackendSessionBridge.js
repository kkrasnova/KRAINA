import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { DeviceEventEmitter } from 'react-native';
import { useAuthStore } from './auth/authStore';
import { getSession, saveSession } from './db';
import { ApiError } from './auth/types';
import { backendGetProfileMe, hasBackendSession } from './backendAuthApi';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_SIGNIN_WEB_CLIENT_ID, hasGoogleConfig } from './authConfig';
import { logError } from './errorLogger';

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
/** Резерв на Android, якщо SecureStore тимчасово недоступний або ключі втрачені після оновлення. */
const SESSION_RECOVERY_EMAIL_AS_KEY = '@kraina_session_recovery_email_v1';
const SESSION_RECOVERY_PASSWORD_AS_KEY = '@kraina_session_recovery_password_v1';
const SECURE_STORE_KEYCHAIN = { keychainService: 'kraina.saved-login' };
const AUTH_RECOVERY_RETRY_DELAYS_MS = [0, 2000, 5000];
const GOOGLE_ID_TOKEN_RECOVERY_KEY = 'kraina_google_id_token_recovery';

const ADMIN_LOCAL_ID = 'kraina_gate_admin_v1';

/** SecureStore rejects keys with «@» — legacy keys must be read in isolation. */
async function safeSecureGetItem(key, legacyKey) {
  try {
    const value = await SecureStore.getItemAsync(key, SECURE_STORE_KEYCHAIN);
    if (value != null && value !== '') return value;
    if (!legacyKey) return null;
    try {
      return await SecureStore.getItemAsync(legacyKey, SECURE_STORE_KEYCHAIN);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

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
    logError('chat_session', String(e?.message || e), {
      step: 'email_auth',
      mode: mode || 'login',
      status: e instanceof ApiError ? e.status : 0,
      errorCode: e instanceof ApiError ? e.payload?.error : undefined,
    });
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
  // Capture Firebase auth ref for error logging
  let fireAuth;
  try {
    const mod = require('./firebaseConfig');
    fireAuth = mod.auth;
  } catch { fireAuth = null; }
  try {
    await useAuthStore.getState().loginWithGoogleIdToken(t);
    await mergeBackendUserIntoLocalSession();
    await useAuthStore.getState().loadProfileMe().catch(() => {});
  } catch (e) {
    if (await tryRecoverViaFirebaseIdToken()) {
      await mergeBackendUserIntoLocalSession();
      await useAuthStore.getState().loadProfileMe().catch(() => {});
      return;
    }
    const errMessage = e instanceof ApiError
      ? `google_api_error:${e.status}:${e.payload?.error || e.message}`
      : String(e?.message || e);
    logError('chat_session', errMessage, {
      step: 'google_id_token',
      provider: 'google',
      status: e instanceof ApiError ? e.status : 0,
      errorCode: e instanceof ApiError ? e.payload?.error : undefined,
      hasFirebase: !!fireAuth?.currentUser,
    });
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
    logError('chat_session', String(e?.message || e), {
      step: 'facebook_access_token',
      provider: 'facebook',
      status: e instanceof ApiError ? e.status : 0,
      errorCode: e instanceof ApiError ? e.payload?.error : undefined,
    });
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
    logError('chat_session', String(e?.message || e), {
      step: 'apple_identity_token',
      provider: 'apple',
      status: e instanceof ApiError ? e.status : 0,
      errorCode: e instanceof ApiError ? e.payload?.error : undefined,
    });
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
  } catch (e) {
    if (__DEV__) console.warn('[syncBackendSessionBridge] persist recovery credentials (secure) failed:', e?.message || e);
  }
  try {
    await AsyncStorage.multiSet([
      [SESSION_RECOVERY_EMAIL_AS_KEY, em],
      [SESSION_RECOVERY_PASSWORD_AS_KEY, pw],
    ]);
    if (__DEV__) console.log('[syncBackendSessionBridge] session recovery credentials persisted');
  } catch (e) {
    if (__DEV__) console.warn('[syncBackendSessionBridge] persist recovery credentials (async) failed:', e?.message || e);
  }
}

export async function clearSessionRecoveryCredentials() {
  try {
    await SecureStore.deleteItemAsync(SESSION_RECOVERY_EMAIL_SECURE_KEY, SECURE_STORE_KEYCHAIN);
    await SecureStore.deleteItemAsync(SESSION_RECOVERY_PASSWORD_SECURE_KEY, SECURE_STORE_KEYCHAIN);
  } catch {
    /* */
  }
  try {
    await AsyncStorage.multiRemove([SESSION_RECOVERY_EMAIL_AS_KEY, SESSION_RECOVERY_PASSWORD_AS_KEY]);
  } catch {
    /* */
  }
}

async function readRememberedCredentials(localUser) {
  try {
    const remember = await AsyncStorage.getItem(REMEMBER_ME_KEY);
    const emailFromSession = String(localUser?.email || '').trim();
    const email =
      (await safeSecureGetItem(REMEMBER_EMAIL_SECURE_KEY, REMEMBER_EMAIL_SECURE_KEY_LEGACY)) ||
      (await AsyncStorage.getItem(REMEMBER_EMAIL_KEY)) ||
      emailFromSession;
    const password = await safeSecureGetItem(REMEMBER_PASSWORD_SECURE_KEY, REMEMBER_PASSWORD_SECURE_KEY_LEGACY);
    const em = String(email || '').trim();
    const pw = String(password || '');
    if (em && pw && (remember === 'true' || !emailFromSession || em.toLowerCase() === emailFromSession.toLowerCase())) {
      if (__DEV__) console.log('[syncBackendSessionBridge] recovered remembered credentials');
      return { email: em, password: pw };
    }
    // Резервне джерело — облікові дані для відновлення сесії (зберігаються при кожному вході).
    const recEmail = String(
      (await safeSecureGetItem(SESSION_RECOVERY_EMAIL_SECURE_KEY)) ||
        (await AsyncStorage.getItem(SESSION_RECOVERY_EMAIL_AS_KEY)) ||
        '',
    ).trim();
    const recPw = String(
      (await safeSecureGetItem(SESSION_RECOVERY_PASSWORD_SECURE_KEY)) ||
        (await AsyncStorage.getItem(SESSION_RECOVERY_PASSWORD_AS_KEY)) ||
        '',
    );
    if (__DEV__) {
      console.log('[syncBackendSessionBridge] session recovery email found:', !!recEmail, 'password found:', !!recPw);
    }
    if (!recEmail || !recPw) return null;
    if (emailFromSession && recEmail.toLowerCase() !== emailFromSession.toLowerCase()) {
      if (__DEV__) console.log('[syncBackendSessionBridge] recovery email mismatch:', recEmail, 'vs', emailFromSession);
      return null;
    }
    if (__DEV__) console.log('[syncBackendSessionBridge] recovered session recovery credentials');
    return { email: recEmail, password: recPw };
  } catch (e) {
    if (__DEV__) console.warn('[syncBackendSessionBridge] read credentials error:', e?.message || e);
    return null;
  }
}

/** Перевіряє, що JWT реально працює (не лише лежить у SecureStore). */
async function backendSessionIsLive() {
  if (!hasBackendSession()) return false;
  try {
    await backendGetProfileMe();
    return true;
  } catch (e) {
    const authDead =
      e instanceof ApiError && (e.status === 401 || e.status === 403);
    if (authDead) {
      await useAuthStore.getState().clearLocalSession();
      return false;
    }
    // Мережева помилка — не знищуємо сесію, вважаємо тимчасовим збоєм.
    return true;
  }
}

function isRetryableRecoveryNetworkError(err) {
  if (err instanceof ApiError) {
    return err.status === 0 || err.status === 408 || err.status === 502 || err.status === 503 || err.status === 504;
  }
  const msg = String(err?.message || '').toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    err?.name === 'TypeError' ||
    err?.name === 'TimeoutError'
  );
}

async function tryRecoverEmailBackendSession(localUser) {
  const saved = await readRememberedCredentials(localUser);
  if (!saved) {
    if (__DEV__) console.log('[syncBackendSessionBridge] no saved credentials to recover');
    return false;
  }
  for (let attempt = 0; attempt < AUTH_RECOVERY_RETRY_DELAYS_MS.length; attempt += 1) {
    const delayMs = AUTH_RECOVERY_RETRY_DELAYS_MS[attempt];
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    try {
      if (__DEV__) {
        console.log('[syncBackendSessionBridge] attempting email recovery for:', saved.email, `(try ${attempt + 1})`);
      }

      const authState = useAuthStore.getState();
      await authState.loginWithPassword(saved.email, saved.password);
      if (__DEV__) console.log('[syncBackendSessionBridge] email login succeeded, checking state...');

      await new Promise((r) => setTimeout(r, 50));

      const newState = useAuthStore.getState();
      if (__DEV__) {
        console.log('[syncBackendSessionBridge] auth state after login:', {
          hasAccessToken: !!newState.accessToken,
          hasUser: !!newState.user?.id,
          userId: newState.user?.id,
          userEmail: newState.user?.email,
        });
      }

      await mergeBackendUserIntoLocalSession();
      DeviceEventEmitter.emit('kraina_backend_session_merged_v1');

      const hasSession = hasBackendSession();
      if (__DEV__) {
        console.log('[syncBackendSessionBridge] email recovery result:', hasSession);
      }
      return hasSession;
    } catch (e) {
      if (__DEV__) console.warn('[syncBackendSessionBridge] email recover failed:', e?.message || e);
      const isInvalidCreds =
        e instanceof ApiError &&
        (e.status === 401 || String(e.payload?.error || '').toLowerCase() === 'invalid_credentials');
      if (isInvalidCreds) {
        try {
          const displayName = String(localUser?.name || saved.email.split('@')[0] || 'User').trim();
          await useAuthStore.getState().registerWithPassword(saved.email, saved.password, displayName);
          await mergeBackendUserIntoLocalSession();
          DeviceEventEmitter.emit('kraina_backend_session_merged_v1');
          return hasBackendSession();
        } catch (regErr) {
          if (__DEV__) {
            console.warn('[syncBackendSessionBridge] email register recover failed:', regErr?.message || regErr);
          }
        }
      }
      if (attempt < AUTH_RECOVERY_RETRY_DELAYS_MS.length - 1 && isRetryableRecoveryNetworkError(e)) {
        continue;
      }
      return false;
    }
  }
  return false;
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
    logError('chat_session', String(e?.message || e), {
      step: 'firebase_recover',
      status: e instanceof ApiError ? e.status : 0,
      errorCode: e instanceof ApiError ? e.payload?.error : undefined,
    });
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
    const silent = await GoogleSignin.signInSilently().catch(() => null);
    if (silent?.type === 'noSavedCredentialFound') {
      if (__DEV__) console.log('[syncBackendSessionBridge] google silent: no saved credential');
      return false;
    }
    const tokens = await GoogleSignin.getTokens();
    const idToken = String(tokens?.idToken || '').trim();
    if (!idToken) return false;
    await syncBackendSessionAfterGoogleIdToken(idToken, localUser);
    if (hasBackendSession()) {
      await persistGoogleIdTokenForRecovery(idToken);
      return true;
    }
    await SecureStore.deleteItemAsync(GOOGLE_ID_TOKEN_RECOVERY_KEY, SECURE_STORE_KEYCHAIN).catch(() => {});
    return false;
  } catch (e) {
    if (__DEV__) console.warn('[syncBackendSessionBridge] google recover', e?.message || e);
    return false;
  }
}

/** Інтерактивний Google Sign-In для відновлення чат-сесії (кнопка «Спробувати знову»). */
export async function recoverGoogleBackendSessionInteractive(localUser) {
  if (!hasGoogleConfig || shouldSkipBackendSyncForLocalUser(localUser)) return false;
  try {
    const mod = require('@react-native-google-signin/google-signin');
    const GoogleSignin = mod.GoogleSignin || mod.default?.GoogleSignin;
    if (!GoogleSignin) return false;
    const { Platform } = require('react-native');
    const { signInWithGoogleIdToken, saveSession } = require('./db');
    GoogleSignin.configure({
      webClientId: GOOGLE_SIGNIN_WEB_CLIENT_ID,
      ...(GOOGLE_IOS_CLIENT_ID ? { iosClientId: GOOGLE_IOS_CLIENT_ID } : {}),
    });
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }
    const result = await GoogleSignin.signIn();
    const idToken = String(result?.data?.idToken || result?.idToken || '').trim();
    if (!idToken) return false;
    const { user: signedUser } = await signInWithGoogleIdToken(idToken);
    if (signedUser) await saveSession(signedUser);
    await syncBackendSessionAfterGoogleIdToken(idToken, signedUser || localUser);
    if (!hasBackendSession()) return false;
    await mergeBackendUserIntoLocalSession();
    DeviceEventEmitter.emit('kraina_backend_session_merged_v1');
    return true;
  } catch (e) {
    const code = String(e?.code || e?.message || '');
    if (code === 'SIGN_IN_CANCELLED' || code === '12501' || code === 'ERR_REQUEST_CANCELED') {
      return false;
    }
    if (__DEV__) console.warn('[syncBackendSessionBridge] google interactive', e?.message || e);
    return false;
  }
}

/**
 * Локальна сесія (Google/Apple/email) без JWT — пробуємо refresh, Firebase, Google або email.
 */
export async function ensureBackendSession(localUser) {
  if (await backendSessionIsLive()) {
    if (__DEV__) console.log('[syncBackendSessionBridge] backend session already active');
    return true;
  }

  if (!useAuthStore.getState().hydrated) {
    if (__DEV__) console.log('[syncBackendSessionBridge] hydrating auth store');
    await useAuthStore.getState().hydrate();
  }

  const user = localUser || (await getSession())?.user;
  if (!user || shouldSkipBackendSyncForLocalUser(user)) {
    if (__DEV__) console.log('[syncBackendSessionBridge] skipping backend sync:', !user ? 'no user' : 'admin user');
    return false;
  }

  if (__DEV__) console.log('[syncBackendSessionBridge] attempting to recover backend session for:', user?.email || user?.id);
  
  const provider = String(user.provider || '').toLowerCase();
  const isEmailLikeProvider = provider === 'email' || provider === 'password' || !provider;

  // Спроба 1: refresh існуючого токена (з повтором при cold start Render / офлайн).
  for (let attempt = 0; attempt < AUTH_RECOVERY_RETRY_DELAYS_MS.length; attempt += 1) {
    const delayMs = AUTH_RECOVERY_RETRY_DELAYS_MS[attempt];
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    const refreshed = await useAuthStore.getState().refreshSession();
    if (refreshed && hasBackendSession()) {
      if (__DEV__) console.log('[syncBackendSessionBridge] refreshed session successfully');
      return true;
    }
  }

  // Спроба 2: Email/пароль — для email-акаунтів швидше за Firebase (менше залежності від мережі Firebase→API).
  if (isEmailLikeProvider) {
    if (await tryRecoverEmailBackendSession(user)) {
      if (__DEV__) console.log('[syncBackendSessionBridge] recovered via email/password');
      return true;
    }
  }

  // Спроба 3: Firebase idToken → backend JWT.
  if (await tryRecoverViaFirebaseIdToken()) {
    if (__DEV__) console.log('[syncBackendSessionBridge] recovered via firebase');
    return true;
  }

  // Спроба 4–5: Google — спочатку свіжий idToken з GoogleSignin, потім кешований.
  if (provider === 'google') {
    if (await tryRecoverGoogleBackendSession(user)) {
      if (__DEV__) console.log('[syncBackendSessionBridge] recovered via google signin');
      return true;
    }
    if (await tryRecoverFromStoredGoogleIdToken(user)) {
      if (__DEV__) console.log('[syncBackendSessionBridge] recovered via stored google token');
      return true;
    }
  } else if (await tryRecoverFromStoredGoogleIdToken(user)) {
    if (__DEV__) console.log('[syncBackendSessionBridge] recovered via stored google token');
    return true;
  }

  // Спроба 6: Email/пароль як fallback (навіть якщо provider інший).
  if (!isEmailLikeProvider && (await tryRecoverEmailBackendSession(user))) {
    if (__DEV__) console.log('[syncBackendSessionBridge] recovered via email/password fallback');
    return true;
  }

  const result = hasBackendSession();
  if (!result) {
    const state = useAuthStore.getState();
    const { API_BASE_URL } = require('./auth/config');
    logError('chat_session', 'All session recovery attempts failed', {
      provider: provider || 'unknown',
      userEmail: user?.email || 'no-email',
      hasAccessToken: !!state.accessToken,
      hasUser: !!state.user?.id,
      accessTokenIsJwt: typeof state.accessToken === 'string' && state.accessToken.split('.').length === 3,
      apiBaseUrl: API_BASE_URL || 'missing',
    });
    if (__DEV__) {
      console.warn('[syncBackendSessionBridge] failed to recover session:', {
        hasAccessToken: !!state.accessToken,
        hasUser: !!state.user?.id,
        provider: provider || 'unknown',
        userEmail: user?.email || 'no-email',
      });
    }
  } else if (__DEV__) {
    console.log('[syncBackendSessionBridge] session recovered after all attempts');
  }
  return result;
}
