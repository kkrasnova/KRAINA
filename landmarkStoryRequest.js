import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, firebaseEnabled } from './firebaseConfig';

const QUEUE_KEY = '@kraina_landmark_story_requests_v1';
const MAX_QUEUED = 200;

/**
 * @param {{
 *   requestRef: string,
 *   language: string,
 *   userId?: string | null,
 *   userEmail?: string | null,
 *   scanLatitude?: number | null,
 *   scanLongitude?: number | null,
 *   attachedLatitude?: number | null,
 *   attachedLongitude?: number | null,
 *   visionHintTitle?: string | null,
 *   hasPhoto?: boolean,
 * }} payload
 */
export async function persistLandmarkStoryRequest(payload) {
  const stamp = new Date().toISOString();
  const localDoc = { ...payload, createdAt: stamp };

  if (db && firebaseEnabled) {
    try {
      const { collection, addDoc, serverTimestamp } = require('firebase/firestore');
      await addDoc(collection(db, 'landmark_story_requests'), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      return { ok: true, remote: true };
    } catch (e) {
      if (__DEV__) console.warn('[landmarkStoryRequest] Firestore write failed', e?.message);
    }
  }

  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    let list = [];
    try {
      const parsed = JSON.parse(raw || '[]');
      list = Array.isArray(parsed) ? parsed : [];
    } catch {
      list = [];
    }
    list.push(localDoc);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-MAX_QUEUED)));
    return { ok: true, remote: false };
  } catch (e2) {
    if (__DEV__) console.warn('[landmarkStoryRequest] local queue failed', e2?.message);
    return { ok: false, remote: false, error: e2 };
  }
}
