import React, { memo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

/**
 * Обгортка фото+градієнт для карток на Home.
 * Без неї ExpoImage і LinearGradient — окремі GPU-шари і під час скролу
 * «рвуться» (одна частина їде вгору, інша вниз) на будь-якій країні/місті.
 */
function HomeScrollSafeMedia({ children, style }) {
  return (
    <View
      style={[styles.media, style]}
      pointerEvents="none"
      collapsable={false}
      needsOffscreenAlphaCompositing={Platform.OS === 'android'}
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
    >
      {children}
    </View>
  );
}

export default memo(HomeScrollSafeMedia);

/** Спільні стилі для full-bleed фото всередині картки. */
export const homeScrollSafeImageStyle = {
  width: '100%',
  height: '100%',
};

const styles = StyleSheet.create({
  media: {
    ...StyleSheet.absoluteFillObject,
  },
});
