/**
 * expo-av is excluded from native autolinking on SDK 56 (see app.json + react-native.config.js).
 * This shim keeps existing call sites working via expo-video + expo-audio.
 */
import React, { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Image, Platform, StyleSheet, View } from 'react-native';
import { createAudioPlayer, setAudioModeAsync as setExpoAudioModeAsync } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { APP_PLAYBACK_AUDIO_MODE } from './audioSession';
import { runAfterInteractions } from './runAfterInteractions';

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

/** Catches render-time expo-video failures when Android Activity is not ready yet. */
class VideoRenderErrorBoundary extends Component {
  state = { hasError: false, retryKey: 0 };

  _retryTimer = null;

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    if (__DEV__) {
      console.warn('[Video] render failed:', error?.message);
    }
    const msg = String(error?.message || '');
    if (
      msg.includes('activity is no longer available') ||
      msg.includes('Activity')
    ) {
      this._retryTimer = setTimeout(() => {
        this.setState((prev) => ({
          hasError: false,
          retryKey: prev.retryKey + 1,
        }));
      }, 400);
    }
  }

  componentWillUnmount() {
    if (this._retryTimer != null) clearTimeout(this._retryTimer);
  }

  render() {
    if (this.state.hasError) {
      const { fallbackStyle } = this.props;
      return fallbackStyle ? <View style={fallbackStyle} /> : null;
    }
    const child = React.Children.only(this.props.children);
    return React.cloneElement(child, {
      key: `video-player-${this.state.retryKey}`,
    });
  }
}

function useAndroidActivityReady() {
  const [ready, setReady] = useState(Platform.OS !== 'android');

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    let cancelled = false;
    let timeoutId = null;

    const markReady = () => {
      if (!cancelled) setReady(true);
    };

    const armReady = () => {
      if (cancelled) return;
      // Cold start: AppState "active" can precede a usable Activity for expo-video.
      timeoutId = setTimeout(markReady, 280);
    };

    if (AppState.currentState !== 'active') {
      const subscription = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') armReady();
      });
      return () => {
        cancelled = true;
        if (timeoutId != null) clearTimeout(timeoutId);
        subscription.remove();
      };
    }

    const handle = runAfterInteractions(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(armReady);
      });
    });

    return () => {
      cancelled = true;
      if (timeoutId != null) clearTimeout(timeoutId);
      handle.cancel();
    };
  }, []);

  return ready;
}

function VideoPlayerInner({
  videoSource,
  style,
  resizeMode = ResizeMode.CONTAIN,
  shouldPlay = false,
  isLooping = false,
  isMuted = false,
  useNativeControls = true,
  onError,
  onReadyForDisplay,
  onFirstFrameRender,
  surfaceType,
  ...rest
}) {
  const player = useVideoPlayer(videoSource, (playerInstance) => {
    playerInstance.loop = isLooping;
    playerInstance.muted = isMuted;
    playerInstance.audioMixingMode = 'mixWithOthers';
  });
  const readyToPlayRef = useRef(false);

  useEffect(() => {
    player.loop = isLooping;
  }, [player, isLooping]);

  useEffect(() => {
    player.muted = isMuted;
  }, [player, isMuted]);

  useEffect(() => {
    if (!shouldPlay) {
      player.pause();
      return;
    }
    if (readyToPlayRef.current) {
      player.play();
    }
  }, [player, shouldPlay]);

  useEffect(() => {
    if (!onError && !onReadyForDisplay && !onFirstFrameRender) return undefined;
    const subscription = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'readyToPlay') {
        readyToPlayRef.current = true;
        if (shouldPlay) {
          player.play();
        }
        onReadyForDisplay?.();
      }
      if (onError && (status === 'error' || error)) {
        onError(error);
      }
    });
    return () => subscription.remove();
  }, [player, onError, onReadyForDisplay, onFirstFrameRender, shouldPlay]);

  return (
    <VideoView
      style={style}
      player={player}
      contentFit={mapContentFit(resizeMode)}
      nativeControls={useNativeControls}
      surfaceType={surfaceType}
      useExoShutter={false}
      onFirstFrameRender={onFirstFrameRender}
      {...rest}
    />
  );
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
  onReadyForDisplay,
  onFirstFrameRender,
  surfaceType,
  /** Показати Image-постер з source до першого кадра відео. */
  showPoster = false,
  /** Rare override: mount before Android activity deferral completes. */
  immediateMount = false,
  ...rest
}) {
  const videoSource = useMemo(() => normalizeVideoSource(source), [source]);
  const activityReady = useAndroidActivityReady();
  const canMountPlayer = immediateMount || activityReady;
  const [firstFrameReady, setFirstFrameReady] = useState(!showPoster);
  const posterTimerRef = useRef(null);

  /** Скидаємо firstFrameReady при зміні source. */
  useEffect(() => {
    if (!showPoster) return;
    setFirstFrameReady(false);

    posterTimerRef.current = setTimeout(() => {
      setFirstFrameReady(true);
    }, 500);

    return () => {
      if (posterTimerRef.current != null) clearTimeout(posterTimerRef.current);
    };
  }, [showPoster, videoSource]);

  const internalOnFirstFrame = useCallback(() => {
    if (posterTimerRef.current != null) clearTimeout(posterTimerRef.current);
    setFirstFrameReady(true);
    onFirstFrameRender?.();
  }, [onFirstFrameRender]);

  if (!videoSource || !canMountPlayer) {
    return null;
  }

  const contentFit = mapContentFit(resizeMode);

  const playerElement = (
    <VideoRenderErrorBoundary fallbackStyle={style}>
      <VideoPlayerInner
        videoSource={videoSource}
        style={showPoster ? StyleSheet.absoluteFill : style}
        resizeMode={resizeMode}
        shouldPlay={shouldPlay}
        isLooping={isLooping}
        isMuted={isMuted}
        useNativeControls={useNativeControls}
        onError={onError}
        onReadyForDisplay={onReadyForDisplay}
        onFirstFrameRender={showPoster ? internalOnFirstFrame : onFirstFrameRender}
        surfaceType={surfaceType}
        {...rest}
      />
    </VideoRenderErrorBoundary>
  );

  if (!showPoster || firstFrameReady) {
    return playerElement;
  }

  return (
    <View style={style}>
      <View style={StyleSheet.absoluteFill}>
        {playerElement}
      </View>
      <Image
        source={source}
        style={[StyleSheet.absoluteFill, { borderRadius: style?.borderRadius }]}
        resizeMode={contentFit === 'fill' ? 'stretch' : contentFit}
        fadeDuration={0}
      />
    </View>
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
      ...APP_PLAYBACK_AUDIO_MODE,
      playsInSilentMode:
        mode.playsInSilentModeIOS ?? mode.playsInSilentMode ?? APP_PLAYBACK_AUDIO_MODE.playsInSilentMode,
      interruptionMode: mode.interruptionMode ?? APP_PLAYBACK_AUDIO_MODE.interruptionMode,
      allowsRecording: mode.allowsRecording ?? APP_PLAYBACK_AUDIO_MODE.allowsRecording,
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
