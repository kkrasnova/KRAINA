import { API_BASE_URL } from './config';
import type {
  ApiErrorPayload,
  AuthSuccessBody,
  BillingVerifyBody,
  BillingVerifyResponse,
  ProfileMeBody,
  RefreshBody,
} from './types';
import { ApiError } from './types';

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: T & ApiErrorPayload;
  try {
    data = (text ? JSON.parse(text) : {}) as T & ApiErrorPayload;
  } catch {
    throw new ApiError(res.status, {}, 'invalid_response');
  }
  if (!res.ok) {
    throw new ApiError(res.status, data as ApiErrorPayload);
  }
  return data as T;
}

export async function postRegister(body: {
  email: string;
  password: string;
  username: string;
}): Promise<AuthSuccessBody> {
  const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseResponse<AuthSuccessBody>(res);
}

export async function postLogin(body: {
  email: string;
  password: string;
}): Promise<AuthSuccessBody> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseResponse<AuthSuccessBody>(res);
}

export async function postGoogle(body: { id_token: string }): Promise<AuthSuccessBody> {
  const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseResponse<AuthSuccessBody>(res);
}

export async function postApple(body: {
  identity_token: string;
  user?: { name: string };
}): Promise<AuthSuccessBody> {
  const res = await fetch(`${API_BASE_URL}/api/auth/apple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseResponse<AuthSuccessBody>(res);
}

export async function postRefresh(refresh_token: string): Promise<RefreshBody> {
  const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token }),
  });
  return parseResponse<RefreshBody>(res);
}

export async function postForgotPassword(body: { email: string }): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseResponse<{ message: string }>(res);
}

export async function postResetPassword(body: {
  token: string;
  new_password: string;
}): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseResponse<{ message: string }>(res);
}

export async function postLogout(accessToken: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return parseResponse<{ message: string }>(res);
}

export async function getProfileMe(accessToken: string): Promise<ProfileMeBody> {
  const res = await fetch(`${API_BASE_URL}/api/profile/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return parseResponse<ProfileMeBody>(res);
}

export async function patchProfileMe(
  accessToken: string,
  body: {
    username?: string;
    bio?: string | null;
    language?: string;
    is_public?: boolean;
    display_name?: string | null;
    birth_date?: string | null;
    birth_date_public?: boolean;
    location_label?: string | null;
    saved_route_plans?: unknown[];
  },
): Promise<{ profile: ProfileMeBody['profile'] }> {
  const res = await fetch(`${API_BASE_URL}/api/profile/me`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return parseResponse<{ profile: ProfileMeBody['profile'] }>(res);
}

/** Завантаження аватара (multipart); сервер зберігає файл (у проді можна замінити на S3). */
export async function postProfileAvatar(
  accessToken: string,
  localUri: string,
  mimeType: string,
): Promise<{ avatar_url: string }> {
  const name =
    mimeType.includes('png') ? 'avatar.png' : mimeType.includes('webp') ? 'avatar.webp' : 'avatar.jpg';
  const form = new FormData();
  form.append('file', { uri: localUri, name, type: mimeType } as unknown as Blob);
  const res = await fetch(`${API_BASE_URL}/api/profile/me/avatar`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });
  return parseResponse<{ avatar_url: string }>(res);
}

/** Видалення аватара на сервері та локального файлу в сховищі бекенду. */
export async function deleteProfileAvatar(accessToken: string): Promise<{ avatar_url: null }> {
  const res = await fetch(`${API_BASE_URL}/api/profile/me/avatar`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return parseResponse<{ avatar_url: null }>(res);
}

export async function postBillingVerify(
  accessToken: string,
  body: BillingVerifyBody,
): Promise<BillingVerifyResponse> {
  const res = await fetch(`${API_BASE_URL}/api/billing/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  return parseResponse<BillingVerifyResponse>(res);
}

export type BillingCancelFeedbackBody = {
  previous_plan: 'explorer' | 'pro' | 'family';
  reason_codes: string[];
  comment?: string | null;
  app_language?: string | null;
};

export async function postBillingCancelFeedback(
  accessToken: string,
  body: BillingCancelFeedbackBody,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE_URL}/api/billing/cancel-feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  return parseResponse<{ ok: boolean }>(res);
}

export type AdminSubscriptionCancelFeedbackRow = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  previous_plan: string;
  reason_codes: string[];
  comment: string | null;
  app_language: string | null;
  created_at: string;
};

export async function getAdminSubscriptionCancelFeedback(
  accessToken: string,
  limit = 80,
): Promise<{ items: AdminSubscriptionCancelFeedbackRow[] }> {
  const q = new URLSearchParams();
  q.set('limit', String(limit));
  const res = await fetch(`${API_BASE_URL}/api/admin/subscription-cancel-feedback?${q.toString()}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseResponse<{ items: AdminSubscriptionCancelFeedbackRow[] }>(res);
}

export type AdminUserSearchRow = {
  user_id: string;
  email: string;
  username: string | null;
  plan_type: string | null;
  expires_at: string | null;
  payment_provider: string | null;
};

export async function getAdminUsersSearch(
  accessToken: string,
  q: string,
): Promise<{ users: AdminUserSearchRow[] }> {
  const res = await fetch(`${API_BASE_URL}/api/admin/users/search?q=${encodeURIComponent(q)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseResponse<{ users: AdminUserSearchRow[] }>(res);
}

export async function postAdminGrantSubscription(
  accessToken: string,
  body: {
    email: string;
    plan_type: 'free' | 'explorer' | 'pro' | 'family';
    duration_days: number;
    lifetime?: boolean;
  },
): Promise<{ ok: boolean; user_id: string; plan_type: string; expires_at: string | null }> {
  const res = await fetch(`${API_BASE_URL}/api/admin/subscriptions/grant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  return parseResponse<{ ok: boolean; user_id: string; plan_type: string; expires_at: string | null }>(res);
}
