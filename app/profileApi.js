import { useAuthStore } from './auth/authStore';
import {
  backendDeleteProfileAvatar,
  backendPatchProfileMe,
  backendPostProfileAvatar,
  isBackendJwt,
} from './backendAuthApi';
import { ApiError } from './auth/types';
import { ensureBackendSession } from './syncBackendSessionBridge';
import { normalizeBackendAssetUrl } from './auth/config';

/** Відновити JWT перед змінами профілю на бекенді. */
export async function ensureProfileBackendSession(localUser) {
  await useAuthStore.getState().hydrate();
  if (localUser) {
    await ensureBackendSession(localUser);
  }
  return isBackendJwt(useAuthStore.getState().accessToken);
}

function requireBackendSession() {
  if (!isBackendJwt(useAuthStore.getState().accessToken)) {
    throw new ApiError(401, { error: 'UNAUTHORIZED' }, 'UNAUTHORIZED');
  }
}

/** PATCH /api/profile/me — повертає { profile }. */
export async function patchProfileMe(_token, patch) {
  requireBackendSession();
  return backendPatchProfileMe(patch);
}

/** POST /api/profile/me/avatar — повертає { avatar_url }. */
export async function postProfileAvatar(_token, uri, mimeType = 'image/jpeg') {
  requireBackendSession();
  if (!uri) throw new ApiError(400, { error: 'EMPTY_FILE' }, 'EMPTY_FILE');
  return backendPostProfileAvatar(uri, mimeType);
}

/** DELETE /api/profile/me/avatar */
export async function deleteProfileAvatar(_token) {
  requireBackendSession();
  return backendDeleteProfileAvatar();
}

/** Миттєво оновити profileMe в памʼяті без повного GET /profile/me. */
export function applyProfileMeOptimisticPatch(patch = {}) {
  const state = useAuthStore.getState();
  const prev = state.profileMe;
  if (!prev?.profile || !patch || typeof patch !== 'object') return;
  const profile = { ...prev.profile };
  if ('avatar_url' in patch) {
    const raw = patch.avatar_url;
    profile.avatar_url = raw ? normalizeBackendAssetUrl(String(raw)) : null;
  }
  if (patch.display_name !== undefined) profile.display_name = patch.display_name;
  if (patch.username !== undefined) profile.username = patch.username;
  if (patch.bio !== undefined) profile.bio = patch.bio;
  if (patch.location_label !== undefined) profile.location_label = patch.location_label;
  if (patch.birth_date !== undefined) profile.birth_date = patch.birth_date;
  if (patch.birth_date_public !== undefined) profile.birth_date_public = patch.birth_date_public;
  if (patch.language !== undefined) profile.language = patch.language;
  useAuthStore.setState({
    profileMe: { ...prev, profile },
    profileMeLoadedAt: Date.now(),
  });
}
