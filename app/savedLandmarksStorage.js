import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { ttlGetItem, ttlSetItem } from './ttlCache';

const STORAGE_KEY = '@kraina_saved_landmarks_v1';

/** Підпис: оновити список закладок / іконки після зміни AsyncStorage. */
export const KRAINA_SAVED_LANDMARKS_CHANGED = 'KRAINA_SAVED_LANDMARKS_CHANGED';

function emitSavedLandmarksChanged() {
  try {
    DeviceEventEmitter.emit(KRAINA_SAVED_LANDMARKS_CHANGED);
  } catch (_) {}
}

/** Стабільний ключ для порівняння та дедуплікації. */
export function landmarkSaveKey(countryId, regionId, landmarkId) {
  return `${String(countryId ?? '')}|${String(regionId ?? '')}|${String(landmarkId ?? '')}`;
}

/**
 * @returns {Promise<Array<{ key: string, countryId: string, regionId: string, landmarkId: string, titleUk: string, titleEn: string, regionTitleUk: string, regionTitleEn: string, flag: string, savedAt: number }>>}
 */
export async function getSavedLandmarks() {
  return ttlGetItem('saved_landmarks', 30000, async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const j = JSON.parse(raw);
      return Array.isArray(j) ? j : [];
    } catch {
      return [];
    }
  });
}

export async function isLandmarkSaved(countryId, regionId, landmarkId) {
  const key = landmarkSaveKey(countryId, regionId, landmarkId);
  const list = await getSavedLandmarks();
  return list.some((row) => row.key === key);
}

/**
 * @param {object} entry
 * @param {string} entry.countryId
 * @param {string} entry.regionId
 * @param {string} entry.landmarkId
 * @param {string} entry.titleUk
 * @param {string} entry.titleEn
 * @param {string} entry.regionTitleUk
 * @param {string} entry.regionTitleEn
 * @param {string} entry.flag
 */
export async function addSavedLandmark(entry) {
  const key = landmarkSaveKey(entry.countryId, entry.regionId, entry.landmarkId);
  const list = await getSavedLandmarks();
  if (list.some((row) => row.key === key)) return list;
  const next = [
    {
      key,
      countryId: String(entry.countryId ?? ''),
      regionId: String(entry.regionId ?? ''),
      landmarkId: String(entry.landmarkId ?? ''),
      titleUk: String(entry.titleUk ?? ''),
      titleEn: String(entry.titleEn ?? ''),
      regionTitleUk: String(entry.regionTitleUk ?? ''),
      regionTitleEn: String(entry.regionTitleEn ?? ''),
      flag: String(entry.flag ?? ''),
      savedAt: Date.now(),
    },
    ...list,
  ];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  await ttlSetItem('saved_landmarks', next, 30000);
  emitSavedLandmarksChanged();
  return next;
}

export async function removeSavedLandmark(countryId, regionId, landmarkId) {
  const key = landmarkSaveKey(countryId, regionId, landmarkId);
  const list = await getSavedLandmarks();
  const next = list.filter((row) => row.key !== key);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  await ttlSetItem('saved_landmarks', next, 30000);
  emitSavedLandmarksChanged();
  return next;
}

export async function toggleSavedLandmark(entry) {
  const key = landmarkSaveKey(entry.countryId, entry.regionId, entry.landmarkId);
  const exists = await isLandmarkSaved(entry.countryId, entry.regionId, entry.landmarkId);
  if (exists) {
    return removeSavedLandmark(entry.countryId, entry.regionId, entry.landmarkId);
  }
  return addSavedLandmark(entry);
}
