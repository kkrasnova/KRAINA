import React, { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ls } from './landmarkScannerI18n';

const ACCENT_BLUE = '#0212EB';

export function LandmarkAudioGuideControls({
  visible,
  slideIndex,
  slideCount,
  accent,
  isLight,
  language,
  isPlaying,
  onToggle,
  onSeek,
  onPrev,
  onNext,
  bottomInset = 0,
}) {
  const trackWidthRef = useRef(0);

  const onTrackLayout = useCallback((e) => {
    const w = Number(e?.nativeEvent?.layout?.width);
    trackWidthRef.current = Number.isFinite(w) ? w : 0;
  }, []);

  const onTrackPress = useCallback(
    (e) => {
      const width = trackWidthRef.current;
      if (!width || slideCount <= 1) return;
      const x = Number(e?.nativeEvent?.locationX);
      if (!Number.isFinite(x)) return;
      const ratio = Math.max(0, Math.min(1, x / width));
      const idx = Math.round(ratio * (slideCount - 1));
      onSeek?.(idx);
    },
    [slideCount, onSeek],
  );

  if (!visible || slideCount <= 0) return null;

  const progress = slideCount > 1 ? slideIndex / (slideCount - 1) : 1;
  const label = ls(language, 'audioSlideCounter')
    .replace('{current}', String(slideIndex + 1))
    .replace('{total}', String(slideCount));

  return (
    <View
      style={[
        styles.wrap,
        isLight ? styles.wrapLight : styles.wrapDark,
        { bottom: bottomInset },
      ]}
      pointerEvents="box-none"
    >
      <View style={[styles.panel, isLight ? styles.panelLight : styles.panelDark]}>
        <View style={styles.row}>
          <Pressable
            onPress={onPrev}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={ls(language, 'audioPrevSlide')}
            style={styles.iconBtn}
          >
            <Ionicons
              name="play-skip-back"
              size={20}
              color={isLight ? ACCENT_BLUE : accent}
            />
          </Pressable>

          <Pressable
            onPress={onToggle}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? ls(language, 'audioPause') : ls(language, 'audioResume')}
            style={[styles.playBtn, isLight ? styles.playBtnLight : styles.playBtnDark]}
          >
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={18}
              color={isLight ? '#FFFFFF' : '#1E1E1E'}
            />
          </Pressable>

          <Pressable
            onPress={onNext}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={ls(language, 'audioNextSlide')}
            style={styles.iconBtn}
          >
            <Ionicons
              name="play-skip-forward"
              size={20}
              color={isLight ? ACCENT_BLUE : accent}
            />
          </Pressable>
        </View>

        <Pressable
          onLayout={onTrackLayout}
          onPress={onTrackPress}
          accessibilityRole="adjustable"
          accessibilityLabel={ls(language, 'audioScrubber')}
          accessibilityValue={{ text: label }}
          style={styles.trackHit}
        >
          <View style={[styles.track, isLight ? styles.trackLight : styles.trackDark]}>
            <View
              style={[
                styles.trackFill,
                {
                  width: `${Math.round(progress * 100)}%`,
                  backgroundColor: isLight ? ACCENT_BLUE : accent,
                },
              ]}
            />
            <View
              style={[
                styles.thumb,
                {
                  left: `${Math.round(progress * 100)}%`,
                  backgroundColor: isLight ? ACCENT_BLUE : accent,
                },
              ]}
            />
          </View>
        </Pressable>

        <Text style={[styles.counter, isLight ? styles.counterLight : styles.counterDark]}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 20,
  },
  wrapLight: {},
  wrapDark: {},
  panel: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 6 },
    }),
  },
  panelLight: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(2,18,235,0.12)',
  },
  panelDark: {
    backgroundColor: 'rgba(22,22,22,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(225,255,0,0.16)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginBottom: 10,
  },
  iconBtn: {
    padding: 4,
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnLight: {
    backgroundColor: ACCENT_BLUE,
  },
  playBtnDark: {
    backgroundColor: '#E1FF00',
  },
  trackHit: {
    paddingVertical: 8,
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'visible',
    position: 'relative',
  },
  trackLight: {
    backgroundColor: 'rgba(2,18,235,0.14)',
  },
  trackDark: {
    backgroundColor: 'rgba(225,255,0,0.2)',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
  },
  counter: {
    marginTop: 2,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
  counterLight: {
    color: 'rgba(30,30,30,0.72)',
  },
  counterDark: {
    color: 'rgba(242,242,234,0.72)',
  },
});
