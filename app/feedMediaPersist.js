import * as FileSystem from 'expo-file-system';

const MEDIA_DIR = `${FileSystem.documentDirectory || ''}kraina_feed_media/`;

function extFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('quicktime') || m === 'video/quicktime') return 'mov';
  if (m.startsWith('video/')) return 'mp4';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.startsWith('image/')) return 'jpg';
  return null;
}

/**
 * Копіює медіа у sandbox застосунку (фото чи відео), щоб file:// не зник після очищення тимчасових файлів.
 * @param {{ mimeType?: string }} [options] — з ImagePicker / MediaLibrary, якщо в URI немає розширення (.mp4 тощо).
 */
export async function persistCapturedImage(uri, options) {
  if (!uri || typeof uri !== 'string') return null;
  const base = FileSystem.documentDirectory;
  if (!base) return uri;

  const fromInfo = await FileSystem.getInfoAsync(uri, { size: false }).catch(() => null);
  if (!fromInfo?.exists) return uri;

  const mimeExt = extFromMime(options?.mimeType);
  const u = uri.toLowerCase();
  const ext =
    mimeExt ||
    (u.includes('.mp4') || u.includes('.m4v')
      ? 'mp4'
      : u.includes('.mov')
        ? 'mov'
        : u.includes('.png')
          ? 'png'
          : u.includes('.webp')
            ? 'webp'
            : 'jpg');

  await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true }).catch(() => {});

  const dest = `${MEDIA_DIR}feed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  try {
    await FileSystem.copyAsync({ from: uri, to: dest });
    const toInfo = await FileSystem.getInfoAsync(dest, { size: false }).catch(() => null);
    if (!toInfo?.exists) return uri;
    return dest;
  } catch {
    return uri;
  }
}

export async function persistManyUris(uris) {
  const out = [];
  for (const u of uris) {
    if (!u) continue;
    const p = await persistCapturedImage(u);
    if (p) out.push(p);
  }
  return out;
}
