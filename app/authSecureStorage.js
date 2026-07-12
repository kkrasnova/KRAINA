import * as SecureStore from 'expo-secure-store';

/**
 * Токени сесії — лише на цьому пристрої, без міграції на новий iPhone.
 * На iOS такі записи зникають при видаленні застосунку, але лишаються,
 * якщо очистили лише AsyncStorage (дані застосунку без деінсталяції).
 */
export const AUTH_TOKEN_KEYCHAIN_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'kraina.auth',
};

const EXPLICIT_LOGOUT_KEY = 'kraina_explicit_logout_v1';

export async function isExplicitLogout() {
  try {
    const v = await SecureStore.getItemAsync(EXPLICIT_LOGOUT_KEY, AUTH_TOKEN_KEYCHAIN_OPTIONS);
    return v === '1';
  } catch {
    return false;
  }
}

export async function markExplicitLogout() {
  try {
    await SecureStore.setItemAsync(EXPLICIT_LOGOUT_KEY, '1', AUTH_TOKEN_KEYCHAIN_OPTIONS);
  } catch {
    /* ignore */
  }
}

export async function clearExplicitLogout() {
  try {
    await SecureStore.deleteItemAsync(EXPLICIT_LOGOUT_KEY, AUTH_TOKEN_KEYCHAIN_OPTIONS);
  } catch {
    /* ignore */
  }
}

/** Читає з нового keychain service; якщо порожньо — з дефолтного (міграція). */
export async function secureAuthGet(key) {
  try {
    const v = await SecureStore.getItemAsync(key, AUTH_TOKEN_KEYCHAIN_OPTIONS);
    if (v != null && v !== '') return v;
  } catch {
    /* fall through */
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function secureAuthSet(key, value) {
  await SecureStore.setItemAsync(key, value, AUTH_TOKEN_KEYCHAIN_OPTIONS);
  // Прибираємо legacy-запис без keychainService, щоб не лишалось «привидів» після виходу.
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* ignore */
  }
}

export async function secureAuthDelete(key) {
  try {
    await SecureStore.deleteItemAsync(key, AUTH_TOKEN_KEYCHAIN_OPTIONS);
  } catch {
    /* ignore */
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* ignore */
  }
}
