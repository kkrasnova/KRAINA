import { create } from 'zustand';
import {
  clearExplicitLogout,
  isExplicitLogout,
  markExplicitLogout,
  secureAuthDelete,
  secureAuthGet,
  secureAuthSet,
} from '../authSecureStorage';
import type { ProfileMeBody, UserDTO } from './types';
import { ApiError } from './types';
import { clearProfileLocalCache } from '../profileStorage';
import {
  backendApple,
  backendFacebook,
  backendFirebase,
  backendGetProfileMe,
  backendGoogle,
  backendLogin,
  backendRefresh,
  backendRegister,
  isBackendJwt,
  signInFirebaseCustomToken,
} from '../backendAuthApi';
import {
  clearSession as clearLegacySession,
  getSession as getLegacySession,
  loginUser,
  registerUser,
  saveSession as saveLegacySession,
  signInWithAppleFirebase,
  signInWithFacebookAccessToken,
  signInWithGoogleIdToken,
} from '../db';
import { hydrateSavedRoutesFromProfileMe } from '../savedRoutesSync';
const KEY_ACCESS = 'kraina_backend_access_token';
const KEY_REFRESH = 'kraina_backend_refresh_token';

function decodeBase64UrlToUtf8(base64Url: string): string | null {
  try {
    const base64 = String(base64Url || '')
      .trim()
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(padLen);

    // Most RN runtimes have atob. If not, fallback to base64-js.
    let binStr: string;
    const atobFn = (globalThis as any)?.atob;
    if (typeof atobFn === 'function') {
      binStr = atobFn(padded);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const b64 = require('base64-js');
      const bytes = b64.toByteArray(padded);
      const TD: any = (globalThis as any)?.TextDecoder;
      if (typeof TD === 'function') return new TD('utf-8').decode(bytes);
      let out = '';
      for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
      return out;
    }

    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i += 1) bytes[i] = binStr.charCodeAt(i);
    const TD: any = (globalThis as any)?.TextDecoder;
    if (typeof TD === 'function') return new TD('utf-8').decode(bytes);
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
    return out;
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const payloadStr = decodeBase64UrlToUtf8(parts[1]);
    if (!payloadStr) return null;
    const parsed = JSON.parse(payloadStr);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

function buildUserFromJwt(token: string): (UserDTO & { appLanguage?: string; provider?: string }) | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  const idRaw = payload.sub ?? payload.user_id ?? payload.uid ?? payload.id ?? '';
  const emailRaw = payload.email ?? payload.user_email ?? payload.mail ?? '';

  const roleRaw = payload.role ?? (payload.isAdmin ? 'admin' : 'user');
  const statusRaw = payload.status ?? 'active';
  const appLanguageRaw = payload.app_language ?? payload.appLanguage ?? payload.language ?? payload.locale ?? null;
  const providerRaw = payload.provider ?? null;

  const id = String(idRaw || '').trim();
  if (!id) return null;

  const user: UserDTO & { appLanguage?: string; provider?: string } = {
    id,
    email: String(emailRaw || '').trim(),
    role: String(roleRaw || 'user'),
    status: String(statusRaw || 'active'),
  };
  if (appLanguageRaw != null && String(appLanguageRaw).trim()) user.appLanguage = String(appLanguageRaw).trim();
  if (providerRaw != null && String(providerRaw).trim()) user.provider = String(providerRaw).trim();
  return user;
}

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserDTO | null;
  profileMe: ProfileMeBody | null;
  profileMeLoadedAt: number | null;
  hydrated: boolean;
  busy: boolean;
  lastError: string | null;
  hydrate: () => Promise<void>;
  setSession: (tokens: { access_token: string; refresh_token: string }, user: UserDTO) => Promise<void>;
  clearLocalSession: () => Promise<void>;
  /** Скидає лише JWT у сховищі (протухлий refresh) — без прапорця «явний вихід». */
  clearExpiredTokens: () => Promise<void>;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  registerWithPassword: (
    email: string,
    password: string,
    displayName: string,
    accountUsername?: string,
  ) => Promise<void>;
  loginWithTokens: (body: {
    access_token: string;
    refresh_token: string;
    user: UserDTO;
  }) => Promise<void>;
  loginWithGoogleIdToken: (id_token: string) => Promise<void>;
  loginWithFirebaseIdToken: (id_token: string) => Promise<void>;
  loginWithFacebookAccessToken: (access_token: string) => Promise<void>;
  loginWithAppleIdentityToken: (identity_token: string, fullName?: string | null) => Promise<void>;
  refreshSession: () => Promise<boolean>;
  logoutRemote: () => Promise<void>;
  loadProfileMe: () => Promise<void>;
  loadProfileMeIfStale: (staleMs?: number) => Promise<void>;
}

