import { DeviceEventEmitter } from 'react-native';
import { useAuthStore } from './auth/authStore';
import { rememberProfileAvatarUrl } from './profileAvatarHotCache';
import {
  getProfileDisplayName,
  getProfileUsername,
  getProfileBio,
  getProfileCity,
  getProfileBirthDate,
  getProfileBirthPublic,
  setProfileDisplayName,
  setProfileUsername,
  setProfileBio,
  setProfileCity,
  setProfileBirthDate,
  setProfileBirthPublic,
} from './profileStorage';

export const KRAINA_PROFILE_ME_UPDATED = 'kraina_profile_me_updated_v1';
/** Свіжість profile/me для лічильників і полів акаунта. */
export const PROFILE_ME_SYNC_TTL_MS = 1000;

/** Зчитати збережені локально поля профілю (AsyncStorage). */
export async function readLocalProfileSnapshot() {
  const [name, username, bio, city, birthDate, birthPublic] = await Promise.all([
    getProfileDisplayName(''),
    getProfileUsername(),
    getProfileBio(),
    getProfileCity(),
    getProfileBirthDate(),
    getProfileBirthPublic(),
  ]);
  return {
    name: String(name || '').trim(),
    username: String(username || '').trim(),
    bio: String(bio || '').trim(),
    city: String(city || '').trim(),
    birthDate: String(birthDate || '').trim().slice(0, 10),
    birthPublic: !!birthPublic,
  };
}

function pickProfileField(localVal, serverVal) {
  const local = localVal != null ? String(localVal).trim() : '';
  const server = serverVal != null ? String(serverVal).trim() : '';
  return local || server;
}

/** Обʼєднати локальні збереження з profile/me для відображення власного профілю. */
export async function resolveOwnProfileDisplayFields(pm) {
  const local = await readLocalProfileSnapshot();
  const name = pickProfileField(local.name, pm?.display_name);
  const bio = pickProfileField(local.bio, pm?.bio);
  const city = pickProfileField(local.city, pm?.location_label);
  const birthDate = pickProfileField(
    local.birthDate,
    pm?.birth_date ? String(pm.birth_date).slice(0, 10) : '',
  );
  const birthPublic =
    local.birthPublic || (pm?.birth_date_public != null ? Boolean(pm.birth_date_public) : false);
  const birthIso = birthDate && birthPublic ? birthDate : null;
  return { name, bio, city, birthIso };
}

/** Записати поля серверного профілю в локальний AsyncStorage (офлайн-резерв + узгодженість UI). */
export async function applyServerProfileToLocal(profile) {
  if (!profile || typeof profile !== 'object') return;
  const local = await readLocalProfileSnapshot();
  const tasks = [];
  const serverName = profile.display_name != null ? String(profile.display_name).trim() : '';
  if (serverName && !local.name) {
    tasks.push(setProfileDisplayName(serverName));
  }
  const serverUsername =
    profile.username != null ? String(profile.username).replace(/^@/, '').trim() : '';
  if (serverUsername && !local.username.replace(/^@/, '').trim()) {
    tasks.push(setProfileUsername(serverUsername));
  }
  if (profile.bio != null && !local.bio) {
    tasks.push(setProfileBio(String(profile.bio)));
  }
  if (profile.location_label != null && !local.city) {
    tasks.push(setProfileCity(String(profile.location_label)));
  }
  if (profile.birth_date && !local.birthDate) {
    tasks.push(setProfileBirthDate(String(profile.birth_date).slice(0, 10)));
  }
  if (profile.birth_date_public != null && !local.birthDate) {
    tasks.push(setProfileBirthPublic(Boolean(profile.birth_date_public)));
  }
  if (tasks.length) await Promise.all(tasks);
}

export function emitProfileMeUpdated(payload = {}) {
  try {
    const av = useAuthStore.getState().profileMe?.profile?.avatar_url;
    if (av) rememberProfileAvatarUrl(String(av));
    DeviceEventEmitter.emit(KRAINA_PROFILE_ME_UPDATED, payload);
  } catch {
    /* ignore */
  }
}

/** Після соціальних дій — оновити лічильники підписок з бекенду. */
export async function refreshSocialProfileCounts() {
  try {
    if (!useAuthStore.getState().accessToken) return null;

    const { bustSocialProfileCache } = await import('./socialApi');
    bustSocialProfileCache();
    await useAuthStore.getState().loadProfileMe();

    const profile = useAuthStore.getState().profileMe?.profile;
    if (profile) await applyServerProfileToLocal(profile);

    const counts = {
      followersCount: Number(profile?.followers_count) || 0,
      followingCount: Number(profile?.following_count) || 0,
    };
    emitProfileMeUpdated({ source: 'social_counts', counts });
    return counts;
  } catch {
    return null;
  }
}
