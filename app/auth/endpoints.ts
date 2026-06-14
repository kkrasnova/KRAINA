import * as FirebaseCfg from '../firebaseConfig';
import type {
  BillingVerifyBody,
  BillingVerifyResponse,
  ProfileMeBody,
  RefreshBody,
  SubscriptionDTO,
  UserDTO,
} from './types';
import { ApiError } from './types';

function requireAuthUser() {
  const auth: any = (FirebaseCfg as any).auth;
  const uid = auth?.currentUser?.uid || '';
  if (!uid) throw new ApiError(401, { error: 'UNAUTHORIZED' }, 'UNAUTHORIZED');
  return uid;
}

function defaultSubscription(): SubscriptionDTO {
  return {
    plan_type: 'free',
    billing_period: null,
    is_active: false,
    expires_at: null,
    payment_provider: null,
  };
}

export async function postRegister(body: { email: string; password: string; username: string }) {
  const auth: any = (FirebaseCfg as any).auth;
  const firebaseEnabled = Boolean((FirebaseCfg as any).firebaseEnabled);
  if (!firebaseEnabled || !auth) throw new ApiError(503, { error: 'FIREBASE_UNAVAILABLE' });
  const { createUserWithEmailAndPassword } = require('firebase/auth');
  const cred = await createUserWithEmailAndPassword(auth, body.email, body.password);
  const token = await cred.user.getIdToken();
  return {
    user: { id: cred.user.uid, email: cred.user.email || body.email, role: 'user', status: 'active' },
    access_token: token,
    refresh_token: cred.user.refreshToken || token,
  };
}

export async function postLogin(body: { email: string; password: string }) {
  const auth: any = (FirebaseCfg as any).auth;
  const firebaseEnabled = Boolean((FirebaseCfg as any).firebaseEnabled);
  if (!firebaseEnabled || !auth) throw new ApiError(503, { error: 'FIREBASE_UNAVAILABLE' });
  const { signInWithEmailAndPassword } = require('firebase/auth');
  const cred = await signInWithEmailAndPassword(auth, body.email, body.password);
  const token = await cred.user.getIdToken();
  return {
    user: { id: cred.user.uid, email: cred.user.email || body.email, role: 'user', status: 'active' },
    access_token: token,
    refresh_token: cred.user.refreshToken || token,
  };
}

export async function postGoogle(body: { id_token: string }) {
  const auth: any = (FirebaseCfg as any).auth;
  const firebaseEnabled = Boolean((FirebaseCfg as any).firebaseEnabled);
  if (!firebaseEnabled || !auth) throw new ApiError(503, { error: 'FIREBASE_UNAVAILABLE' });
  const { GoogleAuthProvider, signInWithCredential } = require('firebase/auth');
  const cred = await signInWithCredential(auth, GoogleAuthProvider.credential(body.id_token));
  const token = await cred.user.getIdToken();
  return {
    user: { id: cred.user.uid, email: cred.user.email || '', role: 'user', status: 'active' },
    access_token: token,
    refresh_token: cred.user.refreshToken || token,
  };
}

export async function postApple(body: { identity_token: string }) {
  const auth: any = (FirebaseCfg as any).auth;
  const firebaseEnabled = Boolean((FirebaseCfg as any).firebaseEnabled);
  if (!firebaseEnabled || !auth) throw new ApiError(503, { error: 'FIREBASE_UNAVAILABLE' });
  const { OAuthProvider, signInWithCredential } = require('firebase/auth');
  const provider = new OAuthProvider('apple.com');
  const credential = provider.credential({ idToken: body.identity_token });
  const cred = await signInWithCredential(auth, credential);
  const token = await cred.user.getIdToken();
  return {
    user: { id: cred.user.uid, email: cred.user.email || '', role: 'user', status: 'active' },
    access_token: token,
    refresh_token: cred.user.refreshToken || token,
  };
}

