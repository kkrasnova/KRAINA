import { DeviceEventEmitter } from 'react-native';

export const KRAINA_FEED_MEDIA_UPDATED = 'kraina_feed_media_updated_v1';

export function emitFeedMediaUpdated(payload = {}) {
  try {
    DeviceEventEmitter.emit(KRAINA_FEED_MEDIA_UPDATED, payload);
  } catch {
    /* ignore */
  }
}
