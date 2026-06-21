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

const FIGMA_CREAM = '#F2F2EA';

/** Висота смуги; `borderRadius` ≥ половини — щоб кінці були рівні півкола (stadium / pill). */
const GLASS_HEADER_MIN_HEIGHT = 56;

/**
 * Скляна «пілюля» як на міні-екрані пам’ятки: blur (iOS) + тінт + акцентна обводка.
 * `Shell` — зазвичай `View` або `Animated.View` (для анімації появи).
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
  const hasBottomContent = !!bottomContent;
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const miniBarIosShadow =
    Platform.OS === 'ios'
      ? isLight
        ? {
            shadowColor: '#0212EB',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 16,
          }
        : {
            shadowColor: accent,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.28,
            shadowRadius: 12,
          }
      : {};

  return (
    <Shell
      style={[
        styles.miniTopBar,
        isLight && styles.miniTopBarLight,
        miniBarIosShadow,
        !isLight && { borderColor: accent },
        shellStyle,
      ]}
    >
      <View style={[styles.miniTopBarClip, hasBottomContent && styles.miniTopBarClipWithBottom]}>
        {Platform.OS === 'ios' && !isLight ? (
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        ) : null}
        <View
          style={[
            styles.miniTopBarTint,
            isLight ? styles.miniTopBarTintLight : { backgroundColor: 'rgba(22,22,22,0.84)' },
          ]}
        />
        <View style={styles.miniTopRow}>
          <Pressable
            style={isLight ? styles.miniTopIconBtnLight : styles.miniTopIconBtnGlass}
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={accessibilityBackLabel}
            android_ripple={ripple}
          >
            <Text style={[styles.backGlyph, isLight && styles.backGlyphLight]}>‹</Text>
          </Pressable>
          <Text
            style={[
              styles.miniTopTitle,
              brandFontHeadMedium,
              isLight
                ? {
                    color: '#1E1E1E',
                    textShadowColor: 'transparent',
                    textShadowOffset: { width: 0, height: 0 },
                    textShadowRadius: 0,
                  }
                : { color: FIGMA_CREAM },
            ]}
            {...LANDMARK_TITLE_SINGLE_LINE_PROPS}
          >
            {headerTitle}
          </Text>
          {showMore && typeof onMorePress === 'function' ? (
            <Pressable
              style={[
                isLight ? styles.miniTopIconBtnLight : styles.miniTopIconBtnGlass,
                moreMenuOpen && (isLight ? styles.miniTopIconBtnLightActive : styles.miniTopIconBtnGlassActive),
              ]}
              onPress={onMorePress}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={accessibilityMoreLabel}
              accessibilityState={{ expanded: moreMenuOpen }}
              android_ripple={ripple}
            >
              <Ionicons name="ellipsis-vertical" size={20} color={isLight ? '#1E1E1E' : FIGMA_CREAM} />
            </Pressable>
          ) : (
            <View style={styles.moreSpacer} />
          )}
        </View>
        {bottomContent ? <View style={styles.bottomSlot}>{bottomContent}</View> : null}
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
    borderRadius: 9999,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: GLASS_HEADER_MIN_HEIGHT,
    ...Platform.select({
      android: { elevation: 10 },
    }),
  },
  miniTopBarLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(2, 18, 235, 0.08)',
    ...Platform.select({
      android: { elevation: 8 },
    }),
  },
  miniTopBarClip: {
    position: 'relative',
    minHeight: GLASS_HEADER_MIN_HEIGHT,
    justifyContent: 'center',
  },
  miniTopBarClipWithBottom: {
    minHeight: GLASS_HEADER_MIN_HEIGHT + 22,
  },
  miniTopBarTint: {
    ...StyleSheet.absoluteFillObject,
  },
  miniTopBarTintLight: {
    backgroundColor: '#FFFFFF',
  },
  miniTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    minHeight: GLASS_HEADER_MIN_HEIGHT,
    zIndex: 1,
  },
  miniTopIconBtnGlass: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniTopIconBtnLight: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniTopIconBtnGlassActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.62)',
  },
  miniTopIconBtnLightActive: {
    backgroundColor: 'rgba(2, 18, 235, 0.1)',
    borderColor: 'rgba(2, 18, 235, 0.28)',
  },
  backGlyphLight: {
    color: '#1E1E1E',
  },
  miniTopTitle: {
    flex: 1,
    marginHorizontal: 4,
    textAlign: 'center',
    color: FIGMA_CREAM,
    fontSize: 16,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  backGlyph: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '300',
    marginTop: -2,
  },
  moreSpacer: {
    width: 40,
    height: 40,
  },
  bottomSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});
