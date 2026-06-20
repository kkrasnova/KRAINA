
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sha256 } from 'js-sha256';
import * as FirebaseCfg from './firebaseConfig';
import { isAdminGateEmail, verifyAdminPasswordGate } from './adminGate';
import { clearProfileLocalCache } from './profileStorage';

const auth = FirebaseCfg.auth;
const db = FirebaseCfg.db;
const firebaseEnabled = !!FirebaseCfg.firebaseEnabled;
const firebaseAuthEnabled = !!FirebaseCfg.firebaseAuthEnabled;


const FIRESTORE_GET_USERS_MS = 2200;
const FIRESTORE_SET_USER_MS = 3500;
const FIREBASE_FETCH_SIGNIN_METHODS_MS = 2200;
const FIREBASE_CREATE_USER_MS = 5000;
const FIREBASE_SIGNIN_MS = 5000;

const USERS_KEY = '@kraina_users_v2';
const SESSION_KEY = '@kraina_session_v2';
const USERS_COLLECTION = 'users';


const REMEMBER_ME_KEY = '@kraina_remember_me';
const REMEMBER_EMAIL_KEY = '@kraina_remember_email';
const REMEMBER_EMAIL_SECURE_KEY = '@kraina_remember_email_secure';
const REMEMBER_PASSWORD_SECURE_KEY = '@kraina_remember_password_secure';
const AUTH_FORM_DRAFT_KEY = '@kraina_auth_form_draft_v1';
const AUTH_DRAFT_PASSWORD_SECURE_KEY = '@kraina_auth_draft_password_secure';
const SECURE_STORE_KEYCHAIN = { keychainService: 'kraina.saved-login' };

async function secureStoreDeleteIfPresent(key) {
  try {
    const SS = require('expo-secure-store');
    await SS.deleteItemAsync(key, SECURE_STORE_KEYCHAIN);
  } catch (_) {}
}

/** Iterated SHA-256 stretching (per-user salt). Legacy accounts use a single salted SHA-256 only. */
const PASSWORD_V2_ITERATIONS = 12000;

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function legacyPasswordHash(password) {
  return sha256('kraina_2025_salt_' + String(password));
}

function stretchPasswordHash(password, saltHex, iterations) {
  const p = String(password);
  let out = sha256(`${saltHex}|kraina_pw_v2|${p}`);
  for (let i = 1; i < iterations; i += 1) {
    out = sha256(`${out}|${i}|${p}|${saltHex}`);
  }
  return out;
}

async function randomSaltHex16() {
  try {
    const Crypto = require('expo-crypto');
    const bytes = await Crypto.getRandomBytesAsync(16);
    return Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('');
  } catch {
    return legacyPasswordHash(`${Date.now()}:${Math.random()}`).slice(0, 32);
  }
}

async function verifyPasswordAgainstStored(password, stored) {
  if (stored == null || stored === '') return false;
  const s = String(stored);
  if (s.startsWith('v2|')) {
    const parts = s.split('|');
    if (parts.length !== 4) return false;
    const iterations = parseInt(parts[1], 10);
    const saltHex = parts[2];
    const want = parts[3];
    if (!iterations || !saltHex || !want || saltHex.length < 16) return false;
    const got = stretchPasswordHash(password, saltHex, iterations);
    return timingSafeEqualHex(got, want);
  }
  return timingSafeEqualHex(legacyPasswordHash(password), s);
}

function needsPasswordUpgrade(stored) {
  return stored != null && stored !== '' && !String(stored).startsWith('v2|');
}

async function hashPassword(password) {
  const saltHex = await randomSaltHex16();
  const hashHex = stretchPasswordHash(password, saltHex, PASSWORD_V2_ITERATIONS);
  return `v2|${PASSWORD_V2_ITERATIONS}|${saltHex}|${hashHex}`;
}

function mapFirebaseAuthError(error) {
  const code = error?.code || '';
  if (
    code === 'auth/email-already-in-use' ||
    code === 'auth/account-exists-with-different-credential'
  ) {
    return 'EMAIL_EXISTS';
  }
  if (code === 'auth/invalid-email') {
    return 'INVALID_EMAIL';
  }
  if (code === 'auth/weak-password') {
    return 'WEAK_PASSWORD';
  }
  if (code === 'auth/user-not-found') {
    return 'USER_NOT_FOUND';
  }
  if (code === 'auth/wrong-password') {
    return 'WRONG_PASSWORD';
  }
  if (code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
    return 'WRONG_CREDENTIALS';
  }
  if (code === 'auth/user-disabled') {
    return 'USER_DISABLED';
  }
  if (code === 'auth/too-many-requests') {
    return 'TOO_MANY_REQUESTS';
  }
  if (code === 'auth/network-request-failed') {
    return 'NETWORK_ERROR';
  }
  if (code === 'auth/internal-error') {
    return 'AUTH_INTERNAL_ERROR';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'OPERATION_NOT_ALLOWED';
  }
  return 'FIREBASE_AUTH_ERROR';
}


async function refineFirebaseEmailLoginError(error, emailTrimmed, localEmailExists) {
  const code = error?.code || '';
  if (code === 'auth/user-not-found') return 'USER_NOT_FOUND';
  if (code === 'auth/wrong-password') return 'WRONG_PASSWORD';

  if (code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
    if (localEmailExists) return 'WRONG_PASSWORD';
    if (!auth || !firebaseAuthEnabled) {
      return 'USER_NOT_FOUND';
    }
    try {
      const { fetchSignInMethodsForEmail } = require('firebase/auth');
      const methods = await Promise.race([
        fetchSignInMethodsForEmail(auth, emailTrimmed),
        new Promise((resolve) => setTimeout(() => resolve(null), FIREBASE_FETCH_SIGNIN_METHODS_MS)),
      ]);
      if (methods === null) {
        return localEmailExists ? 'WRONG_PASSWORD' : 'USER_NOT_FOUND';
      }
      const m = Array.isArray(methods) ? methods : [];
      if (m.length === 0) return 'USER_NOT_FOUND';
      if (m.includes('password')) return 'WRONG_PASSWORD';
      return 'WRONG_CREDENTIALS';
    } catch {
      return localEmailExists ? 'WRONG_PASSWORD' : 'WRONG_CREDENTIALS';
    }
  }

  return mapFirebaseAuthError(error);
}

async function createFirebaseEmailUser(email, password) {
  if (!auth || !firebaseAuthEnabled) return null;
  const { createUserWithEmailAndPassword } = require('firebase/auth');
  // Keep Firebase session active after create — Firestore/Cloud Functions
  // need auth.currentUser on the very first calls after registration.
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  return credential?.user || null;
}

async function signInFirebaseEmailUser(email, password) {
  if (!auth || !firebaseAuthEnabled) return null;
  const { signInWithEmailAndPassword } = require('firebase/auth');
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential?.user || null;
}

