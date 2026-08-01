import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';

/**
 * Мережеве фото із вбудованою заглушкою: нейтральний фон + іконка видні,
 * поки фото вантажиться, і залишаються, якщо воно так і не завантажилось
 * (бек спить / повільна мережа / битий URL). Іконка лежить під фото,
 * тому стани loading/error не потребують жодного state.
 */
function RemotePhoto({ style, iconSize = 26, iconName = 'image-outline', children, ...imageProps }) {
  return (
    <View style={[styles.wrap, style]}>
      <Ionicons name={iconName} size={iconSize} color="rgba(120,120,128,0.55)" />
      <ExpoImage
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
        {...imageProps}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: 'rgba(120,120,128,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default React.memo(RemotePhoto);
