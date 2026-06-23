import { useAuthStore } from './auth/authStore';
import {
  backendDeleteProfileAvatar,
  backendPatchProfileMe,
  backendPostProfileAvatar,
  isBackendJwt,
} from './backendAuthApi';
import { ApiError } from './auth/types';
import { ensureBackendSession } from './syncBackendSessionBridge';

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
