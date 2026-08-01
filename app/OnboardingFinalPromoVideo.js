import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Asset } from 'expo-asset';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  useAndroidActivityReady,
  useStagedVideoPlayerMount,
  VideoRenderErrorBoundary,
} from './expoAvCompat';

const PROMO_VIDEO = require('./assets/onboarding-final-promo.mp4');

function runOnPlayer(player, fn) {
  try {
    fn(player);
    return true;
  } catch {
    return false;
  }
}

function OnboardingFinalPromoVideoInner({ source, style, mountView = true, onEnded, onError }) {
  const endedRef = useRef(false);

  const notifyEnded = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    onEnded?.();
  }, [onEnded]);

  const player = useVideoPlayer(source, (instance) => {
    instance.loop = false;
    instance.muted = false;
    instance.timeUpdateEventInterval = 0.25;
    if (Platform.OS === 'ios') {
      instance.audioMixingMode = 'mixWithOthers';
    }
  });

  const ensurePlaying = useCallback(() => {
    runOnPlayer(player, (p) => {
      if (p.status === 'readyToPlay' && !p.playing && !endedRef.current) {
        p.play();
      }
    });
  }, [player]);

  useEffect(() => {
    if (!mountView) return undefined;

    ensurePlaying();

    const statusSub = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'readyToPlay') {
        ensurePlaying();
      }
      if (status === 'error') {
        if (__DEV__) console.warn('[OnboardingFinalPromoVideo] error:', error?.message || error);
        onError?.(error);
        notifyEnded();
      }
    });

    const playingSub = player.addListener('playingChange', ({ isPlaying }) => {
      if (!isPlaying && player.status === 'readyToPlay' && !endedRef.current) {
        ensurePlaying();
      }
    });

    const endSub = player.addListener('playToEnd', () => {
      notifyEnded();
    });

    /** Fallback: якщо playToEnd не прийшов — вихід по тривалості. */
    const watchdog = setInterval(() => {
      try {
        const dur = Number(player.duration) || 0;
        const t = Number(player.currentTime) || 0;
        if (dur > 1 && t >= dur - 0.2) {
          notifyEnded();
        }
      } catch {
        /* ignore */
      }
    }, 400);

    const retryId = setInterval(ensurePlaying, 250);
    const stopRetryId = setTimeout(() => clearInterval(retryId), 6000);

    return () => {
      statusSub.remove();
      playingSub.remove();
      endSub.remove();
      clearInterval(watchdog);
      clearInterval(retryId);
      clearTimeout(stopRetryId);
      runOnPlayer(player, (p) => {
        try {
          p.pause();
        } catch {
          /* ignore */
        }
      });
    };
  }, [player, ensurePlaying, mountView, notifyEnded, onError]);

  if (!mountView) {
    return <View pointerEvents="none" style={style} />;
  }

  return (
    <View pointerEvents="none" style={style}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        nativeControls={false}
        contentFit="cover"
        allowsFullscreen={false}
        useExoShutter={false}
        surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
        onFirstFrameRender={ensurePlaying}
      />
    </View>
  );
}

/**
 * Повноекранне промо-відео фінального слайду онбордингу.
 * По завершенню (або помилці) викликає onEnded → перехід на вхід.
 */
export default function OnboardingFinalPromoVideo({ style, onEnded, enabled = true }) {
  const activityReady = useAndroidActivityReady();
  const [localUri, setLocalUri] = useState(null);
  const shouldRun = Boolean(enabled && localUri && activityReady);
  const { mountPlayer, mountView } = useStagedVideoPlayerMount(shouldRun);
  const endedOnceRef = useRef(false);

  const handleEnded = useCallback(() => {
    if (endedOnceRef.current) return;
    endedOnceRef.current = true;
    onEnded?.();
  }, [onEnded]);

  useEffect(() => {
    if (!enabled) {
      handleEnded();
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const asset = Asset.fromModule(PROMO_VIDEO);
        await asset.downloadAsync();
        if (cancelled) return;
        const uri = asset.localUri || asset.uri;
        if (!uri) throw new Error('promo video uri missing');
        setLocalUri(uri);
      } catch (e) {
        if (__DEV__) console.warn('[OnboardingFinalPromoVideo] preload failed:', e?.message || e);
        if (!cancelled) handleEnded();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, handleEnded]);

  /** Жорсткий таймаут, якщо відео зависло (~відео 52с + запас). */
  useEffect(() => {
    if (!enabled) return undefined;
    const t = setTimeout(handleEnded, 70000);
    return () => clearTimeout(t);
  }, [enabled, handleEnded]);

  if (!mountPlayer || !localUri) {
    return <View pointerEvents="none" style={[styles.fallback, style]} />;
  }

  return (
    <VideoRenderErrorBoundary
      fallbackStyle={[styles.fallback, style]}
      onFallback={handleEnded}
    >
      <OnboardingFinalPromoVideoInner
        source={localUri}
        style={style}
        mountView={mountView}
        onEnded={handleEnded}
        onError={handleEnded}
      />
    </VideoRenderErrorBoundary>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: '#000000',
  },
});
