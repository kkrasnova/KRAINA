import { AppState, DeviceEventEmitter } from 'react-native';
import { startNetworkPolling } from './networkStatus';
import { flushOutboxNow, startOfflineSyncEngine } from './syncEngine';
import { prepareOfflineMediaPack } from './mediaOfflinePack';
import '../feedApi';
import '../socialApi';
import '../messageApi';
import '../savedRoutesSync';

let stopSync = null;
let appStateSub = null;
let started = false;

export async function initOfflineRuntime() {
  if (started) return;
  started = true;
  startNetworkPolling({ intervalMs: 5000 });
  stopSync = startOfflineSyncEngine();
  appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void flushOutboxNow({ reason: 'app_active' });
      void prepareOfflineMediaPack({ limit: 90 });
    }
  });
  DeviceEventEmitter.addListener('kraina_backend_session_merged_v1', () => {
    void flushOutboxNow({ reason: 'session_merged' });
  });
  void flushOutboxNow({ reason: 'runtime_init' });
}

export function stopOfflineRuntime() {
  stopSync?.();
  stopSync = null;
  appStateSub?.remove?.();
  appStateSub = null;
  started = false;
}
