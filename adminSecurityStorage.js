/**
 * Локальний журнал спроб входу в адмін-гейт і блокування пристрою після невірного PIN.
 * За наявності Firestore подія додатково записується в колекцію (best-effort).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const BLOCK_KEY = '@kraina_admin_gate_blocked_v1';
const LOG_KEY = '@kraina_admin_gate_log_v1';
const INSTALL_KEY = '@kraina_install_uid_v1';
const MAX_LOG = 200;

export async function getOrCreateInstallUid() {
  let v = await AsyncStorage.getItem(INSTALL_KEY);
  if (v && v.trim()) return v.trim();
  v = `ins_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  await AsyncStorage.setItem(INSTALL_KEY, v);
  return v;
}

export async function isAdminGateDeviceBlocked() {
  const raw = await AsyncStorage.getItem(BLOCK_KEY);
  if (!raw) return false;
  try {
    const j = JSON.parse(raw);
    return j?.blocked === true;
  } catch {
    return false;
  }
}

export async function getAdminGateBlockInfo() {
  const raw = await AsyncStorage.getItem(BLOCK_KEY);
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    return j?.blocked ? j : null;
  } catch {
    return null;
  }
}

export async function recordAdminGateWrongPinAttempt({ email }) {
  const installId = await getOrCreateInstallUid();
  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    at: new Date().toISOString(),
    email: String(email || '').trim(),
    outcome: 'wrong_pin_blocked',
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    installId,
    appVersion:
      Constants.expoConfig?.version ||
      Constants.nativeAppVersion ||
      Constants.nativeBuildVersion ||
      'unknown',
    channel: 'mobile',
  };
  await AsyncStorage.setItem(
    BLOCK_KEY,
    JSON.stringify({
      blocked: true,
      blockedAt: entry.at,
      installId,
      reason: 'wrong_admin_pin',
    }),
  );
  let arr = [];
  try {
    const prev = await AsyncStorage.getItem(LOG_KEY);
    const parsed = prev ? JSON.parse(prev) : [];
    arr = Array.isArray(parsed) ? parsed : [];
  } catch {
    arr = [];
  }
  arr.unshift(entry);
  if (arr.length > MAX_LOG) arr = arr.slice(0, MAX_LOG);
  await AsyncStorage.setItem(LOG_KEY, JSON.stringify(arr));

  try {
    const { firebaseEnabled, db } = require('./firebaseConfig');
    if (firebaseEnabled && db) {
      const { collection, addDoc, serverTimestamp } = require('firebase/firestore');
      await addDoc(collection(db, 'kraina_admin_gate_audit'), {
        ...entry,
        createdAt: serverTimestamp(),
      });
    }
  } catch {
    /* правила Firestore можуть забороняти — ігноруємо */
  }
}

export async function getAdminGateSecurityLog() {
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function clearAdminGateDeviceBlock() {
  await AsyncStorage.removeItem(BLOCK_KEY);
}

export async function clearAdminGateSecurityLog() {
  await AsyncStorage.removeItem(LOG_KEY);
}