async function sendFirebasePasswordReset(email) {
  if (!auth || !firebaseAuthEnabled) return false;
  const { sendPasswordResetEmail } = require('firebase/auth');
  await sendPasswordResetEmail(auth, email);
  return true;
}

function makeId() {
  return 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}


const APP_LANGUAGE_STORAGE_KEY = '@kraina_app_language';

async function mergeAppLanguageBidirectional(user) {
  const u = { ...user };
  let stored = null;
  try {
    stored = await AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
  } catch (_) {}
  if (stored && typeof stored === 'string') {
    const base = stored.split(/[-_]/)[0].toLowerCase();
    u.appLanguage = base === 'ru' ? 'uk' : base;
  } else if (u.appLanguage) {
    try {
      await AsyncStorage.setItem(APP_LANGUAGE_STORAGE_KEY, u.appLanguage);
    } catch (_) {}
  }
  return u;
}

function userToStore(u) {
  const role = u.role === 'admin' || u.isAdmin === true ? 'admin' : 'user';
  return {
    id: u.id,
    email: (u.email || '').trim(),
    name: u.name || '',
    firebaseUid: u.firebaseUid || null,
    passwordHash: u.passwordHash || null,
    provider: u.provider || 'email',
    googleId: u.googleId || null,
    facebookId: u.facebookId || null,
    appleUserId: u.appleUserId || null,
    avatar: u.avatar || null,
    createdAt: u.createdAt || new Date().toISOString(),
    appLanguage: u.appLanguage || null,
    role,
    isAdmin: role === 'admin',
  };
}


function decodeGoogleIdTokenPayload(idToken) {
  try {
    const part = idToken.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64 + '==='.slice(0, (4 - (b64.length % 4)) % 4);
    const atobFn = typeof globalThis.atob === 'function' ? globalThis.atob.bind(globalThis) : null;
    if (!atobFn) return null;
    const json = decodeURIComponent(
      atobFn(pad)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}


async function syncAppUserFromFirebaseUser(fbUser) {
  const email = (fbUser.email || '').trim();
  const emailLower = email.toLowerCase();
  const displayName = fbUser.displayName || '';
  const photoURL = fbUser.photoURL || null;

  const providers = fbUser.providerData || [];
  const primary = providers[0];
  let providerType = 'email';
  const pid0 = primary?.providerId;
  if (pid0 === 'google.com') providerType = 'google';
  else if (pid0 === 'facebook.com') providerType = 'facebook';
  else if (pid0 === 'apple.com') providerType = 'apple';
  else if (pid0 === 'phone') providerType = 'phone';

  let googleId = null;
  let facebookId = null;
  let appleUserId = null;
  for (const p of providers) {
    if (p.providerId === 'google.com') googleId = p.uid;
    if (p.providerId === 'facebook.com') facebookId = p.uid;
    if (p.providerId === 'apple.com') appleUserId = p.uid;
  }

  const users = await getUsers();
  let user = users.find(
    (u) =>
      (u.firebaseUid && u.firebaseUid === fbUser.uid) ||
      (emailLower && (u.email || '').toLowerCase() === emailLower),
  );

  const placeholderEmail = `user_${fbUser.uid.slice(0, 12)}@kraina.local`;

  if (!user) {
    user = {
      id: makeId(),
      email: email || placeholderEmail,
      name: displayName || (email ? email.split('@')[0] : 'User'),
      firebaseUid: fbUser.uid,
      passwordHash: null,
      provider: providerType,
      googleId,
      facebookId,
      appleUserId,
      avatar: photoURL,
      createdAt: new Date().toISOString(),
    };
  } else {
    user.firebaseUid = fbUser.uid;
    user.provider = providerType;
    if (photoURL) user.avatar = photoURL;
    if (displayName) user.name = displayName;
    if (email && (!user.email || user.email.includes('@kraina.local'))) user.email = email;
    if (googleId) user.googleId = googleId;
    if (facebookId) user.facebookId = facebookId;
    if (appleUserId) user.appleUserId = appleUserId;
  }

  await persistUser(user);
  return user;
}


export async function signInWithGoogleIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('MISSING_GOOGLE_TOKEN');
  }
  if (firebaseAuthEnabled && auth) {
    try {
      const { GoogleAuthProvider, signInWithCredential, getAdditionalUserInfo } = require('firebase/auth');
      const credential = GoogleAuthProvider.credential(idToken);
      const result = await Promise.race([
        signInWithCredential(auth, credential),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('GOOGLE_AUTH_TIMEOUT')), FIREBASE_SIGNIN_MS),
        ),
      ]);
      const isNewUser = getAdditionalUserInfo(result)?.isNewUser === true;
      const user = await syncAppUserFromFirebaseUser(result.user);
      return { user, isNewUser };
    } catch (e) {
      if (__DEV__) console.warn('[signInWithGoogleIdToken] Firebase failed, JWT fallback', e?.message);
      const payload = decodeGoogleIdTokenPayload(idToken);
      if (!payload?.sub) throw e;
      return loginOrRegisterGoogle({
        email: payload.email || '',
        name: payload.name || payload.given_name || '',
        googleId: payload.sub,
        avatar: payload.picture || null,
      });
    }
  }
  const payload = decodeGoogleIdTokenPayload(idToken);
  if (!payload?.sub) throw new Error('INVALID_GOOGLE_TOKEN');
  return loginOrRegisterGoogle({
    email: payload.email || '',
    name: payload.name || payload.given_name || '',
    googleId: payload.sub,
    avatar: payload.picture || null,
  });
}

export async function signInWithFacebookAccessToken(accessToken) {
  if (!accessToken || typeof accessToken !== 'string') {
    throw new Error('MISSING_FACEBOOK_TOKEN');
  }
  const graphFallback = async () => {
    const profile = await fetchFacebookProfileFromGraph(accessToken);
    return loginOrRegisterFacebook(profile);
  };

  if (firebaseAuthEnabled && auth) {
    try {
      const { FacebookAuthProvider, signInWithCredential, getAdditionalUserInfo } = require('firebase/auth');
      const credential = FacebookAuthProvider.credential(accessToken);
      const result = await Promise.race([
        signInWithCredential(auth, credential),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('FB_AUTH_TIMEOUT')), FIREBASE_SIGNIN_MS),
        ),
      ]);
      const isNewUser = getAdditionalUserInfo(result)?.isNewUser === true;
      const user = await syncAppUserFromFirebaseUser(result.user);
      return { user, isNewUser };
    } catch (e) {
      if (__DEV__) console.warn('[signInWithFacebookAccessToken] Firebase failed, Graph fallback', e?.message);
      return graphFallback();
    }
  }

  return graphFallback();
}

