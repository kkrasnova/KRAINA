/**
 * Локальне сховище чатів (AsyncStorage) + дзеркало в Firestore для того самого акаунта:
 * `users/{firebaseUid}/appPrivate/messengerState` (поле `json`).
 * У консолі Firebase додайте правило, наприклад:
 * match /users/{uid}/appPrivate/{doc} { allow read, write: if request.auth != null && request.auth.uid == uid; }
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, firebaseEnabled, auth } from './firebaseConfig';
import { hasBackendSession } from './backendAuthApi';

const STORAGE_PREFIX = '@kraina_messenger_v1_';
const CLOUD_DOC = 'messengerState';

function storageKey(userKey) {
  return `${STORAGE_PREFIX}${userKey}`;
}

export function chatUserKey(user) {
  if (!user) return 'guest';
  if (user.firebaseUid) return `fb_${user.firebaseUid}`;
  if (user.id != null) return `id_${user.id}`;
  if (user.email) return `em_${String(user.email).toLowerCase()}`;
  return 'guest';
}

function now() {
  return Date.now();
}

function uid() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

const DEMO_THREAD_ID_PREFIX = 'th_demo_';

/** Локальні демо-чати з макету — не реальні користувачі. */
export function isDemoThread(thread) {
  if (!thread) return false;
  const id = String(thread.id || '');
  if (id.startsWith(DEMO_THREAD_ID_PREFIX)) return true;
  const peerKey = String(thread.peerKey || '');
  if (peerKey.startsWith('peer_')) return true;
  if (peerKey.startsWith('friend_')) return true;
  return false;
}

function stripDemoThreads(threads) {
  return (threads || []).filter((t) => !isDemoThread(t));
}

