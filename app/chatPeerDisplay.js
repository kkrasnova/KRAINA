/** Повне ім'я з профілю для шапки чату; @username — для навігації в профіль. */
export function peerUsernameLabel(raw) {
  const u = String(raw || '').trim().replace(/^@/, '');
  return u ? `@${u}` : '';
}

export function peerDisplayNameFromMeta(meta) {
  const display = String(meta?.peer_display_name || meta?.peerDisplayName || '').trim();
  if (display) return display;
  const legacy = String(meta?.peerName || '').trim();
  if (legacy && !legacy.startsWith('@')) return legacy;
  const user = peerUsernameLabel(meta?.peer_username || legacy);
  return user.replace(/^@/, '') || user;
}

export function peerUsernameFromMeta(meta) {
  const fromApi = peerUsernameLabel(meta?.peer_username);
  if (fromApi) return fromApi;
  const legacy = String(meta?.peerName || '').trim();
  if (legacy.startsWith('@')) return legacy;
  return peerUsernameLabel(legacy);
}

export function peerAvatarUriFromMeta(meta) {
  const uri = String(meta?.peer_avatar_url || meta?.peerAvatarUrl || meta?.peerAvatarUri || '').trim();
  return uri || null;
}

export function isValidPeerAvatarUri(uri) {
  const s = String(uri || '').trim();
  return s.startsWith('http') || s.startsWith('file');
}
