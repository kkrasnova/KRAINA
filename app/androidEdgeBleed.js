import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Paints Android system bar regions so themed screen backgrounds visually
 * continue behind the status and navigation bars.
 */
export default function AndroidEdgeBleed({ color }) {
  const insets = useSafeAreaInsets();
  if (Platform.OS !== 'android' || !color) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden>
      {insets.top > 0 ? (
        <View style={[styles.edge, styles.top, { height: insets.top, backgroundColor: color }]} />
      ) : null}
      {insets.bottom > 0 ? (
        <View style={[styles.edge, styles.bottom, { height: insets.bottom, backgroundColor: color }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  edge: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  top: { top: 0 },
  bottom: { bottom: 0 },
});