export async function postRefresh(): Promise<RefreshBody> {
  const auth: any = (FirebaseCfg as any).auth;
  const uid = requireAuthUser();
  const user = auth?.currentUser;
  const token = user ? await user.getIdToken(true) : uid;
  return { access_token: token, refresh_token: user?.refreshToken || token };
}

export async function postLogout(): Promise<{ ok: true }> {
  const auth: any = (FirebaseCfg as any).auth;
  const { signOut } = require('firebase/auth');
  await signOut(auth).catch(() => {});
  return { ok: true };
}

export async function getProfileMe(): Promise<ProfileMeBody> {
  const auth: any = (FirebaseCfg as any).auth;
  const db: any = (FirebaseCfg as any).db;
  const uid = requireAuthUser();
  const { doc, getDoc } = require('firebase/firestore');
  const profileSnap = await getDoc(doc(db, 'profiles', uid));
  const subSnap = await getDoc(doc(db, 'subscriptions', uid));
  const profileData = profileSnap.exists() ? profileSnap.data() : {};
  const subscription = subSnap.exists() ? (subSnap.data() as SubscriptionDTO) : defaultSubscription();
  return {
    profile: {
      id: uid,
      user_id: uid,
      username: String(profileData.username || auth?.currentUser?.displayName || 'user'),
      avatar_url: (profileData.avatar_url as string | null) || null,
      bio: (profileData.bio as string | null) || null,
      language: String(profileData.language || 'en'),
      display_name: (profileData.display_name as string | null) || null,
      birth_date: (profileData.birth_date as string | null) || null,
      birth_date_public: Boolean(profileData.birth_date_public),
      location_label: (profileData.location_label as string | null) || null,
      xp_points: Number(profileData.xp_points || 0),
      level: Number(profileData.level || 1),
      is_public: profileData.is_public !== false,
      locations_visited: Number(profileData.locations_visited || 0),
      routes_created: Number(profileData.routes_created || 0),
      followers_count: Number(profileData.followers_count || 0),
      following_count: Number(profileData.following_count || 0),
      created_at: String(profileData.created_at || new Date().toISOString()),
      updated_at: String(profileData.updated_at || new Date().toISOString()),
      saved_route_plans: Array.isArray(profileData.saved_route_plans) ? profileData.saved_route_plans : [],
      countryId: (profileData.countryId as string | null) || null,
      stepSyncEnabled: typeof profileData.stepSyncEnabled === 'boolean' ? profileData.stepSyncEnabled : undefined,
      walkReminder:
        profileData.walkReminder && typeof profileData.walkReminder === 'object'
          ? {
              enabled: Boolean((profileData.walkReminder as any).enabled),
              hour: Math.min(23, Math.max(0, Math.floor(Number((profileData.walkReminder as any).hour) || 0))),
              minute: Math.min(59, Math.max(0, Math.floor(Number((profileData.walkReminder as any).minute) || 0))),
            }
          : undefined,
    },
    subscription,
    usage: {},
  };
}

export async function patchProfileMe(_: string, patch: Record<string, unknown>) {
  const db: any = (FirebaseCfg as any).db;
  const uid = requireAuthUser();
  const { doc, serverTimestamp, setDoc } = require('firebase/firestore');
  await setDoc(doc(db, 'profiles', uid), { ...patch, updated_at: new Date().toISOString(), updatedAt: serverTimestamp() }, { merge: true });
  return getProfileMe();
}

export async function postProfileAvatar(_: string, file: { uri?: string } | null) {
  if (!file?.uri) throw new ApiError(400, { error: 'EMPTY_FILE' });
  const uid = requireAuthUser();
  const { getDownloadURL, getStorage, ref, uploadBytes } = require('firebase/storage');
  const r = await fetch(file.uri);
  const blob = await r.blob();
  const storageRef = ref(getStorage(), `users/${uid}/avatar_${Date.now()}.jpg`);
  await uploadBytes(storageRef, blob);
  const avatarUrl = await getDownloadURL(storageRef);
  await patchProfileMe('', { avatar_url: avatarUrl });
  return { avatar_url: avatarUrl };
}

