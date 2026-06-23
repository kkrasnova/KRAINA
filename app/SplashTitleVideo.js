import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAndroidActivityReady, useStagedVideoPlayerMount, VideoRenderErrorBoundary } from './expoAvCompat';
import { preloadSplashTitleVideo } from './splashTitleVideoAsset';

function runOnPlayer(player, fn) {
  try {
    fn(player);
    return true;
  } catch {
    return false;
  }
}

function SplashTitleVideoPlayerInner({ localUri, style, mountView = true, onReady, onPlaybackStarted }) {
  const readyNotifiedRef = useRef(false);
  const playbackStartedRef = useRef(false);

  const notifyReady = useCallback(() => {
    if (readyNotifiedRef.current) return;
    readyNotifiedRef.current = true;
    onReady?.();
  }, [onReady]);

  const notifyPlaybackStarted = useCallback(
    (currentTime = 0, force = false) => {
      if (playbackStartedRef.current) return;
      if (!force && currentTime < 0.04) return;
      playbackStartedRef.current = true;
      onPlaybackStarted?.();
      notifyReady();
    },
    [notifyReady, onPlaybackStarted],
  );

  const player = useVideoPlayer(localUri, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.timeUpdateEventInterval = 0.08;
    if (Platform.OS === 'ios') {
      instance.audioMixingMode = 'mixWithOthers';
    }
  });

  const ensurePlaying = useCallback(() => {
    runOnPlayer(player, (p) => {
      if (p.status === 'readyToPlay' && !p.playing) {
        p.play();
      }
    });
  }, [player]);

  const handleFirstFrameRender = useCallback(() => {
    ensurePlaying();
    notifyPlaybackStarted(1, true);
  }, [ensurePlaying, notifyPlaybackStarted]);

  useEffect(() => {
    if (!mountView) return undefined;

    ensurePlaying();

    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        ensurePlaying();
      }
    });

    const playingSub = player.addListener('playingChange', ({ isPlaying }) => {
      if (isPlaying) {
        notifyPlaybackStarted(
          player.currentTime,
          Platform.OS === 'android',
        );
      } else if (player.status === 'readyToPlay') {
        ensurePlaying();
      }
    });

    const timeSub = player.addListener('timeUpdate', ({ currentTime }) => {
      notifyPlaybackStarted(currentTime);
    });

    const playToEndSub = player.addListener('playToEnd', () => {
      runOnPlayer(player, (p) => p.replay());
    });

    const retryId = setInterval(ensurePlaying, 200);
    const stopRetryId = setTimeout(() => clearInterval(retryId), 5000);

    return () => {
      statusSub.remove();
      playingSub.remove();
      timeSub.remove();
      playToEndSub.remove();
      clearInterval(retryId);
      clearTimeout(stopRetryId);
    };
  }, [player, ensurePlaying, notifyPlaybackStarted, notifyReady, mountView]);

  if (!mountView) {
    return <View pointerEvents="none" style={style} />;
  }

  return (
    <View pointerEvents="none" style={style}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        nativeControls={false}
        contentFit="contain"
        allowsFullscreen={false}
        useExoShutter={false}
        surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
        onFirstFrameRender={handleFirstFrameRender}
      />
    </View>
  );
}

function SplashTitleVideoPlayer({ localUri, style, mountView = true, onReady, onPlaybackStarted }) {
  const handleBoundaryReady = useCallback(() => {
    onReady?.();
    onPlaybackStarted?.();
  }, [onPlaybackStarted, onReady]);

  return (
    <VideoRenderErrorBoundary fallbackStyle={style} onFallback={handleBoundaryReady}>
      <SplashTitleVideoPlayerInner
        localUri={localUri}
        style={style}
        mountView={mountView}
        onReady={onReady}
        onPlaybackStarted={onPlaybackStarted}
      />
    </VideoRenderErrorBoundary>
  );
}

/**
 * SplashTitleVideo — анімація лого KRAÏNA (скло/лінза по буквах).
 * Відтворення лише з локального file:// після Asset.downloadAsync.
 */
export default function SplashTitleVideo({ style, onReady, onPlaybackStarted, enabled = true }) {
  const activityReady = useAndroidActivityReady();
  const [localUri, setLocalUri] = useState(null);
  const shouldRun = Boolean(enabled && localUri && activityReady);
  const { mountPlayer, mountView } = useStagedVideoPlayerMount(shouldRun);

  useEffect(() => {
    if (!enabled) {
      onReady?.();
      onPlaybackStarted?.();
      return undefined;
    }
    let cancelled = false;

    void (async () => {
      try {
        const uri = await preloadSplashTitleVideo();
        if (cancelled) return;
        if (!uri) {
          onReady?.();
          onPlaybackStarted?.();
          return;
        }
        setLocalUri(uri);
      } catch (error) {
        if (__DEV__) {
          console.warn('[SplashTitleVideo] preload failed:', error?.message ?? error);
        }
        if (!cancelled) {
          onReady?.();
          onPlaybackStarted?.();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, onPlaybackStarted, onReady]);

  if (!mountPlayer) {
    return <View pointerEvents="none" style={style} />;
  }

  return (
    <SplashTitleVideoPlayer
      localUri={localUri}
      style={style}
      mountView={mountView}
      onReady={onReady}
      onPlaybackStarted={onPlaybackStarted}
    />
  );
}
