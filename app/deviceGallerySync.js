import { AppState, DeviceEventEmitter } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';

export const KRAINA_DEVICE_GALLERY_CHANGED = 'kraina_device_gallery_changed_v1';

const DEFAULT_LIMIT = 24;

/** Запит доступу до фотогалереї (Apple Photos / Google Photos на пристрої). */
export async function requestDeviceGalleryAccess() {
  try {
    await ImagePicker.requestMediaLibraryPermissionsAsync();
  } catch {
    /* */
  }
  try {
    const r = await MediaLibrary.requestPermissionsAsync(false);
    return r?.status === 'granted' || r?.granted === true;
  } catch {
    return false;
  }
}

/** Локальний URI для iCloud / Google Photos (завантаження в мережі, якщо потрібно). */
export async function resolveDeviceAssetUri(asset) {
  if (!asset) return null;
  try {
    const info = await MediaLibrary.getAssetInfoAsync(asset, {
      shouldDownloadFromNetwork: true,
    });
    return info?.localUri || info?.uri || asset.uri || null;
  } catch {
    return asset.uri || null;
  }
}

/**
 * Останні фото/відео з галереї пристрою (Apple Photos, Google Photos sync).
 * @returns {Promise<{ granted: boolean, items: Array<{ id: string, uri: string, thumbUri: string, isVideo: boolean, creationTime: number }> }>}
 */
export async function fetchDeviceGalleryPreview({ limit = DEFAULT_LIMIT, quickThumbs = false } = {}) {
  const granted = await requestDeviceGalleryAccess();
  if (!granted) return { granted: false, items: [] };

  let assets = [];
  try {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      first: Math.max(1, Math.min(limit, 60)),
      sortBy: MediaLibrary.SortBy.creationTime,
    });
    assets = Array.isArray(page?.assets) ? page.assets : [];
  } catch {
    return { granted: true, items: [] };
  }

  const items = [];
  for (const asset of assets) {
    const uri = quickThumbs
      ? asset.uri || null
      : await resolveDeviceAssetUri(asset);
    if (!uri) continue;
    items.push({
      id: String(asset.id),
      uri,
      thumbUri: asset.uri || uri,
      isVideo: asset.mediaType === MediaLibrary.MediaType.video,
      creationTime: Number(asset.creationTime) || 0,
    });
  }
  return { granted: true, items };
}

export function emitDeviceGalleryChanged() {
  try {
    DeviceEventEmitter.emit(KRAINA_DEVICE_GALLERY_CHANGED);
  } catch {
    /* */
  }
}

/** Підписка на оновлення галереї при поверненні в застосунок. */
export function subscribeDeviceGalleryAppState(onRefresh) {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') onRefresh();
  });
  return () => sub.remove();
}
