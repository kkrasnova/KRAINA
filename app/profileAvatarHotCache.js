/** Синхронний кеш URL аватара — одразу на профілі, як у стрічці/публікації. */
let hotAvatarUrl = '';

export function rememberProfileAvatarUrl(url) {
  const raw = url != null ? String(url).trim() : '';
  if (!raw) return;
  hotAvatarUrl = raw;
}

export function peekProfileAvatarUrl() {
  return hotAvatarUrl;
}

export function clearProfileAvatarHotCache() {
  hotAvatarUrl = '';
}
