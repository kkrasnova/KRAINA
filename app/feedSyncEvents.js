import { DeviceEventEmitter } from 'react-native';
import { useAuthStore } from './auth/authStore';
import { resolveFeedLocalUser } from './feedLocalUser';
import { applyProfilePostsOptimistic, profilePostsCacheKey } from './profilePostsCache';
import { rememberPostLikeState, rememberPostCommentsCount } from './feedInteractionHotCache';

export const KRAINA_FEED_MEDIA_UPDATED = 'kraina_feed_media_updated_v1';

export { feedDeleteIdSet } from './feedDeleteIds';

export function emitFeedMediaUpdated(payload = {}) {
  try {
    if (payload?.kind === 'interaction') {
      const ids = [payload?.postId, payload?.localPostId].map(String).filter(Boolean);
      if (payload.liked != null || payload.likes_count != null) {
        rememberPostLikeState(ids, {
          liked: payload.liked,
          likes_count: payload.likes_count,
        });
      }
      if (payload.comments_count != null) {
        rememberPostCommentsCount(ids, payload.comments_count);
      }
    }
    DeviceEventEmitter.emit(KRAINA_FEED_MEDIA_UPDATED, payload);
    const feedUser = resolveFeedLocalUser(useAuthStore.getState().user);
    const userId = payload?.userId
      ? String(payload.userId)
      : feedUser?.id
        ? String(feedUser.id)
        : '';
    if (
      userId &&
      feedUser &&
      (payload.kind === 'post' || payload.kind === 'story' || payload.kind === 'delete')
    ) {
      const key = profilePostsCacheKey(feedUser, true);
      applyProfilePostsOptimistic(key, payload, userId);
    }
  } catch {
    /* ignore */
  }
}