export async function deleteProfileAvatar() {
  await patchProfileMe('', { avatar_url: null });
  return { avatar_url: null };
}

export async function postBillingVerify(_: string, body: BillingVerifyBody): Promise<BillingVerifyResponse> {
  const db: any = (FirebaseCfg as any).db;
  const uid = requireAuthUser();
  const { doc, setDoc } = require('firebase/firestore');
  const subscription: SubscriptionDTO = {
    plan_type: body.productId || 'premium',
    billing_period: 'monthly',
    is_active: true,
    expires_at: null,
    payment_provider: body.platform,
  };
  await setDoc(doc(db, 'subscriptions', uid), subscription, { merge: true });
  return { subscription };
}

export async function postBillingCancelFeedback(_: string, payload: Record<string, unknown>) {
  const db: any = (FirebaseCfg as any).db;
  const uid = requireAuthUser();
  const { addDoc, collection, serverTimestamp } = require('firebase/firestore');
  await addDoc(collection(db, 'billingCancelFeedback'), { uid, ...payload, createdAt: serverTimestamp() });
  return { ok: true };
}

export async function getAdminSubscriptionCancelFeedback() {
  const db: any = (FirebaseCfg as any).db;
  const { collection, getDocs, limit: qLimit, orderBy, query } = require('firebase/firestore');
  const snap = await getDocs(query(collection(db, 'billingCancelFeedback'), orderBy('createdAt', 'desc'), qLimit(100)));
  return { items: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) };
}

export async function getAdminUsersSearch(_: string, q: string) {
  const db: any = (FirebaseCfg as any).db;
  const needle = String(q || '').trim().toLowerCase();
  const { collection, getDocs, limit: qLimit, query } = require('firebase/firestore');
  const snap = await getDocs(query(collection(db, 'profiles'), qLimit(200)));
  const users = snap.docs
    .map((d: any) => ({ id: d.id, ...(d.data() || {}) }))
    .filter((u: any) => `${u.username || ''} ${u.display_name || ''} ${u.email || ''}`.toLowerCase().includes(needle))
    .map((u: any) => ({ id: String(u.id), email: String(u.email || ''), role: String(u.role || 'user'), status: 'active' } as UserDTO));
  return { users };
}

export async function postAdminGrantSubscription(_: string, body: { user_id: string; plan_type: string }) {
  const db: any = (FirebaseCfg as any).db;
  const { doc, setDoc } = require('firebase/firestore');
  const subscription: SubscriptionDTO = {
    plan_type: body.plan_type || 'premium',
    billing_period: 'monthly',
    is_active: true,
    expires_at: null,
    payment_provider: 'admin',
  };
  await setDoc(doc(db, 'subscriptions', body.user_id), subscription, { merge: true });
  return { ok: true, subscription };
}

