import { API_BASE_URL, normalizeBackendAssetUrl } from './auth/config';

/**
 * Повний URL для медіа стрічки: відносні шляхи та URL з «чужим» хостом (localhost у БД)
 * підміняються на поточний API_BASE_URL, щоб зображення відкривались на пристрої / емуляторі.
 */
export function resolveFeedMediaUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (
    s.startsWith('file:') ||
    s.startsWith('content:') ||
    s.startsWith('ph:') ||
    s.startsWith('assets-library:') ||
    s.startsWith('asset')
  ) {
    return s;
  }
  const base = API_BASE_URL.replace(/\/$/, '');
  if (!/^https?:\/\//i.test(s)) {
    const path = s.startsWith('/') ? s : `/${s}`;
    return `${base}${path}`;
  }
  try {
    const u = new URL(s);
    const path = `${u.pathname}${u.search}`;
    if (path.startsWith('/static/')) {
      return `${base}${path}`;
    }
  } catch {
    /* ignore */
  }
  if (/^https?:\/\//i.test(s)) {
    return normalizeBackendAssetUrl(s);
  }
  return s;
}

/** Перший непорожній URL медіа з API-поста або масиву шляхів. */
export function pickFirstFeedMediaUrl(postOrUrls) {
  let urls = [];
  if (Array.isArray(postOrUrls)) {
    urls = postOrUrls;
  } else if (postOrUrls && typeof postOrUrls === 'object') {
    const raw = postOrUrls.media_urls ?? postOrUrls.mediaUrls ?? postOrUrls.media_url;
    if (Array.isArray(raw)) urls = raw;
    else if (typeof raw === 'string' && raw.trim()) urls = [raw];
  }
  for (const item of urls) {
    const resolved = resolveFeedMediaUrl(String(item || ''));
    if (resolved) return resolved;
  }
  return '';
}
