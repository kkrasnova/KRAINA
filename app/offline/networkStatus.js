import { DeviceEventEmitter } from 'react-native';

export const OFFLINE_NETWORK_CHANGED = 'kraina_offline_network_changed_v1';

let online = true;
let pollingTimer = null;
const listeners = new Set();

function emit() {
  const value = !!online;
  DeviceEventEmitter.emit(OFFLINE_NETWORK_CHANGED, value);
  listeners.forEach((fn) => {
    try {
      fn(value);
    } catch {
      /* noop */
    }
  });
}

export function getIsOnline() {
  return !!online;
}

export function onNetworkStatusChange(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function refreshNetworkStatus() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch('https://clients3.google.com/generate_204', {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const next = !!res && (res.status === 204 || (res.status >= 200 && res.status < 400));
    if (next !== online) {
      online = next;
      emit();
    }
    return next;
  } catch {
    if (online) {
      online = false;
      emit();
    }
    return online;
  }
}

export function startNetworkPolling({ intervalMs = 5000 } = {}) {
  if (pollingTimer) return;
  pollingTimer = setInterval(() => {
    void refreshNetworkStatus();
  }, Math.max(5000, Number(intervalMs) || 15000));
  void refreshNetworkStatus();
}

export function stopNetworkPolling() {
  if (!pollingTimer) return;
  clearInterval(pollingTimer);
  pollingTimer = null;
}