export async function postForgotPassword(body: { email: string }): Promise<{ message: 'email_sent' }> {
  const auth: any = (FirebaseCfg as any).auth;
  const functions: any = (FirebaseCfg as any).functions;
  const firebaseEnabled = Boolean((FirebaseCfg as any).firebaseEnabled);
  if (!firebaseEnabled || !auth) {
    throw new ApiError(503, { error: 'FIREBASE_UNAVAILABLE' });
  }
  const email = String(body?.email || '').trim();
  if (!email) throw new ApiError(400, { error: 'INVALID_EMAIL' });
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!validEmail) throw new ApiError(400, { error: 'INVALID_EMAIL' });

  const language = String((body as any)?.language || 'en');

  const { sendPasswordResetEmail, fetchSignInMethodsForEmail } = require('firebase/auth');
  try {
    const methods = await fetchSignInMethodsForEmail(auth, email);
    if (__DEV__ && Array.isArray(methods)) {
      // Hint only: Google/Apple-only accounts should still be able to receive a Firebase reset/set-password email.
      console.warn('[auth] sign-in methods for reset:', email, methods);
    }
  } catch (e: any) {
    const code = String(e?.code || '');
    if (code === 'auth/too-many-requests') {
      throw new ApiError(429, { error: 'rate_limited' });
    }
    if (__DEV__) console.warn('[auth] fetchSignInMethodsForEmail failed; continuing reset flow:', e?.message || code);
  }

  const sendViaNativeFirebaseEmail = async () => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (e: any) {
      const code = String(e?.code || '');
      if (code === 'auth/invalid-email') throw new ApiError(400, { error: 'INVALID_EMAIL' });
      if (code === 'auth/too-many-requests') throw new ApiError(429, { error: 'rate_limited' });
      if (code === 'auth/network-request-failed') throw new ApiError(503, { error: 'NETWORK_ERROR' });
      throw new ApiError(500, { error: 'reset_email_send_failed' });
    }
  };

  if (functions) {
    try {
      const { httpsCallable } = require('firebase/functions');
      const fn = httpsCallable(functions, 'sendPasswordResetEmailCustom');
      await fn({ email, language });
      return { message: 'email_sent' };
    } catch (e: any) {
      const code = String(e?.code || '');
      const msg = String(e?.message || e?.details || '');
      const combined = `${code} ${msg}`.toLowerCase();
      if (msg.includes('INVALID_EMAIL') || combined.includes('invalid-argument')) {
        throw new ApiError(400, { error: 'INVALID_EMAIL' });
      }
      if (code.includes('resource-exhausted') || combined.includes('too-many-requests')) {
        throw new ApiError(429, { error: 'rate_limited' });
      }
      if (code === 'functions/unavailable' || combined.includes('unavailable')) {
        await sendViaNativeFirebaseEmail();
        return { message: 'email_sent' };
      }
      // Cloud Function uses Resend; if it's not configured or send fails, fall back to Firebase Auth email.
      if (
        combined.includes('resend_not_configured') ||
        combined.includes('resend_send_failed') ||
        combined.includes('reset_mail_failed') ||
        combined.includes('internal')
      ) {
        if (__DEV__) console.warn('[auth] sendPasswordResetEmailCustom failed, falling back:', msg || code);
        await sendViaNativeFirebaseEmail();
        return { message: 'email_sent' };
      }
      if (combined.includes('network') || code.includes('network')) {
        throw new ApiError(503, { error: 'NETWORK_ERROR' });
      }
      if (__DEV__) console.warn('[auth] sendPasswordResetEmailCustom failed:', msg || code);
      await sendViaNativeFirebaseEmail();
      return { message: 'email_sent' };
    }
  }

  await sendViaNativeFirebaseEmail();
  return { message: 'email_sent' };
}

export async function postResetPassword(_: { token: string; new_password: string }): Promise<{ message: 'password_reset' }> {
  const auth: any = (FirebaseCfg as any).auth;
  const firebaseEnabled = Boolean((FirebaseCfg as any).firebaseEnabled);
  const token = String(_?.token || '').trim();
  const newPassword = String(_?.new_password || '');
  if (!token) throw new ApiError(400, { error: 'token_invalid' });
  if (newPassword.length < 8 || !/\d/.test(newPassword)) {
    throw new ApiError(400, { error: 'weak_password' });
  }
  if (!firebaseEnabled || !auth) throw new ApiError(503, { error: 'FIREBASE_UNAVAILABLE' });
  const { confirmPasswordReset } = require('firebase/auth');
  try {
    await confirmPasswordReset(auth, token, newPassword);
    return { message: 'password_reset' };
  } catch (e: any) {
    const code = String(e?.code || '');
    if (code === 'auth/expired-action-code') throw new ApiError(400, { error: 'token_expired' });
    if (code === 'auth/invalid-action-code') throw new ApiError(400, { error: 'token_invalid' });
    if (code === 'auth/weak-password') throw new ApiError(400, { error: 'weak_password' });
    throw new ApiError(500, { error: 'reset_failed' });
  }
}
