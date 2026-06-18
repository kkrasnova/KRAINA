import { auth, db, firebaseEnabled } from './firebaseConfig';
import { getKrainaRestApiBase } from './krainaApiBase';
import { useAuthStore } from './auth/authStore';
import { backendAuthFetch, hasBackendSession } from './backendAuthApi';

let profilesCache = [];
let profilesCacheAt = 0;
const PROFILES_CACHE_TTL_MS = 120000;
/** Скільки документів тягнути для клієнтського пошуку (Firestore — без full-text, тільки фільтр у пам'яті). */
const PROFILES_FOR_SEARCH = 5000;
const fullProfileCache = new Map();
const FULL_PROFILE_CACHE_TTL_MS = 30000;

/** Допоміжна функція для авторизованих REST-викликів до бекенду. */
async function apiAuthCall(method, path, body) {
  return backendAuthFetch(method, path, body);
}

/** Існування документа після getDoc: у різних версіях SDK — `exists` поле чи метод. */
export function firestoreDocExists(snap) {
  if (snap == null) return false;
  try {
    const v = snap.exists;
    if (typeof v === 'function') return v.call(snap);
    return Boolean(v);
  } catch {
    return false;
  }
}

export function bustSocialProfileCache() {
  profilesCache = [];
  profilesCacheAt = 0;
  fullProfileCache.clear();
}

function currentUid() {
  return String(useAuthStore.getState().user?.id || '');
}

function normalizeUsername(username) {
  return String(username || '')
    .trim()
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase();
}

export function hasSocialApi() {
  return hasBackendSession() || (firebaseEnabled && !!db && !!currentUid());
}

/** Discover: Firestore і/або REST API з профілями в PostgreSQL. */
export function isDiscoverSearchAvailable() {
  if (firebaseEnabled && !!db) return true;
  return !!getKrainaRestApiBase();
}

function profileSearchBlob(p) {
  const parts = [
    p.username,
    p.displayName,
    p.display_name,
    p.name,
    p.email,
    p.bio,
    p.location_label,
  ];
  return parts
    .filter((x) => x != null && String(x).trim() !== '')
    .map((x) => String(x).toLowerCase())
    .join(' ');
}

async function loadProfiles(limit = 300) {
  if (!firebaseEnabled || !db) return [];
  const now = Date.now();
  const wanted = Math.max(1, Number(limit) || 300);
  if (
    profilesCache.length &&
    now - profilesCacheAt < PROFILES_CACHE_TTL_MS &&
    profilesCache.length >= wanted
  ) {
    return profilesCache.slice(0, wanted);
  }
  const { collection, getDocs, limit: qLimit, query } = require('firebase/firestore');
  const snap = await getDocs(query(collection(db, 'profiles'), qLimit(wanted)));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  profilesCache = rows;
  profilesCacheAt = now;
  return rows;
}

async function findProfileByUsername(username) {
  const wanted = normalizeUsername(username);
  if (!wanted) return null;
  const all = await loadProfiles(1000);
  const fromFirestore = all.find((p) => normalizeUsername(p.username || p.displayName || p.email || '') === wanted);
  if (fromFirestore) return fromFirestore;
  // Fallback to Postgres REST when Firestore is unavailable (dev without Firebase).
  const backendRows = await searchProfilesFromBackend(wanted, 50);
  const hit = backendRows.find((p) => normalizeUsername(p.username) === wanted);
  return hit ? { ...hit, id: hit.user_id, displayName: hit.display_name } : null;
}

function fullCacheKey(username, limit) {
  return `${normalizeUsername(username)}::${Math.min(120, Math.max(1, Number(limit) || 80))}`;
}

export function socialGetCachedPublicProfileFull(username, limit = 80) {
  const key = fullCacheKey(username, limit);
  const hit = fullProfileCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at >= FULL_PROFILE_CACHE_TTL_MS) return null;
  return hit.value;
}

function toPublicRow(p) {
  return {
    user_id: p.id,
    username: p.username || p.displayName || p.email?.split('@')?.[0] || 'user',
    display_name: p.display_name || p.displayName || null,
    avatar_url: p.avatar_url || p.avatar || null,
    bio: p.bio || null,
    is_private: !!p.is_private,
    followers_count: Number(p.followers_count || 0),
    following_count: Number(p.following_count || 0),
  };
}

