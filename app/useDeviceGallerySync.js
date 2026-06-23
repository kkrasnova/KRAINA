import { useCallback, useEffect, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  fetchDeviceGalleryPreview,
  KRAINA_DEVICE_GALLERY_CHANGED,
  subscribeDeviceGalleryAppState,
} from './deviceGallerySync';
import { KRAINA_FEED_MEDIA_UPDATED } from './feedSyncEvents';

/**
 * Синхронізація превʼю з Apple Photos / Google Photos для профілю та стрічки історій.
 */
export function useDeviceGallerySync({ enabled = true, limit = 24 } = {}) {
  const [items, setItems] = useState([]);
  const [granted, setGranted] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      setGranted(false);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchDeviceGalleryPreview({ limit });
      setGranted(!!result.granted);
      setItems(Array.isArray(result.items) ? result.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, limit]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (!enabled) return undefined;
    const unsubApp = subscribeDeviceGalleryAppState(() => {
      void refresh();
    });
    const subGallery = DeviceEventEmitter.addListener(KRAINA_DEVICE_GALLERY_CHANGED, () => {
      void refresh();
    });
    const subFeed = DeviceEventEmitter.addListener(KRAINA_FEED_MEDIA_UPDATED, () => {
      void refresh();
    });
    return () => {
      unsubApp();
      subGallery.remove();
      subFeed.remove();
    };
  }, [enabled, refresh]);

  const latest = items[0] || null;

  return { items, latest, granted, loading, refresh };
}
