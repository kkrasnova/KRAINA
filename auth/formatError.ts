import { ApiError } from './types';

const ERROR_MESSAGES: Record<string, string> = {
  email_taken: 'Цей email вже зареєстрований.',
  username_taken: 'Цей нікнейм вже зайнятий. Оберіть інший.',
  invalid_credentials: 'Невірний email або пароль.',
  invalid_email: 'Невірний формат email.',
  invalid_username: 'Нікнейм: 3-32 символи, латиниця, цифри або _.',
  weak_password: 'Пароль: мінімум 8 символів і хоча б одна цифра.',
  account_banned: 'Акаунт заблоковано.',
  token_invalid: 'Недійсний токен. Запросіть новий.',
  token_expired: 'Токен застарів. Запросіть новий.',
  rate_limited: 'Забагато спроб. Зачекайте хвилину й спробуйте знову.',
  invalid_token: 'Помилка автентифікації. Спробуйте ще раз.',
  username_generation_failed: 'Не вдалося згенерувати нікнейм. Спробуйте пізніше.',
};

export function formatAuthError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429 || e.payload.error === 'rate_limited') {
      return ERROR_MESSAGES.rate_limited;
    }
    if (e.payload.error === 'account_banned') {
      return e.payload.ban_reason
        ? `Акаунт заблоковано: ${e.payload.ban_reason}`
        : ERROR_MESSAGES.account_banned;
    }
    const code = e.payload.error;
    if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
    return code ?? e.message;
  }
  if (e instanceof TypeError && e.message.includes('Network')) {
    return 'Немає зʼєднання з сервером. Перевірте інтернет і спробуйте знову.';
  }
  if (e instanceof Error) return e.message;
  return 'Сталася невідома помилка. Спробуйте ще раз.';
}
