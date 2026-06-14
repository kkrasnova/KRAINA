// Maps backend/JS error messages to user-facing localized text.
// Falls back to a generic message instead of leaking raw technical keys to UI.

const MAP_UK = {
  profile_not_found: 'Профіль не знайдено',
  not_found: 'Не знайдено',
  unauthorized: 'Потрібно увійти',
  unauthorized_admin: 'Доступ лише для адміністратора',
  forbidden: 'Доступ заборонено',
  private_profile: 'Це приватний профіль',
  token_expired: 'Сесія закінчилась. Увійдіть знову',
  validation_failed: 'Перевірте введені дані',
  network_error: 'Немає з’єднання',
  network_request_failed: 'Немає з’єднання',
  conflict: 'Конфлікт даних',
  already_exists: 'Вже існує',
  payment_failed: 'Оплата не пройшла',
  rate_limited: 'Забагато спроб. Спробуйте пізніше',
  send_failed: 'Не вдалося надіслати',
  upload_failed: 'Не вдалося завантажити',
  thread_locked: 'Чат заблоковано',
};

const MAP_EN = {
  profile_not_found: 'Profile not found',
  not_found: 'Not found',
  unauthorized: 'Sign in required',
  unauthorized_admin: 'Admin access only',
  forbidden: 'Access denied',
  private_profile: 'This profile is private',
  token_expired: 'Session expired. Please sign in again',
  validation_failed: 'Please check your input',
  network_error: 'No connection',
  network_request_failed: 'No connection',
  conflict: 'Conflict',
  already_exists: 'Already exists',
  payment_failed: 'Payment failed',
  rate_limited: 'Too many attempts. Try again later',
  send_failed: 'Failed to send',
  upload_failed: 'Failed to upload',
  thread_locked: 'Chat is locked',
};

const GENERIC = { uk: 'Сталася помилка', en: 'Something went wrong' };

export function errorToUserText(err, lang) {
  const code = String(err?.message || '').trim();
  const isKey = /^[a-z_][a-z0-9_]*$/i.test(code) && code.length < 60;
  const map = lang === 'uk' ? MAP_UK : MAP_EN;
  if (isKey && map[code]) return map[code];
  return lang === 'uk' ? GENERIC.uk : GENERIC.en;
}
