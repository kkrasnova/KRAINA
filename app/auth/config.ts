import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

const fromEnv =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_KRAINA_API_URL
    ? String(process.env.EXPO_PUBLIC_KRAINA_API_URL).replace(/\/$/, '')
    : '';

const DEFAULT_LOCAL = 'http://localhost:3000';

function isLoopbackHost(url: string) {
  return /^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
}

/** Host from Metro bundle URL (e.g. http://192.168.1.5:8081/...). Works on physical devices when debuggerHost is missing. */
function hostFromScriptUrl(): string {
  try {
    const scriptURL = NativeModules?.SourceCode?.scriptURL as string | undefined;
    if (!scriptURL || typeof scriptURL !== 'string') return '';
    const m = scriptURL.match(/^https?:\/\/([^/:?]+)/i);
    if (!m) return '';
    const host = m[1];
    if (!host || host === 'localhost' || host === '127.0.0.1') return '';
    return host;
  } catch {
    return '';
  }
}

/** IP або hostname Mac у локальній мережі (без `http://`). Для фізичного iPhone/Android при `localhost` у .env. */
function devLanHost(): string {
  const fromDotEnv =
    typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEV_LAN_HOST
      ? String(process.env.EXPO_PUBLIC_DEV_LAN_HOST).trim()
      : '';
  if (fromDotEnv) return fromDotEnv.replace(/^https?:\/\//i, '').replace(/\/$/, '');

  const dbg =
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string }; debuggerHost?: string })
      .expoGoConfig?.debuggerHost ||
    (Constants as unknown as { debuggerHost?: string }).debuggerHost;
  if (dbg && typeof dbg === 'string') {
    const host = dbg.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') return host;
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri && typeof hostUri === 'string') {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') return host;
  }

  const fromBundle = hostFromScriptUrl();
  if (fromBundle) return fromBundle;

  return '';
}

/** Android emulator: `localhost` is the emulator itself; host machine API is 10.0.2.2. */
function mapAndroidEmulatorLoopback(url: string): string {
  if (Platform.OS !== 'android' || !__DEV__ || Constants.isDevice || !isLoopbackHost(url)) {
    return url;
  }
  return url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?/i, (_, proto: string, __, port: string | undefined) => {
    const p = port && port.length > 0 ? port : ':3000';
    return `${proto}10.0.2.2${p}`;
  });
}

function resolveBaseUrl(raw: string): string {
  let url = raw || DEFAULT_LOCAL;
  url = mapAndroidEmulatorLoopback(url);
  if (isLoopbackHost(url) && Constants.isDevice) {
    const host = devLanHost();
    if (host) {
      url = url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)/i, (_, proto: string) => `${proto}${host}`);
    }
  }
  return url.replace(/\/$/, '');
}

/**
 * Базовий URL бекенду (без завершального слеша).
 * На фізичному пристрої `localhost` замінюється на: EXPO_PUBLIC_DEV_LAN_HOST → debugger host →
 * expo hostUri → IP з Metro `SourceCode.scriptURL`.
 */
export const API_BASE_URL = resolveBaseUrl(fromEnv || DEFAULT_LOCAL);

/**
 * Normalizes backend-provided absolute URLs that still point to localhost/127.0.0.1.
 * This keeps media links usable on Android emulator and physical devices.
 */
export function normalizeBackendAssetUrl(rawUrl: string): string {
  const input = String(rawUrl || '').trim();
  if (!input) return input;
  if (!/^https?:\/\//i.test(input)) return input;
  try {
    const parsed = new URL(input);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'localhost' && host !== '127.0.0.1') return input;
    const base = new URL(API_BASE_URL);
    parsed.protocol = base.protocol;
    parsed.hostname = base.hostname;
    parsed.port = base.port;
    return parsed.toString();
  } catch {
    return input;
  }
}
