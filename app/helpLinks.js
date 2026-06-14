/**
 * Посилання та email для екрана «Допомога».
 * Пріоритет: EXPO_PUBLIC_* → expo.extra у app.json → резерв (сторінка застосунку в Google Play).
 * Для продакшену задайте окремі EXPO_PUBLIC_HELP_FAQ_URL / EXPO_PUBLIC_HELP_DOCS_URL або extra.helpFaqUrl / helpDocsUrl.
 */
import Constants from 'expo-constants';

const ANDROID_PACKAGE = 'com.kraina.app';
const DEFAULT_LISTING = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

function readEnv(key) {
  try {
    if (typeof process === 'undefined' || !process.env) return '';
    const v = process.env[key];
    return v && String(v).trim() ? String(v).trim() : '';
  } catch {
    return '';
  }
}

function isHttpUrl(s) {
  return /^https?:\/\//i.test(s);
}

function readExtra(key) {
  try {
    const ex = Constants.expoConfig?.extra ?? Constants.manifest?.extra ?? {};
    const v = ex[key];
    return v && String(v).trim() ? String(v).trim() : '';
  } catch {
    return '';
  }
}

function firstValidHttp(...candidates) {
  for (const c of candidates) {
    if (c && isHttpUrl(c)) return c;
  }
  return '';
}

export function getHelpFaqUrl() {
  return firstValidHttp(
    readEnv('EXPO_PUBLIC_HELP_FAQ_URL'),
    readExtra('helpFaqUrl'),
    readEnv('EXPO_PUBLIC_PLAY_STORE_URL'),
    DEFAULT_LISTING,
  );
}

export function getHelpDocsUrl() {
  return firstValidHttp(
    readEnv('EXPO_PUBLIC_HELP_DOCS_URL'),
    readExtra('helpDocsUrl'),
    readEnv('EXPO_PUBLIC_IOS_APP_STORE_URL'),
    readEnv('EXPO_PUBLIC_PLAY_STORE_URL'),
    DEFAULT_LISTING,
  );
}

/** Підтримка: спочатку SUPPORT, інакше PRIVACY email, інакше дефолт. */
export function getSupportEmail() {
  const s = readEnv('EXPO_PUBLIC_SUPPORT_EMAIL');
  if (s && s.includes('@')) return s.trim();
  const p = readEnv('EXPO_PUBLIC_PRIVACY_EMAIL');
  if (p && p.includes('@')) return p.trim();
  return 'support@kraina.app';
}