function formatAppleFullName(fullName) {
  if (!fullName || typeof fullName !== 'object') return '';
  const a = [fullName.givenName, fullName.familyName, fullName.middleName].filter(
    (x) => typeof x === 'string' && x.trim(),
  );
  return a.length ? a.join(' ').trim() : '';
}


export async function loginOrRegisterApple({ appleUserId, email, name }) {
  if (!appleUserId || typeof appleUserId !== 'string') {
    throw new Error('MISSING_APPLE_USER_ID');
  }
  const users = await getUsers();
  const emailLower = (email || '').toLowerCase();

  let user = users.find(
    (u) =>
      (u.appleUserId && u.appleUserId === appleUserId) ||
      (emailLower && (u.email || '').toLowerCase() === emailLower),
  );

  const isNewUser = !user;
  const placeholderEmail = `apple_${appleUserId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}@kraina.local`;

  if (!user) {
    user = {
      id: makeId(),
      email: email || placeholderEmail,
      name: name || (email ? email.split('@')[0] : 'Apple'),
      appleUserId,
      provider: 'apple',
      passwordHash: null,
      createdAt: new Date().toISOString(),
    };
  } else {
    user.appleUserId = appleUserId;
    user.provider = user.provider === 'email' ? 'apple' : user.provider || 'apple';
    if (email && (!user.email || String(user.email).includes('@kraina.local'))) user.email = email;
    if (name && (!user.name || user.name === 'Apple' || user.name === 'User')) user.name = name;
  }

  await persistUser(user);
  return { user, isNewUser };
}


export async function signInWithAppleFirebase(idToken, rawNonce, options) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('MISSING_APPLE_TOKEN');
  }
  const extraName = formatAppleFullName(options?.fullName);
  const extraEmail = typeof options?.email === 'string' ? options.email.trim() : '';

  if (!firebaseAuthEnabled || !auth) {
    const payload = decodeGoogleIdTokenPayload(idToken);
    if (!payload?.sub) throw new Error('INVALID_APPLE_TOKEN');
    const email = extraEmail || payload.email || '';
    const name = extraName || payload.email?.split('@')[0] || '';
    return loginOrRegisterApple({
      appleUserId: payload.sub,
      email,
      name,
    });
  }

  const { OAuthProvider, signInWithCredential, getAdditionalUserInfo } = require('firebase/auth');
  const provider = new OAuthProvider('apple.com');
  const credential = provider.credential({
    idToken,
    rawNonce: rawNonce || undefined,
  });
  try {
    const result = await Promise.race([
      signInWithCredential(auth, credential),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('APPLE_AUTH_TIMEOUT')), FIREBASE_SIGNIN_MS),
      ),
    ]);
    const isNewUser = getAdditionalUserInfo(result)?.isNewUser === true;
    let user = await syncAppUserFromFirebaseUser(result.user);
    if (extraName && (!user.name || user.name.length < 2 || user.name === 'User')) {
      user.name = extraName;
      await persistUser(user);
    }
    if (extraEmail && (!user.email || String(user.email).includes('@kraina.local'))) {
      user.email = extraEmail;
      await persistUser(user);
    }
    return { user, isNewUser };
  } catch (e) {
    if (__DEV__) console.warn('[signInWithAppleFirebase] Firebase failed, local JWT fallback', e?.message);
    const payload = decodeGoogleIdTokenPayload(idToken);
    if (!payload?.sub) throw e;
    const email = extraEmail || payload.email || '';
    const name = extraName || (payload.email ? payload.email.split('@')[0] : '') || 'Apple';
    return loginOrRegisterApple({
      appleUserId: payload.sub,
      email,
      name,
    });
  }
}



async function getUsersFromFirestore() {
  if (!db || !firebaseEnabled) return null;
  try {
    const { collection, getDocs } = require('firebase/firestore');
    const snap = await Promise.race([
      getDocs(collection(db, USERS_COLLECTION)),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('FIRESTORE_TIMEOUT')), FIRESTORE_GET_USERS_MS),
      ),
    ]);
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  } catch (e) {
    if (__DEV__ && e?.message !== 'FIRESTORE_TIMEOUT') {
      console.warn('[db] Firestore getUsers failed', e?.message);
    }
    if (__DEV__ && e?.message === 'FIRESTORE_TIMEOUT') {
      console.warn(`[db] Firestore getUsers timeout (${FIRESTORE_GET_USERS_MS}ms), using local list`);
    }
    return null;
  }
}

async function saveUserToFirestore(user) {
  if (!db || !firebaseEnabled) return false;
  try {
    const { doc, setDoc, deleteField } = require('firebase/firestore');
    const payload = userToStore(user);
    const { passwordHash: _omitPw, ...cloudPayload } = payload;
    const op = setDoc(
      doc(db, USERS_COLLECTION, user.id),
      { ...cloudPayload, passwordHash: deleteField() },
      { merge: true },
    );
    const ok = await Promise.race([
      op.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), FIRESTORE_SET_USER_MS)),
    ]);
    if (!ok && __DEV__) {
      console.warn(`[db] Firestore setUser timeout (${FIRESTORE_SET_USER_MS}ms), saved locally only`);
    }
    return ok;
  } catch (e) {
    if (__DEV__) console.warn('[db] Firestore saveUser failed', e?.message);
    return false;
  }
}