/** Пошук профілів у PostgreSQL (бекенд). Працює без Firestore — основне джерело для «Знайти людей» у дев. */
async function searchProfilesFromBackend(q, lim) {
  const base = getKrainaRestApiBase();
  if (!base) return [];
  const params = new URLSearchParams({ q: String(q || ''), limit: String(lim) });
  const url = `${base}/api/profile/search-public?${params.toString()}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    const users = Array.isArray(data?.users) ? data.users : [];
    return users.map((u) => ({
      user_id: String(u.user_id),
      username: String(u.username || 'user'),
      display_name: u.display_name != null && String(u.display_name).trim() !== '' ? String(u.display_name) : null,
      avatar_url: u.avatar_url != null ? String(u.avatar_url) : null,
      bio: u.bio != null ? String(u.bio) : null,
      is_private: false,
      followers_count: 0,
      following_count: 0,
      is_following: Boolean(u.is_following),
    }));
  } catch (e) {
    if (__DEV__) console.warn('[socialApi] search-public', e?.message);
    return [];
  }
}

/** Топ-N профілів для початкового наповнення DiscoverPeople, коли запит порожній. */
export async function socialListTopProfiles(limit = 24) {
  if (!firebaseEnabled || !db) return [];
  const lim = Math.min(40, Math.max(1, Number(limit) || 24));
  const all = await loadProfiles(PROFILES_FOR_SEARCH);
  const me = currentUid();
  const rows = all
    .filter((p) => !me || p.id !== me)
    .slice(0, lim)
    .map(toPublicRow)
    .map((r) => ({ ...r, is_following: false }));
  return rows;
}

export async function socialSearchProfiles(q, limit = 24) {
  const qt = String(q ?? '').trim();
  if (!qt) return [];
  const lim = Math.min(40, Math.max(1, Number(limit) || 24));
  const me = currentUid();
  const { doc, getDoc } = require('firebase/firestore');

  const [fromApi, fromFs] = await Promise.all([
    searchProfilesFromBackend(qt, lim),
    (async () => {
      if (!firebaseEnabled || !db) return [];
      const all = await loadProfiles(PROFILES_FOR_SEARCH);
      const qn = qt.toLowerCase();
      return all
        .filter((p) => profileSearchBlob(p).includes(qn))
        .slice(0, lim)
        .map(toPublicRow);
    })(),
  ]);

  const apiKeys = new Set(fromApi.map((r) => normalizeUsername(r.username)));
  const apiIds = new Set(fromApi.map((r) => String(r.user_id)));
  const merged = [...fromApi];
  for (const r of fromFs) {
    if (apiIds.has(String(r.user_id))) continue;
    if (apiKeys.has(normalizeUsername(r.username))) continue;
    merged.push(r);
  }
  const rows = merged.slice(0, lim);

  if (!me) return rows.map((r) => ({ ...r, is_following: Boolean(r.is_following) }));
  if (!firebaseEnabled || !db) {
    return rows.map((r) => ({ ...r, is_following: Boolean(r.is_following) }));
  }

  const withFollowing = await Promise.all(
    rows.map(async (row) => {
      const fromApi = Boolean(row.is_following);
      try {
        const edge = await getDoc(doc(db, 'socialFollows', `${me}__${row.user_id}`));
        return { ...row, is_following: fromApi || firestoreDocExists(edge) };
      } catch {
        return { ...row, is_following: fromApi };
      }
    }),
  );
  return withFollowing;
}

export async function socialGetPublicProfile(username) {
  const u = String(username || '').replace(/^@/, '').trim();
  if (!u) throw new Error('profile_not_found');

  // Try backend API first: GET /api/profile/:username
  const base = getKrainaRestApiBase();
  if (base) {
    try {
      const body = await apiAuthCall('GET', `/api/profile/${encodeURIComponent(u)}`);
      if (body && body.profile) {
        const p = body.profile;
        if (__DEV__) console.log(`[socialApi] profile API HIT @${u}`);
        return {
          user_id: String(p.user_id || ''),
          username: String(p.username || 'user'),
          display_name: p.display_name != null && String(p.display_name).trim() !== ''
            ? String(p.display_name).trim()
            : null,
          avatar_url: p.avatar_url != null ? String(p.avatar_url) : null,
          bio: p.bio != null ? String(p.bio) : null,
          is_private: p.is_public === false,
          followers_count: Number(p.followers_count || 0),
          following_count: Number(p.following_count || 0),
          is_following: p.is_following === true,
        };
      }
    } catch (e) {
      if (__DEV__) console.warn('[socialApi] profile API fallback', e?.message);
    }
  }

  const profile = await findProfileByUsername(u);
  if (!profile) throw new Error('profile_not_found');
  const me = currentUid();
  let isFollowing = false;
  if (me && profile.id && me !== profile.id) {
    const { doc, getDoc } = require('firebase/firestore');
    const edge = await getDoc(doc(db, 'socialFollows', `${me}__${profile.id}`)).catch(() => null);
    isFollowing = firestoreDocExists(edge);
  }
  return { ...toPublicRow(profile), is_following: isFollowing };
}

export async function socialGetPublicProfileFull(username, limit = 80) {
  const cacheKey = fullCacheKey(username, limit);
  const now = Date.now();
  const cached = fullProfileCache.get(cacheKey);
  if (cached && now - cached.at < FULL_PROFILE_CACHE_TTL_MS) return cached.value;

  const u = String(username || '').replace(/^@/, '').trim();
  if (!u) throw new Error('profile_not_found');
  const lim = Math.min(120, Math.max(1, Number(limit) || 80));

  // Try backend API first: GET /api/profile/:username/full (один SQL-запит замість N Firestore-читань)
  const base = getKrainaRestApiBase();
  if (base) {
    try {
      const body = await apiAuthCall('GET', `/api/profile/${encodeURIComponent(u)}/full?limit=${lim}`);
      if (body && body.profile) {
        const p = body.profile;
        const mapPerson = (row) => ({
          user_id: String(row.user_id),
          username: String(row.username || 'user'),
          display_name: row.display_name != null && String(row.display_name).trim() !== ''
            ? String(row.display_name).trim()
            : null,
          avatar_url: row.avatar_url != null ? String(row.avatar_url) : null,
          bio: row.bio != null ? String(row.bio) : null,
          is_private: false,
          followers_count: 0,
          following_count: 0,
        });
        const result = {
          profile: {
            user_id: String(p.user_id || ''),
            username: String(p.username || 'user'),
            display_name: p.display_name != null && String(p.display_name).trim() !== ''
              ? String(p.display_name).trim()
              : null,
            avatar_url: p.avatar_url != null ? String(p.avatar_url) : null,
            bio: p.bio != null ? String(p.bio) : null,
            is_private: p.is_public === false,
            followers_count: Number(p.followers_count || 0),
            following_count: Number(p.following_count || 0),
            is_following: p.is_following === true,
          },
          followers: Array.isArray(body.followers) ? body.followers.map(mapPerson) : [],
          following: Array.isArray(body.following) ? body.following.map(mapPerson) : [],
          friends: Array.isArray(body.friends) ? body.friends.map(mapPerson) : [],
        };
        fullProfileCache.set(cacheKey, { at: now, value: result });
        return result;
      }
    } catch (e) {
      if (__DEV__) console.warn('[socialApi] profileFull API fallback', e?.message);
    }
  }

  const profile = await findProfileByUsername(u);
  if (!profile) throw new Error('profile_not_found');
  const { collection, doc, getDoc, getDocs, limit: qLimit, query, where } = require('firebase/firestore');
  const me = currentUid();
  const followersSnap = await getDocs(
    query(collection(db, 'socialFollows'), where('followingId', '==', profile.id), qLimit(lim)),
  );
  const followingSnap = await getDocs(
    query(collection(db, 'socialFollows'), where('followerId', '==', profile.id), qLimit(lim)),
  );
  const allProfiles = await loadProfiles(1000);
  const byId = new Map(allProfiles.map((x) => [x.id, x]));
  let followers = followersSnap.docs.map((d) => toPublicRow(byId.get(d.data().followerId) || { id: d.data().followerId }));
  let following = followingSnap.docs.map((d) => toPublicRow(byId.get(d.data().followingId) || { id: d.data().followingId }));
  const followersSet = new Set(followersSnap.docs.map((d) => d.data().followerId));
  const followingSet = new Set(followingSnap.docs.map((d) => d.data().followingId));
  let friends = [...followersSet].filter((id) => followingSet.has(id)).map((id) => toPublicRow(byId.get(id) || { id }));
  let isFollowing = false;
  if (me && profile.id && me !== profile.id) {
    const edge = await getDoc(doc(db, 'socialFollows', `${me}__${profile.id}`)).catch(() => null);
    isFollowing = firestoreDocExists(edge);
  }
  // Додаємо is_following для кожного рядка followers/following/friends
  if (me) {
    const { doc, getDoc } = require('firebase/firestore');
    const allIds = [...new Set([
      ...followers.map((r) => String(r.user_id)),
      ...following.map((r) => String(r.user_id)),
      ...friends.map((r) => String(r.user_id)),
    ])];
    const followingMe = new Set();
    for (let i = 0; i < allIds.length; i += 10) {
      const batch = allIds.slice(i, i + 10);
      const snapshots = await Promise.allSettled(
        batch.map((id) => getDoc(doc(db, 'socialFollows', `${me}__${id}`))),
      );
      snapshots.forEach((res, idx) => {
        if (res.status === 'fulfilled' && firestoreDocExists(res.value)) {
          followingMe.add(batch[idx]);
        }
      });
    }
    const enh = (r) => ({ ...r, is_following: followingMe.has(String(r.user_id)) });
    followers = followers.map(enh);
    following = following.map(enh);
    friends = friends.map(enh);
  }

  const profilePublic = toPublicRow(profile);
  const result = {
    profile: {
      ...profilePublic,
      is_following: isFollowing,
      followers_count: followersSnap.size,
      following_count: followingSnap.size,
    },
    followers,
    following,
    friends,
  };
  fullProfileCache.set(cacheKey, { at: now, value: result });
  return result;
}

/**
 * Отримати список connections (followers/following/friends) з `is_following` для кожного юзера.
 * Спершу пробує backend API (швидше, один SQL-запит), при помилці — Firestore fallback.
 */
export async function socialGetConnections(username, kind = 'friends', limit = 120) {
  const u = String(username || '').replace(/^@/, '').trim();
  if (!u) return [];
  const lim = Math.min(200, Math.max(1, Number(limit) || 120));

  // Try backend API first
  const base = getKrainaRestApiBase();
  if (base) {
    try {
      const data = await apiAuthCall(
        'GET',
        `/api/social/connections?username=${encodeURIComponent(u)}&kind=${kind}&limit=${lim}`,
      );
      if (data && Array.isArray(data.users)) {
        return data.users;
      }
    } catch (e) {
      if (__DEV__) console.warn('[socialApi] connections API fallback', e?.message);
    }
  }

  // Fallback to Firestore via socialGetPublicProfileFull
  const payload = await socialGetPublicProfileFull(u, lim);
  if (!payload) return [];
  if (kind === 'followers') return Array.isArray(payload.followers) ? payload.followers : [];
  if (kind === 'following') return Array.isArray(payload.following) ? payload.following : [];
  return Array.isArray(payload.friends) ? payload.friends : [];
}

export async function socialPrefetchPublicProfileFull(username, limit = 80) {
  try {
    await socialGetPublicProfileFull(username, limit);
  } catch {
    /* no-op */
  }
}

export async function socialFollowUsername(username) {
  const u = String(username || '').replace(/^@/, '').trim();
  if (!u) return { ok: false };
  try {
    const data = await apiAuthCall('POST', '/api/social/follow', { username: u });
    fullProfileCache.clear();
    return { ok: true, pending: !!data?.pending };
  } catch {
    // Fallback to Firestore
    const uid = currentUid();
    const target = await findProfileByUsername(u);
    if (!uid || !target?.id || target.id === uid) return { ok: false };
    const { doc, setDoc, serverTimestamp } = require('firebase/firestore');
    await setDoc(doc(db, 'socialFollows', `${uid}__${target.id}`), {
      followerId: uid,
      followingId: target.id,
      createdAt: serverTimestamp(),
    });
    fullProfileCache.clear();
    return { ok: true };
  }
}

export async function socialUnfollowUsername(username) {
  const u = String(username || '').replace(/^@/, '').trim();
  if (!u) return { ok: false };
  try {
    await apiAuthCall('DELETE', `/api/social/follow/${encodeURIComponent(u)}`);
    fullProfileCache.clear();
    return { ok: true };
  } catch {
    // Fallback to Firestore
    const uid = currentUid();
    const target = await findProfileByUsername(u);
    if (!uid || !target?.id) return { ok: false };
    const { deleteDoc, doc } = require('firebase/firestore');
    await deleteDoc(doc(db, 'socialFollows', `${uid}__${target.id}`)).catch(() => {});
    fullProfileCache.clear();
    return { ok: true };
  }
}

export async function socialListIncomingRequests() {
  try {
    const data = await apiAuthCall('GET', '/api/social/requests/incoming');
    return Array.isArray(data?.requests) ? data.requests : [];
  } catch {
    // Fallback: Firestore-based request check
    if (!firebaseEnabled || !db) return [];
    const uid = currentUid();
    if (!uid) return [];
    const { collection, getDocs, query, where } = require('firebase/firestore');
    const snap = await getDocs(query(collection(db, 'followRequests'), where('followeeId', '==', uid)));
    const ids = snap.docs.map((d) => d.data().followerId).filter(Boolean);
    if (!ids.length) return [];
    const allProfiles = await loadProfiles(1000);
    const byId = new Map(allProfiles.map((x) => [x.id, x]));
    return ids.map((fid) => {
      const p = byId.get(fid) || { id: fid };
      return {
        user_id: fid,
        username: p.username || p.displayName || fid,
        display_name: p.display_name || p.displayName || null,
        avatar_url: p.avatar_url || p.avatar || null,
        requested_at: new Date().toISOString(),
      };
    });
  }
}

export async function socialListOutgoingRequests() {
  try {
    const data = await apiAuthCall('GET', '/api/social/requests/outgoing');
    return Array.isArray(data?.requests) ? data.requests : [];
  } catch {
    // Fallback: Firestore
    if (!firebaseEnabled || !db) return [];
    const uid = currentUid();
    if (!uid) return [];
    const { collection, getDocs, query, where } = require('firebase/firestore');
    const snap = await getDocs(query(collection(db, 'followRequests'), where('followerId', '==', uid)));
    const ids = snap.docs.map((d) => d.data().followeeId).filter(Boolean);
    if (!ids.length) return [];
    const allProfiles = await loadProfiles(1000);
    const byId = new Map(allProfiles.map((x) => [x.id, x]));
    return ids.map((fid) => {
      const p = byId.get(fid) || { id: fid };
      return {
        user_id: fid,
        username: p.username || p.displayName || fid,
        display_name: p.display_name || p.displayName || null,
        avatar_url: p.avatar_url || p.avatar || null,
        requested_at: new Date().toISOString(),
      };
    });
  }
}

export async function socialAcceptRequest(userId) {
  if (!userId) return { ok: false };
  try {
    await apiAuthCall('POST', `/api/social/requests/${encodeURIComponent(String(userId))}/accept`);
    fullProfileCache.clear();
    return { ok: true };
  } catch (e) {
    // Fallback: Firestore-based accept
    const target = await findProfileByUsername(String(userId));
    if (!target?.id) return { ok: false };
    return socialFollowUsername(target.username || target.id);
  }
}

export async function socialDeclineRequest(userId) {
  if (!userId) return { ok: true };
  try {
    await apiAuthCall('POST', `/api/social/requests/${encodeURIComponent(String(userId))}/decline`);
    return { ok: true };
  } catch {
    // Fallback: no-op for Firestore
    return { ok: true };
  }
}

export async function socialCancelOutgoingRequest(userId) {
  if (!userId) return { ok: true };
  try {
    await apiAuthCall('DELETE', `/api/social/requests/outgoing/${encodeURIComponent(String(userId))}`);
    return { ok: true };
  } catch {
    return { ok: true };
  }
}
