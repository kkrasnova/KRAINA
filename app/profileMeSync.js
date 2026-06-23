import { DeviceEventEmitter } from 'react-native';
import { useAuthStore } from './auth/authStore';
import {
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

/** Записати поля серверного профілю в локальний AsyncStorage (офлайн-резерв + узгодженість UI). */
export async function applyServerProfileToLocal(profile) {
  if (!profile || typeof profile !== 'object') return;
  const tasks = [];
  if (profile.display_name != null && String(profile.display_name).trim()) {
    tasks.push(setProfileDisplayName(String(profile.display_name).trim()));
  }
  if (profile.username != null && String(profile.username).trim()) {
    tasks.push(setProfileUsername(String(profile.username).replace(/^@/, '')));
  }
  if (profile.bio != null) {
    tasks.push(setProfileBio(String(profile.bio)));
  }
  if (profile.location_label != null) {
    tasks.push(setProfileCity(String(profile.location_label)));
  }
  if (profile.birth_date) {
    tasks.push(setProfileBirthDate(String(profile.birth_date).slice(0, 10)));
  }
  if (profile.birth_date_public != null) {
    tasks.push(setProfileBirthPublic(Boolean(profile.birth_date_public)));
  }
  if (tasks.length) await Promise.all(tasks);
}

export function emitProfileMeUpdated(payload = {}) {
  try {
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