async function persistTokens(access: string, refresh: string): Promise<void> {
  await secureAuthSet(KEY_ACCESS, access);
  await secureAuthSet(KEY_REFRESH, refresh);
}

function mapLegacyUserToDto(user: Record<string, unknown>): UserDTO {
  const uid = String(user?.firebaseUid || user?.id || '');
  return {
    id: uid,
    email: String(user?.email || ''),
    role: String(user?.role || (user?.isAdmin ? 'admin' : 'user')),
    status: 'active',
  };
}

function buildProfileMe(user: Record<string, unknown>): ProfileMeBody {
  const now = new Date().toISOString();
  const id = String(user?.id || user?.firebaseUid || '');
  const language = String(user?.appLanguage || 'en');
  const accountHandle =
    user?.accountUsername != null && String(user.accountUsername).trim()
      ? String(user.accountUsername).trim()
      : String(user?.name || String(user?.email || '').split('@')[0] || 'user');
  return {
    profile: {
      id,
      user_id: id,
      username: accountHandle,
      avatar_url: (user?.avatar as string | null) || null,
      bio: null,
      language,
      display_name: String(user?.name || ''),
      birth_date: null,
      birth_date_public: false,
      location_label: null,
      xp_points: 0,
      level: 1,
      is_public: true,
      locations_visited: 0,
      routes_created: 0,
      followers_count: 0,
      following_count: 0,
      created_at: now,
      updated_at: now,
      saved_route_plans: [],
    },
    subscription: {
      plan_type: 'free',
      billing_period: null,
      is_active: false,
      expires_at: null,
      payment_provider: null,
    },
    usage: {},
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  profileMe: null,
  profileMeLoadedAt: null,
  hydrated: false,
  busy: false,
  lastError: null,

  hydrate: async () => {
    try {
      if (await isExplicitLogout()) {
        const legacyOnExplicitLogout = await getLegacySession();
        if (!legacyOnExplicitLogout?.user) {
          await secureAuthDelete(KEY_ACCESS);
          await secureAuthDelete(KEY_REFRESH);
          set({ hydrated: true });
          return;
        }
        // Міграція: прапорець «явний вихід» міг зʼявитись через протухлий refresh,
        // хоча локальна сесія ще є — відновлюємо вхід без повторного логіну.
        await clearExplicitLogout();
      }

      const [access, refresh] = await Promise.all([
        secureAuthGet(KEY_ACCESS),
        secureAuthGet(KEY_REFRESH),
      ]);
      const s = await getLegacySession();

      const accessJwt = access && isBackendJwt(access) ? access : null;

      // Normal case: we have legacy local user (AsyncStorage session) + access JWT.
      if (accessJwt && s?.user) {
        set({
          accessToken: accessJwt,
          refreshToken: refresh ?? null,
          user: mapLegacyUserToDto(s.user),
          profileMe: buildProfileMe(s.user),
          hydrated: true,
        });
        return;
      }

      // Important case (your scenario): user cleared app data (AsyncStorage), but Keychain still has refresh/access tokens.
      // In this case we must restore `user` from JWT so navigation can treat the user as logged-in.
      if (refresh) {
        if (s?.user) {
          const legacyUser = mapLegacyUserToDto(s.user);
          const legacyProfile = buildProfileMe(s.user);
          set({
            refreshToken: refresh,
            user: legacyUser,
            profileMe: legacyProfile,
          });
          const ok = await get().refreshSession();
          if (ok) {
            set({ hydrated: true });
            return;
          }
          set({
            accessToken: null,
            refreshToken: refresh,
            user: legacyUser,
            profileMe: legacyProfile,
            hydrated: true,
          });
          return;
        }

        // No legacy user - recover purely from refresh/access tokens.
        // refreshSession signs in Firebase (best-effort) and updates access/refresh in SecureStore.
        set({ refreshToken: refresh, hydrated: false });
        const ok = await get().refreshSession();
        const accessAfter = get().accessToken;
        const refreshAfter = get().refreshToken;
        const accessForDecode = accessAfter ?? accessJwt;
        // Если refreshSession реально “зачистил” токены (невалидний refresh), refreshAfter буде null.
        // Тоді не відновлюємо user з старого accessJwt (щоб не показувати залогінений стан з мертвими токенами).
        const userFromJwt =
          refreshAfter && accessForDecode && isBackendJwt(accessForDecode) ? buildUserFromJwt(accessForDecode) : null;
        if (userFromJwt) set({ user: userFromJwt, profileMe: null });
        // Even if refresh failed (offline), we can still proceed if we decoded a usable user.
        set({ hydrated: true });
        // If refresh failed and it cleared tokens, userFromJwt will likely be null already.
        if (ok || userFromJwt) return;
        return;
      }

      if (s?.user) {
        set({
          user: mapLegacyUserToDto(s.user),
          profileMe: buildProfileMe(s.user),
          hydrated: true,
        });
        return;
      }

      // Fallback: access token without legacy session (rare).
      if (accessJwt) {
        const userFromJwt = buildUserFromJwt(accessJwt);
        if (userFromJwt) {
          set({
            accessToken: accessJwt,
            refreshToken: null,
            user: userFromJwt,
            profileMe: null,
            hydrated: true,
          });
          return;
        }
      }
    } catch {
      /* ignore */
    }
    set({ hydrated: true });
  },

  setSession: async (tokens, user) => {
    const prevUser = get().user;
    const prevIdentity = prevUser?.id != null ? String(prevUser.id) : prevUser?.email || '';
    const nextIdentity = user?.id != null ? String(user.id) : user?.email || '';
    const userChanged = !!prevIdentity && !!nextIdentity && prevIdentity !== nextIdentity;

    await clearExplicitLogout();

    set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      user,
      lastError: null,
    });

    // Токени зберігаємо синхронно — інакше при закритті застосунку сесія губиться.
    await persistTokens(tokens.access_token, tokens.refresh_token);

    void (async () => {
      try {
        const promises: Promise<unknown>[] = [];
        if (userChanged) promises.push(clearProfileLocalCache());
        promises.push(get().loadProfileMe());
        await Promise.all(promises);
      } catch {
        // Ignore background errors
      }
    })();
  },

  clearExpiredTokens: async () => {
    await secureAuthDelete(KEY_ACCESS);
    await secureAuthDelete(KEY_REFRESH);
    set({
      accessToken: null,
      refreshToken: null,
      lastError: null,
    });
  },

  clearLocalSession: async () => {
    await markExplicitLogout();
    await secureAuthDelete(KEY_ACCESS);
    await secureAuthDelete(KEY_REFRESH);
    set({
      accessToken: null,
      refreshToken: null,
      user: null,
      profileMe: null,
      lastError: null,
    });
  },

  loginWithPassword: async (email, password) => {
    set({ busy: true, lastError: null });
    try {
      const body = await backendLogin(email, password);
      // ⚡ Встанавлюємо сесію одразу (критично для UX)
      await get().setSession(
        { access_token: body.access_token, refresh_token: body.refresh_token },
        body.user,
      );

      try {
        await signInFirebaseCustomToken((body as { firebase_custom_token?: string }).firebase_custom_token);
      } catch (e) {
        if (__DEV__) console.warn('[authStore] Firebase custom token sync failed:', e);
      }

      try {
        const userRaw = await loginUser({ email, password });
        await saveLegacySession({
          ...(userRaw as Record<string, unknown>),
          id: body.user.id,
          email: body.user.email || (userRaw as { email?: string }).email,
          provider: 'email',
        } as any);
      } catch {
        await saveLegacySession({
          id: body.user.id,
          email: body.user.email,
          name: body.user.email.split('@')[0] || 'User',
          role: body.user.role,
          status: body.user.status,
          provider: 'email',
        } as any);
      }
    } catch (e: unknown) {
      if (e instanceof ApiError) throw e;
      set({ lastError: e instanceof Error ? e.message : 'login_failed' });
      throw e;
    } finally {
      set({ busy: false });
    }
  },

  registerWithPassword: async (email, password, displayName, accountUsername?) => {
    set({ busy: true, lastError: null });
    const trimmedDisplay = String(displayName || '').trim();
    const explicitUsername = String(accountUsername || '')
      .trim()
      .replace(/^@/, '')
      .toLowerCase();
    try {
      const body = await backendRegister(email, password, {
        username: explicitUsername || undefined,
        display_name: trimmedDisplay || undefined,
      });
      // ⚡ Встанавлюємо сесію одразу
      await get().setSession(
        { access_token: body.access_token, refresh_token: body.refresh_token },
        body.user,
      );

      try {
        await signInFirebaseCustomToken((body as { firebase_custom_token?: string }).firebase_custom_token);
      } catch (e) {
        if (__DEV__) console.warn('[authStore] Firebase custom token sync failed:', e);
      }

      try {
        await get().loadProfileMe();
      } catch {
        // OK if profile load fails
      }

      const profileUsername = get().profileMe?.profile?.username || explicitUsername || '';
      const profileDisplayName =
        get().profileMe?.profile?.display_name || trimmedDisplay || body.user.email.split('@')[0] || 'User';

      try {
        const userRaw = await registerUser({
          email,
          password,
          name: profileDisplayName,
        });
        const merged = {
          ...(userRaw as Record<string, unknown>),
          accountUsername: profileUsername,
          name: profileDisplayName,
        };
        await saveLegacySession(merged as any);
        if (profileUsername) {
          const { setProfileUsername, setProfileDisplayName } = await import('../profileStorage');
          await setProfileUsername(profileUsername);
          await setProfileDisplayName(profileDisplayName);
        }
      } catch {
        await saveLegacySession({
          id: body.user.id,
          email: body.user.email,
          name: profileDisplayName,
          accountUsername: profileUsername || undefined,
          role: body.user.role,
          status: body.user.status,
          provider: 'email',
        } as any);
        if (profileUsername) {
          const { setProfileUsername, setProfileDisplayName } = await import('../profileStorage');
          await setProfileUsername(profileUsername);
          await setProfileDisplayName(profileDisplayName);
        }
      }
    } catch (e: unknown) {
      if (e instanceof ApiError) throw e;
      set({ lastError: e instanceof Error ? e.message : 'register_failed' });
      throw e;
    } finally {
      set({ busy: false });
    }
  },

  loginWithTokens: async (body) => {
    set({ busy: true, lastError: null });
    try {
      await get().setSession(
        { access_token: body.access_token, refresh_token: body.refresh_token },
        body.user,
      );
    } finally {
      set({ busy: false });
    }
  },

  loginWithGoogleIdToken: async (id_token) => {
    set({ busy: true, lastError: null });
    try {
      const body = await backendGoogle(id_token);
      // ⚡ Встанавлюємо сесію одразу
      await get().setSession(
        { access_token: body.access_token, refresh_token: body.refresh_token },
        body.user,
      );
      
      // ⚡ Firebase + Legacy session у фоні
      void (async () => {
        try {
          await signInFirebaseCustomToken((body as { firebase_custom_token?: string }).firebase_custom_token);
        } catch (e) {
          if (__DEV__) console.warn('[authStore] Firebase custom token sync failed:', e);
        }
        
        try {
          const signed = await signInWithGoogleIdToken(id_token);
          if ((signed as any)?.user) {
            await saveLegacySession({
              ...(signed as any).user,
              id: body.user.id,
              email: body.user.email || (signed as any).user?.email,
              provider: 'google',
            } as any);
          }
        } catch {
          await saveLegacySession({
            id: body.user.id,
            email: body.user.email,
            name: body.user.email.split('@')[0] || 'User',
            role: body.user.role,
            status: body.user.status,
            provider: 'google',
          } as any);
        }
      })();
    } catch (e: unknown) {
      if (e instanceof ApiError) throw e;
      set({ lastError: e instanceof Error ? e.message : 'google_login_failed' });
      throw e;
    } finally {
      set({ busy: false });
    }
  },

  loginWithFirebaseIdToken: async (id_token) => {
    set({ busy: true, lastError: null });
    try {
      const body = await backendFirebase(id_token);
      // ⚡ Встанавлюємо сесію одразу
      await get().setSession(
        { access_token: body.access_token, refresh_token: body.refresh_token },
        body.user,
      );
      
      // ⚡ Firebase + Legacy session у фоні
      void (async () => {
        try {
          await signInFirebaseCustomToken((body as { firebase_custom_token?: string }).firebase_custom_token);
        } catch (e) {
          if (__DEV__) console.warn('[authStore] Firebase custom token sync failed:', e);
        }
        
        const s = await getLegacySession();
        if (s?.user) {
          await saveLegacySession({
            ...s.user,
            id: body.user.id,
            email: body.user.email || s.user.email,
            provider: s.user.provider || 'email',
          } as any);
        } else {
          await saveLegacySession({
            id: body.user.id,
            email: body.user.email,
            name: body.user.email.split('@')[0] || 'User',
            role: body.user.role,
            status: body.user.status,
            provider: 'email',
          } as any);
        }
      })();
    } catch (e: unknown) {
      if (e instanceof ApiError) throw e;
      set({ lastError: e instanceof Error ? e.message : 'firebase_login_failed' });
      throw e;
    } finally {
      set({ busy: false });
    }
  },

  loginWithFacebookAccessToken: async (access_token) => {
    set({ busy: true, lastError: null });
    try {
      const body = await backendFacebook(access_token);
      await get().setSession(
        { access_token: body.access_token, refresh_token: body.refresh_token },
        body.user,
      );
      await signInFirebaseCustomToken((body as { firebase_custom_token?: string }).firebase_custom_token);
      try {
        const signed = await signInWithFacebookAccessToken(access_token);
        if ((signed as any)?.user) {
          await saveLegacySession({
            ...(signed as any).user,
            id: body.user.id,
            email: body.user.email || (signed as any).user?.email,
            provider: 'facebook',
          } as any);
        }
      } catch {
        await saveLegacySession({
          id: body.user.id,
          email: body.user.email,
          name: body.user.email.split('@')[0] || 'User',
          role: body.user.role,
          status: body.user.status,
          provider: 'facebook',
        } as any);
      }
    } catch (e: unknown) {
      if (e instanceof ApiError) throw e;
      set({ lastError: e instanceof Error ? e.message : 'facebook_login_failed' });
      throw e;
    } finally {
      set({ busy: false });
    }
  },

  loginWithAppleIdentityToken: async (identity_token, fullName) => {
    set({ busy: true, lastError: null });
    try {
      const body = await backendApple(identity_token, fullName ? { name: fullName } : undefined);
      await get().setSession(
        { access_token: body.access_token, refresh_token: body.refresh_token },
        body.user,
      );
      await signInFirebaseCustomToken((body as { firebase_custom_token?: string }).firebase_custom_token);
      try {
        const signed = await signInWithAppleFirebase(identity_token, undefined, {
          fullName: fullName ? { givenName: fullName } : undefined,
        });
        if ((signed as any)?.user) {
          await saveLegacySession({
            ...(signed as any).user,
            id: body.user.id,
            email: body.user.email || (signed as any).user?.email,
            provider: 'apple',
          } as any);
        }
      } catch {
        await saveLegacySession({
          id: body.user.id,
          email: body.user.email,
          name: fullName || body.user.email.split('@')[0] || 'User',
          role: body.user.role,
          status: body.user.status,
          provider: 'apple',
        } as any);
      }
    } catch (e: unknown) {
      if (e instanceof ApiError) throw e;
      set({ lastError: e instanceof Error ? e.message : 'apple_login_failed' });
      throw e;
    } finally {
      set({ busy: false });
    }
  },

  refreshSession: async () => {
    const rt = get().refreshToken ?? (await secureAuthGet(KEY_REFRESH));
    if (!rt) return false;
    try {
      const tokens = await backendRefresh(rt);
      await persistTokens(tokens.access_token, tokens.refresh_token);
      await signInFirebaseCustomToken((tokens as { firebase_custom_token?: string }).firebase_custom_token);
      set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        lastError: null,
      });
      return true;
    } catch (e: unknown) {
      // Скидаємо сесію лише коли сервер реально відхилив refresh-токен (401/403).
      // Транзієнтні збої — офлайн, таймаут «холодного старту» Render, 5xx — НЕ повинні
      // знищувати сесію: інакше повідомлення перестають працювати для будь-якого акаунта
      // (email/Apple/Facebook не мають тихого відновлення, лише Google). Токен лишається в
      // SecureStore і наступна спроба (refresh або 401-retry) відновить доступ до чатів.
      const status = e instanceof ApiError ? e.status : 0;
      const code = e instanceof ApiError ? String(e.payload?.error || '').toLowerCase() : '';
      const tokenRejected =
        status === 401 ||
        status === 403 ||
        code === 'invalid_token' ||
        code === 'invalid_refresh_token' ||
        code === 'token_expired' ||
        code === 'refresh_token_expired';
      if (tokenRejected) {
        await get().clearExpiredTokens();
      }
      return false;
    }
  },

  logoutRemote: async () => {
    set({ busy: true, lastError: null });
    try {
      await clearLegacySession().catch(() => {});
      await get().clearLocalSession();
    } finally {
      set({ busy: false });
    }
  },

  loadProfileMe: async () => {
    set({ busy: true, lastError: null });
    try {
      if (isBackendJwt(get().accessToken)) {
        const data = (await backendGetProfileMe()) as ProfileMeBody;
        await hydrateSavedRoutesFromProfileMe(data.profile);
        set({ profileMe: data, user: get().user, lastError: null, profileMeLoadedAt: Date.now() });
        const { applyServerProfileToLocal, emitProfileMeUpdated } = await import('../profileMeSync');
        await applyServerProfileToLocal(data.profile);
        const { mergeBackendUserIntoLocalSession } = await import('../syncBackendSessionBridge');
        await mergeBackendUserIntoLocalSession();
        emitProfileMeUpdated({ source: 'loadProfileMe' });
        return;
      }
      const s = await getLegacySession();
      if (!s?.user) return;
      const data = buildProfileMe(s.user);
      await hydrateSavedRoutesFromProfileMe(data.profile);
      set({ profileMe: data, user: mapLegacyUserToDto(s.user), profileMeLoadedAt: Date.now() });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'profile_load_failed';
      set({ lastError: msg });
    } finally {
      set({ busy: false });
    }
  },

  loadProfileMeIfStale: async (staleMs = 1000) => {
    const state = get();
    const elapsed = state.profileMeLoadedAt != null ? Date.now() - state.profileMeLoadedAt : Infinity;
    if (elapsed < staleMs && state.profileMe != null) {
      return; // still fresh enough
    }
    await state.loadProfileMe();
  },
}));
