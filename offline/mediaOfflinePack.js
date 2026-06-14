import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { buildSnapshotFromRuntime } from '../adminLocationData';
import { getIsOnline } from './networkStatus';
import { mergeOfflineMediaMap, setOfflineBundleMeta } from './localCacheStore';

const OFFLINE_MEDIA_DIR = `${FileSystem.documentDirectory}offline-media/`;

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function collectMediaUris() {
  const snapshot = buildSnapshotFromRuntime();
  const uris = [];
  Object.values(snapshot.homeCountryHeroUris || {}).forEach((u) => uris.push(String(u || '').trim()));
  Object.values(snapshot.regions || {}).forEach((region) => {
    uris.push(String(region.heroUri || '').trim());
    (region.landmarks || []).forEach((lm) => {
      uris.push(String(lm.thumbUri || '').trim());
      if (Array.isArray(lm.galleryUris)) lm.galleryUris.forEach((u) => uris.push(String(u || '').trim()));
      const story = lm.story && typeof lm.story === 'object' ? lm.story : null;
      if (story?.audioUri) uris.push(String(story.audioUri).trim());
      if (story?.beforeAfter?.oldUri) uris.push(String(story.beforeAfter.oldUri).trim());
      if (story?.beforeAfter?.newUri) uris.push(String(story.beforeAfter.newUri).trim());
      if (story?.photoFact?.bgUri) uris.push(String(story.photoFact.bgUri).trim());
    });
  });
  return uniq(uris);
}

function isRemoteUri(uri) {
  return /^https?:\/\//i.test(String(uri || '').trim());
}

async function ensureDir() {
  await FileSystem.makeDirectoryAsync(OFFLINE_MEDIA_DIR, { intermediates: true }).catch(() => {});
}

function extFromUri(uri) {
  const m = String(uri || '').match(/\.(jpg|jpeg|png|webp|mp3|m4a|aac|wav|ogg|mp4|mov)(\?.*)?$/i);
  return m ? `.${m[1].toLowerCase()}` : '.bin';
}

async function cacheRemoteUri(remoteUri) {
  if (!isRemoteUri(remoteUri)) return '';
  await ensureDir();
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, remoteUri);
  const localPath = `${OFFLINE_MEDIA_DIR}${hash.slice(0, 32)}${extFromUri(remoteUri)}`;
  const info = await FileSystem.getInfoAsync(localPath);
  if (info.exists) return localPath;
  const dl = await FileSystem.downloadAsync(remoteUri, localPath);
  if (dl.status === 200) return dl.uri;
  await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
  return '';
}

export async function prepareOfflineMediaPack({ limit = 120 } = {}) {
  if (!getIsOnline()) return { prepared: 0, skipped: 0 };
  const uris = collectMediaUris().filter((u) => isRemoteUri(u)).slice(0, Math.max(10, Number(limit) || 120));
  let prepared = 0;
  let skipped = 0;
  const patch = {};
  for (const remoteUri of uris) {
    try {
      const local = await cacheRemoteUri(remoteUri);
      if (local) {
        patch[remoteUri] = local;
        prepared += 1;
      } else {
        skipped += 1;
      }
    } catch {
      skipped += 1;
    }
  }
  await mergeOfflineMediaMap(patch);
  await setOfflineBundleMeta({
    prepared,
    skipped,
    totalCandidates: uris.length,
  });
  return { prepared, skipped };
}
