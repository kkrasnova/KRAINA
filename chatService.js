/**
 * Локальне сховище чатів (AsyncStorage) + дзеркало в Firestore для того самого акаунта:
 * `users/{firebaseUid}/appPrivate/messengerState` (поле `json`).
 * У консолі Firebase додайте правило, наприклад:
 * match /users/{uid}/appPrivate/{doc} { allow read, write: if request.auth != null && request.auth.uid == uid; }
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, firebaseEnabled, auth } from './firebaseConfig';

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

/** Початкові демо-чати (як у макеті) — лише якщо сховище порожнє. */
function seedThreads(langUk) {
  const snippet = langUk
    ? 'Дуже круте місці і ця історія створена так що...'
    : 'Such a cool place and this story is built so that...';
  const t = now() - 86400000 * 2;
  return [
    {
      id: 'th_demo_angelina',
      peerKey: 'peer_angelina',
      peerName: langUk ? 'Ангеліна Романова' : 'Angelina Romanova',
      peerAvatarUri: null,
      lastMessagePreview: snippet,
      lastAt: now() - 5 * 60 * 1000,
      unreadCount: 1,
      messages: [
        {
          id: uid(),
          createdAt: t,
          fromMe: false,
          type: 'text',
          text: langUk ? 'Привіт' : 'Hi',
        },
        {
          id: uid(),
          createdAt: t + 60000,
          fromMe: true,
          type: 'text',
          text: langUk ? 'Привіт, як справи?' : 'Hi, how are you?',
        },
        {
          id: uid(),
          createdAt: t + 120000,
          fromMe: false,
          type: 'text',
          text: langUk ? 'Все гаразд' : 'All good',
        },
        {
          id: uid(),
          createdAt: now() - 5 * 60 * 1000,
          fromMe: false,
          type: 'text',
          text: langUk ? 'Які плани?' : 'Any plans?',
        },
      ],
    },
    {
      id: 'th_demo_mar',
      peerKey: 'peer_mar',
      peerName: langUk ? 'мар Роа' : 'Mar Roa',
      peerAvatarUri: null,
      lastMessagePreview: snippet,
      lastAt: now() - 5 * 60 * 60 * 1000,
      unreadCount: 1,
      messages: [
        {
          id: uid(),
          createdAt: now() - 5 * 60 * 60 * 1000,
          fromMe: false,
          type: 'text',
          text: langUk ? 'Пропоную в подорож' : 'I suggest a trip',
        },
      ],
    },
    {
      id: 'th_demo_route',
      peerKey: 'peer_maria',
      peerName: langUk ? 'Марія' : 'Maria',
      peerAvatarUri: null,
      lastMessagePreview: langUk ? 'Рим — Колізей · Маршрут' : 'Rome — Colosseum · Route',
      lastAt: now() - 86400000 * 2,
      unreadCount: 0,
      messages: [
        {
          id: uid(),
          createdAt: now() - 86400000 * 2,
          fromMe: true,
          type: 'text',
          text: langUk ? 'Зараз надішлю локацію' : 'Sending the location now',
        },
        {
          id: uid(),
          createdAt: now() - 86400000 * 2 + 5000,
          fromMe: false,
          type: 'route',
          routeCard: {
            title: langUk ? 'Рим — Колізей' : 'Rome — Colosseum',
            subtitle: langUk ? 'Марія' : 'Maria',
            regionId: 'kyiv',
          },
        },
      ],
    },
  ];
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
 * @param {boolean} langUk
 */
export async function loadMessengerState(user, langUk) {
  const key = chatUserKey(user);
  let local = await readRaw(key);
  const rawMissing = local == null;
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

  if (local.threads.length === 0 && rawMissing) {
    local.threads = seedThreads(langUk);
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
  const s = await loadMessengerState(user, langUk);
  return s.threads || [];
}

export async function getThreadById(user, threadId, langUk) {
  const threads = await getThreads(user, langUk);
  return threads.find((t) => t.id === threadId) || null;
}

export async function markThreadRead(user, threadId, langUk) {
  const s = await loadMessengerState(user, langUk);
  const th = s.threads.find((t) => t.id === threadId);
  if (!th) return;
  th.unreadCount = 0;
  await persist(user, s);
}

export async function sendTextMessage(user, threadId, text, langUk) {
  const s = await loadMessengerState(user, langUk);
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
  const s = await loadMessengerState(user, langUk);
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
  const s = await loadMessengerState(user, langUk);
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

export async function deleteThread(user, threadId, langUk) {
  const s = await loadMessengerState(user, langUk);
  s.threads = (s.threads || []).filter((t) => t.id !== threadId);
  await persist(user, s);
}

export async function deleteChatHistory(user, threadId, langUk) {
  const s = await loadMessengerState(user, langUk);
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
  const s = await loadMessengerState(user, langUk);
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
