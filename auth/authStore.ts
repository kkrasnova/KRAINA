import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import {
  getProfileMe,
  postApple,
  postGoogle,
  postLogin,
  postLogout,
  postRefresh,
  postRegister,
} from './endpoints';
import type { ProfileMeBody, UserDTO } from './types';
import { ApiError } from './types';
import { clearProfileLocalCache } from '../profileStorage';

const KEY_ACCESS = 'kraina_backend_access_token';
const KEY_REFRESH = 'kraina_backend_refresh_token';

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserDTO | null;
  profileMe: ProfileMeBody | null;
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
    username: string,
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
}

async function persistTokens(access: string, refresh: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_ACCESS, access);
  await SecureStore.setItemAsync(KEY_REFRESH, refresh);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  profileMe: null,
  hydrated: false,
  busy: false,
  lastError: null,

  hydrate: async () => {
    try {
      const [access, refresh] = await Promise.all([
        SecureStore.getItemAsync(KEY_ACCESS),
        SecureStore.getItemAsync(KEY_REFRESH),
      ]);
      if (access && refresh) {
        set({
          accessToken: access,
          refreshToken: refresh,
          hydrated: true,
        });
        void get().loadProfileMe().catch(() => {});
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
      const body = await postLogin({ email, password });
      await get().setSession(
        { access_token: body.access_token, refresh_token: body.refresh_token },
        body.user,
      );
    } catch (e) {
      if (e instanceof ApiError) {
        set({ lastError: e.payload.error ?? e.message });
      }
      throw e;
    } finally {
      set({ busy: false });
    }
  },

  registerWithPassword: async (email, password, username) => {
    set({ busy: true, lastError: null });
    try {
      const body = await postRegister({ email, password, username });
      await get().setSession(
        { access_token: body.access_token, refresh_token: body.refresh_token },
        body.user,
      );
    } catch (e) {
      if (e instanceof ApiError) {
        set({ lastError: e.payload.error ?? e.message });
      }
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
      const res = await postGoogle({ id_token });
      await get().setSession(
        { access_token: res.access_token, refresh_token: res.refresh_token },
        res.user,
      );
    } catch (e) {
      if (e instanceof ApiError) {
        set({ lastError: e.payload.error ?? e.message });
      }
      throw e;
    } finally {
      set({ busy: false });
    }
  },

  loginWithAppleIdentityToken: async (identity_token, fullName) => {
    set({ busy: true, lastError: null });
    try {
      const res = await postApple({
        identity_token,
        user: fullName ? { name: fullName } : undefined,
      });
      await get().setSession(
        { access_token: res.access_token, refresh_token: res.refresh_token },
        res.user,
      );
    } catch (e) {
      if (e instanceof ApiError) {
        set({ lastError: e.payload.error ?? e.message });
      }
      throw e;
    } finally {
      set({ busy: false });
    }
  },

  refreshSession: async () => {
    const rt = get().refreshToken ?? (await SecureStore.getItemAsync(KEY_REFRESH));
    if (!rt) return false;
    try {
      const body = await postRefresh(rt);
      await persistTokens(body.access_token, body.refresh_token);
      set({
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        lastError: null,
      });
      return true;
    } catch {
      await get().clearLocalSession();
      return false;
    }
  },

  logoutRemote: async () => {
    const token = get().accessToken;
    set({ busy: true, lastError: null });
    try {
      if (token) {
        try {
          await postLogout(token);
        } catch {
          /* ігноруємо мережеві помилки — локально все одно виходимо */
        }
      }
      await get().clearLocalSession();
    } finally {
      set({ busy: false });
    }
  },

  loadProfileMe: async () => {
    const token = get().accessToken;
    if (!token) return;
    set({ busy: true, lastError: null });
    try {
      const access = token;
      try {
        const data = await getProfileMe(access);
        const { hydrateSavedRoutesFromProfileMe } = await import('../savedRoutesSync');
        await hydrateSavedRoutesFromProfileMe(data.profile);
        set({ profileMe: data });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          const ok = await get().refreshSession();
          if (!ok) throw e;
          const t2 = get().accessToken;
          if (!t2) throw e;
          const data = await getProfileMe(t2);
          const { hydrateSavedRoutesFromProfileMe: hydrate2 } = await import('../savedRoutesSync');
          await hydrate2(data.profile);
          set({ profileMe: data });
        } else {
          throw e;
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? (err.payload.error ?? err.message)
          : err instanceof Error
            ? err.message
            : 'profile_load_failed';
      set({ lastError: msg });
    } finally {
      set({ busy: false });
    }
  },
}));
