import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { ttlGetItem, ttlSetItem } from './ttlCache';
import { getRegion } from './routeRegionsData';

export const KRAINA_SAVED_ROUTES_CHANGED = 'kraina_saved_routes_changed';
export const KRAINA_PROFILE_AVATAR_CHANGED = 'kraina_profile_avatar_changed_v1';

function emitSavedRoutesChanged() {
  try {
    DeviceEventEmitter.emit(KRAINA_SAVED_ROUTES_CHANGED);
  } catch {
    /* */
  }
}

function emitProfileAvatarChanged() {
  try {
    DeviceEventEmitter.emit(KRAINA_PROFILE_AVATAR_CHANGED);
  } catch {
    /* */
  }
}

const K = {
  name: '@kraina_profile_display_name',
  username: '@kraina_profile_username',
  bio: '@kraina_profile_bio_v1',
  city: '@kraina_profile_city',
  avatarLocalUri: '@kraina_profile_avatar_local_uri_v1',
  birthDate: '@kraina_profile_birth_iso_v1',
  birthPublic: '@kraina_profile_birth_public_v1',
  postCaption: '@kraina_profile_post_caption',
  friends: '@kraina_profile_friends_json',
  invitations: '@kraina_profile_invitations_json',
  savedRoutes: '@kraina_profile_saved_routes_json',
  postComments: '@kraina_profile_post_comments_json',
  postLikeState: '@kraina_profile_post_like_state_json',
};

export async function clearProfileLocalCache() {
  try {
    await AsyncStorage.multiRemove([
      K.name,
      K.username,
      K.bio,
      K.city,
      K.avatarLocalUri,
      K.birthDate,
      K.birthPublic,
      K.postCaption,
      K.friends,
      K.invitations,
      K.savedRoutes,
      K.postComments,
      K.postLikeState,
    ]);
  } catch {
    /* ignore */
  }
}

const T_FALLBACK = require('./assets/kling_20260405_IMAGE____________5495_1.webp');

export function hydrateRoutePlan(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const region = getRegion(raw.regionId);
  const stops = (raw.stops || []).map((s) => {
    const lm = region?.landmarks?.find((l) => l.id === s.id);
    return {
      ...s,
      thumb: lm?.thumb ?? s.thumb ?? T_FALLBACK,
    };
  });
  const coordinates = (raw.coordinates || stops.map((x) => ({ latitude: x.lat, longitude: x.lng }))).map(
    (c) => ({
      latitude: c.latitude,
      longitude: c.longitude,
    }),
  );
  return {
    ...raw,
    stops,
    coordinates,
    ...(raw.mapRegion ? { mapRegion: raw.mapRegion } : {}),
    ...(raw.aiGenerated ? { aiGenerated: raw.aiGenerated } : {}),
  };
}

export function stripRoutePlanForStorage(plan) {
  if (!plan) return null;
  return {
    regionId: plan.regionId,
    regionTitleUk: plan.regionTitleUk,
    regionTitleEn: plan.regionTitleEn,
    countryUk: plan.countryUk,
    countryEn: plan.countryEn,
    flag: plan.flag,
    stops: (plan.stops || []).map((s) => {
      const row = {
        order: s.order,
        id: s.id,
        titleUk: s.titleUk,
        titleEn: s.titleEn,
        title: s.title,
        lat: s.lat,
        lng: s.lng,
        minutes: s.minutes,
      };
      if (s.thumb != null) row.thumb = s.thumb;
      if (s.category != null) row.category = s.category;
      return row;
    }),
    coordinates: plan.coordinates,
    totalKm: plan.totalKm,
    totalMinutes: plan.totalMinutes,
    transport: plan.transport,
    freeOnly: plan.freeOnly,
    budgetTier: plan.budgetTier ?? null,
    interests: plan.interests ?? null,
    userOrigin: plan.userOrigin || null,
    ...(plan.mapRegion ? { mapRegion: plan.mapRegion } : {}),
    ...(plan.aiGenerated ? { aiGenerated: plan.aiGenerated } : {}),
  };
}

export async function getProfileDisplayName(fallbackName) {
  const v = await AsyncStorage.getItem(K.name);
  return v && v.trim() ? v.trim() : (fallbackName || '');
}

export async function setProfileDisplayName(name) {
  await AsyncStorage.setItem(K.name, name);
}

export async function getProfileUsername() {
  const v = await AsyncStorage.getItem(K.username);
  return v && v.trim() ? v.trim() : '';
}

export async function setProfileUsername(u) {
  await AsyncStorage.setItem(K.username, u.startsWith('@') ? u : `@${u}`);
}

export async function getProfileBio() {
  const v = await AsyncStorage.getItem(K.bio);
  return v && v.trim() ? v.trim() : '';
}

export async function setProfileBio(text) {
  await AsyncStorage.setItem(K.bio, String(text || '').trim());
}

export async function getProfileCity() {
  const v = await AsyncStorage.getItem(K.city);
  return v && v.trim() ? v.trim() : '';
}

export async function setProfileCity(c) {
  await AsyncStorage.setItem(K.city, c);
}

export async function getProfileAvatarLocalUri() {
  const v = await AsyncStorage.getItem(K.avatarLocalUri);
  return v && v.trim() ? v.trim() : '';
}

export async function setProfileAvatarLocalUri(uri) {
  await AsyncStorage.setItem(K.avatarLocalUri, String(uri || '').trim());
  emitProfileAvatarChanged();
}

export async function clearProfileAvatarLocalUri() {
  await AsyncStorage.removeItem(K.avatarLocalUri);
  emitProfileAvatarChanged();
}

export async function getProfileBirthDate() {
  const v = await AsyncStorage.getItem(K.birthDate);
  return v && v.trim() ? v.trim() : '';
}

