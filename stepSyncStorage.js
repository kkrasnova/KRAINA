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
  try {
    await AsyncStorage.setItem(KEY, on ? '1' : '0');
    DeviceEventEmitter.emit(KRAINA_STEP_SYNC_CHANGED, { enabled: !!on });
  } catch {
    /* */
  }
}
