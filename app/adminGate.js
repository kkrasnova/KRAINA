/**
 * Доступ до адмін-панелі: лише один фіксований email + пароль (SHA-256) + PIN (SHA-256).
 * Оновити секрети — змінити константи хешів (наприклад: node -e "console.log(require('js-sha256').sha256('...'))").
 */
import { sha256 } from 'js-sha256';

const ADMIN_EMAIL = 'admin123itty23@gmail.com';
/** SHA-256(hex) від пароля адміністратора */
const ADMIN_PASSWORD_SHA256 =
  'b22d7293b7008857e188fb138c1f93bcfe985b20deda972f577a633f2a31d1e5';
/** SHA-256(hex) від PIN */
const ADMIN_PIN_SHA256 =
  '05c643e1e553212dc17e2b5072eb7d8e1017b9fa891d70aeb9c99bb0fb779881';

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function isAdminGateEmail(email) {
  return typeof email === 'string' && email.trim().toLowerCase() === ADMIN_EMAIL;
}

export function verifyAdminPasswordGate(password) {
  return timingSafeEqualHex(sha256(String(password)), ADMIN_PASSWORD_SHA256);
}

export function verifyAdminPinGate(pin) {
  return timingSafeEqualHex(sha256(String(pin)), ADMIN_PIN_SHA256);
}

/** Адміністратор у сесії (після локального / серверного входу). */
export function isAppAdminUser(user) {
  return user?.role === 'admin' || user?.isAdmin === true;
}
