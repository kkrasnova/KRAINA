import { AppState } from 'react-native';
import { API_BASE_URL } from './auth/config';

/**
 * Прогрів бекенду (Render free tier «засинає» після ~15 хв простою; перший запит будить
 * його 30–60 с). Щоб натискання відкривались швидко, ми:
 *   1) пінгуємо /health одразу на старті застосунку (поки видно заставку),
 *   2) тримаємо сервер «теплим» поки застосунок відкритий (пінг кожні ~10 хв),
 *   3) пінгуємо повторно щоразу, коли застосунок повертається з фону.
 *
 * Пінг легкий (GET /health) і fire-and-forget — ніколи не блокує UI.
 */

// Render free спить після 15 хв простою — пінгуємо з запасом.
const KEEP_WARM_INTERVAL_MS = 10 * 60 * 1000;
// Холодний старт може не відповісти з першого разу — кілька рознесених спроб.
const PREWARM_RETRY_DELAYS_MS = [0, 3000, 8000];

let keepWarmTimer = null;
let appStateSub = null;
let lastPingAt = 0;

function pingHealthOnce(timeoutMs = 20000) {
  const base = API_BASE_URL;
  if (!base) return;
  lastPingAt = Date.now();
  let controller = null;
  let timer = null;
  try {
    controller = new AbortController();
    timer = setTimeout(() => controller.abort(), timeoutMs);
  } catch {
    controller = null;
  }
  void fetch(`${base}/health`, {
    method: 'GET',
    ...(controller ? { signal: controller.signal } : {}),
  })
    .catch(() => {})
    .finally(() => {
      if (timer) clearTimeout(timer);
    });
}

/** Негайний прогрів на старті — кілька спроб, бо холодний сервер може не відповісти одразу. */
export function prewarmBackend() {
  for (const delay of PREWARM_RETRY_DELAYS_MS) {
    if (delay === 0) pingHealthOnce();
    else setTimeout(() => pingHealthOnce(), delay);
  }
}

/** Тримає сервер теплим, поки застосунок активний. Ідемпотентно — безпечно викликати кілька разів. */
export function startBackendKeepWarm() {
  if (keepWarmTimer == null) {
    keepWarmTimer = setInterval(() => {
      if (AppState.currentState === 'active') pingHealthOnce();
    }, KEEP_WARM_INTERVAL_MS);
  }
  if (appStateSub == null) {
    appStateSub = AppState.addEventListener('change', (state) => {
      // Повернення з фону: сервер міг заснути — будимо одразу (з невеликим дебаунсом).
      if (state === 'active' && Date.now() - lastPingAt > 60 * 1000) {
        pingHealthOnce();
      }
    });
  }
}

export function stopBackendKeepWarm() {
  if (keepWarmTimer != null) {
    clearInterval(keepWarmTimer);
    keepWarmTimer = null;
  }
  if (appStateSub != null) {
    appStateSub.remove?.();
    appStateSub = null;
  }
}