async function getUsersLocal() {
  try {
    const raw = await AsyncStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveUsersLocal(users) {
  await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
}


async function getUsers() {
  const [fromCloud, fromLocal] = await Promise.all([
    firebaseEnabled ? getUsersFromFirestore() : Promise.resolve(null),
    getUsersLocal(),
  ]);
  if (!fromCloud || !Array.isArray(fromCloud)) return fromLocal;
  const byId = new Map();
  fromCloud.forEach((u) => u.id && byId.set(u.id, u));
  fromLocal.forEach((u) => {
    if (!u.id) return;
    const cloud = byId.get(u.id);
    if (!cloud) {
      byId.set(u.id, u);
      return;
    }
    byId.set(u.id, {
      ...cloud,
      ...u,
      passwordHash:
        u.passwordHash != null && u.passwordHash !== ''
          ? u.passwordHash
          : cloud.passwordHash != null && cloud.passwordHash !== ''
            ? cloud.passwordHash
            : null,
    });
  });
  return Array.from(byId.values());
}


async function persistUser(user) {
  const merged = await mergeAppLanguageBidirectional({ ...user });
  const local = await getUsersLocal();
  const payload = userToStore(merged);
  const idx = local.findIndex((u) => u.id === merged.id);
  if (idx >= 0) local[idx] = { ...local[idx], ...payload };
  else local.push({ ...payload });
  await saveUsersLocal(local);
  void saveUserToFirestore(merged);
  return merged;
}




export async function registerUser({ email, password, name }) {
  const emailTrim = email.trim();
  const emailLower = emailTrim.toLowerCase();
  if (isAdminGateEmail(emailTrim)) {
    throw new Error('EMAIL_EXISTS');
  }

  const fetchMethodsTask =
    firebaseAuthEnabled && auth
      ? (async () => {
          try {
            const { fetchSignInMethodsForEmail } = require('firebase/auth');
            return await Promise.race([
              fetchSignInMethodsForEmail(auth, emailTrim),
              new Promise((resolve) => setTimeout(() => resolve(null), FIREBASE_FETCH_SIGNIN_METHODS_MS)),
            ]);
          } catch {
            return null;
          }
        })()
      : Promise.resolve(null);

  const [users, methods, passwordHash] = await Promise.all([
    getUsers(),
    fetchMethodsTask,
    hashPassword(password),
  ]);

  if (users.find((u) => (u.email || '').toLowerCase() === emailLower)) {
    throw new Error('EMAIL_EXISTS');
  }

  if (Array.isArray(methods) && methods.length > 0) {
    throw new Error('EMAIL_EXISTS');
  }
  if (firebaseAuthEnabled && auth && methods === null && __DEV__) {
    console.warn(
      `[registerUser] fetchSignInMethodsForEmail skipped (timeout/network, ${FIREBASE_FETCH_SIGNIN_METHODS_MS}ms)`,
    );
  }

  let firebaseUser = null;
  if (firebaseAuthEnabled) {
    try {
      firebaseUser = await Promise.race([
        createFirebaseEmailUser(emailTrim, password),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AUTH_CREATE_TIMEOUT')), FIREBASE_CREATE_USER_MS),
        ),
      ]);
    } catch (e) {
      if (e?.message === 'AUTH_CREATE_TIMEOUT') {
        if (__DEV__) {
          console.warn(
            `[registerUser] createUser timeout (${FIREBASE_CREATE_USER_MS}ms), local account only`,
          );
        }
        firebaseUser = null;
      } else {
        if (__DEV__) console.warn('[registerUser]', e?.code, e?.message);
        const mapped = mapFirebaseAuthError(e);

        if (mapped === 'NETWORK_ERROR') {
          if (__DEV__) {
            console.warn(
              '[registerUser] Firebase unreachable; creating local account only. Check emulator network / Wi‑Fi / Firebase Console (Email+password, SHA‑1).',
            );
          }
          firebaseUser = null;
        } else {
          throw new Error(mapped);
        }
      }
    }
  }

  const user = {
    id: makeId(),
    email: emailTrim,
    name: name || emailTrim.split('@')[0],
    firebaseUid: firebaseUser?.uid || null,
    passwordHash,
    provider: 'email',
    avatar: null,
    createdAt: new Date().toISOString(),
  };

  return await persistUser(user);
}


/**
 * Вхід адміністратора після перевірки email/пароля/PIN у UI.
 * Не викликає Firebase signIn — акаунт може існувати лише локально.
 */
export async function completeAdminLoginWithCredentials({ email, password }) {
  const emailTrim = String(email || '').trim();
  const emailLower = emailTrim.toLowerCase();
  if (!isAdminGateEmail(emailTrim) || !verifyAdminPasswordGate(password)) {
    throw new Error('WRONG_PASSWORD');
  }
  const users = await getUsers();
  const passwordHash = await hashPassword(password);
  const idx = users.findIndex((u) => (u.email || '').toLowerCase() === emailLower);
  let user;
  if (idx >= 0) {
    user = {
      ...users[idx],
      role: 'admin',
      isAdmin: true,
      passwordHash,
    };
  } else {
    user = {
      id: 'kraina_gate_admin_v1',
      email: emailTrim,
      name: 'KRAÏNA Admin',
      firebaseUid: null,
      passwordHash,
      provider: 'email',
      avatar: null,
      createdAt: new Date().toISOString(),
      role: 'admin',
      isAdmin: true,
    };
  }
  await persistUser(user);
  return user;
}

export async function loginUser({ email, password }) {
  const emailTrim = email.trim();
  const emailLower = emailTrim.toLowerCase();
  const users = await getUsers();
  const candidate = users.find((u) => (u.email || '').toLowerCase() === emailLower);

  let verifiedLocal = null;
  if (candidate?.passwordHash) {
    if (await verifyPasswordAgainstStored(password, candidate.passwordHash)) {
      verifiedLocal = candidate;
    }
  }

  let user = verifiedLocal;

  if (firebaseAuthEnabled) {
    try {
      const firebaseUser = await Promise.race([
        signInFirebaseEmailUser(emailTrim, password),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AUTH_SIGNIN_TIMEOUT')), FIREBASE_SIGNIN_MS),
        ),
      ]);
      const byUid = users.find((u) => u.firebaseUid && u.firebaseUid === firebaseUser.uid);
      const byEmail = users.find((u) => (u.email || '').toLowerCase() === emailLower);
      user = byUid || verifiedLocal || byEmail;

      if (user) {
        if (!user.firebaseUid && firebaseUser?.uid) {
          user.firebaseUid = firebaseUser.uid;
        }
        const hashOk =
          user.passwordHash && (await verifyPasswordAgainstStored(password, user.passwordHash));
        if (!hashOk || needsPasswordUpgrade(user.passwordHash)) {
          user.passwordHash = await hashPassword(password);
        }
        await persistUser(user);
        return user;
      }

      user = {
        id: makeId(),
        email: emailTrim,
        name: emailTrim.split('@')[0],
        firebaseUid: firebaseUser?.uid || null,
        passwordHash: await hashPassword(password),
        provider: 'email',
        avatar: null,
        createdAt: new Date().toISOString(),
      };
      await persistUser(user);
      return user;
    } catch (e) {
      if (e?.message === 'AUTH_SIGNIN_TIMEOUT') {
        if (verifiedLocal) {
          if (__DEV__) {
            console.warn(`[loginUser] signIn timeout (${FIREBASE_SIGNIN_MS}ms), using local session`);
          }
        } else {
          throw new Error('NETWORK_ERROR');
        }
      } else if (!verifiedLocal) {
        const localEmailExists = users.some((u) => (u.email || '').toLowerCase() === emailLower);
        const refined = await refineFirebaseEmailLoginError(e, emailTrim, localEmailExists);
        throw new Error(refined);
      }
    }
  }

  if (!verifiedLocal) {
    const emailTaken = users.some((u) => (u.email || '').toLowerCase() === emailLower);
    throw new Error(emailTaken ? 'WRONG_PASSWORD' : 'USER_NOT_FOUND');
  }

  user = verifiedLocal;
  if (needsPasswordUpgrade(user.passwordHash)) {
    user.passwordHash = await hashPassword(password);
    await persistUser(user);
  }

  if (firebaseAuthEnabled && !user.firebaseUid) {
    try {
      const firebaseUser = await Promise.race([
        createFirebaseEmailUser(emailTrim, password),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AUTH_MIGRATE_TIMEOUT')), FIREBASE_CREATE_USER_MS),
        ),
      ]);
      if (firebaseUser?.uid) {
        user.firebaseUid = firebaseUser.uid;
        await persistUser(user);
      }
    } catch (e) {
      if (e?.message === 'AUTH_MIGRATE_TIMEOUT') {
        if (__DEV__) console.warn('[db] Firebase migration (createUser) timeout, skipped');
      } else {
        const mapped = mapFirebaseAuthError(e);
        if (mapped !== 'EMAIL_EXISTS') {
          if (__DEV__) console.warn('[db] Firebase migration login failed', e?.message);
        }
      }
    }
  }

  return user;
}


