import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

function runOnPlayer(player, fn) {
  try {
    fn(player);
    return true;
  } catch {
    return false;
  }
}

/**
 * SplashTitleVideo — показує анімацію лого KRAINA.
 *
 * Використовуємо нативний loop (`loop: true`) — на Android це ExoPlayer
 * REPEAT_MODE_ONE, який робить seamless loop без переініціалізації декодера.
 *
 * Раніше був manual cross-fade loop (fade out → seek(0) → play → fade in),
 * але seek(0) на Android може спричиняти мікролаги через скидання буфера.
 */
export default function SplashTitleVideo({ source, style }) {
  const startedRef = useRef(false);
  const firstFrameRef = useRef(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const player = useVideoPlayer(source, (instance) => {
    instance.muted = true;
    instance.loop = true;
  });

  /**
   * Починаємо відтворення як тільки readyToPlay.
   * Але fade-in чекає на onFirstFrameRender — щоб на Android (TextureView)
   * перший кадр вже був відрендерений до початку анімації.
   *
   * Fallback: якщо onFirstFrameRender не спрацював за 500ms після readyToPlay,
   * починаємо fade-in в будь-якому разі (захист від дивних девайсів/версій expo-video).
   */
  useEffect(() => {
    let fallbackTimer = null;
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status !== 'readyToPlay' || startedRef.current) return;
      startedRef.current = true;
      runOnPlayer(player, (p) => p.play());
      // Fallback: fade-in навіть без onFirstFrameRender через 500ms
      fallbackTimer = setTimeout(() => {
        if (!firstFrameRef.current) {
          firstFrameRef.current = true;
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }).start();
        }
      }, 500);
    });
    return () => {
      sub.remove();
      if (fallbackTimer != null) clearTimeout(fallbackTimer);
    };
  }, [player, fadeAnim]);

  /** Коли перший кадр реально відрендерився — починаємо fade-in. */
  const handleFirstFrame = useCallback(() => {
    if (firstFrameRef.current) return;
    firstFrameRef.current = true;
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  return (
    <View pointerEvents="none" style={style}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: fadeAnim,
            backgroundColor: 'transparent',
          },
        ]}
      >
        <VideoView
          style={StyleSheet.absoluteFill}
          player={player}
          nativeControls={false}
          contentFit="contain"
          allowsFullscreen={false}
          useExoShutter={false}
          surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
          onFirstFrameRender={handleFirstFrame}
        />
      </Animated.View>
    </View>
  );
}
