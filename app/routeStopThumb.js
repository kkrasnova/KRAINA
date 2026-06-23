import { Image } from 'react-native';

const FALLBACK = require('./assets/Frame 23.webp');

/** @param {number | { uri: string } | null | undefined} thumb */
export function routeStopImageSource(thumb) {
  if (thumb && typeof thumb === 'object' && typeof thumb.uri === 'string' && thumb.uri.trim()) {
    return { uri: thumb.uri.trim() };
  }
  if (typeof thumb === 'number') return thumb;
  return FALLBACK;
}

/** Для resolveAssetSource (лише локальні asset). */
export function routeStopAssetMeta(thumb) {
  const src = routeStopImageSource(thumb);
  if (src && typeof src === 'object' && src.uri) {
    return { uri: src.uri, width: 96, height: 96 };
  }
  try {
    return Image.resolveAssetSource(src) || { width: 96, height: 96 };
  } catch {
    return { width: 96, height: 96 };
  }
}
