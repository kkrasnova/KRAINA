import { auth, db, firebaseEnabled } from './firebaseConfig';
import { getKrainaRestApiBase } from './krainaApiBase';
import { useAuthStore } from './auth/authStore';
import { ApiError } from './auth/types';
import { backendAuthFetch, hasBackendSession } from './backendAuthApi';
import { normalizeBackendAssetUrl } from './auth/config';
import { SOCIAL_SYNC_TTL_MS, emitSocialFollowChanged, emitSocialGraphChanged } from './socialFollowSyncEvents';
import { refreshSocialProfileCounts } from './profileMeSync';

let profilesCache = [];
let profilesCacheAt = 0;
const PROFILES_CACHE_TTL_MS = 120000;
/** Скільки документів тягнути для клієнтського пошуку (Firestore — без full-text, тільки фільтр у пам'яті). */
const PROFILES_FOR_SEARCH = 5000;
const PROFILES_FOR_SEARCH_SUPPLEMENT = 800;
const fullProfileCache = new Map();
const FULL_PROFILE_CACHE_TTL_MS = SOCIAL_SYNC_TTL_MS;
const searchResultsCache = new Map();
/** Кеш пошуку — довший за sync TTL, щоб не дёргати мережу на кожен символ. */
const SEARCH_RESULTS_CACHE_TTL_MS = 60000; // Збільшено з 30000 для швидшого повторного пошуку
const SEARCH_FETCH_TIMEOUT_MS = 3000; // Скорочено з 8000 для швидшого failover на локальний пошук
let topProfilesCache = { value: [], at: 0 };
const TOP_PROFILES_CACHE_TTL_MS = SOCIAL_SYNC_TTL_MS;

const PROFILE_FETCH_TIMEOUT_MS = 6000;

/** Допоміжна функція для авторизованих REST-викликів до бекенду. */
async function apiAuthCall(method, path, body, opts = {}) {
  return backendAuthFetch(method, path, body, { timeoutMs: PROFILE_FETCH_TIMEOUT_MS, ...opts });
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
  searchResultsCache.clear();
  topProfilesCache = { value: [], at: 0 };
}

/** Синхронний кеш топ-профілів для миттєвого рендеру DiscoverPeople. */
export function socialGetCachedTopProfiles(limit = 24) {
  const lim = Math.min(40, Math.max(1, Number(limit) || 24));
  if (!topProfilesCache.value?.length) return [];
  if (Date.now() - topProfilesCache.at >= TOP_PROFILES_CACHE_TTL_MS) return [];
  return topProfilesCache.value.slice(0, lim);
}

/** Фонове поповнення кешу топ-профілів (без await у UI). */
export function socialPrefetchTopProfiles(limit = 24) {
  void socialListTopProfiles(limit).catch(() => {});
}

function currentUid() {
  return String(useAuthStore.getState().user?.id || '');
}

/** Firebase Auth UID — потрібен для записів у Firestore (правила socialFollows). */
function currentFirebaseUid() {
  try {
    const { auth } = require('./firebaseConfig');
    return String(auth?.currentUser?.uid || '');
  } catch {
    return '';
  }
}

function isPostgresUuid(value) {
  return /^[0-9a-f-]{36}$/i.test(String(value || '').trim());
}

function apiErrorCode(err) {
  return String(err?.payload?.error || err?.message || '').trim().toLowerCase();
}

