import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

const KEY = '@kraina_step_sync_enabled';

export const KRAINA_STEP_SYNC_CHANGED = 'kraina_step_sync_changed';

export async function getStepSyncEnabled() {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v === '1';
  } catch {
    return false;
  }
}

export async function setStepSyncEnabled(on) {
  const next = !!on;
  try {
    await AsyncStorage.setItem(KEY, next ? '1' : '0');
    DeviceEventEmitter.emit(KRAINA_STEP_SYNC_CHANGED, { enabled: next });
  } catch {
    /* */
  }
  void mirrorStepSyncToFirestore(next).catch(() => {});
}

/** Called by PostAuthHome to apply remote value (from profiles/{uid}) without re-mirroring. */
export async function applyStepSyncEnabledLocal(on) {
  const next = !!on;
  try {
    await AsyncStorage.setItem(KEY, next ? '1' : '0');
    DeviceEventEmitter.emit(KRAINA_STEP_SYNC_CHANGED, { enabled: next });
  } catch {
    /* */
  }
}

async function mirrorStepSyncToFirestore(enabled) {
  try {
    const FirebaseCfg = require('./firebaseConfig');
    if (!FirebaseCfg.firebaseEnabled || !FirebaseCfg.db || !FirebaseCfg.auth) return;
    const uid = String(FirebaseCfg.auth.currentUser?.uid || '');
    if (!uid) return;
    const { doc, setDoc, serverTimestamp } = require('firebase/firestore');
    await setDoc(
      doc(FirebaseCfg.db, 'profiles', uid),
      { stepSyncEnabled: enabled, updated_at: new Date().toISOString(), updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (_) {
    // Silent: offline or anonymous session — local flag remains authoritative.
  }
}
