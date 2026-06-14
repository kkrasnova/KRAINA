import { DeviceEventEmitter } from 'react-native';
import { useAuthStore } from '../auth/authStore';
import { getIsOnline, onNetworkStatusChange } from './networkStatus';
import {
  getOutboxItems,
  patchOutboxItem,
  removeOutboxItem,
  OFFLINE_OUTBOX_CHANGED,
} from './outboxStore';

export const OFFLINE_SYNC_STATUS = 'kraina_offline_sync_status_v1';

const handlers = new Map();
let flushing = false;
let started = false;

function emitStatus(extra = {}) {
  DeviceEventEmitter.emit(OFFLINE_SYNC_STATUS, {
    running: flushing,
    ...extra,
  });
}

function backoffMs(attemptCount) {
  const n = Math.max(1, Number(attemptCount) || 1);
  return Math.min(5 * 60 * 1000, 1500 * 2 ** Math.min(8, n - 1));
}

export function registerOutboxHandler(type, fn) {
  const t = String(type || '').trim();
  if (!t || typeof fn !== 'function') return () => {};
  handlers.set(t, fn);
  return () => handlers.delete(t);
}

export async function flushOutboxNow({ reason = 'manual' } = {}) {
  if (flushing) return false;
  if (!getIsOnline()) return false;
  flushing = true;
  emitStatus({ reason, phase: 'start' });
  try {
    const items = await getOutboxItems();
    for (const item of items) {
      if (!getIsOnline()) break;
      const nextAt = Date.parse(String(item.nextAttemptAt || ''));
      if (Number.isFinite(nextAt) && nextAt > Date.now()) continue;
      const run = handlers.get(String(item.type || ''));
      if (!run) {
        await patchOutboxItem(item.id, {
          status: 'failed',
          lastError: 'handler_missing',
        });
        await removeOutboxItem(item.id, { success: false });
        continue;
      }
      const token = useAuthStore.getState().accessToken;
      if (!token) break;
      try {
        await patchOutboxItem(item.id, {
          status: 'syncing',
          lastError: '',
        });
        await run(item, token, { idempotencyKey: item.idempotencyKey || item.id });
        await removeOutboxItem(item.id, { success: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'sync_failed';
        const attemptCount = Number(item.attemptCount || 0) + 1;
        if (attemptCount >= 8) {
          await patchOutboxItem(item.id, {
            status: 'failed',
            attemptCount,
            lastError: msg,
          });
          await removeOutboxItem(item.id, { success: false });
        } else {
          await patchOutboxItem(item.id, {
            status: 'queued',
            attemptCount,
            lastError: msg,
            nextAttemptAt: new Date(Date.now() + backoffMs(attemptCount)).toISOString(),
          });
        }
      }
    }
    emitStatus({ reason, phase: 'done' });
    return true;
  } finally {
    flushing = false;
  }
}

export function startOfflineSyncEngine() {
  if (started) return () => {};
  started = true;
  const offNet = onNetworkStatusChange((isOnline) => {
    if (isOnline) void flushOutboxNow({ reason: 'network_regain' });
  });
  const offOutbox = DeviceEventEmitter.addListener(OFFLINE_OUTBOX_CHANGED, () => {
    if (getIsOnline()) void flushOutboxNow({ reason: 'outbox_changed' });
  });
  void flushOutboxNow({ reason: 'engine_start' });
  return () => {
    started = false;
    offNet();
    offOutbox.remove();
  };
}