export async function setProfileBirthDate(iso) {
  await AsyncStorage.setItem(K.birthDate, String(iso || '').trim());
}

export async function getProfileBirthPublic() {
  const v = await AsyncStorage.getItem(K.birthPublic);
  return v === '1';
}

export async function setProfileBirthPublic(on) {
  await AsyncStorage.setItem(K.birthPublic, on ? '1' : '0');
}

export async function getFriends() {
  const raw = await AsyncStorage.getItem(K.friends);
  if (raw) {
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return j;
    } catch {
      /* fallthrough */
    }
  }
  return [];
}

export async function setFriends(list) {
  await AsyncStorage.setItem(K.friends, JSON.stringify(list));
}

export async function getInvitations() {
  const raw = await AsyncStorage.getItem(K.invitations);
  if (raw) {
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return j;
    } catch {
      /* fallthrough */
    }
  }
  return [];
}

export async function setInvitations(list) {
  await AsyncStorage.setItem(K.invitations, JSON.stringify(list));
}

export async function getSavedRoutesRaw() {
  return ttlGetItem('saved_routes', 30000, async () => {
    const raw = await AsyncStorage.getItem(K.savedRoutes);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  });
}

/** Повна заміна журналу (наприклад після завантаження з сервера). */
export async function replaceSavedRoutesRaw(arr) {
  const next = Array.isArray(arr) ? arr : [];
  await AsyncStorage.setItem(K.savedRoutes, JSON.stringify(next));
  await ttlSetItem('saved_routes', next, 30000);
  emitSavedRoutesChanged();
}

export async function getSavedRoutes() {
  const arr = await getSavedRoutesRaw();
  return arr.map((item) => ({
    ...item,
    routePlan: hydrateRoutePlan(item.routePlan),
  }));
}

export async function addSavedRoute(routePlan, titleHint) {
  const arr = await getSavedRoutesRaw();
  const stripped = stripRoutePlanForStorage(routePlan);
  const entry = {
    id: `sr_${Date.now()}`,
    savedAt: Date.now(),
    titleHint: titleHint || stripped?.regionTitleUk || 'Маршрут',
    routePlan: stripped,
  };
  arr.unshift(entry);
  await AsyncStorage.setItem(K.savedRoutes, JSON.stringify(arr));
  await ttlSetItem('saved_routes', arr, 30000);
  emitSavedRoutesChanged();
}

export async function removeSavedRoute(id) {
  const arr = await getSavedRoutesRaw();
  const next = arr.filter((x) => x.id !== id);
  await AsyncStorage.setItem(K.savedRoutes, JSON.stringify(next));
  await ttlSetItem('saved_routes', next, 30000);
  emitSavedRoutesChanged();
}

const POST_ID = 'profile_demo_post';

/** Демо-пост і відсутній id — спільне сховище; реальні пости фіду — окремі ключі за id. */
function postStorageScope(postId) {
  if (postId == null) return null;
  const s = String(postId).trim();
  if (!s || s === POST_ID) return null;
  const safe = s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return safe || null;
}

function likeStorageKey(postId) {
  const sc = postStorageScope(postId);
  return sc ? `${K.postLikeState}::${sc}` : K.postLikeState;
}

function commentsStorageKey(postId) {
  const sc = postStorageScope(postId);
  return sc ? `${K.postComments}::${sc}` : K.postComments;
}

function captionStorageKey(postId) {
  const sc = postStorageScope(postId);
  return sc ? `${K.postCaption}::${sc}` : K.postCaption;
}

export async function getPostLikeState(postId) {
  const key = likeStorageKey(postId);
  const raw = await AsyncStorage.getItem(key);
  if (raw) {
    try {
      const j = JSON.parse(raw);
      if (j && typeof j === 'object') return j;
    } catch {
      /* noop */
    }
  }
  return { liked: false, count: 0 };
}

export async function setPostLikeState(state, postId) {
  await AsyncStorage.setItem(likeStorageKey(postId), JSON.stringify(state));
}

export async function togglePostLike(postId) {
  const s = await getPostLikeState(postId);
  const next = s.liked
    ? { liked: false, count: Math.max(0, s.count - 1) }
    : { liked: true, count: s.count + 1 };
  await setPostLikeState(next, postId);
  return next;
}

export async function getPostComments(postId) {
  const key = commentsStorageKey(postId);
  const raw = await AsyncStorage.getItem(key);
  if (raw) {
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return j;
    } catch {
      /* noop */
    }
  }
  return [];
}

export async function addPostComment(postId, text) {
  const list = await getPostComments(postId);
  const next = [
    ...list,
    {
      id: `c_${Date.now()}`,
      author: 'Ви',
      time: 'щойно',
      text,
      likes: 0,
      liked: false,
    },
  ];
  await AsyncStorage.setItem(commentsStorageKey(postId), JSON.stringify(next));
  return next;
}

export async function toggleCommentLike(postId, commentId) {
  const list = await getPostComments(postId);
  const next = list.map((c) => {
    if (c.id !== commentId) return c;
    const liked = !c.liked;
    return {
      ...c,
      liked,
      likes: Math.max(0, c.likes + (liked ? 1 : -1)),
    };
  });
  await AsyncStorage.setItem(commentsStorageKey(postId), JSON.stringify(next));
  return next;
}

export async function getPostCaption(postId, defaultText) {
  const v = await AsyncStorage.getItem(captionStorageKey(postId));
  return v != null && String(v).trim() ? v.trim() : defaultText;
}

export async function setPostCaption(postId, text) {
  await AsyncStorage.setItem(captionStorageKey(postId), text);
}

export { POST_ID };
