import { Platform } from 'react-native';
import Constants from 'expo-constants';

function iosSimulatorDetected() {
  if (Platform.OS !== 'ios') return false;
  if (Constants.platform?.ios?.simulator === true) return true;
  if (Constants.isDevice === false) return true;
  const deviceName = String(Constants.deviceName || '');
  if (/simulator/i.test(deviceName)) return true;
  const model = String(Constants.platform?.ios?.model || '');
  if (/simulator/i.test(model)) return true;
  return false;
}

function androidEmulatorDetected() {
  if (Platform.OS !== 'android') return false;
  if (Constants.isDevice === false) return true;
  const deviceName = String(Constants.deviceName || '');
  if (/sdk_gphone|emulator|generic|android sdk built for/i.test(deviceName)) return true;
  return false;
}

export const isIosSimulator = iosSimulatorDetected();
export const isAndroidEmulator = androidEmulatorDetected();
export const isVirtualDevice = isIosSimulator || isAndroidEmulator;