export async function loginOrRegisterGoogle({ email, name, googleId, avatar }) {
  const users = await getUsers();
  const emailLower = (email || '').toLowerCase();

  let user = users.find(
    (u) =>
      (googleId && u.googleId === googleId) ||
      (emailLower && (u.email || '').toLowerCase() === emailLower),
  );

  const isNewUser = !user;
  if (!user) {
    user = {
      id: makeId(),
      email: email || `google_${googleId}`,
      name: name || (email ? email.split('@')[0] : 'Google User'),
      googleId,
      avatar: avatar || null,
      provider: 'google',
      passwordHash: null,
      createdAt: new Date().toISOString(),
    };
  } else {
    if (googleId) user.googleId = googleId;
    if (avatar) user.avatar = avatar;
    if (name) user.name = name;
  }

  await persistUser(user);
  return { user, isNewUser };
}


export async function loginOrRegisterFacebook({ email, name, facebookId, avatar }) {
  if (!facebookId || typeof facebookId !== 'string') {
    throw new Error('MISSING_FACEBOOK_ID');
  }
  const users = await getUsers();
  const emailLower = (email || '').trim().toLowerCase();
  const placeholderEmail = `facebook_${String(facebookId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}@kraina.local`;

  let user = users.find(
    (u) =>
      u.facebookId === facebookId ||
      (emailLower && (u.email || '').toLowerCase() === emailLower),
  );

  const isNewUser = !user;
  if (!user) {
    user = {
      id: makeId(),
      email: emailLower ? email.trim() : placeholderEmail,
      name: name || (emailLower ? email.split('@')[0] : 'Facebook'),
      facebookId,
      avatar: avatar || null,
      provider: 'facebook',
      passwordHash: null,
      createdAt: new Date().toISOString(),
    };
  } else {
    user.facebookId = facebookId;
    if (avatar) user.avatar = avatar;
    if (name) user.name = name;
    if (emailLower && (!user.email || String(user.email).includes('@kraina.local'))) {
      user.email = email.trim();
    }
  }

  await persistUser(user);
  return { user, isNewUser };
}

async function fetchFacebookProfileFromGraph(accessToken) {
  const graphUrl =
    'https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=' +
    encodeURIComponent(accessToken);
  const res = await Promise.race([
    fetch(graphUrl),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('FACEBOOK_GRAPH_TIMEOUT')), 12000),
    ),
  ]);
  if (!res.ok) {
    throw new Error(`FACEBOOK_GRAPH_ERROR:${res.status}`);
  }
  const data = await res.json();
  if (!data?.id) throw new Error('INVALID_FACEBOOK_USER');
  const avatarUrl =
    data.picture?.data?.url || (typeof data.picture === 'string' ? data.picture : null);
  return {
    facebookId: data.id,
    email: (data.email || '').trim(),
    name: data.name || '',
    avatar: avatarUrl,
  };
}

export async function canRequestPasswordReset(normalizedEmail) {
  const e = (normalizedEmail || '').trim().toLowerCase();
  if (!e) return { eligible: false, reason: 'EMPTY' };
  if (await userExistsByEmail(e)) return { eligible: true };

  if (firebaseAuthEnabled && auth) {
    try {
      const { fetchSignInMethodsForEmail } = require('firebase/auth');
      const methods = await Promise.race([
        fetchSignInMethodsForEmail(auth, e),
        new Promise((resolve) => setTimeout(() => resolve(null), FIREBASE_FETCH_SIGNIN_METHODS_MS)),
      ]);
      if (Array.isArray(methods) && methods.length > 0) {
        return { eligible: true };
      }
    } catch (err) {
      if (__DEV__) console.warn('[db] canRequestPasswordReset firebase', err?.message);
    }
  }

  try {
    const { backendEmailExists } = require('./backendAuthApi');
    const { API_BASE_URL } = require('./auth/config');
    if (!API_BASE_URL) return { eligible: false, reason: 'NOT_FOUND' };
    if (await backendEmailExists(e)) return { eligible: true };
    return { eligible: false, reason: 'NOT_FOUND' };
  } catch (err) {
    if (__DEV__) console.warn('[db] canRequestPasswordReset backend', err?.message);
    return { eligible: false, reason: 'NETWORK_ERROR' };
  }
}

async function syncBackendPasswordResetOtp(emailLower, code, expiresAt) {
  try {
    const { backendEmailExists, backendStoreAppPasswordResetOtp } = require('./backendAuthApi');
    if (await backendEmailExists(emailLower)) {
      await backendStoreAppPasswordResetOtp(emailLower, code, expiresAt);
    }
  } catch (e) {
    if (__DEV__) console.warn('[db] syncBackendPasswordResetOtp', e?.message);
  }
}

const OTP_STORE_PREFIX = 'kraina_pw_otp_v1_';

function otpStorageKeyDigest(emailLower) {
  return sha256(OTP_STORE_PREFIX + emailLower).slice(0, 48);
}

async function otpPayloadWrite(emailLower, jsonStr) {
  const key = OTP_STORE_PREFIX + otpStorageKeyDigest(emailLower);
  try {
    const SS = require('expo-secure-store');
    await SS.setItemAsync(key, jsonStr, SECURE_STORE_KEYCHAIN);
  } catch (_) {
    await AsyncStorage.setItem('@kraina_otp_' + key, jsonStr);
  }
}

async function otpPayloadRead(emailLower) {
  const key = OTP_STORE_PREFIX + otpStorageKeyDigest(emailLower);
  try {
    const SS = require('expo-secure-store');
    let v = await SS.getItemAsync(key, SECURE_STORE_KEYCHAIN);
    if (v != null) return v;
    v = await SS.getItemAsync(key);
    if (v != null) return v;
  } catch (_) {}
  return AsyncStorage.getItem('@kraina_otp_' + key);
}

async function otpPayloadDelete(emailLower) {
  const key = OTP_STORE_PREFIX + otpStorageKeyDigest(emailLower);
  try {
    const SS = require('expo-secure-store');
    await SS.deleteItemAsync(key, SECURE_STORE_KEYCHAIN);
    await SS.deleteItemAsync(key);
  } catch (_) {}
  await AsyncStorage.removeItem('@kraina_otp_' + key);
}

