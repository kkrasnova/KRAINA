import * as FileSystem from 'expo-file-system/legacy';

const MEDIA_DIR = `${FileSystem.documentDirectory || ''}kraina_feed_media/`;
const FILE_B64 = FileSystem.EncodingType?.Base64 ?? 'base64';

function isSandboxFileUri(uri) {
  const u = normalizeLocalFileUri(uri);
  return !!u && u.startsWith('file://');
}

/** Копіює URI (file:// або content://) у sandbox — потрібно для multipart upload на Android. */
async function copyUriToSandbox(fromUri, destPath) {
  const normalized = normalizeLocalFileUri(fromUri);
  if (!normalized) return false;
  try {
    await FileSystem.copyAsync({ from: normalized, to: destPath });
    const info = await FileSystem.getInfoAsync(destPath, { size: false }).catch(() => null);
    if (info?.exists) return true;
  } catch {
    /* copyAsync часто не працює з content:// на Android */
  }
  try {
    const b64 = await FileSystem.readAsStringAsync(normalized, { encoding: FILE_B64 });
    if (!b64) return false;
    await FileSystem.writeAsStringAsync(destPath, b64, { encoding: FILE_B64 });
    const info = await FileSystem.getInfoAsync(destPath, { size: false }).catch(() => null);
    return !!info?.exists;
  } catch {
    return false;
  }
}

function extFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('quicktime') || m === 'video/quicktime') return 'mov';
  if (m.startsWith('video/')) return 'mp4';
  if (m.includes('caf')) return 'caf';
  if (m.includes('aac')) return 'aac';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  if (m.startsWith('audio/')) return 'm4a';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.startsWith('image/')) return 'jpg';
  return null;
}

function extFromUri(uri) {
  const u = String(uri || '').toLowerCase();
  if (u.includes('.caf')) return 'caf';
  if (u.includes('.aac')) return 'aac';
  if (u.includes('.mp3')) return 'mp3';
  if (u.includes('.wav')) return 'wav';
  if (u.includes('.m4a')) return 'm4a';
  if (u.includes('.mp4') || u.includes('.m4v')) return 'mp4';
  if (u.includes('.mov')) return 'mov';
  if (u.includes('.png')) return 'png';
  if (u.includes('.webp')) return 'webp';
  return null;
}

function isHeicLike(uri, mimeType = '') {
  const mime = String(mimeType || '').toLowerCase();
  const lower = String(uri || '').toLowerCase();
  return mime.includes('heic') || mime.includes('heif') || /\.heic|\.heif(\?|$)/i.test(lower);
}

/** ph:// / assets-library:// → file:// через MediaLibrary (iOS Photos). */
async function resolveReadableMediaUri(uri, options = {}) {
  let normalized = normalizeLocalFileUri(uri);
  if (!normalized) return null;

  const needsResolve =
    normalized.startsWith('ph://') ||
    normalized.startsWith('assets-library://') ||
    !!options?.assetId;

  if (needsResolve) {
    try {
      const MediaLibrary = require('expo-media-library');
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) return null;
      const assetRef = options.assetId || normalized;
      const info = await MediaLibrary.getAssetInfoAsync(assetRef, {
        shouldDownloadFromNetwork: true,
      });
      const resolved = info?.localUri || info?.uri;
      if (resolved) normalized = normalizeLocalFileUri(resolved);
    } catch {
      /* MediaLibrary may be unavailable before permission grant */
    }
  }

  return normalized;
}

/** Лише file:// з непорожнім файлом — придатний для multipart upload. */
export async function ensureUploadableImageUri(uri, options = {}) {
  const persisted = await persistCapturedImage(uri, options);
  const candidates = [];
  if (persisted) candidates.push(persisted);
  const normalized = normalizeLocalFileUri(uri);
  if (normalized && !candidates.includes(normalized)) candidates.push(normalized);

  for (const candidate of candidates) {
    if (!isSandboxFileUri(candidate)) continue;
    const info = await FileSystem.getInfoAsync(candidate, { size: true }).catch(() => null);
    if (info?.exists && info.size > 0) return candidate;
  }
  return null;
}

/**
 * Копіює медіа у sandbox застосунку (фото чи відео), щоб file:// не зник після очищення тимчасових файлів.
 * @param {{ mimeType?: string, assetId?: string }} [options] — з ImagePicker / MediaLibrary.
 */
export async function persistCapturedImage(uri, options) {
  if (!uri || typeof uri !== 'string') return null;
  const readable = await resolveReadableMediaUri(uri, options);
  if (!readable) return null;
  const normalized = normalizeLocalFileUri(readable);
  if (isPersistedFeedMediaUri(normalized)) return normalized;
  const base = FileSystem.documentDirectory;
  if (!base) return normalized;

  const forceJpeg = isHeicLike(normalized, options?.mimeType);
  const mimeExt = forceJpeg ? 'jpg' : extFromMime(options?.mimeType);
  const ext = mimeExt || extFromUri(readable) || 'jpg';

  await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true }).catch(() => {});

  const dest = `${MEDIA_DIR}feed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const copied = await copyUriToSandbox(normalized, dest);
  if (copied) {
    const out = normalizeLocalFileUri(dest);
    const info = await FileSystem.getInfoAsync(out, { size: true }).catch(() => null);
    if (info?.exists && info.size > 0) return out;
  }

  // Лише file:// можна віддати на upload; content:// / ph:// multipart не приймає.
  if (isSandboxFileUri(normalized)) {
    const fromInfo = await FileSystem.getInfoAsync(normalized, { size: true }).catch(() => null);
    if (fromInfo?.exists && fromInfo.size > 0) return normalized;
  }

  return null;
}

export function normalizeLocalFileUri(uri) {
  const u = String(uri || '').trim();
  if (!u) return '';
  if (u.startsWith('file://') || u.startsWith('content://') || u.startsWith('ph://')) return u;
  if (u.startsWith('/')) return `file://${u}`;
  return u;
}

/** URI вже в sandbox застосунку — повторне копіювання не потрібне. */
export function isPersistedFeedMediaUri(uri) {
  const u = normalizeLocalFileUri(uri);
  if (!u) return false;
  if (u.includes('kraina_feed_media/')) return true;
  const base = FileSystem.documentDirectory;
  return !!(base && u.startsWith(base));
}

/** Копіює записане голосове в sandbox, поки тимчасовий файл expo-audio ще доступний. */
export async function persistCapturedAudio(uri, options = {}) {
  if (!uri || typeof uri !== 'string') return null;
  const base = FileSystem.documentDirectory;
  if (!base) return uri;

  const fromInfo = await FileSystem.getInfoAsync(uri, { size: true }).catch(() => null);
  if (!fromInfo?.exists || !(fromInfo.size > 0)) return null;

  const ext = extFromMime(options?.mimeType) || extFromUri(uri) || 'm4a';

  await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true }).catch(() => {});

  const dest = `${MEDIA_DIR}voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  try {
    await FileSystem.copyAsync({ from: uri, to: dest });
    const toInfo = await FileSystem.getInfoAsync(dest, { size: true }).catch(() => null);
    if (!toInfo?.exists || !(toInfo.size > 0)) return null;
    return dest;
  } catch {
    return null;
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
