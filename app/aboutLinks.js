/**
 * Опційні посилання для екрана «Інформація / посібник».
 * EXPO_PUBLIC_KRAINA_WEBSITE_URL, EXPO_PUBLIC_APP_DOWNLOAD_URL (сторінка в магазині або лендинг).
 */
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

export function getKrainaWebsiteUrl() {
  const u = readEnv('EXPO_PUBLIC_KRAINA_WEBSITE_URL');
  return isHttpUrl(u) ? u : '';
}

/** Посилання на сторінку завантаження / App Store / Google Play для «Поділитися». */
export function getAppDownloadUrl() {
  const u = readEnv('EXPO_PUBLIC_APP_DOWNLOAD_URL');
  return isHttpUrl(u) ? u : '';
}
