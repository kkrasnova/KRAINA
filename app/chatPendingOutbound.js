import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@kraina_chat_pending_images_v1';

async function readAll() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeAll(data) {
  await AsyncStorage.setItem(KEY, JSON.stringify(data));
}

/** Несинхронізовані локальні фото в чаті (офлайн / без мережі). */
export async function readPendingOutboundMessages(threadId) {
  const all = await readAll();
  const rows = all[String(threadId)];
  return Array.isArray(rows) ? rows : [];
}

export async function savePendingOutboundMessage(threadId, message) {
  const tid = String(threadId);
  const all = await readAll();
  const list = Array.isArray(all[tid]) ? all[tid] : [];
  all[tid] = [...list.filter((m) => m.id !== message.id), message];
  await writeAll(all);
}

export async function removePendingOutboundMessage(threadId, messageId) {
  const tid = String(threadId);
  const all = await readAll();
  const list = Array.isArray(all[tid]) ? all[tid] : [];
  const next = list.filter((m) => m.id !== messageId);
  if (next.length) all[tid] = next;
  else delete all[tid];
  await writeAll(all);
}

export function mergePendingImages(serverMessages, pendingMessages) {
  const byId = new Map();
  for (const m of serverMessages || []) byId.set(m.id, m);
  for (const p of pendingMessages || []) {
    if (!byId.has(p.id)) byId.set(p.id, p);
  }
  return [...byId.values()].sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
}
