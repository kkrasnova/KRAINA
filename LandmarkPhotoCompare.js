import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

function normalizeCompareSource(asset, uri) {
  if (typeof asset === 'number') return asset;
  const u = String(uri || '').trim();
  return u ? { uri: u } : null;
}

const CompareLayerImage = React.memo(function CompareLayerImage({
  source,
  height,
  top = 0,
  contentPosition,
}) {
  if (!source) return null;
  return (
    <ExpoImage
      source={source}
      style={[styles.fullLayerImage, { height, top }]}
      contentFit="cover"
      contentPosition={contentPosition}
      cachePolicy="memory-disk"
      transition={0}
      allowDownscaling
      recyclingKey={typeof source === 'number' ? String(source) : source.uri}
      accessibilityIgnoresInvertColors
    />
  );
});

/**
 * Vertical compare:
 * - drag handle up => shows more "before" (historic) photo
 * - drag handle down => shows more "after/current" photo
 */
const KNOB_SIZE = 44;
const LINE_HEIGHT = 2.5;

export default function LandmarkPhotoCompare({
  beforeUri,
  afterUri,
  beforeSource,
  afterSource,
  beforeContentPosition = 'center',
  afterContentPosition = 'center',
  initialPosition = 0.5,
  containerHeight = 0,
  nestedInScroll = false,
  isLight = false,
  style,
  onDragStateChange,
  onPhotoPress,
}) {
  const layoutHeightRef = useRef(0);
  const dragStartRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const dividerYRef = useRef(0);
  const animatedDividerY = useRef(new Animated.Value(0)).current;
  const [, forceLayoutTick] = React.useReducer((n) => n + 1, 0);

  const effectiveHeight = Math.max(
    1,
    layoutHeightRef.current > 0 ? layoutHeightRef.current : Number(containerHeight) || 1,
  );

  const clampY = (y, h = effectiveHeight) => {
    const max = Math.max(0, h);
    return Math.max(0, Math.min(max, y));
  };

  const setDividerPosition = (y, h = effectiveHeight) => {
    const next = clampY(y, h);
    dividerYRef.current = next;
    animatedDividerY.setValue(next);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => Platform.OS === 'android',
        onMoveShouldSetPanResponder: (_, g) =>
          nestedInScroll
            ? Math.abs(g.dy) > 2 || Math.abs(g.dx) > 2
            : Math.abs(g.dy) > 1 || Math.abs(g.dx) > 1,
        onMoveShouldSetPanResponderCapture: (_, g) =>
          Platform.OS === 'android' &&
          (nestedInScroll
            ? Math.abs(g.dy) > 2 || Math.abs(g.dx) > 2
            : Math.abs(g.dy) > 1 || Math.abs(g.dx) > 1),
        onPanResponderGrant: () => {
          hasDraggedRef.current = false;
          onDragStateChange?.(true);
          const h = Math.max(layoutHeightRef.current, Number(containerHeight) || 0, 1);
          const current = dividerYRef.current;
          const start = current > 0 ? current : h * initialPosition;
          dragStartRef.current = clampY(start, h);
        },
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dy) > 3 || Math.abs(g.dx) > 3) {
            hasDraggedRef.current = true;
          }
          const h = Math.max(layoutHeightRef.current, Number(containerHeight) || 0, 1);
          setDividerPosition(dragStartRef.current + g.dy, h);
        },
        onPanResponderRelease: (_, g) => {
          onDragStateChange?.(false);
          const h = Math.max(layoutHeightRef.current, Number(containerHeight) || 0, 1);
          const next = clampY(dragStartRef.current + g.dy, h);
          if (
            !hasDraggedRef.current &&
            Math.abs(g.dy) < 10 &&
            Math.abs(g.dx) < 10
          ) {
            onPhotoPress?.();
            return;
          }
          const edgeSnap = 18;
          if (next <= edgeSnap) {
            setDividerPosition(0, h);
            return;
          }
          if (next >= h - edgeSnap) {
            setDividerPosition(h, h);
            return;
          }
          setDividerPosition(next, h);
        },
        onPanResponderTerminate: () => {
          onDragStateChange?.(false);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [initialPosition, containerHeight, nestedInScroll, onDragStateChange, onPhotoPress],
  );

  const onLayout = (e) => {
    const nextH = Number(e?.nativeEvent?.layout?.height);
    if (!Number.isFinite(nextH) || nextH <= 0) return;
    layoutHeightRef.current = nextH;
    if (!hasDraggedRef.current) {
      setDividerPosition(nextH * initialPosition, nextH);
    }
    forceLayoutTick();
  };

  useEffect(() => {
    if (layoutHeightRef.current > 0 || !containerHeight) return;
    const h = Math.max(1, Number(containerHeight) || 1);
    if (!hasDraggedRef.current) {
      setDividerPosition(h * initialPosition, h);
    }
  }, [containerHeight, initialPosition]);

  const topSource = normalizeCompareSource(afterSource, afterUri);
  const bottomSource = normalizeCompareSource(beforeSource, beforeUri);

  const lineColor = isLight ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.92)';
  const knobBg = isLight ? 'rgba(255,255,255,0.96)' : 'rgba(66,72,74,0.94)';
  const knobBorder = isLight ? 'rgba(255,255,255,0.9)' : 'rgba(225,255,0,0.72)';
  const knobArrowColor = isLight ? '#0212EB' : '#E1FF00';
  const knobDividerColor = isLight ? 'rgba(2,18,235,0.55)' : 'rgba(225,255,0,0.78)';

  const topClipHeight = animatedDividerY;
  const bottomClipTop = animatedDividerY;
  const clipRanges = useMemo(
    () => ({
      inputRange: [0, effectiveHeight],
      extrapolate: 'clamp',
    }),
    [effectiveHeight],
  );
  const bottomClipHeight = useMemo(
    () =>
      animatedDividerY.interpolate({
        ...clipRanges,
        outputRange: [effectiveHeight, 0],
      }),
    [animatedDividerY, clipRanges, effectiveHeight],
  );
  const bottomImageTop = useMemo(
    () =>
      animatedDividerY.interpolate({
        ...clipRanges,
        outputRange: [0, -effectiveHeight],
      }),
    [animatedDividerY, clipRanges, effectiveHeight],
  );
  // Лінія і кружок завжди центруються на dividerY (раніше кружок «відставав» при русі вниз).
  const lineTop = useMemo(
    () =>
      animatedDividerY.interpolate({
        ...clipRanges,
        outputRange: [-LINE_HEIGHT / 2, effectiveHeight - LINE_HEIGHT / 2],
      }),
    [animatedDividerY, clipRanges, effectiveHeight],
  );
  const knobTop = useMemo(
    () =>
      animatedDividerY.interpolate({
        ...clipRanges,
        outputRange: [-KNOB_SIZE / 2, effectiveHeight - KNOB_SIZE / 2],
      }),
    [animatedDividerY, clipRanges, effectiveHeight],
  );

  const handleTouchStart = () => {
    if (nestedInScroll) onDragStateChange?.(true);
  };

  if (!topSource && !bottomSource) {
    return <View style={[styles.wrap, style, styles.emptyCompare]} onLayout={onLayout} />;
  }

  return (
    <View
      style={[styles.wrap, isLight && styles.wrapLight, style]}
      onLayout={onLayout}
      onTouchStart={handleTouchStart}
      collapsable={false}
      {...panResponder.panHandlers}
    >
      {topSource ? (
        <Animated.View style={[styles.overlayClip, { top: 0, height: topClipHeight }]}>
          <CompareLayerImage
            source={topSource}
            height={effectiveHeight}
            contentPosition={afterContentPosition}
          />
        </Animated.View>
      ) : null}

      {bottomSource ? (
        <Animated.View
          style={[styles.overlayClip, { top: bottomClipTop, height: bottomClipHeight }]}
        >
          <Animated.View style={[styles.fullLayerImage, { top: bottomImageTop }]}>
            <CompareLayerImage
              source={bottomSource}
              height={effectiveHeight}
              contentPosition={beforeContentPosition}
            />
          </Animated.View>
        </Animated.View>
      ) : null}

      <Animated.View
        style={[
          styles.line,
          { top: lineTop, height: LINE_HEIGHT, backgroundColor: lineColor },
        ]}
        pointerEvents="none"
      />
      <Animated.View
        style={[
          styles.knob,
          {
            top: knobTop,
            width: KNOB_SIZE,
            height: KNOB_SIZE,
            borderRadius: KNOB_SIZE / 2,
            backgroundColor: knobBg,
            borderColor: knobBorder,
          },
        ]}
        pointerEvents="none"
      >
        <Text style={[styles.knobArrow, { color: knobArrowColor }]}>▲</Text>
        <View style={[styles.knobDivider, { backgroundColor: knobDividerColor }]} />
        <Text style={[styles.knobArrow, { color: knobArrowColor }]}>▼</Text>
      </Animated.View>
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
  line: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: LINE_HEIGHT,
    zIndex: 2,
  },
  knob: {
    position: 'absolute',
    alignSelf: 'center',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.22,
        shadowRadius: 5,
      },
      android: { elevation: 4 },
    }),
  },
  knobArrow: {
    fontSize: 10,
    lineHeight: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  knobDivider: {
    width: 14,
    height: 1.5,
    borderRadius: 999,
    marginVertical: 1,
  },
});
