export interface UserDTO {
  id: string;
  email: string;
  role: string;
  status: string;
}

export interface AuthSuccessBody {
  user: UserDTO;
  access_token: string;
  refresh_token: string;
}

export interface RefreshBody {
  access_token: string;
  refresh_token: string;
}

export interface ProfileDTO {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  language: string;
  /** Можуть бути відсутні на старому бекенді до міграції. */
  display_name?: string | null;
  birth_date?: string | null;
  birth_date_public?: boolean;
  location_label?: string | null;
  xp_points: number;
  level: number;
  is_public: boolean;
  locations_visited: number;
  routes_created: number;
  followers_count: number;
  following_count: number;
  created_at: string;
  updated_at: string;
  /** З сервера після міграції 022; локально дзеркалиться в AsyncStorage. */
  saved_route_plans?: unknown[];
  /** Вибрана країна у профілі. Дзеркалиться в AsyncStorage через countryStorage. */
  countryId?: string | null;
  /** Тогл синхронізації кроків (HealthKit / Health Connect). Дзеркалиться в AsyncStorage через stepSyncStorage. */
  stepSyncEnabled?: boolean;
  /** Налаштування нагадування про прогулянку. Дзеркалиться в AsyncStorage через walkReminderStorage. */
  walkReminder?: {
    enabled: boolean;
    hour: number;
    minute: number;
  };
}

export interface SubscriptionDTO {
  plan_type: string;
  billing_period: string | null;
  is_active: boolean;
  expires_at: string | null;
  payment_provider: string | null;
}

export interface ProfileMeBody {
  profile: ProfileDTO;
  subscription: SubscriptionDTO;
  usage: Record<string, unknown>;
}

export type BillingVerifyBody =
  | {
      platform: 'ios';
      productId?: string;
      appReceiptBase64: string;
    }
  | {
      platform: 'android';
      productId: string;
      purchaseToken: string;
    };

export interface BillingVerifyResponse {
  subscription: SubscriptionDTO;
}

export type ApiErrorPayload = {
  error?: string;
  message?: string;
  /** Може бути в відповіді 403 account_banned */
  ban_reason?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly payload: ApiErrorPayload;

  constructor(status: number, payload: ApiErrorPayload, message?: string) {
    super(message ?? payload.error ?? payload.message ?? `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}
