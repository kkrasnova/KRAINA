import { postPrivacyUserRequest } from './auth/endpoints';
import { backendAuthFetch, hasBackendJwt } from './backendAuthApi';
import { useAuthStore } from './auth/authStore';

/**
 * Надіслати GDPR-запит (export/delete) на сервер.
 * Повертає { channel: 'backend' | 'firebase' | 'guest' }.
 */
export async function submitPrivacyUserRequest(requestType, { appLanguage, userEmail } = {}) {
  const payload = {
    request_type: requestType,
    app_language: appLanguage ?? null,
    user_email: userEmail?.trim() || null,
  };

  if (hasBackendJwt()) {
    await backendAuthFetch('POST', '/api/privacy/request', payload);
    return { channel: 'backend' };
  }

  const token = useAuthStore.getState().accessToken;
  const userId = useAuthStore.getState().user?.id;
  if (token && userId) {
    await postPrivacyUserRequest(token, payload);
    return { channel: 'firebase' };
  }

  return { channel: 'guest' };
}

export function privacyRequestMailBody(requestType, email) {
  const intro =
    requestType === 'export'
      ? 'Прошу надіслати копію моїх персональних даних (GDPR / право на переносимість даних).'
      : 'Прошу видалити мій обліковий запис і пов’язані персональні дані.';
  const parts = [intro];
  if (email) parts.push(`Account / акаунт: ${email}`);
  parts.push('KRAÏNA mobile app');
  return parts.join('\n\n');
}