async function readRaw(userKey) {
  const raw = await AsyncStorage.getItem(storageKey(userKey));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeRaw(userKey, state) {
  await AsyncStorage.setItem(storageKey(userKey), JSON.stringify(state));
}

async function cloudPull(uid) {
  if (!db || !firebaseEnabled || !uid) return null;
  try {
    const { doc, getDoc } = require('firebase/firestore');
    const snap = await getDoc(doc(db, 'users', uid, 'appPrivate', CLOUD_DOC));
    if (!snap.exists()) return null;
    const d = snap.data();
    const json = d?.json;
    if (typeof json !== 'string') return null;
    return JSON.parse(json);
  } catch (e) {
    if (__DEV__) console.warn('[chatService] cloud pull', e?.message);
    return null;
  }
}

async function cloudPush(uid, state) {
  if (!db || !firebaseEnabled || !uid) return;
  try {
    const { doc, setDoc, serverTimestamp } = require('firebase/firestore');
    await setDoc(
      doc(db, 'users', uid, 'appPrivate', CLOUD_DOC),
      {
        json: JSON.stringify(state),
        updatedAt: serverTimestamp(),
        updatedAtMs: state.updatedAt || now(),
      },
      { merge: true },
    );
  } catch (e) {
    if (__DEV__) console.warn('[chatService] cloud push', e?.message);
  }
}

/**
 * @param {object|null} user
 */
export async function loadMessengerState(user) {
  const key = chatUserKey(user);
  let local = await readRaw(key);
  const uidCloud = auth?.currentUser?.uid;

  if (uidCloud) {
    const remote = await cloudPull(uidCloud);
    if (remote && typeof remote.updatedAt === 'number') {
      if (!local || (local.updatedAt || 0) < remote.updatedAt) {
        local = remote;
        await writeRaw(key, local);
      }
    }
  }

  if (!local) {
    local = { version: 1, updatedAt: now(), threads: [] };
  }
  if (!Array.isArray(local.threads)) local.threads = [];

  const cleaned = stripDemoThreads(local.threads);
  if (cleaned.length !== local.threads.length) {
    local.threads = cleaned;
    local.updatedAt = now();
    await writeRaw(key, local);
    if (uidCloud) void cloudPush(uidCloud, local);
  }

  return local;
}

async function persist(user, state) {
  const key = chatUserKey(user);
  state.updatedAt = now();
  await writeRaw(key, state);
  const uidCloud = auth?.currentUser?.uid;
  if (uidCloud) void cloudPush(uidCloud, state);
}

export async function getThreads(user, langUk) {
  const s = await loadMessengerState(user);
  return s.threads || [];
}

export async function getThreadById(user, threadId, langUk) {
  const threads = await getThreads(user, langUk);
  return threads.find((t) => t.id === threadId) || null;
}

export async function markThreadRead(user, threadId, langUk) {
  const s = await loadMessengerState(user);
  const th = s.threads.find((t) => t.id === threadId);
  if (!th) return;
  th.unreadCount = 0;
  await persist(user, s);
}

export async function sendTextMessage(user, threadId, text, langUk) {
  const s = await loadMessengerState(user);
  const th = s.threads.find((t) => t.id === threadId);
  if (!th) return null;
  const msg = {
    id: uid(),
    createdAt: now(),
    fromMe: true,
    type: 'text',
    text: String(text || '').trim(),
  };
  if (!msg.text) return th;
  th.messages = [...(th.messages || []), msg];
  th.lastMessagePreview = msg.text.slice(0, 120);
  th.lastAt = msg.createdAt;
  await persist(user, s);
  return th;
}

export async function sendRouteCardMessage(user, threadId, routeCard, langUk) {
  const s = await loadMessengerState(user);
  const th = s.threads.find((t) => t.id === threadId);
  if (!th) return null;
  const msg = {
    id: uid(),
    createdAt: now(),
    fromMe: true,
    type: 'route',
    routeCard: {
      title: routeCard.title,
      subtitle: routeCard.subtitle || '',
      regionId: routeCard.regionId || null,
    },
  };
  th.messages = [...(th.messages || []), msg];
  th.lastMessagePreview = `${msg.routeCard.title} · ${langUk ? 'Маршрут' : 'Route'}`;
  th.lastAt = msg.createdAt;
  await persist(user, s);
  return th;
}

export async function sendImageMessage(user, threadId, imageUri, langUk) {
  const s = await loadMessengerState(user);
  const th = s.threads.find((t) => t.id === threadId);
  if (!th) return null;
  const msg = {
    id: uid(),
    createdAt: now(),
    fromMe: true,
    type: 'image',
    imageUri: String(imageUri || ''),
  };
  if (!msg.imageUri) return th;
  th.messages = [...(th.messages || []), msg];
  th.lastMessagePreview = langUk ? 'Фото' : 'Photo';
  th.lastAt = msg.createdAt;
  await persist(user, s);
  return th;
}

export async function sendVoiceMessage(user, threadId, voiceUri, durationMs, langUk) {
  const s = await loadMessengerState(user);
  const th = s.threads.find((t) => t.id === threadId);
  if (!th) return null;
  const uri = String(voiceUri || '').trim();
  if (!uri) return th;
  const msg = {
    id: uid(),
    createdAt: now(),
    fromMe: true,
    type: 'voice',
    voiceUri: uri,
    durationMs: Math.max(0, Number(durationMs) || 0),
  };
  th.messages = [...(th.messages || []), msg];
  th.lastMessagePreview = langUk ? 'Голосове' : 'Voice';
  th.lastAt = msg.createdAt;
  await persist(user, s);
  return th;
}

export async function deleteThread(user, threadId, langUk) {
  const s = await loadMessengerState(user);
  s.threads = (s.threads || []).filter((t) => t.id !== threadId);
  await persist(user, s);
}

export async function deleteChatHistory(user, threadId, langUk) {
  const s = await loadMessengerState(user);
  const th = s.threads.find((t) => t.id === threadId);
  if (!th) return;
  th.messages = [];
  th.lastMessagePreview = '';
  th.lastAt = now();
  th.unreadCount = 0;
  await persist(user, s);
}

/**
 * @returns {Promise<{ id: string }>}
 */
export async function ensureThreadForPeer(user, peerKey, peerName, langUk) {
  const s = await loadMessengerState(user);
  const existing = s.threads.find((t) => t.peerKey === peerKey);
  if (existing) return existing;
  const th = {
    id: uid(),
    peerKey,
    peerName: peerName || peerKey,
    peerAvatarUri: null,
    lastMessagePreview: '',
    lastAt: now(),
    unreadCount: 0,
    messages: [],
  };
  s.threads = [th, ...s.threads];
  await persist(user, s);
  return th;
}
