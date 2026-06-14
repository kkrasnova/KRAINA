/**
 * expo-av is excluded from native autolinking on SDK 56 (see app.json + react-native.config.js).
 * This shim keeps existing call sites working via expo-video + expo-audio.
 */
import React, { useEffect, useMemo } from 'react';
import { createAudioPlayer, setAudioModeAsync as setExpoAudioModeAsync } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';

export const ResizeMode = {
  CONTAIN: 'contain',
  COVER: 'cover',
  STRETCH: 'fill',
};

function normalizeVideoSource(source) {
  if (source == null) return null;
  if (typeof source === 'number') return source;
  if (typeof source === 'string') return source;
  if (typeof source === 'object' && source.uri) return source.uri;
  return source;
}

function normalizeAudioSource(source) {
  if (source == null) return null;
  if (typeof source === 'number') return source;
  if (typeof source === 'string') return source;
  if (typeof source === 'object' && source.uri) return source.uri;
  return source;
}

function mapContentFit(resizeMode) {
  if (resizeMode === ResizeMode.COVER) return 'cover';
  if (resizeMode === ResizeMode.STRETCH) return 'fill';
  return 'contain';
}

export function Video({
  source,
  style,
  resizeMode = ResizeMode.CONTAIN,
  shouldPlay = false,
  isLooping = false,
  isMuted = false,
  useNativeControls = true,
  onError,
  ...rest
}) {
  const videoSource = useMemo(() => normalizeVideoSource(source), [source]);
  const player = useVideoPlayer(videoSource, (playerInstance) => {
    playerInstance.loop = isLooping;
    playerInstance.muted = isMuted;
  });

  useEffect(() => {
    player.loop = isLooping;
  }, [player, isLooping]);

  useEffect(() => {
    player.muted = isMuted;
  }, [player, isMuted]);

  useEffect(() => {
    if (shouldPlay) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, shouldPlay]);

  useEffect(() => {
    if (!onError) return undefined;
    const subscription = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'error' || error) {
        onError(error);
      }
    });
    return () => subscription.remove();
  }, [player, onError]);

  return (
    <VideoView
      style={style}
      player={player}
      contentFit={mapContentFit(resizeMode)}
      nativeControls={useNativeControls}
      {...rest}
    />
  );
}

class CompatSound {
  constructor(player) {
    this._player = player;
    this._statusCallback = null;
    this._subscription = player.addListener('playbackStatusUpdate', (status) => {
      this._statusCallback?.(status);
    });
  }

  setOnPlaybackStatusUpdate(callback) {
    this._statusCallback = callback;
  }

  async playAsync() {
    this._player.play();
  }

  async stopAsync() {
    this._player.pause();
    await this._player.seekTo(0);
  }

  async unloadAsync() {
    this._subscription?.remove();
    this._player.remove();
  }
}

export const Audio = {
  setAudioModeAsync(mode = {}) {
    return setExpoAudioModeAsync({
      playsInSilentMode: mode.playsInSilentModeIOS ?? mode.playsInSilentMode ?? false,
    });
  },
  Sound: {
    async createAsync(source, initialStatus = {}) {
      const player = createAudioPlayer(normalizeAudioSource(source));
      const sound = new CompatSound(player);
      if (initialStatus.shouldPlay) {
        player.play();
      }
      return { sound };
    },
  },
};
