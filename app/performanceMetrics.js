/**
 * Performance Metrics — автоматичний збір метрик продуктивності.
 *
 * Використовує react-native-performance (W3C Performance API) для:
 * - Вимірювання часу холодного старту
 * - Вимірювання тривалості bootstrap (завантаження сесії, ініціалізація)
 * - Вимірювання часу до першого рендера
 * - Відстеження ресурсів (HTTP-запитів)
 * - Збору native метрик (час до інтерактивності, frame drops)
 *
 * У __DEV__ режимі виводить метрики в консоль.
 * У production — зберігає в пам'яті для подальшої відправки на сервер.
 */

/** Нативний модуль опційний (на Android без codegen — лише JS-заглушка). */
const noopPerformance = {
  mark() {},
  measure() {},
  metric() {},
  getEntriesByName() {
    return [];
  },
  clearMarks() {},
  clearMeasures() {},
  clearMetrics() {},
};

let performance = noopPerformance;
let PerformanceObserver = class {
  observe() {}
};
let setResourceLoggingEnabled = () => {};

try {
  const perfMod = require('react-native-performance');
  performance = perfMod.default || perfMod;
  PerformanceObserver = perfMod.PerformanceObserver || PerformanceObserver;
  setResourceLoggingEnabled = perfMod.setResourceLoggingEnabled || setResourceLoggingEnabled;
} catch {
  /* native module unavailable — keep no-op stubs */
}

/** Скільки останніх метрик зберігати в буфері */
const METRICS_BUFFER_SIZE = 100;

/** Кількість зібраних метрик (для логування) */
let metricCount = 0;

/** Буфер останніх метрик для експорту */
const metricsBuffer = [];

/**
 * Додати запис у внутрішній буфер.
 * @param {string} name
 * @param {object} entry
 */
function pushToBuffer(name, entry) {
  metricCount++;
  metricsBuffer.push({
    name,
    entryType: entry.entryType,
    startTime: entry.startTime,
    duration: entry.duration,
    value: entry.value,
    ts: Date.now(),
  });
  if (metricsBuffer.length > METRICS_BUFFER_SIZE) {
    metricsBuffer.shift();
  }
}

/**
 * Ініціалізувати PerformanceObserver для збору всіх типів метрик.
 */
function setupObservers() {
  try {
    // Спостерігаємо за всіма кастомними метриками
    const metricObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        pushToBuffer(entry.name, entry);
        if (__DEV__) {
          if (entry.entryType === 'metric') {
            console.log(
              `[Perf] ${entry.name} = ${entry.value}` +
                (entry.duration ? ` (${entry.duration.toFixed(1)}ms)` : ''),
            );
          }
        }
      }
    });
    metricObserver.observe({ entryTypes: ['mark', 'measure', 'metric'] });

    // Спостерігаємо за native React Native маркерами
    const nativeObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        pushToBuffer(entry.name, entry);
        if (__DEV__) {
          console.log(
            `[Perf] [RN] ${entry.name}: start=${entry.startTime.toFixed(1)}`,
          );
        }
      }
    });
    nativeObserver.observe({ entryTypes: ['react-native-mark'] });

    // Включаємо логування ресурсів (HTTP)
    setResourceLoggingEnabled(true);

    if (__DEV__) {
      const resourceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          pushToBuffer(entry.name, entry);
          console.log(
            `[Perf] [HTTP] ${entry.name}: ${entry.duration.toFixed(0)}ms`,
          );
        }
      });
      resourceObserver.observe({ entryTypes: ['resource'] });

      console.log('[Perf] Performance observers initialized');
    }
  } catch (e) {
    if (__DEV__) {
      console.warn('[Perf] Failed to setup observers:', e?.message);
    }
  }
}

/**
 * Позначити початок фази.
 * @param {string} name
 */
export function markStart(name) {
  try {
    performance.mark(`${name}_start`);
  } catch {
    /* silently fail if performance API not ready */
  }
}

/**
 * Позначити кінець фази і створити вимірювання.
 * @param {string} name
 */
export function markEnd(name) {
  try {
    const endMark = `${name}_end`;
    const startMark = `${name}_start`;
    performance.mark(endMark);
    performance.measure(name, startMark, endMark);
    if (__DEV__) {
      const entries = performance.getEntriesByName(name, 'measure');
      if (entries.length > 0) {
        const last = entries[entries.length - 1];
        console.log(`[Perf] ${name}: ${last.duration.toFixed(1)}ms`);
      }
    }
  } catch {
    /* silently fail */
  }
}