/** Firestore fallback лише для профілів без запису в PostgreSQL або без бекенд-сесії. */
/** ID для читання/запису ребер socialFollows у Firestore (правила вимагають Firebase UID). */
function firestoreFollowActorId() {
  return currentFirebaseUid() || currentUid();
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

/** ⚡ Префетч популярних профілів у фоні (вивантажує кеш при старті додатка). */
export function socialWarmupSearchCache() {
  // Префетч топ-профілів для DiscoverPeoplePage
  void socialListTopProfiles(32).catch(() => {});
  // Префетч базового пулу профілів для локального пошуку
  void loadProfiles(1000).catch(() => {});
}

/** Discover: Firestore і/або REST API з профілями в PostgreSQL. */
export function isDiscoverSearchAvailable() {
  if (firebaseEnabled && !!db) return true;
  return !!getKrainaRestApiBase();
}

// ⚡ WeakMap для кешування profileSearchBlob результатів (зберігає пам'ять)
const profileBlobCache = new WeakMap();

function profileSearchBlob(p) {
  // Повертаємо кешоване значення якщо воно існує
  if (profileBlobCache.has(p)) {
    return profileBlobCache.get(p);
  }
  
  const parts = [
    p.username,
    p.displayName,
    p.display_name,
    p.name,
    p.email,
    p.bio,
    p.location_label,
  ];
  const blob = parts
    .filter((x) => x != null && String(x).trim() !== '')
    .map((x) => String(x).toLowerCase())
    .join(' ');
  
  // Кешуємо результат для наступних запитів
  profileBlobCache.set(p, blob);
  return blob;
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

function normalizeFullProfilePosts(posts) {
  if (!Array.isArray(posts)) return [];
  return posts.map((post) => {
    if (!post || typeof post !== 'object') return post;
    const media = Array.isArray(post.media_urls)
      ? post.media_urls.map((u) => normalizeBackendAssetUrl(String(u || '')))
      : [];
    return {
      ...post,
      media_urls: media,
      avatar_url:
        post.avatar_url != null ? normalizeBackendAssetUrl(String(post.avatar_url)) : post.avatar_url,
    };
  });
}

function normalizeFullProfileStories(stories) {
  if (!Array.isArray(stories)) return [];
  return stories.map((story) => {
    if (!story || typeof story !== 'object') return story;
    return {
      ...story,
      media_url:
        story.media_url != null ? normalizeBackendAssetUrl(String(story.media_url)) : story.media_url,
      author_avatar_url:
        story.author_avatar_url != null
          ? normalizeBackendAssetUrl(String(story.author_avatar_url))
          : story.author_avatar_url,
    };
  });
}

function mapBackendPublicProfileRow(p) {
  if (!p || typeof p !== 'object') return null;
  return {
    user_id: String(p.user_id || ''),
    username: String(p.username || 'user'),
    display_name:
      p.display_name != null && String(p.display_name).trim() !== ''
        ? String(p.display_name).trim()
        : null,
    avatar_url: p.avatar_url != null ? String(p.avatar_url) : null,
    bio: p.bio != null ? String(p.bio) : null,
    location_label:
      p.location_label != null && String(p.location_label).trim() !== ''
        ? String(p.location_label).trim()
        : null,
    birth_date:
      p.birth_date != null && String(p.birth_date).trim() !== ''
        ? String(p.birth_date).slice(0, 10)
        : null,
    is_private: p.is_public === false,
    followers_count: Number(p.followers_count || 0),
    following_count: Number(p.following_count || 0),
    is_following: p.is_following === true,
  };
}

function toPublicRow(p) {
  return {
    user_id: p.id,
    username: p.username || p.displayName || p.email?.split('@')?.[0] || 'user',
    display_name: p.display_name || p.displayName || null,
    avatar_url: p.avatar_url || p.avatar || null,
    bio: p.bio || null,
    location_label:
      p.location_label != null && String(p.location_label).trim() !== ''
        ? String(p.location_label).trim()
        : p.locationLabel != null && String(p.locationLabel).trim() !== ''
          ? String(p.locationLabel).trim()
          : null,
    birth_date:
      p.birth_date != null && String(p.birth_date).trim() !== ''
        ? String(p.birth_date).slice(0, 10)
        : null,
    is_private: !!p.is_private,
    followers_count: Number(p.followers_count || 0),
    following_count: Number(p.following_count || 0),
  };
}

function mapBackendSearchUser(u) {
  return {
    user_id: String(u.user_id),
    username: String(u.username || 'user'),
    display_name: u.display_name != null && String(u.display_name).trim() !== '' ? String(u.display_name) : null,
    avatar_url: u.avatar_url != null ? String(u.avatar_url) : null,
    bio: u.bio != null ? String(u.bio) : null,
    is_private: false,
    followers_count: 0,
    following_count: 0,
    is_following: Boolean(u.is_following),
  };
}

/** Рядок з Discover / друзів → DTO для миттєвого рендеру профілю. */
export function mapSocialListRowToProfile(row, fallbackUsername = '') {
  if (!row) return null;
  const username = String(row.username || fallbackUsername || 'user').replace(/^@/, '').trim();
  if (!username) return null;
  const displayName =
    row.display_name != null && String(row.display_name).trim() !== ''
      ? String(row.display_name).trim()
      : row.displayName != null && String(row.displayName).trim() !== ''
        ? String(row.displayName).trim()
        : null;
  return {
    user_id: String(row.user_id || row.id || ''),
    username,
    display_name: displayName,
    avatar_url:
      row.avatar_url != null
        ? String(row.avatar_url)
        : row.avatar != null
          ? String(row.avatar)
          : null,
    bio: row.bio != null ? String(row.bio) : null,
    location_label:
      row.location_label != null && String(row.location_label).trim() !== ''
        ? String(row.location_label).trim()
        : null,
    birth_date:
      row.birth_date != null && String(row.birth_date).trim() !== ''
        ? String(row.birth_date).slice(0, 10)
        : null,
    is_private: row.is_public === false || !!row.is_private,
    followers_count: Number(row.followers_count || 0),
    following_count: Number(row.following_count || 0),
    is_following: !!row.is_following,
  };
}

async function fetchSearchPublicJson(base, path) {
  const headers = { Accept: 'application/json' };
  const token = String(useAuthStore.getState().accessToken || '').trim();
  if (/^eyJ/i.test(token)) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, { headers, signal: controller.signal });
    if (!res.ok) return null;
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Пошук профілів у PostgreSQL (бекенд). Працює без Firestore — основне джерело для «Знайти людей» у дев. */
async function searchProfilesFromBackend(q, lim) {
  const base = getKrainaRestApiBase();
  if (!base) return [];
  const params = new URLSearchParams({ q: String(q || ''), limit: String(lim) });
  const path = `/api/profile/search-public?${params.toString()}`;
  try {
    const data = await fetchSearchPublicJson(base, path);
    const users = Array.isArray(data?.users) ? data.users : [];
    return users.map(mapBackendSearchUser);
  } catch (e) {
    if (__DEV__) console.warn('[socialApi] search-public', e?.message);
    return [];
  }
}

/** Топ-N профілів для початкового наповнення DiscoverPeople, коли запит порожній. */
export async function socialListTopProfiles(limit = 24) {
  const lim = Math.min(40, Math.max(1, Number(limit) || 24));
  const me = currentUid();
  const cacheFresh =
    topProfilesCache.value?.length &&
    Date.now() - topProfilesCache.at < TOP_PROFILES_CACHE_TTL_MS;
  if (cacheFresh) {
    return topProfilesCache.value
      .filter((r) => !me || String(r.user_id) !== me)
      .slice(0, lim);
  }

  // Основне джерело — реальні зареєстровані користувачі з PostgreSQL (порожній q = «огляд людей»).
  const fromApi = await searchProfilesFromBackend('', lim);

  // Якщо бекенд дав достатньо — не тягнемо тисячі документів з Firestore.
  let merged = [...fromApi];
  if (firebaseEnabled && db && fromApi.length < lim) {
    try {
      const fsWanted = Math.min(lim * 2, PROFILES_FOR_SEARCH_SUPPLEMENT);
      const all = await loadProfiles(fsWanted);
      const fromFs = all
        .filter((p) => !me || p.id !== me)
        .slice(0, lim)
        .map(toPublicRow)
        .map((r) => ({ ...r, is_following: false }));
      const apiIds = new Set(fromApi.map((r) => String(r.user_id)));
      const apiKeys = new Set(fromApi.map((r) => normalizeUsername(r.username)));
      for (const r of fromFs) {
        if (apiIds.has(String(r.user_id))) continue;
        if (apiKeys.has(normalizeUsername(r.username))) continue;
        merged.push(r);
      }
    } catch {
      /* Firestore supplement optional */
    }
  }

  const result = merged
    .filter((r) => !me || String(r.user_id) !== me)
    .slice(0, lim)
    .map((r) => ({ ...r, is_following: Boolean(r.is_following) }));
  topProfilesCache = { value: result, at: Date.now() };
  return result;
}

function localFilterSearchRows(rows, q, lim) {
  const qn = String(q ?? '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
  if (!qn) return [];
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      const blob = [row.username, row.display_name, row.bio]
        .filter((part) => part != null && String(part).trim() !== '')
        .join(' ')
        .toLowerCase();
      return blob.includes(qn);
    })
    .slice(0, lim);
}

/** Миттєвий кеш пошуку для UI (без await). */
export function socialPeekCachedSearchProfiles(q, limit = 24) {
  const qt = String(q ?? '').trim();
  if (!qt) return [];
  const lim = Math.min(40, Math.max(1, Number(limit) || 24));
  const cacheKey = `${qt.toLowerCase()}::${lim}`;
  const cached = searchResultsCache.get(cacheKey);
  if (!cached || Date.now() - cached.at >= SEARCH_RESULTS_CACHE_TTL_MS) return [];
  return cached.value;
}

/** Миттєві результати з кешу / топ-профілів — без мережі. */
export function socialInstantSearchProfiles(q, limit = 24) {
  const qt = String(q ?? '').trim().replace(/^@/, '');
  if (!qt) return [];
  const lim = Math.min(40, Math.max(1, Number(limit) || 24));
  const exact = socialPeekCachedSearchProfiles(qt, lim);
  if (exact.length) return exact;

  const qn = qt.toLowerCase();
  for (const [key, cached] of searchResultsCache) {
    if (Date.now() - cached.at >= SEARCH_RESULTS_CACHE_TTL_MS) continue;
    const cachedQ = key.split('::')[0] || '';
    if (!cachedQ) continue;
    if (cachedQ.startsWith(qn) || qn.startsWith(cachedQ)) {
      const hit = localFilterSearchRows(cached.value, qt, lim);
      if (hit.length) return hit;
    }
  }

  const top = socialGetCachedTopProfiles(40);
  if (top.length) return localFilterSearchRows(top, qt, lim);
  if (profilesCache.length) return localFilterSearchRows(profilesCache.map(toPublicRow), qt, lim);
  return [];
}

/** Прогрів API (Render cold start) + кеш топ-профілів перед пошуком. */
export function socialWarmDiscoverSearch() {
  const base = getKrainaRestApiBase();
  if (base) {
    void fetch(`${base}/health`, { method: 'GET' }).catch(() => {});
  }
  void socialListTopProfiles(24).catch(() => {});
}

export async function socialSearchProfiles(q, limit = 24) {
  const qt = String(q ?? '').trim();
  if (!qt) return [];
  const lim = Math.min(40, Math.max(1, Number(limit) || 24));
  const cacheKey = `${qt.toLowerCase()}::${lim}`;
  const cached = searchResultsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SEARCH_RESULTS_CACHE_TTL_MS) {
    return cached.value;
  }

  const me = currentUid();
  const hasBackend = !!getKrainaRestApiBase();
  let fromApi = hasBackend ? await searchProfilesFromBackend(qt, lim) : [];

  let fromFs = [];
  if (firebaseEnabled && db && (!hasBackend || fromApi.length < 1)) {
    const fsWanted = hasBackend ? Math.min(lim * 3, PROFILES_FOR_SEARCH_SUPPLEMENT) : PROFILES_FOR_SEARCH;
    const all = await loadProfiles(fsWanted);
    const qn = qt.toLowerCase();
    fromFs = all
      .filter((p) => profileSearchBlob(p).includes(qn))
      .slice(0, lim)
      .map(toPublicRow);
  }

  const apiKeys = new Set(fromApi.map((r) => normalizeUsername(r.username)));
  const apiIds = new Set(fromApi.map((r) => String(r.user_id)));
  const merged = [...fromApi];
  for (const r of fromFs) {
    if (apiIds.has(String(r.user_id))) continue;
    if (apiKeys.has(normalizeUsername(r.username))) continue;
    merged.push(r);
  }
  const rows = merged.slice(0, lim);

  if (!me || !firebaseEnabled || !db || hasBackend) {
    const result = rows.map((r) => ({ ...r, is_following: Boolean(r.is_following) }));
    searchResultsCache.set(cacheKey, { at: Date.now(), value: result });
    return result;
  }

  const fsMe = firestoreFollowActorId();
  if (!fsMe) {
    const result = rows.map((r) => ({ ...r, is_following: Boolean(r.is_following) }));
    searchResultsCache.set(cacheKey, { at: Date.now(), value: result });
    return result;
  }

  // ✨ Оптимізація: Батч-запит + фільтрація замість 24 окремих запитів
  const { collection, getDocs, query, where } = require('firebase/firestore');
  const userIds = new Set(rows.map((r) => String(r.user_id)));
  
  try {
    // Отримуємо всі socialFollows записи для поточного користувача за один запит
    const snap = await getDocs(
      query(
        collection(db, 'socialFollows'),
        where('__name__', '>=', `${fsMe}__`),
        where('__name__', '<', `${fsMe}__\uf8ff`)
      )
    );
    
    const followedIds = new Set();
    snap.docs.forEach((doc) => {
      const targetId = doc.id.replace(`${fsMe}__`, '');
      if (userIds.has(targetId)) {
        followedIds.add(targetId);
      }
    });

    const withFollowing = rows.map((row) => ({
      ...row,
      is_following: Boolean(row.is_following) || followedIds.has(String(row.user_id)),
    }));
    searchResultsCache.set(cacheKey, { at: Date.now(), value: withFollowing });
    return withFollowing;
  } catch (e) {
    // Fallback на API результати без Firestore перевірки
    if (__DEV__) console.warn('[socialApi] batch follow check failed:', e?.message);
    const result = rows.map((r) => ({ ...r, is_following: Boolean(r.is_following) }));
    searchResultsCache.set(cacheKey, { at: Date.now(), value: result });
    return result;
  }
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
        const mapped = mapBackendPublicProfileRow(body.profile);
        if (mapped) {
          if (__DEV__) console.log(`[socialApi] profile API HIT @${u}`);
          return mapped;
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[socialApi] profile API fallback', e?.message);
    }
  }

  const profile = await findProfileByUsername(u);
  if (!profile) throw new Error('profile_not_found');
  const me = currentUid();
  const fsMe = firestoreFollowActorId();
  let isFollowing = false;
  if (fsMe && profile.id && fsMe !== profile.id) {
    const { doc, getDoc } = require('firebase/firestore');
    const edge = await getDoc(doc(db, 'socialFollows', `${fsMe}__${profile.id}`)).catch(() => null);
    isFollowing = firestoreDocExists(edge);
  }
  return { ...toPublicRow(profile), is_following: isFollowing };
}

