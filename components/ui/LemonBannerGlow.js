import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Легке лаймове світіння по контуру блоку (заголовок / «банер»), без суцільної заливки.
 */
export default function LemonBannerGlow({ children, style, contentStyle, borderRadius = 16 }) {
  return (
    <View style={[styles.wrap, { borderRadius }, style]}>
      <View style={[styles.gradientClip, { borderRadius }]} pointerEvents="none">
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(238, 255, 115, 0.085)', 'rgba(225, 255, 0, 0.028)', 'transparent']}
          locations={[0, 0.3, 0.65]}
          start={{ x: 0.02, y: 0 }}
          end={{ x: 0.92, y: 0.88 }}
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(225, 255, 0, 0.038)', 'transparent']}
          locations={[0.38, 0.74, 1]}
          start={{ x: 1, y: 0.15 }}
          end={{ x: 0.1, y: 0.95 }}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'visible',
  },
  gradientClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
});
