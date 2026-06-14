
import { Platform } from 'react-native';

const FALLBACK = 'com.kraina.app.pro.monthly';

function env(name) {
  try {
    const v = process.env[name];
    return typeof v === 'string' && v.trim() ? v.trim() : '';
  } catch {
    return '';
  }
}

const SHARED = env('EXPO_PUBLIC_IAP_PRO_SUBSCRIPTION_ID');
const EXPLORER_SHARED = env('EXPO_PUBLIC_IAP_EXPLORER_SUBSCRIPTION_ID');

export function getIosSubscriptionId() {
  return env('EXPO_PUBLIC_IAP_PRO_SUBSCRIPTION_ID_IOS') || SHARED || FALLBACK;
}

export function getAndroidSubscriptionId() {
  return env('EXPO_PUBLIC_IAP_PRO_SUBSCRIPTION_ID_ANDROID') || SHARED || FALLBACK;
}

export function getExplorerIosSubscriptionId() {
  return env('EXPO_PUBLIC_IAP_EXPLORER_SUBSCRIPTION_ID_IOS') || EXPLORER_SHARED || '';
}

export function getExplorerAndroidSubscriptionId() {
  return env('EXPO_PUBLIC_IAP_EXPLORER_SUBSCRIPTION_ID_ANDROID') || EXPLORER_SHARED || '';
}

export function getSubscriptionIdForPlatform() {
  return Platform.OS === 'android' ? getAndroidSubscriptionId() : getIosSubscriptionId();
}

export function getExplorerSubscriptionIdForPlatform() {
  return Platform.OS === 'android' ? getExplorerAndroidSubscriptionId() : getExplorerIosSubscriptionId();
}

export function getSubscriptionIdsForFetch() {
  const ids = [];
  if (Platform.OS === 'android') {
    ids.push(getAndroidSubscriptionId());
    const ex = getExplorerAndroidSubscriptionId();
    if (ex) ids.push(ex);
  } else {
    ids.push(getIosSubscriptionId());
    const ex = getExplorerIosSubscriptionId();
    if (ex) ids.push(ex);
  }
  return [...new Set(ids.filter(Boolean))];
}
