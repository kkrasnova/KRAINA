import { DeviceEventEmitter } from 'react-native';

/** Максимальний вік кешу підписок/профілів — UI має збігатися з сервером за ~1 с. */
export const SOCIAL_SYNC_TTL_MS = 1000;

export const KRAINA_SOCIAL_FOLLOW_CHANGED = 'kraina_social_follow_changed_v1';
/** Ширше оновлення графа: запити, взаємні, лічильники після accept/decline/unfollow. */
export const KRAINA_SOCIAL_GRAPH_CHANGED = 'kraina_social_graph_changed_v1';

export function normalizeSocialUsername(username) {
  return String(username || '')
    .replace(/^@/, '')
    .trim()
    .toLowerCase();
}

const PLACEHOLDER_SOCIAL_USERNAMES = new Set(['user']);

/** Fallback-нік з коду (`|| 'user'`), не веде на реальний профіль. */
export function isPlaceholderSocialUsername(username) {
  const u = normalizeSocialUsername(username);
  return !u || PLACEHOLDER_SOCIAL_USERNAMES.has(u);
}

/** Чи можна відкрити публічний профіль за цим ніком. */
export function isNavigableSocialUsername(username) {
  const u = normalizeSocialUsername(username);
  if (!u || PLACEHOLDER_SOCIAL_USERNAMES.has(u)) return false;
  return /^[a-z0-9_]{3,32}$/.test(u);
}

/** @param {{ username?: string, user_id?: string, is_following?: boolean, pending?: boolean }} payload */
export function emitSocialFollowChanged(payload = {}) {
  try {
    DeviceEventEmitter.emit(KRAINA_SOCIAL_FOLLOW_CHANGED, {
      username: normalizeSocialUsername(payload.username),
      user_id: payload.user_id != null ? String(payload.user_id) : '',
      is_following: !!payload.is_following,
      pending: !!payload.pending,
    });
  } catch {
    /* ignore */
  }
}

/** @param {{ reason?: string, user_id?: string }} payload */
export function emitSocialGraphChanged(payload = {}) {
  try {
    DeviceEventEmitter.emit(KRAINA_SOCIAL_GRAPH_CHANGED, {
      reason: payload.reason || 'update',
      user_id: payload.user_id != null ? String(payload.user_id) : '',
    });
  } catch {
    /* ignore */
  }
}

export function socialFollowMatches(payload, username, userId) {
  const pid = String(payload?.user_id || '');
  if (userId && pid && pid === String(userId)) return true;
  const pu = normalizeSocialUsername(payload?.username);
  const u = normalizeSocialUsername(username);
  return !!(u && pu && u === pu);
}