/**
 * Записати метрику з числовим значенням.
 * @param {string} name
 * @param {number|string} value
 */
export function recordMetric(name, value) {
  try {
    performance.metric(name, value);
  } catch {
    /* silently fail */
  }
}

/**
 * Отримати буфер зібраних метрик.
 */
export function getMetricsBuffer() {
  return metricsBuffer.slice(0);
}

/**
 * Отримати загальну кількість зібраних метрик.
 */
export function getMetricCount() {
  return metricCount;
}

/**
 * Очистити всі метрики.
 */
export function clearMetrics() {
  try {
    performance.clearMarks();
    performance.clearMeasures();
    performance.clearMetrics();
  } catch {
    /* silently fail */
  }
  metricsBuffer.length = 0;
  metricCount = 0;
}

/**
 * Ініціалізувати систему збору метрик продуктивності.
 * Викликати один раз на старті додатка.
 */
export function initPerformanceMetrics() {
  try {
    // Позначаємо старт додатка
    performance.mark('app_start');

    // Спостерігачі
    setupObservers();

    // Native метрики (від RN) автоматично приходять через emitter
    if (__DEV__) {
      console.log('[Perf] Performance monitoring initialized');
    }
  } catch (e) {
    if (__DEV__) {
      console.warn('[Perf] Failed to initialize:', e?.message);
    }
  }
}

/** Мінімальний час ре-рендеру для логування (ms) — ігнорувати мікро-рендери < 2ms */
const RENDER_LOG_THRESHOLD_MS = 2;

/** Дебаунс: не логувати той самий компонент частіше ніж раз на N ms */
const RENDER_LOG_DEBOUNCE_MS = 500;

/**
 * React Profiler onRender callback — логує час ре-рендеру.
 * Використовується разом з `<Profiler>` з `react`.
 *
 * @param {string} id
 * @param {'mount'|'update'|'nested-update'} phase
 * @param {number} actualDuration — фактичний час рендеру (ms)
 * @param {number} baseDuration — оцінка повного ре-рендеру без оптимізацій (ms)
 * @param {number} startTime
 * @param {number} commitTime
 */
const renderTimestamps = {};

export function onRenderCallback(
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
) {
  if (!__DEV__) return;

  // Дебаунс: не логувати той самий компонент надто часто
  const now = Date.now();
  const lastLog = renderTimestamps[id] || 0;
  if (now - lastLog < RENDER_LOG_DEBOUNCE_MS) return;

  // Ігнорувати мікро-рендери
  if (actualDuration < RENDER_LOG_THRESHOLD_MS) return;

  renderTimestamps[id] = now;

  // Записуємо метрику через react-native-performance
  try {
    performance.metric(`render:${id}`, {
      value: actualDuration,
      startTime,
      detail: { phase, baseDuration, commitTime },
    });
  } catch {
    /* silently fail */
  }

  // Логування в консоль
  const phaseIcon = phase === 'mount' ? '🟢' : phase === 'nested-update' ? '🔄' : '🔵';
  console.log(
    `[Perf] ${phaseIcon} [${id}] ${phase}` +
      ` — render: ${actualDuration.toFixed(2)}ms` +
      (actualDuration > 20 ? ' ⚠️ SLOW' : '') +
      (baseDuration > 0 ? ` (base: ${baseDuration.toFixed(1)}ms)` : ''),
  );
}

/**
 * React Profiler компонент-обгортка.
 * Активний лише в __DEV__ режимі. У production — null (без overhead).
 *
 * @param {{ id: string, children: React.ReactNode }} props
 */
let RenderProfiler;

if (__DEV__) {
  const { Profiler } = require('react');
  RenderProfiler = ({ id, children }) => (
    <Profiler id={id} onRender={onRenderCallback}>
      {children}
    </Profiler>
  );
} else {
  // У production — просто пропускаємо дітей без Profiler
  RenderProfiler = ({ children }) => children;
}

export { RenderProfiler };

export default {
  initPerformanceMetrics,
  markStart,
  markEnd,
  recordMetric,
  getMetricsBuffer,
  getMetricCount,
  clearMetrics,
  RenderProfiler,
  onRenderCallback,
};
