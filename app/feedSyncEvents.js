import { DeviceEventEmitter } from 'react-native';
import { useAuthStore } from './auth/authStore';
import { applyProfilePostsOptimistic, profilePostsCacheKey } from './profilePostsCache';

export const KRAINA_FEED_MEDIA_UPDATED = 'kraina_feed_media_updated_v1';

export function emitFeedMediaUpdated(payload = {}) {
  try {
    DeviceEventEmitter.emit(KRAINA_FEED_MEDIA_UPDATED, payload);
    const user = useAuthStore.getState().user;
    const userId = payload?.userId ? String(payload.userId) : user?.id ? String(user.id) : '';
    if (userId && user && (payload.kind === 'post' || payload.kind === 'story')) {
      const key = profilePostsCacheKey(user, true);
      applyProfilePostsOptimistic(key, payload, userId);
    }
  } catch {
    /* ignore */
  }
}
