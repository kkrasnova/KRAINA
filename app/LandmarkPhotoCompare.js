import React, { useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

/**
 * Vertical compare:
 * - drag handle up => shows more "before" (historic) photo
 * - drag handle down => shows more "after/current" photo
 */
export default function LandmarkPhotoCompare({
  beforeUri,
  afterUri,
  initialPosition = 0.5,
  isLight = false,
  style,
}) {
  const [height, setHeight] = useState(0);
  const [dividerY, setDividerY] = useState(0);
  const dragStartRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const dividerYRef = useRef(0);
  const effectiveHeightRef = useRef(1);
  const { height: winH } = useWindowDimensions();
  const effectiveHeight = height > 0 ? height : Math.max(1, Math.round(winH || 1));
  dividerYRef.current = dividerY;
  effectiveHeightRef.current = effectiveHeight;

  const clampY = (y) => {
    const min = 0;
    const max = Math.max(min, effectiveHeight);
    return Math.max(min, Math.min(max, y));
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2,
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2,
        onPanResponderGrant: () => {
          const h = effectiveHeightRef.current;
          const current = dividerYRef.current;
          const min = 0;
          const max = Math.max(min, h);
          const start = current > 0 ? current : h * initialPosition;
          dragStartRef.current = Math.max(min, Math.min(max, start));
        },
        onPanResponderMove: (_, g) => {
          hasDraggedRef.current = true;
          setDividerY(clampY(dragStartRef.current + g.dy));
        },
        onPanResponderRelease: (_, g) => {
          const next = clampY(dragStartRef.current + g.dy);
          const edgeSnap = 18;
          if (next <= edgeSnap) {
            setDividerY(0);
            return;
          }
          if (next >= effectiveHeight - edgeSnap) {
            setDividerY(effectiveHeight);
            return;
          }
          setDividerY(next);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [initialPosition],
  );

  const onLayout = (e) => {
    const nextH = Number(e?.nativeEvent?.layout?.height);
    if (!Number.isFinite(nextH) || nextH <= 0) return;
    setHeight(nextH);
    if (!hasDraggedRef.current) setDividerY(clampY(nextH * initialPosition));
  };

  const currentDividerY = dividerY > 0 ? clampY(dividerY) : clampY(effectiveHeight * initialPosition);
  const topHeight = Math.max(0, currentDividerY);
  const bottomTop = Math.max(0, currentDividerY);
  const bottomHeight = Math.max(0, effectiveHeight - bottomTop);
  const lineTop = Math.max(0, Math.min(Math.max(0, effectiveHeight - 2), currentDividerY));
  const knobTop = Math.max(0, Math.min(Math.max(0, effectiveHeight - 78), currentDividerY - 39));
  const topPhotoUri = afterUri || beforeUri;
  const bottomPhotoUri = beforeUri || afterUri;
  const lineColor = isLight ? 'rgba(12,47,168,0.75)' : 'rgba(255,255,255,0.92)';
  const knobBg = isLight ? 'rgba(255,255,255,0.96)' : 'rgba(66,72,74,0.94)';
  const knobBorder = isLight ? 'rgba(12,47,168,0.35)' : 'rgba(225,255,0,0.72)';
  const knobArrowColor = isLight ? '#0C2FA8' : '#E1FF00';
  const knobDividerColor = isLight ? 'rgba(12,47,168,0.55)' : 'rgba(225,255,0,0.78)';

  return (
    <View style={[styles.wrap, style]} onLayout={onLayout} {...panResponder.panHandlers}>
      {topPhotoUri ? (
        <View style={[styles.overlayClip, { top: 0, height: topHeight }]}>
          <Image
            source={{ uri: topPhotoUri }}
            style={[styles.fullLayerImage, { top: 0, height: effectiveHeight }]}
            resizeMode="cover"
          />
        </View>
      ) : null}
      {bottomPhotoUri ? (
        <View style={[styles.overlayClip, { top: bottomTop, height: bottomHeight }]}>
          <Image
            source={{ uri: bottomPhotoUri }}
            style={[styles.fullLayerImage, { top: -bottomTop, height: effectiveHeight }]}
            resizeMode="cover"
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
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
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
    top: 0,
    overflow: 'hidden',
  },
  line: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2.5,
  },
  knob: {
    position: 'absolute',
    alignSelf: 'center',
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(66,72,74,0.94)',
    borderWidth: 1.5,
    borderColor: 'rgba(225,255,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
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
