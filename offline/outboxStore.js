import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

const OUTBOX_KEY = '@kraina_offline_outbox_v1';
const HISTORY_KEY = '@kraina_offline_outbox_history_v1';

export const OFFLINE_OUTBOX_CHANGED = 'kraina_offline_outbox_changed_v1';

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  return `ob_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function readJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function getOutboxItems() {
  const arr = await readJson(OUTBOX_KEY, []);
  return Array.isArray(arr) ? arr : [];
}

export async function getOutboxHistory() {
  const arr = await readJson(HISTORY_KEY, []);
  return Array.isArray(arr) ? arr : [];
}

async function emitChanged() {
  const [queue, history] = await Promise.all([getOutboxItems(), getOutboxHistory()]);
  DeviceEventEmitter.emit(OFFLINE_OUTBOX_CHANGED, {
    pending: queue.length,
    historyCount: history.length,
  });
}

export async function enqueueOutbox({
  type,
  payload,
  dedupeKey = '',
  authUserId = '',
  idempotencyKey = '',
  allowMerge = true,
}) {
  const list = await getOutboxItems();
  const key = String(dedupeKey || '').trim();
  let next = [...list];
  if (allowMerge && key) {
    next = next.filter((it) => String(it.dedupeKey || '') !== key);
  }
  const item = {
    id: makeId(),
    type: String(type || '').trim(),
    payload: payload ?? {},
    authUserId: String(authUserId || ''),
    dedupeKey: key,
    idempotencyKey: String(idempotencyKey || makeId()),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    status: 'queued',
    attemptCount: 0,
    nextAttemptAt: nowIso(),
    lastError: '',
  };
  next.push(item);
  await writeJson(OUTBOX_KEY, next);
  await emitChanged();
  return item;
}

export async function patchOutboxItem(id, patch) {
  const list = await getOutboxItems();
  const idx = list.findIndex((it) => it.id === id);
  if (idx < 0) return null;
  const next = [...list];
  next[idx] = {
    ...next[idx],
    ...patch,
    updatedAt: nowIso(),
  };
  await writeJson(OUTBOX_KEY, next);
  await emitChanged();
  return next[idx];
}

export async function removeOutboxItem(id, { success = true } = {}) {
  const list = await getOutboxItems();
  const idx = list.findIndex((it) => it.id === id);
  if (idx < 0) return;
  const row = list[idx];
  const next = list.filter((it) => it.id !== id);
  await writeJson(OUTBOX_KEY, next);
  const history = await getOutboxHistory();
  history.unshift({
    ...row,
    finishedAt: nowIso(),
    status: success ? 'synced' : 'failed',
  });
  await writeJson(HISTORY_KEY, history.slice(0, 300));
  await emitChanged();
}

export async function clearOutboxHistory() {
  await writeJson(HISTORY_KEY, []);
  await emitChanged();
}