export async function socialGetPublicProfileFull(username, limit = 80) {
  const cacheKey = fullCacheKey(username, limit);
  const now = Date.now();
  const cached = fullProfileCache.get(cacheKey);
  if (cached && now - cached.at < FULL_PROFILE_CACHE_TTL_MS) {
    if (cached.value && Array.isArray(cached.value.posts)) {
      return cached.value;
    }
    fullProfileCache.delete(cacheKey);
  }

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
          profile: mapBackendPublicProfileRow(p),
          followers: Array.isArray(body.followers) ? body.followers.map(mapPerson) : [],
          following: Array.isArray(body.following) ? body.following.map(mapPerson) : [],
          friends: Array.isArray(body.friends) ? body.friends.map(mapPerson) : [],
          posts: normalizeFullProfilePosts(body.posts),
          stories: normalizeFullProfileStories(body.stories),
        };
        if (!result.profile) throw new Error('profile_not_found');
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
  const fsMe = firestoreFollowActorId();
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
  if (fsMe && profile.id && fsMe !== profile.id) {
    const edge = await getDoc(doc(db, 'socialFollows', `${fsMe}__${profile.id}`)).catch(() => null);
    isFollowing = firestoreDocExists(edge);
  }
  // Додаємо is_following для кожного рядка followers/following/friends
  if (fsMe) {
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
        batch.map((id) => getDoc(doc(db, 'socialFollows', `${fsMe}__${id}`))),
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
    posts: [],
    stories: [],
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

function bustFollowCaches() {
  bustSocialProfileCache();
}

function notifySocialGraphChange(reason, userId) {
  emitSocialGraphChanged({ reason, user_id: userId != null ? String(userId) : '' });
  void refreshSocialProfileCounts();
}

async function followViaFirestore(username) {
  const u = String(username || '').replace(/^@/, '').trim();
  const followerUid = currentFirebaseUid();
  if (!followerUid) {
    throw new ApiError(401, { error: 'unauthorized' }, 'unauthorized');
  }
  if (!firebaseEnabled || !db) {
    throw new ApiError(503, { error: 'api_unavailable' }, 'api_unavailable');
  }
  const target = await findProfileByUsername(u);
  const followingId = String(target?.firebase_uid || target?.id || '').trim();
  if (!followingId || followingId === followerUid) {
    throw new ApiError(404, { error: 'user_not_found' }, 'user_not_found');
  }
  const { doc, setDoc, serverTimestamp } = require('firebase/firestore');
  await setDoc(doc(db, 'socialFollows', `${followerUid}__${followingId}`), {
    followerId: followerUid,
    followingId,
    createdAt: serverTimestamp(),
  });
  return { user_id: followingId, username: u };
}

async function unfollowViaFirestore(username) {
  const u = String(username || '').replace(/^@/, '').trim();
  const followerUid = currentFirebaseUid();
  if (!followerUid) {
    throw new ApiError(401, { error: 'unauthorized' }, 'unauthorized');
  }
  if (!firebaseEnabled || !db) {
    throw new ApiError(503, { error: 'api_unavailable' }, 'api_unavailable');
  }
  const target = await findProfileByUsername(u);
  const followingId = String(target?.firebase_uid || target?.id || '').trim();
  if (!followingId) {
    throw new ApiError(404, { error: 'user_not_found' }, 'user_not_found');
  }
  const { deleteDoc, doc } = require('firebase/firestore');
  await deleteDoc(doc(db, 'socialFollows', `${followerUid}__${followingId}`)).catch(() => {});
  return { user_id: followingId, username: u };
}

function emitFollowSuccess({ username, user_id }) {
  emitSocialFollowChanged({
    username,
    user_id,
    is_following: true,
    pending: false,
  });
  notifySocialGraphChange('follow', user_id);
}

export async function socialFollowUsername(username, opts = {}) {
  const u = String(username || '').replace(/^@/, '').trim();
  const userId = String(opts.user_id || '').trim();
  if (!u && !userId) return { ok: false };

  if (hasBackendSession() && isPostgresUuid(userId)) {
    try {
      const data = await apiAuthCall('POST', '/api/social/follow/by-id', { user_id: userId });
      bustFollowCaches();
      const pending = !!data?.pending;
      emitFollowSuccess({ username: u, user_id: userId, pending });
      return { ok: true, pending };
    } catch (apiErr) {
      if (!shouldUseFirestoreFollowFallback(apiErr)) throw apiErr;
    }
  }

  if (!u) return { ok: false };
  try {
    const data = await apiAuthCall('POST', '/api/social/follow', { username: u });
    bustFollowCaches();
    const pending = !!data?.pending;
    emitFollowSuccess({ username: u, user_id: data?.user_id || userId || undefined, pending });
    return { ok: true, pending };
  } catch (apiErr) {
    if (!shouldUseFirestoreFollowFallback(apiErr)) throw apiErr;
    const out = await followViaFirestore(u);
    bustFollowCaches();
    emitFollowSuccess({ username: out.username, user_id: out.user_id, pending: false });
    return { ok: true, pending: false };
  }
}

export async function socialUnfollowUsername(username, opts = {}) {
  const u = String(username || '').replace(/^@/, '').trim();
  const userId = String(opts.user_id || '').trim();
  if (!u && !userId) return { ok: false };

  if (hasBackendSession() && isPostgresUuid(userId)) {
    try {
      await apiAuthCall('DELETE', `/api/social/follow/by-id/${encodeURIComponent(userId)}`);
      bustFollowCaches();
      emitSocialFollowChanged({
        username: u,
        user_id: userId,
        is_following: false,
        pending: false,
      });
      notifySocialGraphChange('unfollow', userId);
      return { ok: true };
    } catch (apiErr) {
      if (!shouldUseFirestoreFollowFallback(apiErr)) throw apiErr;
    }
  }

  if (!u) return { ok: false };
  try {
    await apiAuthCall('DELETE', `/api/social/follow/${encodeURIComponent(u)}`);
    bustFollowCaches();
    emitSocialFollowChanged({
      username: u,
      is_following: false,
      pending: false,
    });
    notifySocialGraphChange('unfollow');
    return { ok: true };
  } catch (apiErr) {
    if (!shouldUseFirestoreFollowFallback(apiErr)) throw apiErr;
    const out = await unfollowViaFirestore(u);
    bustFollowCaches();
    emitSocialFollowChanged({
      username: out.username,
      user_id: out.user_id,
      is_following: false,
      pending: false,
    });
    notifySocialGraphChange('unfollow', out.user_id);
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
    bustFollowCaches();
    emitSocialFollowChanged({
      user_id: String(userId),
      is_following: false,
      pending: false,
    });
    notifySocialGraphChange('accept', userId);
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
    bustFollowCaches();
    notifySocialGraphChange('decline', userId);
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
    bustFollowCaches();
    notifySocialGraphChange('cancel_request', userId);
    return { ok: true };
  } catch {
    return { ok: true };
  }
}
