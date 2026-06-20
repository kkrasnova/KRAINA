/**
 * Опційні посилання для екрана «Інформація / посібник».
 * EXPO_PUBLIC_KRAINA_WEBSITE_URL → extra.krainaSiteUrl → Firebase Hosting.
 */
import Constants from 'expo-constants';
import { getKrainaMarketingSiteUrl } from './helpLinks';

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

export function getKrainaWebsiteUrl() {
  const fromEnv = readEnv('EXPO_PUBLIC_KRAINA_WEBSITE_URL');
  if (isHttpUrl(fromEnv)) return fromEnv;
  const fromExtra = readExtra('krainaSiteUrl');
  if (isHttpUrl(fromExtra)) return fromExtra;
  return getKrainaMarketingSiteUrl();
}

/** Посилання на сторінку завантаження / App Store / Google Play для «Поділитися». */
export function getAppDownloadUrl() {
  const u = readEnv('EXPO_PUBLIC_APP_DOWNLOAD_URL');
  if (isHttpUrl(u)) return u;
  const site = getKrainaWebsiteUrl();
  return site ? `${site.replace(/\/$/, '').replace(/#.*$/, '')}/#cta` : '';
}
