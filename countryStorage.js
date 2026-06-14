import AsyncStorage from '@react-native-async-storage/async-storage';
import { COUNTRY_BY_APP_LANG } from './appLang';

export const LEGACY_COUNTRY_STORAGE_KEY = '@kraina_app_country';

const PREFIX = '@kraina_app_country_user:';

export function stableUserKey(user) {
  if (!user || typeof user !== 'object') return 'anon';
  const id = user.id || user.firebaseUid;
  if (id) return String(id);
  const em = (user.email || '').trim().toLowerCase();
  if (em) return em;
  return 'anon';
}

function hasStableIdentity(user) {
  if (!user || typeof user !== 'object') return false;
  if (user.id || user.firebaseUid) return true;
  const em = (user.email || '').trim().toLowerCase();
  return !!em;
}

export function countryStorageKeyForUser(user) {
  return `${PREFIX}${stableUserKey(user)}`;
}


const VALID_IDS = new Set(Object.values(COUNTRY_BY_APP_LANG).map((c) => c.id));

export function isValidCountryId(id) {
  return typeof id === 'string' && VALID_IDS.has(id);
}

export async function getSavedCountryIdForUser(user) {
  const key = countryStorageKeyForUser(user);
  try {
    const v = await AsyncStorage.getItem(key);
    if (v === 'US' || v === 'GB') {
      await AsyncStorage.removeItem(key).catch(() => {});
      return null;
    }
    if (v && isValidCountryId(v)) return v;
  } catch (_) {}
  // Legacy global country key can leak old value (e.g. US) across users.
  // Use it only for anonymous sessions without a stable user identity.
  if (hasStableIdentity(user)) return null;
  try {
    const legacy = await AsyncStorage.getItem(LEGACY_COUNTRY_STORAGE_KEY);
    const migrated = legacy === 'US' || legacy === 'GB' ? null : legacy;
    if (migrated && isValidCountryId(migrated)) {
      await AsyncStorage.setItem(key, migrated).catch(() => {});
      return migrated;
    }
  } catch (_) {}
  return null;
}

export async function saveCountryForUser(user, countryId) {
  if (!isValidCountryId(countryId)) return;
  const key = countryStorageKeyForUser(user);
  try {
    await AsyncStorage.setItem(key, countryId);
  } catch (_) {}
}
