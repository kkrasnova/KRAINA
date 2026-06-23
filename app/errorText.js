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
  story_daily_limit: 'Максимум 20 історій на добу',
  send_failed: 'Не вдалося надіслати',
  upload_failed: 'Не вдалося завантажити',
  invalid_format: 'Непідтримуваний формат файлу',
  thread_locked: 'Чат заблоковано',
  user_not_found: 'Користувача з таким нікнеймом не знайдено',
  cannot_follow_self: 'Не можна підписатися на себе',
  cannot_unfollow_self: 'Не можна відписатися від себе',
  follow_failed: 'Не вдалося підписатися',
  unfollow_failed: 'Не вдалося відписатися',
  invalid_body: 'Перевірте введені дані',
  token_invalid: 'Сесія закінчилась. Увійдіть знову',
  cannot_message_self: 'Не можна написати самому собі',
  invalid_peer: 'Введіть нікнейм',
  thread_create_failed: 'Не вдалося створити чат',
  thread_not_found: 'Чат не знайдено',
  api_unavailable: 'Сервер тимчасово недоступний',
  livekit_not_configured:
    'Дзвінки ще не налаштовані на сервері. Адміністратор має додати LIVEKIT_URL, LIVEKIT_API_KEY та LIVEKIT_API_SECRET.',
  call_failed: 'Не вдалося почати дзвінок',
  accept_failed: 'Не вдалося прийняти дзвінок',
  callee_id_required: 'Не вдалося визначити співрозмовника',
  cannot_call_self: 'Не можна дзвонити самому собі',
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
  story_daily_limit: 'Maximum 20 stories per day',
  send_failed: 'Failed to send',
  upload_failed: 'Failed to upload',
  invalid_format: 'Unsupported file format',
  thread_locked: 'Chat is locked',
  user_not_found: 'No user with this username',
  cannot_follow_self: 'You cannot follow yourself',
  cannot_unfollow_self: 'You cannot unfollow yourself',
  follow_failed: 'Could not follow',
  unfollow_failed: 'Could not unfollow',
  invalid_body: 'Please check your input',
  token_invalid: 'Session expired. Please sign in again',
  cannot_message_self: 'You cannot message yourself',
  invalid_peer: 'Enter a username',
  thread_create_failed: 'Could not create chat',
  thread_not_found: 'Chat not found',
  api_unavailable: 'Server temporarily unavailable',
  livekit_not_configured:
    'Calls are not configured on the server yet. An admin must set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.',
  call_failed: 'Could not start the call',
  accept_failed: 'Could not accept the call',
  callee_id_required: 'Could not identify the other person',
  cannot_call_self: 'You cannot call yourself',
};

const GENERIC = { uk: 'Сталася помилка', en: 'Something went wrong' };

export function errorToUserText(err, lang) {
  const raw = String(err?.payload?.error || err?.message || '').trim();
  const code = raw.toLowerCase();
  const isKey = /^[a-z_][a-z0-9_]*$/i.test(code) && code.length < 60;
  const map = lang === 'uk' ? MAP_UK : MAP_EN;
  if (isKey && map[code]) return map[code];
  return lang === 'uk' ? GENERIC.uk : GENERIC.en;
}
