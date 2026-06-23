import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, DeviceEventEmitter } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { resolveFeedMediaUrl } from './feedMediaUrl';
import { useAuthStore } from './auth/authStore';
import { getProfileAvatarLocalUri, KRAINA_PROFILE_AVATAR_CHANGED } from './profileStorage';

/** Джерело правди для власного профілю з бекендом — лише avatar_url з акаунта. */
export function resolveProfileAvatarUri({
  isOwnProfile = false,
  accessToken = null,
  profileAvatarUrlRaw = null,
  localAvatarUri = '',
  userAvatar = null,
} = {}) {
  const serverRaw = profileAvatarUrlRaw != null ? String(profileAvatarUrlRaw).trim() : '';
  const serverUri = serverRaw ? resolveFeedMediaUrl(serverRaw) : '';
  const local = localAvatarUri && String(localAvatarUri).trim() ? resolveFeedMediaUrl(localAvatarUri) : '';
  const legacy = userAvatar && String(userAvatar).trim() ? resolveFeedMediaUrl(userAvatar) : '';
  return serverUri || local || legacy || '';
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

  return useMemo(
    () =>
      resolveProfileAvatarUri({
        isOwnProfile: true,
        accessToken,
        profileAvatarUrlRaw,
        localAvatarUri,
        userAvatar: user?.avatar,
      }),
    [accessToken, profileAvatarUrlRaw, localAvatarUri, user?.avatar],
  );
}

function ProfileAvatarCircle({ uri, size = 82, isLight = true, style }) {
  const radius = size / 2;
  const dim = { width: size, height: size, borderRadius: radius };
  const resolved = uri && String(uri).trim() ? String(uri).trim() : '';
  if (resolved) {
    return (
      <ExpoImage
        source={{ uri: resolved }}
        style={[dim, style]}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
      />
    );
  }
  const bg = isLight ? '#D1D1D6' : '#3A3A3C';
  const iconColor = isLight ? '#8E8E93' : '#AEAEB2';
  const iconSize = Math.round(size * 0.46);
  return (
    <View style={[dim, styles.fallback, { backgroundColor: bg }, style]}>
      <Ionicons name="person" size={iconSize} color={iconColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
});

export default memo(ProfileAvatarCircle);
