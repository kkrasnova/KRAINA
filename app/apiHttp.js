import axios from 'axios';
import { API_BASE_URL } from './auth/config';

/**
 * Спільний клієнт для REST KRAÏNA (звіт: приклад виклику API через axios).
 * baseURL без завершального слеша — шляхи починаються з `/api/...`.
 */
export const apiHttp = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    Accept: 'application/json',
  },
});
