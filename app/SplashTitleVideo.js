import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { preloadSplashTitleVideo } from './splashTitleVideoAsset';

function runOnPlayer(player, fn) {
  try {
    fn(player);
    return true;
  } catch {
    return false;
  }
}

function SplashTitleVideoPlayer({ localUri, style, onReady, onPlaybackStarted }) {
  const readyNotifiedRef = useRef(false);
  const playbackStartedRef = useRef(false);

  const notifyReady = useCallback(() => {
    if (readyNotifiedRef.current) return;
    readyNotifiedRef.current = true;
    onReady?.();
  }, [onReady]);

  const notifyPlaybackStarted = useCallback(
    (currentTime) => {
      if (playbackStartedRef.current) return;
      if (currentTime < 0.04) return;
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

  useEffect(() => {
    ensurePlaying();

    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        ensurePlaying();
      }
    });

    const playingSub = player.addListener('playingChange', ({ isPlaying }) => {
      if (isPlaying) {
        notifyPlaybackStarted(player.currentTime);
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
  }, [player, ensurePlaying, notifyPlaybackStarted, notifyReady]);

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
      />
    </View>
  );
}

/**
 * SplashTitleVideo — анімація лого KRAÏNA (скло/лінза по буквах).
 * Відтворення лише з локального file:// після Asset.downloadAsync.
 */
export default function SplashTitleVideo({ style, onReady, onPlaybackStarted }) {
  const [localUri, setLocalUri] = useState(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const uri = await preloadSplashTitleVideo();
        if (!cancelled) setLocalUri(uri);
      } catch (error) {
        if (__DEV__) {
          console.warn('[SplashTitleVideo] preload failed:', error?.message ?? error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!localUri) {
    return <View pointerEvents="none" style={style} />;
  }

  return (
    <SplashTitleVideoPlayer
      localUri={localUri}
      style={style}
      onReady={onReady}
      onPlaybackStarted={onPlaybackStarted}
    />
  );
}
