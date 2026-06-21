import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

function normalizeCompareSource(asset, uri) {
  if (typeof asset === 'number') return asset;
  const u = String(uri || '').trim();
  return u ? { uri: u } : null;
}

/**
 * Vertical compare:
 * - drag handle up => shows more "before" (historic) photo
 * - drag handle down => shows more "after/current" photo
 */
export default function LandmarkPhotoCompare({
  beforeUri,
  afterUri,
  beforeSource,
  afterSource,
  initialPosition = 0.5,
  containerHeight = 0,
  nestedInScroll = false,
  isLight = false,
  style,
  onDragStateChange,
}) {
  const [layoutHeight, setLayoutHeight] = useState(0);
  const [dividerY, setDividerY] = useState(0);
  const dragStartRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const dividerYRef = useRef(0);

  const effectiveHeight = layoutHeight > 0 ? layoutHeight : Math.max(1, Number(containerHeight) || 1);
  dividerYRef.current = dividerY;

  const clampY = (y, h = effectiveHeight) => {
    const max = Math.max(0, h);
    return Math.max(0, Math.min(max, y));
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dy) > (nestedInScroll ? 10 : 6) && Math.abs(g.dy) > Math.abs(g.dx) * 0.9,
        onMoveShouldSetPanResponderCapture: (_, g) =>
          Math.abs(g.dy) > (nestedInScroll ? 8 : 4) && Math.abs(g.dy) > Math.abs(g.dx) * 0.85,
        onPanResponderGrant: () => {
          onDragStateChange?.(true);
          const h = Math.max(layoutHeight, Number(containerHeight) || 0, 1);
          const current = dividerYRef.current;
          const start = current > 0 ? current : h * initialPosition;
          dragStartRef.current = clampY(start, h);
        },
        onPanResponderMove: (_, g) => {
          hasDraggedRef.current = true;
          setDividerY(clampY(dragStartRef.current + g.dy));
        },
        onPanResponderRelease: (_, g) => {
          onDragStateChange?.(false);
          const h = effectiveHeight;
          const next = clampY(dragStartRef.current + g.dy, h);
          const edgeSnap = 18;
          if (next <= edgeSnap) {
            setDividerY(0);
            return;
          }
          if (next >= h - edgeSnap) {
            setDividerY(h);
            return;
          }
          setDividerY(next);
        },
        onPanResponderTerminate: () => {
          onDragStateChange?.(false);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [initialPosition, layoutHeight, containerHeight, effectiveHeight, nestedInScroll, onDragStateChange],
  );

  const onLayout = (e) => {
    const nextH = Number(e?.nativeEvent?.layout?.height);
    if (!Number.isFinite(nextH) || nextH <= 0) return;
    setLayoutHeight(nextH);
    if (!hasDraggedRef.current) setDividerY(clampY(nextH * initialPosition, nextH));
  };

  const currentDividerY =
    dividerY > 0 ? clampY(dividerY) : clampY(effectiveHeight * initialPosition);
  const topHeight = Math.max(0, currentDividerY);
  const bottomTop = Math.max(0, currentDividerY);
  const bottomHeight = Math.max(0, effectiveHeight - bottomTop);
  const lineTop = Math.max(0, Math.min(Math.max(0, effectiveHeight - 2), currentDividerY));
  const knobTop = Math.max(0, Math.min(Math.max(0, effectiveHeight - 88), currentDividerY - 44));

  const topSource = normalizeCompareSource(afterSource, afterUri);
  const bottomSource = normalizeCompareSource(beforeSource, beforeUri);

  const lineColor = isLight ? 'rgba(12,47,168,0.75)' : 'rgba(255,255,255,0.92)';
  const knobBg = isLight ? 'rgba(255,255,255,0.96)' : 'rgba(66,72,74,0.94)';
  const knobBorder = isLight ? 'rgba(12,47,168,0.35)' : 'rgba(225,255,0,0.72)';
  const knobArrowColor = isLight ? '#0C2FA8' : '#E1FF00';
  const knobDividerColor = isLight ? 'rgba(12,47,168,0.55)' : 'rgba(225,255,0,0.78)';

  const fullLayerStyle = useMemo(
    () => ({ width: '100%', height: effectiveHeight }),
    [effectiveHeight],
  );

  if (!topSource && !bottomSource) {
    return <View style={[styles.wrap, style, styles.emptyCompare]} onLayout={onLayout} />;
  }

  return (
    <View
      style={[styles.wrap, isLight && styles.wrapLight, style]}
      onLayout={onLayout}
      {...panResponder.panHandlers}
    >
      {topSource && topHeight > 0 ? (
        <View style={[styles.overlayClip, { top: 0, height: topHeight }]}>
          <ExpoImage
            source={topSource}
            style={[styles.fullLayerImage, fullLayerStyle]}
            contentFit="cover"
            contentPosition="center"
            cachePolicy="memory-disk"
            transition={0}
            allowDownscaling
            accessibilityIgnoresInvertColors
          />
        </View>
      ) : null}

      {bottomSource && bottomHeight > 0 ? (
        <View style={[styles.overlayClip, { top: bottomTop, height: bottomHeight }]}>
          <ExpoImage
            source={bottomSource}
            style={[styles.fullLayerImage, fullLayerStyle, { top: -bottomTop }]}
            contentFit="cover"
            contentPosition="center"
            cachePolicy="memory-disk"
            transition={0}
            allowDownscaling
            accessibilityIgnoresInvertColors
          />
        </View>
      ) : null}

      <View style={[styles.line, { top: lineTop, backgroundColor: lineColor }]} pointerEvents="none" />
      <View
        style={[styles.knob, { top: knobTop, backgroundColor: knobBg, borderColor: knobBorder }]}
        pointerEvents="none"
      >
        <Text style={[styles.knobArrow, { color: knobArrowColor }]}>▲</Text>
        <View style={[styles.knobDivider, { backgroundColor: knobDividerColor }]} />
        <Text style={[styles.knobArrow, { color: knobArrowColor }]}>▼</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrapLight: {
    backgroundColor: '#FFFFFF',
  },
  emptyCompare: {
    backgroundColor: '#DDE0E8',
  },
  baseImage: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  fullLayerImage: {
    position: 'absolute',
    left: 0,
    right: 0,
    width: '100%',
  },
  overlayClip: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
    zIndex: 1,
  },
  topClip: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    overflow: 'hidden',
    zIndex: 1,
  },
  line: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2.5,
    zIndex: 2,
  },
  knob: {
    position: 'absolute',
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(66,72,74,0.94)',
    borderWidth: 1.5,
    borderColor: 'rgba(225,255,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: { elevation: 5 },
    }),
  },
  knobArrow: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  knobDivider: {
    width: 24,
    height: 1.5,
    borderRadius: 999,
    marginVertical: 4,
  },
});
