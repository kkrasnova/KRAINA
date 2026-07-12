import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, DeviceEventEmitter } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { resolveFeedMediaUrl } from './feedMediaUrl';
import { useAuthStore } from './auth/authStore';
import { getProfileAvatarLocalUri, KRAINA_PROFILE_AVATAR_CHANGED } from './profileStorage';
import { peekProfileAvatarUrl, rememberProfileAvatarUrl } from './profileAvatarHotCache';

/** Джерело правди для власного профілю з бекендом — лише avatar_url з акаунта. */
export function resolveProfileAvatarUri({
  isOwnProfile = false,
  accessToken = null,
  profileAvatarUrlRaw = null,
  localAvatarUri = '',
  userAvatar = null,
  fallbackAvatarUrl = '',
} = {}) {
  const serverRaw = profileAvatarUrlRaw != null ? String(profileAvatarUrlRaw).trim() : '';
  const serverUri = serverRaw ? resolveFeedMediaUrl(serverRaw) : '';
  const local = localAvatarUri && String(localAvatarUri).trim() ? resolveFeedMediaUrl(localAvatarUri) : '';
  const legacy = userAvatar && String(userAvatar).trim() ? resolveFeedMediaUrl(userAvatar) : '';
  const hot = fallbackAvatarUrl
    ? resolveFeedMediaUrl(String(fallbackAvatarUrl))
    : peekProfileAvatarUrl()
      ? resolveFeedMediaUrl(peekProfileAvatarUrl())
      : '';
  // Локальний sandbox-файл — свіжий превʼю під час вибору/завантаження.
  if (isOwnProfile && local) {
    if (!serverUri) return local;
    if (local.startsWith('file://') || local.includes('kraina_feed_media/')) return local;
  }
  return serverUri || local || legacy || hot || '';
}

/** Аватар поточного користувача — той самий resolve, що й на ProfilePage. */
export function useViewerProfileAvatarUri(user) {
  const profileAvatarUrlRaw = useAuthStore((s) => s.profileMe?.profile?.avatar_url);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [localAvatarUri, setLocalAvatarUri] = useState('');

  const refreshLocal = useCallback(async () => {
    try {
      const av = await getProfileAvatarLocalUri();
      setLocalAvatarUri(av || '');
    } catch {
      setLocalAvatarUri('');
    }
  }, []);

  useEffect(() => {
    void refreshLocal();
    const sub = DeviceEventEmitter.addListener(KRAINA_PROFILE_AVATAR_CHANGED, () => {
      void refreshLocal();
    });
    return () => sub.remove();
  }, [refreshLocal]);

  const uri = useMemo(() => {
    const resolved = resolveProfileAvatarUri({
      isOwnProfile: true,
      accessToken,
      profileAvatarUrlRaw,
      localAvatarUri,
      userAvatar: user?.avatar,
    });
    if (resolved) rememberProfileAvatarUrl(resolved);
    return resolved;
  }, [accessToken, profileAvatarUrlRaw, localAvatarUri, user?.avatar]);

  return uri;
}

function ProfileAvatarCircle({ uri, size = 82, isLight = true, style }) {
  const radius = size / 2;
  const dim = { width: size, height: size, borderRadius: radius };
  const resolved = uri && String(uri).trim() ? String(uri).trim() : '';
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [resolved]);

  const bg = isLight ? '#D1D1D6' : '#3A3A3C';
  const iconColor = isLight ? '#8E8E93' : '#AEAEB2';
  const iconSize = Math.round(size * 0.46);

  if (!resolved || loadFailed) {
    return (
      <View style={[dim, styles.fallback, { backgroundColor: bg }, style]}>
        <Ionicons name="person" size={iconSize} color={iconColor} />
      </View>
    );
  }

  return (
    <ExpoImage
      source={{ uri: resolved }}
      style={[dim, style]}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={0}
      onError={() => setLoadFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
});

export default memo(ProfileAvatarCircle);
