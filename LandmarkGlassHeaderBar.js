import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { brandFontHeadMedium } from './brandFont';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';

/** Ті самі властивості заголовка, що на `LandmarkResultPage`. */
export const LANDMARK_TITLE_SINGLE_LINE_PROPS = {
  numberOfLines: 1,
  adjustsFontSizeToFit: true,
  minimumFontScale: 0.58,
  maxFontSizeMultiplier: 1.34,
  ellipsizeMode: 'tail',
};

const LEMON = '#E1FF00';
const ACCENT_BLUE = '#0212EB';
const HEADER_H = 50;

/**
 * Pill header: білий + синя обводка/підкреслення (light),
 * темний + лимонна обводка/підкреслення (dark).
 */
export default function LandmarkGlassHeaderBar({
  isLight,
  accent,
  headerTitle,
  onBack,
  onMorePress,
  moreMenuOpen = false,
  showMore = true,
  bottomContent = null,
  Shell = View,
  shellStyle,
  accessibilityBackLabel = 'Back',
  accessibilityMoreLabel = 'More',
}) {
  const onFill = isLight ? ACCENT_BLUE : LEMON;
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const miniBarIosShadow =
    Platform.OS === 'ios'
      ? isLight
        ? {
            shadowColor: ACCENT_BLUE,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.14,
            shadowRadius: 14,
          }
        : {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.35,
            shadowRadius: 14,
          }
      : {};

  return (
    <Shell
      style={[
        styles.miniTopBar,
        isLight ? styles.miniTopBarLight : styles.miniTopBarDark,
        miniBarIosShadow,
        shellStyle,
      ]}
    >
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={isLight ? 40 : 52}
          tint={isLight ? 'light' : 'dark'}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      <View
        style={[
          styles.miniTopTint,
          isLight ? styles.miniTopTintLight : styles.miniTopTintDark,
        ]}
        pointerEvents="none"
      />

      <View style={styles.miniTopRow}>
        <Pressable
          style={({ pressed }) => [styles.miniTopIconHit, pressed && { opacity: 0.55 }]}
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={accessibilityBackLabel}
          android_ripple={ripple}
        >
          <Ionicons name="chevron-back" size={22} color={onFill} />
        </Pressable>

        <View style={styles.miniTopCenter}>
          <Text
            style={[styles.miniTopTitle, brandFontHeadMedium, { color: onFill }]}
            {...LANDMARK_TITLE_SINGLE_LINE_PROPS}
          >
            {headerTitle}
          </Text>
          {bottomContent}
        </View>

        {showMore && typeof onMorePress === 'function' ? (
          <Pressable
            style={({ pressed }) => [
              styles.miniTopIconHit,
              moreMenuOpen && { opacity: 0.85 },
              pressed && { opacity: 0.55 },
            ]}
            onPress={onMorePress}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={accessibilityMoreLabel}
            accessibilityState={{ expanded: moreMenuOpen }}
            android_ripple={ripple}
          >
            <Ionicons name="ellipsis-vertical" size={18} color={onFill} />
          </Pressable>
        ) : (
          <View style={styles.moreSpacer} />
        )}
      </View>
    </Shell>
  );
}

export const landmarkGlassHeaderDockStyle = {
  paddingHorizontal: 14,
};

const styles = StyleSheet.create({
  miniTopBar: {
    alignSelf: 'stretch',
    height: HEADER_H,
    maxHeight: HEADER_H,
    borderRadius: HEADER_H / 2,
    borderWidth: 1.5,
    overflow: 'hidden',
    ...Platform.select({
      android: { elevation: 8 },
    }),
  },
  miniTopBarLight: {
    backgroundColor: Platform.OS === 'ios' ? 'rgba(255,255,255,0.82)' : '#FFFFFF',
    borderColor: ACCENT_BLUE,
  },
  miniTopBarDark: {
    backgroundColor: Platform.OS === 'ios' ? 'rgba(20,20,24,0.88)' : '#141418',
    borderColor: LEMON,
  },
  miniTopTint: {
    ...StyleSheet.absoluteFillObject,
  },
  miniTopTintLight: {
    backgroundColor: Platform.OS === 'ios' ? 'rgba(255,255,255,0.55)' : '#FFFFFF',
  },
  miniTopTintDark: {
    backgroundColor: Platform.OS === 'ios' ? 'rgba(20,20,24,0.72)' : '#141418',
  },
  miniTopRow: {
    height: HEADER_H,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 2,
  },
  miniTopCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  miniTopIconHit: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  miniTopTitle: {
    width: '100%',
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 18,
    marginTop: 0,
    paddingTop: 0,
    includeFontPadding: false,
  },
  moreSpacer: {
    width: 36,
    height: 36,
  },
});
