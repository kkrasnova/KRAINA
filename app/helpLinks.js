/**
 * Посилання та email для екрана «Допомога».
 * Пріоритет: EXPO_PUBLIC_* → expo.extra у app.json → резерв (сторінка застосунку в Google Play).
 * Для продакшену задайте окремі EXPO_PUBLIC_HELP_FAQ_URL / EXPO_PUBLIC_HELP_DOCS_URL або extra.helpFaqUrl / helpDocsUrl.
 */
import Constants from 'expo-constants';

const ANDROID_PACKAGE = 'com.kraina.app';
const DEFAULT_LISTING = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
/** Продакшен-лендинг (Firebase Hosting). kraina.world — коли підключите DNS у Firebase. */
const DEFAULT_SITE_URL = 'https://kraina-207c5.web.app';
const DEFAULT_SITE_FALLBACK = 'https://kraina.world';

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

export function getKrainaMarketingSiteUrl() {
  return firstValidHttp(
    readEnv('EXPO_PUBLIC_KRAINA_SITE_URL'),
    readExtra('krainaSiteUrl'),
    DEFAULT_SITE_URL,
    DEFAULT_SITE_FALLBACK,
  );
}

function siteSectionUrl(hash) {
  const base = getKrainaMarketingSiteUrl().replace(/\/$/, '').replace(/#.*$/, '');
  if (!hash) return base;
  const h = hash.startsWith('#') ? hash : `#${hash}`;
  return `${base}${h}`;
}

export function getHelpFaqUrl() {
  const explicit = firstValidHttp(readEnv('EXPO_PUBLIC_HELP_FAQ_URL'), readExtra('helpFaqUrl'));
  if (explicit && !explicit.includes('play.google.com/store/apps')) return explicit;
  return siteSectionUrl('#faq');
}

export function getHelpDocsUrl() {
  const explicit = firstValidHttp(readEnv('EXPO_PUBLIC_HELP_DOCS_URL'), readExtra('helpDocsUrl'));
  if (explicit && !explicit.includes('play.google.com/store/apps')) return explicit;
  return siteSectionUrl('#guide');
}

/** Підтримка: спочатку SUPPORT, інакше PRIVACY email, інакше дефолт. */
export function getSupportEmail() {
  const s = readEnv('EXPO_PUBLIC_SUPPORT_EMAIL');
  if (s && s.includes('@')) return s.trim();
  const p = readEnv('EXPO_PUBLIC_PRIVACY_EMAIL');
  if (p && p.includes('@')) return p.trim();
  return 'support@kraina.world';
}
