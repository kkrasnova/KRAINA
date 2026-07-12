/**
 * Аудіогід за URL (CDN / S3 / статика): кеш у FileSystem.cacheDirectory, повторне відтворення з диска.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { sha256 } from 'js-sha256';

const DIR = `${FileSystem.cacheDirectory}kraina_audioguides/`;

function extFromUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\.(m4a|mp3|aac|wav|ogg)$/i);
    return m ? `.${m[1].toLowerCase()}` : '.m4a';
  } catch {
    return '.m4a';
  }
}

export async function ensureAudioCacheDir() {
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
}

/**
 * Повертає локальний file:// URI для відтворення (завантажує з мережі при першому зверненні).
 */
export async function getCachedOrRemoteAudioUri(remoteUrl) {
  const url = String(remoteUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) return url;

  await ensureAudioCacheDir();
  const hash = sha256(url);
  const ext = extFromUrl(url);
  const localPath = `${DIR}${hash.slice(0, 32)}${ext}`;

  const info = await FileSystem.getInfoAsync(localPath);
  if (info.exists) return localPath;

  const { uri, status } = await FileSystem.downloadAsync(url, localPath);
  if (status !== 200) {
    await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
    throw new Error(`audio_download_${status}`);
  }
  return uri;
}

const prefetchInflight = new Map();

/** Прогріває аудіогід у фоні (дедуплікація). */
export function prefetchAudioGuideUrl(remoteUrl) {
  const url = String(remoteUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) return Promise.resolve(url || null);
  if (prefetchInflight.has(url)) return prefetchInflight.get(url);
  const promise = getCachedOrRemoteAudioUri(url).finally(() => {
    prefetchInflight.delete(url);
  });
  prefetchInflight.set(url, promise);
  return promise;
}

/** Видалити один закешований файл за URL (опційно). */
export async function deleteCachedAudioForUrl(remoteUrl) {
  const url = String(remoteUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) return;
  try {
    const hash = sha256(url);
    const ext = extFromUrl(url);
    const localPath = `${DIR}${hash.slice(0, 32)}${ext}`;
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists) await FileSystem.deleteAsync(localPath, { idempotent: true });
  } catch {
    /* */
  }
}
