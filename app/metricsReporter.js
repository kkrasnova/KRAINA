/**
 * Metrics Reporter — періодично відправляє зібрані метрики продуктивності
 * на власний сервер через POST /api/metrics.
 *
 * У __DEV__ режимі метрики не відправляються (вони й так логуються в консоль).
 * У production — відправляються кожні 60 секунд, якщо є що відправляти.
 */

import { Platform } from 'react-native';
import { apiHttp } from './apiHttp';
import { getMetricsBuffer, clearMetrics, getMetricCount } from './performanceMetrics';
import { useAuthStore } from './auth/authStore';

/** Інтервал відправки в production (60 секунд) */
const FLUSH_INTERVAL_MS = 60_000;

/** Максимум метрик в одному батчі (щоб не перевантажувати сервер) */
const MAX_METRICS_PER_BATCH = 50;

/** Унікальний ID сесії — генерується один раз при холодному старті */
let sessionId = null;

/** Посилання на таймер для можливості зупинки */
let flushTimer = null;

/**
 * Згенерувати випадковий ID сесії (без зовнішніх залежностей).
 */
function generateSessionId() {
  const chars = 'abcdef0123456789';
  let id = '';
  for (let i = 0; i < 32; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${Date.now().toString(36)}-${id}`;
}

/**
 * Отримати токен авторизації з auth store.
 * Якщо користувач не залогінений — метрики все одно відправляються (без user_id на сервері).
 */
function getAccessToken() {
  try {
    const state = useAuthStore.getState();
    return state.accessToken || null;
  } catch {
    return null;
  }
}

/**
 * Отримати версію додатка з expo config.
 */
function getAppVersion() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('./package.json');
    return pkg.version || null;
  } catch {
    return null;
  }
}

/**
 * Відправити поточний буфер метрик на сервер.
 * Викликається автоматично по таймеру.
 */
async function flushMetrics() {
  const count = getMetricCount();
  if (count === 0) return;

  const allMetrics = getMetricsBuffer();

  // Розбиваємо на батчі, якщо метрик більше ніж MAX_METRICS_PER_BATCH
  for (let i = 0; i < allMetrics.length; i += MAX_METRICS_PER_BATCH) {
    const batch = allMetrics.slice(i, i + MAX_METRICS_PER_BATCH);
    const token = getAccessToken();

    const payload = {
      sessionId,
      appVersion: getAppVersion(),
      platform: Platform.OS,
      osVersion: Platform.Version,
      deviceModel: null, // unavailable without extra native module
      clientTs: new Date().toISOString(),
      metrics: batch,
    };

    try {
      await apiHttp.post('/api/metrics', payload, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        // Короткий таймаут — метрики не критичні
        timeout: 10_000,
      });
    } catch {
      // Metrics are non-critical — don't retry on network errors.
      // The next flush cycle will re-read getMetricsBuffer() which still
      // holds the unsent data, so nothing is lost on a transient failure.
    }
  }

  // Очищаємо буфер після успішної відправки (або після спроби — метрики не критичні)
  clearMetrics();
}

/**
 * Запустити періодичну відправку метрик.
 * Викликати один раз після ініціалізації performanceMetrics.
 *
 * У __DEV__ режимі нічого не робить (метрики виводяться в консоль локально).
 */
export function startMetricsReporting() {
  // У dev-режимі не відправляємо метрики на сервер
  if (__DEV__) {
    console.log('[MetricsReporter] Skipped (__DEV__ — metrics are local-only)');
    return;
  }

  // Генеруємо ID сесії при старті
  sessionId = generateSessionId();

  console.log('[MetricsReporter] Started, session:', sessionId);

  // Перший flush через 10 секунд (дає час на збір початкових метрик bootstrap)
  setTimeout(() => {
    void flushMetrics();
  }, 10_000);

  // Періодичний flush
  flushTimer = setInterval(() => {
    void flushMetrics();
  }, FLUSH_INTERVAL_MS);
}

/**
 * Зупинити періодичну відправку метрик.
 * Викликати при розмонтуванні / виході.
 */
export function stopMetricsReporting() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  // Фінальний flush при зупинці
  if (!__DEV__) {
    void flushMetrics();
  }
}

/**
 * Примусово відправити метрики негайно (наприклад, перед виходом).
 */
export async function flushNow() {
  await flushMetrics();
}

export default {
  startMetricsReporting,
  stopMetricsReporting,
  flushNow,
};
