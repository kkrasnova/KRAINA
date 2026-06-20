import { Platform } from 'react-native';
import { Asset } from 'expo-asset';

const SPLASH_TITLE_VIDEO_IOS = require('./assets/kraina-splash-ios.mp4');
const SPLASH_TITLE_VIDEO_ANDROID = require('./assets/kraina-splash-android.mp4');

export const SPLASH_TITLE_VIDEO_MODULE =
  Platform.OS === 'android' ? SPLASH_TITLE_VIDEO_ANDROID : SPLASH_TITLE_VIDEO_IOS;

let cachedLocalUri = null;
let preloadPromise = null;

/**
 * Metro у dev не віддає Accept-Ranges для mp4 — AVPlayer показує 1-й кадр і зависає.
 * Завантажуємо відео в file:// кеш до старту плеєра.
 */
export async function preloadSplashTitleVideo() {
  if (cachedLocalUri) return cachedLocalUri;
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    const asset = Asset.fromModule(SPLASH_TITLE_VIDEO_MODULE);
    await asset.downloadAsync();
    const localUri = asset.localUri;
    if (!localUri || !localUri.startsWith('file://')) {
      throw new Error('[SplashTitleVideo] local file URI unavailable after downloadAsync');
    }
    cachedLocalUri = localUri;
    return localUri;
  })();

  try {
    return await preloadPromise;
  } catch (error) {
    preloadPromise = null;
    throw error;
  }
}

/** Стартує preload одразу при імпорті модуля. */
export const splashTitleVideoReady = preloadSplashTitleVideo();