async function randomSixDigitCode() {
  try {
    const Crypto = require('expo-crypto');
    const bytes = await Crypto.getRandomBytesAsync(4);
    const n =
      ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    return String(100000 + (n % 900000));
  } catch {
    return String(Math.floor(100000 + Math.random() * 900000));
  }
}

function otpHashForCode(emailLower, codeDigits) {
  return sha256(`kraina_pw_otp_v1|${emailLower}|${codeDigits}`);
}

const PASSWORD_RESET_OTP_TTL_MS = 15 * 60 * 1000;

function resetOtpEmailPayload(code, lang) {
  const raw = String(lang || 'en').split('-')[0].toLowerCase();
  const langNorm = raw === 'ru' ? 'uk' : raw;
  const safeCode = String(code || '').replace(/[^\d]/g, '').slice(0, 6);
  const packs = {
    uk: {
      subject: 'KRAÏNA — код для відновлення пароля',
      intro: 'Вітаємо! Ось код для відновлення пароля у додатку.',
      hint: 'Введіть його на екрані «Забули пароль». Код дійсний 15 хвилин.',
      ignore: 'Якщо ви не запитували відновлення пароля — проігноруйте цей лист.',
      codeLabel: 'Ваш код',
    },
    en: {
      subject: 'KRAÏNA — password reset code',
      intro: 'Hello! Here is your password reset verification code.',
      hint: 'Enter it in the app on the “Forgot password” screen. The code expires in 15 minutes.',
      ignore: 'If you did not request a password reset, you can safely ignore this email.',
      codeLabel: 'Your code',
    },
  };
  const p = packs[langNorm] || packs.en;
  const html = `<!DOCTYPE html>
<html lang="${langNorm}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>KRAÏNA</title>
</head>
<body style="margin:0;padding:0;background:#F3F3EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F3EF;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid #E6E6E0;border-radius:20px;overflow:hidden;box-shadow:0 10px 32px rgba(0,0,0,0.06);">
          <tr>
            <td style="height:5px;background:linear-gradient(90deg,#E1FF00,#C6DB00);"></td>
          </tr>
          <tr>
            <td style="padding:34px 28px 28px;text-align:center;">
              <div style="text-align:center;margin:0 0 22px;">
                <span style="display:inline-block;font-size:30px;line-height:1;font-weight:700;letter-spacing:0.16em;color:#1A1A1A;">KRA</span><span style="display:inline-block;font-size:30px;line-height:1;font-weight:700;letter-spacing:0.16em;color:#5A6600;">Ï</span><span style="display:inline-block;font-size:30px;line-height:1;font-weight:700;letter-spacing:0.16em;color:#1A1A1A;">NA</span>
              </div>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#5C5C58;text-align:center;">${p.intro}</p>
              <div style="margin:6px 0 20px;padding:22px 18px 20px;border-radius:16px;background:linear-gradient(180deg,#FCFFE8 0%,#F4FAD1 100%);border:1px solid rgba(198,219,0,0.45);">
                <div style="font-size:12px;line-height:1.4;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#5A6600;margin-bottom:12px;">${p.codeLabel}</div>
                <span style="display:inline-block;font-size:36px;line-height:1;font-weight:700;letter-spacing:12px;color:#1A1A1A;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${safeCode}</span>
              </div>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#5C5C58;text-align:center;">${p.hint}</p>
              <p style="margin:18px 0 0;font-size:12px;line-height:1.55;color:#8A8A86;text-align:center;">${p.ignore}</p>
            </td>
          </tr>
        </table>
        <p style="margin:18px 0 0;font-size:11px;line-height:1.4;color:#A0A09A;letter-spacing:0.06em;">© KRAÏNA</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject: p.subject, html };
}


function isLikelyResendApiKey(key) {
  return typeof key === 'string' && /^re_[a-zA-Z0-9_]+$/.test(key.trim());
}

function parseResendErrorMessage(bodyText) {
  try {
    const j = JSON.parse(bodyText);
    if (j?.message) return String(j.message);
  } catch (_) {}
  return typeof bodyText === 'string' ? bodyText.slice(0, 400) : '';
}


function classifyResendHttpError(status, bodyText) {
  const msg = parseResendErrorMessage(bodyText);
  const lower = msg.toLowerCase();
  const hint = msg || `HTTP ${status}`;
  if (
    lower.includes('only send') ||
    lower.includes('testing') ||
    lower.includes('only be sent') ||
    (lower.includes('own') && lower.includes('email'))
  ) {
    return { reason: 'RESEND_SANDBOX', hint };
  }
  if (lower.includes('domain') && (lower.includes('verify') || lower.includes('verified'))) {
    return { reason: 'RESEND_DOMAIN', hint };
  }
  return { reason: 'EMAIL_SEND_FAILED', hint };
}


async function sendPasswordResetCodeViaResend(toEmail, code, lang) {
  const apiKey = (
    (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_RESEND_API_KEY) ||
    ''
  ).trim();
  if (!apiKey || typeof fetch !== 'function') {
    return { ok: false, reason: 'NO_MAILER' };
  }
  if (!isLikelyResendApiKey(apiKey)) {
    if (__DEV__) {
      console.warn(
        '[db] EXPO_PUBLIC_RESEND_API_KEY має бути з resend.com (формат re_...). Після зміни: npm run start:clear у app/.',
      );
    }
    return { ok: false, reason: 'INVALID_RESEND_KEY' };
  }
  const fromDefault = 'KRAINA <onboarding@resend.dev>';
  const from =
    (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_RESEND_FROM) ||
    fromDefault;
  const { subject, html } = resetOtpEmailPayload(code, lang);
  const body = JSON.stringify({
    from,
    to: [toEmail],
    subject,
    html,
  });
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  const url = 'https://api.resend.com/emails';
  const retryDelaysMs = [0, 500, 1500];

  try {
    let res;
    let text;
    for (let i = 0; i < retryDelaysMs.length; i++) {
      if (retryDelaysMs[i] > 0) {
        await new Promise((r) => setTimeout(r, retryDelaysMs[i]));
      }
      try {
        res = await fetch(url, { method: 'POST', headers, body });
        text = await res.text();
        break;
      } catch (e) {
        if (__DEV__) console.warn(`[db] Resend fetch attempt ${i + 1}/${retryDelaysMs.length}`, e?.message);
        if (i === retryDelaysMs.length - 1) {
          throw e;
        }
      }
    }

    if (!res.ok) {
      if (__DEV__) {
        console.warn('[db] Resend email failed', res.status, text);
        if (res.status === 401) {
          console.warn(
            '[db] Resend 401: перевірте EXPO_PUBLIC_RESEND_API_KEY у app/.env (без лапок і пробілів), ключ у resend.com → API Keys, після зміни — npm run start:clear',
          );
        }
      }
      const classified = classifyResendHttpError(res.status, text);
      return { ok: false, reason: classified.reason, hint: classified.hint, detail: text };
    }
    return { ok: true };
  } catch (e) {
    const msg = e?.message || String(e);
    if (__DEV__) console.warn('[db] Resend fetch', msg);
    const isNetwork =
      /network request failed/i.test(msg) ||
      /failed to fetch/i.test(msg) ||
      /networkerror/i.test(msg) ||
      msg === 'Aborted';
    return {
      ok: false,
      reason: isNetwork ? 'EMAIL_NETWORK' : 'EMAIL_SEND_FAILED',
      hint: msg,
    };
  }
}


export async function requestPasswordResetCode(email, options) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) return { ok: false, reason: 'EMPTY' };

  const eligibility = await canRequestPasswordReset(normalizedEmail);
  if (eligibility.reason === 'EMPTY') return { ok: false, reason: 'EMPTY' };
  if (eligibility.reason === 'NETWORK_ERROR') return { ok: false, reason: 'NETWORK_ERROR' };
  if (!eligibility.eligible) return { ok: false, reason: 'NOT_FOUND' };

  const code = await randomSixDigitCode();
  const h = otpHashForCode(normalizedEmail, code);
  const expiresAt = Date.now() + PASSWORD_RESET_OTP_TTL_MS;
  const payload = JSON.stringify({ h, expiresAt });

  const lang = options?.language || 'en';
  const mail = await sendPasswordResetCodeViaResend(normalizedEmail, code, lang);

  const saveOtpAndReturnInApp = async () => {
    try {
      await otpPayloadWrite(normalizedEmail, payload);
      await syncBackendPasswordResetOtp(normalizedEmail, code, expiresAt);
    } catch (e) {
      if (__DEV__) console.warn('[db] requestPasswordResetCode storage', e?.message);
      return { ok: false, reason: 'STORAGE_ERROR' };
    }
    return { ok: true, code, delivery: 'in_app_code' };
  };

  if (mail.ok) {
    try {
      await otpPayloadWrite(normalizedEmail, payload);
      await syncBackendPasswordResetOtp(normalizedEmail, code, expiresAt);
    } catch (e) {
      if (__DEV__) console.warn('[db] requestPasswordResetCode storage', e?.message);
      return { ok: false, reason: 'STORAGE_ERROR' };
    }
    return { ok: true, delivery: 'email' };
  }
  if (mail.reason === 'NO_MAILER') {
    return saveOtpAndReturnInApp();
  }
  if (mail.reason === 'INVALID_RESEND_KEY') {
    return { ok: false, reason: 'INVALID_RESEND_KEY' };
  }
  if (mail.reason === 'RESEND_SANDBOX') {
    return { ok: false, reason: 'RESEND_SANDBOX', resendHint: mail.hint };
  }
  if (mail.reason === 'RESEND_DOMAIN') {
    return { ok: false, reason: 'RESEND_DOMAIN', resendHint: mail.hint };
  }
  if (mail.reason === 'EMAIL_NETWORK') {
    return { ok: false, reason: 'EMAIL_NETWORK', resendHint: mail.hint };
  }
  return { ok: false, reason: 'EMAIL_SEND_FAILED', resendHint: mail.hint };
}

export async function verifyPasswordResetCode(email, enteredRaw) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  const entered = String(enteredRaw || '').replace(/\s/g, '');
  if (!normalizedEmail || !entered) return { ok: false, reason: 'EMPTY' };

  const raw = await otpPayloadRead(normalizedEmail);
  if (!raw) return { ok: false, reason: 'NO_CODE' };

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'INVALID' };
  }

  if (typeof data.expiresAt !== 'number' || Date.now() > data.expiresAt) {
    return { ok: false, reason: 'EXPIRED' };
  }

  const h = otpHashForCode(normalizedEmail, entered);
  if (!timingSafeEqualHex(h, data.h)) return { ok: false, reason: 'WRONG_CODE' };

  return { ok: true };
}

export async function clearPasswordResetOtp(email) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) return;
  await otpPayloadDelete(normalizedEmail);
}

export async function signOutFirebaseAuth() {
  if (!auth) return;
  try {
    const { signOut } = require('firebase/auth');
    await signOut(auth);
  } catch (_) {}
}


export async function sendFirebasePhoneVerificationSms(phoneNumberE164, applicationVerifier) {
  if (!auth || !firebaseAuthEnabled) {
    return { ok: false, reason: 'NO_AUTH' };
  }
  if (!applicationVerifier || typeof applicationVerifier.verify !== 'function') {
    return { ok: false, reason: 'NO_RECAPTCHA' };
  }
  try {
    const { PhoneAuthProvider } = require('firebase/auth');
    const provider = new PhoneAuthProvider(auth);
    const verificationId = await provider.verifyPhoneNumber(phoneNumberE164, applicationVerifier);
    if (!verificationId) return { ok: false, reason: 'NO_VERIFICATION_ID' };
    return { ok: true, verificationId };
  } catch (e) {
    const code = e?.code || '';
    if (__DEV__) console.warn('[db] sendFirebasePhoneVerificationSms', code, e?.message);
    if (code === 'auth/invalid-phone-number') {
      return { ok: false, reason: 'INVALID_PHONE' };
    }
    if (code === 'auth/missing-phone-number') {
      return { ok: false, reason: 'INVALID_PHONE' };
    }
    return { ok: false, reason: 'FIREBASE_ERROR', code: mapFirebaseAuthError(e), firebaseCode: code };
  }
}

export async function signInWithFirebasePhoneSms(verificationId, smsCodeRaw) {
  if (!auth || !firebaseAuthEnabled) {
    return { ok: false, reason: 'NO_AUTH' };
  }
  const smsCode = String(smsCodeRaw || '').replace(/\s/g, '');
  if (!verificationId || !smsCode) return { ok: false, reason: 'EMPTY' };
  try {
    const { PhoneAuthProvider, signInWithCredential } = require('firebase/auth');
    const cred = PhoneAuthProvider.credential(verificationId, smsCode);
    const result = await signInWithCredential(auth, cred);
    return { ok: true, firebaseUser: result.user };
  } catch (e) {
    const code = e?.code || '';
    if (__DEV__) console.warn('[db] signInWithFirebasePhoneSms', code, e?.message);
    if (code === 'auth/invalid-verification-code' || code === 'auth/code-expired') {
      return { ok: false, reason: 'WRONG_CODE' };
    }
    return { ok: false, reason: 'FIREBASE_ERROR', code: mapFirebaseAuthError(e), firebaseCode: code };
  }
}


export async function finalizePasswordResetAfterPhoneSignIn(newPassword) {
  const { updatePassword, signOut } = require('firebase/auth');
  if (!auth?.currentUser) return { ok: false, reason: 'NO_SESSION' };
  const fbUser = auth.currentUser;
  const pass = String(newPassword || '');
  if (pass.length < 6) return { ok: false, reason: 'WEAK_PASSWORD' };

  await updatePassword(fbUser, pass);
  const passwordHash = await hashPassword(pass);

  let user = (await getUsers()).find((u) => u.firebaseUid === fbUser.uid);
  if (!user && fbUser.email) {
    const el = fbUser.email.toLowerCase();
    user = (await getUsers()).find((u) => (u.email || '').toLowerCase() === el);
  }
  if (user) {
    user.passwordHash = passwordHash;
    if (!user.firebaseUid && fbUser.uid) user.firebaseUid = fbUser.uid;
    await persistUser(user);
  } else {
    await syncAppUserFromFirebaseUser(fbUser);
    const users2 = await getUsers();
    user = users2.find((u) => u.firebaseUid === fbUser.uid);
    if (user) {
      user.passwordHash = passwordHash;
      await persistUser(user);
    }
  }

  await signOut(auth).catch(() => {});

  if (!user) return { ok: false, reason: 'NO_LOCAL_USER' };
  return { ok: true, user };
}


export async function updateUserPassword({ email, newPassword, resetCode }) {
  const users = await getUsers();
  const emailLower = (email || '').trim().toLowerCase();
  const emailTrim = (email || '').trim();
  let user = users.find((u) => (u.email || '').toLowerCase() === emailLower);

  if (!user) {
    const eligibility = await canRequestPasswordReset(emailLower);
    if (!eligibility.eligible) return false;

    user = {
      id: makeId(),
      email: emailTrim,
      name: emailTrim.split('@')[0] || 'User',
      firebaseUid: null,
      passwordHash: await hashPassword(newPassword),
      provider: 'email',
      avatar: null,
      createdAt: new Date().toISOString(),
    };
    await persistUser(user);
  } else {
    const passwordHash = await hashPassword(newPassword);
    user.passwordHash = passwordHash;
    await persistUser(user);
  }

  if (resetCode) {
    try {
      const { backendEmailExists, backendResetPasswordWithAppOtp } = require('./backendAuthApi');
      if (await backendEmailExists(emailLower)) {
        const backendReset = await backendResetPasswordWithAppOtp(
          emailLower,
          String(resetCode).replace(/\s/g, ''),
          newPassword,
        );
        if (backendReset?.reason === 'BACKEND_OUTDATED') {
          return 'BACKEND_OUTDATED';
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[db] updateUserPassword backend', e?.message);
      try {
        const { backendEmailExists } = require('./backendAuthApi');
        if (await backendEmailExists(emailLower)) return false;
      } catch (_) {}
    }
  }

  return true;
}


export async function userExistsByEmail(email) {
  const users = await getUsers();
  const emailLower = (email || '').trim().toLowerCase();
  return users.some((u) => (u.email || '').toLowerCase() === emailLower);
}


export async function sendPasswordResetForEmail(email) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) return { ok: false, reason: 'EMPTY' };

  if (firebaseAuthEnabled) {
    try {
      await sendFirebasePasswordReset(normalizedEmail);
      return { ok: true, delivery: 'email' };
    } catch (e) {
      const code = e?.code || '';
      if (__DEV__) console.warn('[db] sendPasswordResetForEmail', code, e?.message);
      if (code === 'auth/user-not-found') {
        return { ok: false, reason: 'NOT_FOUND' };
      }
      if (code === 'auth/invalid-email') {
        return { ok: false, reason: 'INVALID_EMAIL' };
      }
      return { ok: false, reason: 'FIREBASE_ERROR', code: mapFirebaseAuthError(e), firebaseCode: code };
    }
  }

  const exists = await userExistsByEmail(normalizedEmail);
  if (!exists) return { ok: false, reason: 'NOT_FOUND' };
  return { ok: true, delivery: 'in_app' };
}



function sanitizeUserForSession(user) {
  if (!user || typeof user !== 'object') return user;
  const { passwordHash: _omit, ...rest } = user;
  return rest;
}

export async function saveSession(user) {
  let prevUser = null;
  try {
    const rawPrev = await AsyncStorage.getItem(SESSION_KEY);
    prevUser = rawPrev ? JSON.parse(rawPrev)?.user || null : null;
  } catch {
    prevUser = null;
  }
  const prevIdentity =
    prevUser?.id != null ? String(prevUser.id) : prevUser?.email ? String(prevUser.email) : '';
  const nextIdentity =
    user?.id != null ? String(user.id) : user?.email ? String(user.email) : '';
  if (prevIdentity && nextIdentity && prevIdentity !== nextIdentity) {
    await clearProfileLocalCache();
  }
  const merged = await mergeAppLanguageBidirectional({ ...user });
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ user: sanitizeUserForSession(merged) }));
  if (merged.appLanguage !== user.appLanguage) {
    await persistUser(merged);
  }
}

export async function getSession() {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Записує мову в AsyncStorage і синхронізує з сесією / обліковим записом (Firestore через persistUser). */
export async function setAppLanguagePreference(languageId) {
  const raw = typeof languageId === 'string' ? languageId.trim() : '';
  if (!raw) return;
  const base = raw.split(/[-_]/)[0].toLowerCase();
  const normalized = base === 'ru' ? 'uk' : base;
  try {
    await AsyncStorage.setItem(APP_LANGUAGE_STORAGE_KEY, normalized);
  } catch (_) {}
  const s = await getSession();
  if (s?.user) {
    await saveSession({ ...s.user });
  }
}


export async function clearSession() {
  await signOutFirebaseAuth();
  await AsyncStorage.removeItem(SESSION_KEY);
  try {
    await AsyncStorage.multiRemove([
      REMEMBER_ME_KEY,
      REMEMBER_EMAIL_KEY,
      AUTH_FORM_DRAFT_KEY,
    ]);
  } catch (_) {}
  await secureStoreDeleteIfPresent(REMEMBER_EMAIL_SECURE_KEY);
  await secureStoreDeleteIfPresent(REMEMBER_PASSWORD_SECURE_KEY);
  // Первинні (без `@`) ключі, які реально пише ThirdPage — теж чистимо при виході.
  await secureStoreDeleteIfPresent('kraina_remember_email_secure');
  await secureStoreDeleteIfPresent('kraina_remember_password_secure');
  // Дані для тихого відновлення чат-сесії — обовʼязково видалити при явному виході.
  await secureStoreDeleteIfPresent('kraina_session_recovery_email_secure');
  await secureStoreDeleteIfPresent('kraina_session_recovery_password_secure');
  await secureStoreDeleteIfPresent(AUTH_DRAFT_PASSWORD_SECURE_KEY);
}


export async function getAllUsers() {
  return getUsers();
}

export { firebaseEnabled, firebaseAuthEnabled };
