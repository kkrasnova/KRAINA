import React, { useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { Image as ExpoImage } from 'expo-image';
import Svg, {
  Path,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
} from 'react-native-svg';

/**
 * Right-biased paint-blob photo for the quiz hero (mockup).
 */
export default function LandmarkQuizBrushHero({
  source,
  width,
  height,
  isLight = true,
  style,
}) {
  const w = Math.max(1, Math.round(Number(width) || 390));
  const h = Math.max(1, Math.round(Number(height) || 420));

  const brushPath = useMemo(() => {
    const L = (x) => +(w * x).toFixed(1);
    const T = (y) => +(h * y).toFixed(1);
    // Soft torn silhouette: open on the right, ragged on the left/bottom.
    return [
      `M${L(0.28)},${T(0.04)}`,
      `C${L(0.42)},${T(0.0)} ${L(0.62)},${T(0.01)} ${L(0.82)},${T(0.03)}`,
      `C${L(0.94)},${T(0.05)} ${L(1.0)},${T(0.12)} ${L(1.0)},${T(0.22)}`,
      `L${L(1.0)},${T(0.78)}`,
      `C${L(1.0)},${T(0.9)} ${L(0.92)},${T(0.98)} ${L(0.78)},${T(1.0)}`,
      `C${L(0.62)},${T(1.02)} ${L(0.5)},${T(0.94)} ${L(0.4)},${T(0.86)}`,
      `C${L(0.3)},${T(0.78)} ${L(0.24)},${T(0.7)} ${L(0.2)},${T(0.58)}`,
      `C${L(0.16)},${T(0.46)} ${L(0.14)},${T(0.36)} ${L(0.18)},${T(0.26)}`,
      `C${L(0.22)},${T(0.16)} ${L(0.24)},${T(0.08)} ${L(0.28)},${T(0.04)}`,
      `Z`,
    ].join(' ');
  }, [w, h]);

  if (!source) {
    return (
      <View
        style={[
          styles.root,
          { width: w, height: h },
          isLight ? styles.placeholderLight : styles.placeholderDark,
          style,
        ]}
      />
    );
  }

  const fadeStop = isLight ? '#F8F8FA' : '#08080A';

  return (
    <View
      style={[styles.root, { width: w, height: h }, style]}
      collapsable={false}
      needsOffscreenAlphaCompositing={Platform.OS === 'android'}
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
    >
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}>
            <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
              <Path d={brushPath} fill="#FFFFFF" />
            </Svg>
          </View>
        }
      >
        <ExpoImage
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition={{ top: '45%', left: '55%' }}
          cachePolicy="memory-disk"
          transition={160}
          allowDownscaling
          accessibilityIgnoresInvertColors
        />
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: isLight ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.14)' },
          ]}
        />
        <Svg
          pointerEvents="none"
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          style={StyleSheet.absoluteFill}
        >
          <Defs>
            <SvgLinearGradient id="quizBrushFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.7" stopColor={fadeStop} stopOpacity="0" />
              <Stop offset="1" stopColor={fadeStop} stopOpacity="0.65" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width={w} height={h} fill="url(#quizBrushFade)" />
        </Svg>
      </MaskedView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'visible',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 8 },
        shadowOpacity: 0.14,
        shadowRadius: 14,
      },
      android: { elevation: 3 },
    }),
  },
  placeholderLight: { backgroundColor: 'rgba(2,18,235,0.06)' },
  placeholderDark: { backgroundColor: 'rgba(225,255,0,0.08)' },
});
