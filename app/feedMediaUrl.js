import { API_BASE_URL } from './auth/config';

/**
 * Повний URL для медіа стрічки: відносні шляхи та URL з «чужим» хостом (localhost у БД)
 * підміняються на поточний API_BASE_URL, щоб зображення відкривались на пристрої / емуляторі.
 */
export function resolveFeedMediaUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('file:') || s.startsWith('content:') || s.startsWith('asset')) {
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
  return s;
}
