/**
 * Чернета форми входу/реєстрації, «запам’ятати мене» (ті самі ключі, що ThirdPage)
 * та індекс останніх email із паролями в SecureStore (по одному ключу на акаунт).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { sha256 } from 'js-sha256';

export const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: 'kraina.saved-login',
};

const REMEMBER_ME_KEY = '@kraina_remember_me';
const REMEMBER_EMAIL_KEY = '@kraina_remember_email';
const REMEMBER_EMAIL_SECURE_KEY = '@kraina_remember_email_secure';
const REMEMBER_PASSWORD_SECURE_KEY = '@kraina_remember_password_secure';
const AUTH_FORM_DRAFT_KEY = '@kraina_auth_form_draft_v1';
const AUTH_DRAFT_PASSWORD_SECURE_KEY = '@kraina_auth_draft_password_secure';
const ACCOUNT_INDEX_KEY = '@kraina_auth_account_index_v1';

const MAX_SAVED_ACCOUNTS = 24;

export type SavedAuthAccount = {
  email: string;
  lastUsedAt: number;
  hasSavedPassword: boolean;
};

export type AuthDraftPayload = {
  v: 1;
  activeTab: 'login' | 'register';
  name: string;
  email: string;
  confirmPassword: string;
  termsAccepted: boolean;
};

function normEmail(email: string) {
  return email.trim().toLowerCase();
}

function perAccountPasswordKey(email: string) {
  const id = sha256(normEmail(email)).slice(0, 48);
  return `kraina_acc_pw_v1_${id}`;
}

async function storageGet(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function storageSet(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

async function secureGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS);
  } catch {
    return null;
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS);
  } catch {
    /* ignore */
  }
}

async function secureDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS);
  } catch {
    /* ignore */
  }
}

export async function readAccountIndex(): Promise<SavedAuthAccount[]> {
  const raw = await storageGet(ACCOUNT_INDEX_KEY);
  if (!raw) return [];
  try {
    const j = JSON.parse(raw) as { accounts?: SavedAuthAccount[] };
    if (Array.isArray(j?.accounts)) return j.accounts;
    return [];
  } catch {
    return [];
  }
}

async function writeAccountIndex(accounts: SavedAuthAccount[]): Promise<void> {
  await storageSet(ACCOUNT_INDEX_KEY, JSON.stringify({ accounts }));
}

/**
 * Оновлює список акаунтів. Якщо передано непорожній пароль — зберігає його для цього email у SecureStore.
 */
export async function upsertSavedAccount(email: string, password?: string | null): Promise<SavedAuthAccount[]> {
  const e = normEmail(email);
  if (!e) return readAccountIndex();
  const now = Date.now();
  const list = await readAccountIndex();
  const idx = list.findIndex((a) => normEmail(a.email) === e);
  let hasSavedPassword = idx >= 0 ? !!list[idx].hasSavedPassword : false;

  const pw = password != null ? String(password) : '';
  if (pw.length > 0) {
    await secureSet(perAccountPasswordKey(e), pw);
    hasSavedPassword = true;
  } else if (idx >= 0) {
    hasSavedPassword = !!list[idx].hasSavedPassword;
  }

  const entry: SavedAuthAccount = {
    email: email.trim(),
    lastUsedAt: now,
    hasSavedPassword,
  };

  let next: SavedAuthAccount[];
  if (idx >= 0) {
    next = [...list];
    next[idx] = { ...next[idx], ...entry };
  } else {
    next = [entry, ...list];
  }
  next.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  if (next.length > MAX_SAVED_ACCOUNTS) next = next.slice(0, MAX_SAVED_ACCOUNTS);
  await writeAccountIndex(next);
  return next;
}

export async function getPerAccountPassword(email: string): Promise<string | null> {
  return secureGet(perAccountPasswordKey(normEmail(email)));
}

export async function clearFormDraft(): Promise<void> {
  await storageSet(AUTH_FORM_DRAFT_KEY, '');
  await secureDelete(AUTH_DRAFT_PASSWORD_SECURE_KEY);
}

export async function saveFormDraft(payload: AuthDraftPayload, password: string): Promise<void> {
  await storageSet(AUTH_FORM_DRAFT_KEY, JSON.stringify(payload));
  if (password) await secureSet(AUTH_DRAFT_PASSWORD_SECURE_KEY, password);
  else await secureDelete(AUTH_DRAFT_PASSWORD_SECURE_KEY);
}

export type AuthHydration = {
  rememberMe: boolean;
  emailFromRemember: string | null;
  passwordFromRemember: string | null;
  draft: Partial<AuthDraftPayload> | null;
  draftPassword: string | null;
};

export async function loadAuthHydration(): Promise<AuthHydration> {
  const savedRemember = await storageGet(REMEMBER_ME_KEY);
  const shouldRemember = savedRemember === 'true';
  const emailSecure = await secureGet(REMEMBER_EMAIL_SECURE_KEY);
  const emailPlain = await storageGet(REMEMBER_EMAIL_KEY);
  const passwordRemember = await secureGet(REMEMBER_PASSWORD_SECURE_KEY);
  const rawDraft = await storageGet(AUTH_FORM_DRAFT_KEY);
  const draftPassword = await secureGet(AUTH_DRAFT_PASSWORD_SECURE_KEY);
  let draft: Partial<AuthDraftPayload> | null = null;
  try {
    if (rawDraft) draft = JSON.parse(rawDraft) as Partial<AuthDraftPayload>;
  } catch {
    draft = null;
  }
  const emailFromRemember =
    shouldRemember && emailSecure && typeof emailSecure === 'string'
      ? emailSecure
      : emailPlain && typeof emailPlain === 'string'
        ? emailPlain
        : null;
  return {
    rememberMe: shouldRemember,
    emailFromRemember,
    passwordFromRemember:
      shouldRemember && passwordRemember && typeof passwordRemember === 'string' ? passwordRemember : null,
    draft,
    draftPassword: draftPassword && typeof draftPassword === 'string' ? draftPassword : null,
  };
}

export async function persistGlobalRememberLogin(email: string, password: string): Promise<void> {
  const e = email.trim();
  await storageSet(REMEMBER_ME_KEY, 'true');
  await storageSet(REMEMBER_EMAIL_KEY, e);
  await secureSet(REMEMBER_EMAIL_SECURE_KEY, e);
  await secureSet(REMEMBER_PASSWORD_SECURE_KEY, password);
}

export async function clearGlobalRememberLogin(): Promise<void> {
  await storageSet(REMEMBER_ME_KEY, 'false');
  await storageSet(REMEMBER_EMAIL_KEY, '');
  await secureDelete(REMEMBER_EMAIL_SECURE_KEY);
  await secureDelete(REMEMBER_PASSWORD_SECURE_KEY);
}
