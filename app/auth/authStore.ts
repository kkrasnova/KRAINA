import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { ProfileMeBody, UserDTO } from './types';
import { ApiError } from './types';
import { clearProfileLocalCache } from '../profileStorage';
import {
  backendApple,
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
  signInWithGoogleIdToken,
} from '../db';
const KEY_ACCESS = 'kraina_backend_access_token';
const KEY_REFRESH = 'kraina_backend_refresh_token';

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
  loginWithAppleIdentityToken: (identity_token: string, fullName?: string | null) => Promise<void>;
  refreshSession: () => Promise<boolean>;
  logoutRemote: () => Promise<void>;
  loadProfileMe: () => Promise<void>;
  loadProfileMeIfStale: (staleMs?: number) => Promise<void>;
}

async function persistTokens(access: string, refresh: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_ACCESS, access);
  await SecureStore.setItemAsync(KEY_REFRESH, refresh);
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
      const [access, refresh] = await Promise.all([
        SecureStore.getItemAsync(KEY_ACCESS),
        SecureStore.getItemAsync(KEY_REFRESH),
      ]);
      const s = await getLegacySession();
      if (access && refresh && s?.user && isBackendJwt(access)) {
        set({
          accessToken: access,
          refreshToken: refresh,
          user: mapLegacyUserToDto(s.user),
          profileMe: buildProfileMe(s.user),
          hydrated: true,
        });
        return;
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
    if (userChanged) {
      await clearProfileLocalCache();
    }
    await persistTokens(tokens.access_token, tokens.refresh_token);
    set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      user,
      lastError: null,
    });
    void get().loadProfileMe().catch(() => {});
  },

  clearLocalSession: async () => {
    await SecureStore.deleteItemAsync(KEY_ACCESS).catch(() => {});
    await SecureStore.deleteItemAsync(KEY_REFRESH).catch(() => {});
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
      await get().setSession(
        { access_token: body.access_token, refresh_token: body.refresh_token },
        body.user,
      );
      await signInFirebaseCustomToken((body as { firebase_custom_token?: string }).firebase_custom_token);
      try {
        const userRaw = await loginUser({ email, password });
        await saveLegacySession(userRaw as any);
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
      await get().setSession(
        { access_token: body.access_token, refresh_token: body.refresh_token },
        body.user,
      );
      await signInFirebaseCustomToken((body as { firebase_custom_token?: string }).firebase_custom_token);
      await get().loadProfileMe().catch(() => {});
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
      await get().setSession(
        { access_token: body.access_token, refresh_token: body.refresh_token },
        body.user,
      );
      await signInFirebaseCustomToken((body as { firebase_custom_token?: string }).firebase_custom_token);
      try {
        const signed = await signInWithGoogleIdToken(id_token);
        if ((signed as any)?.user) await saveLegacySession((signed as any).user);
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
    } catch (e: unknown) {
      if (e instanceof ApiError) throw e;
      set({ lastError: e instanceof Error ? e.message : 'google_login_failed' });
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
        if ((signed as any)?.user) await saveLegacySession((signed as any).user);
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
    const rt = get().refreshToken ?? (await SecureStore.getItemAsync(KEY_REFRESH));
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
    } catch {
      await get().clearLocalSession();
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
        const { hydrateSavedRoutesFromProfileMe } = await import('../savedRoutesSync');
        await hydrateSavedRoutesFromProfileMe(data.profile);
        set({ profileMe: data, user: get().user, lastError: null, profileMeLoadedAt: Date.now() });
        return;
      }
      const s = await getLegacySession();
      if (!s?.user) return;
      const data = buildProfileMe(s.user);
      const { hydrateSavedRoutesFromProfileMe } = await import('../savedRoutesSync');
      await hydrateSavedRoutesFromProfileMe(data.profile);
      set({ profileMe: data, user: mapLegacyUserToDto(s.user), profileMeLoadedAt: Date.now() });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'profile_load_failed';
      set({ lastError: msg });
    } finally {
      set({ busy: false });
    }
  },

  loadProfileMeIfStale: async (staleMs = 30000) => {
    const state = get();
    const elapsed = state.profileMeLoadedAt != null ? Date.now() - state.profileMeLoadedAt : Infinity;
    if (elapsed < staleMs && state.profileMe != null) {
      return; // still fresh enough
    }
    await state.loadProfileMe();
  },
}));
