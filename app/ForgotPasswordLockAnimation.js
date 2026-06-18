import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

const ACCENT = '#E1FF00';
const KEY_COLOR = '#EEFF66';
const STAGE_W = 148;
const STAGE_H = 72;
const LOCK_SIZE = Platform.OS === 'android' ? 48 : 52;
const KEY_SIZE = Platform.OS === 'android' ? 26 : 28;
const KEY_SIDE_GAP = 16;
const LOCK_OPEN_NUDGE_Y = Platform.OS === 'android' ? -7 : -8;

export default function ForgotPasswordLockAnimation() {
  const phase = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    let loopRef = null;

    const run = () => {
      if (!mounted) return;
      phase.setValue(0);
      loopRef = Animated.timing(phase, {
        toValue: 1,
        duration: 3800,
        easing: Easing.linear,
        useNativeDriver: true,
      });
      loopRef.start(({ finished }) => {
        if (finished && mounted) run();
      });
    };

    run();

    return () => {
      mounted = false;
      loopRef?.stop();
      phase.stopAnimation();
    };
  }, [phase]);

  const openOverlayOpacity = phase.interpolate({
    inputRange: [0, 0.54, 0.62, 0.82, 0.9],
    outputRange: [0, 0, 1, 1, 0],
    extrapolate: 'clamp',
  });

  const closedOpacity = openOverlayOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const keyOpacity = phase.interpolate({
    inputRange: [0, 0.12, 0.16, 0.68, 0.78, 0.84],
    outputRange: [0, 0, 1, 1, 0, 0],
    extrapolate: 'clamp',
  });

  const keyScale = phase.interpolate({
    inputRange: [0, 0.16, 0.22, 0.52, 0.68, 0.78],
    outputRange: [0.75, 0.75, 1, 1, 0.96, 0.9],
    extrapolate: 'clamp',
  });

  const keyTranslateX = phase.interpolate({
    inputRange: [0, 0.16, 0.42, 0.52, 0.62, 0.78],
    outputRange: [0, 0, -10, -10, 34, 52],
    extrapolate: 'clamp',
  });

  const keyRotate = phase.interpolate({
    inputRange: [0, 0.16, 0.38, 0.52, 0.62, 0.78],
    outputRange: ['-18deg', '-18deg', '-62deg', '-62deg', '-24deg', '-12deg'],
    extrapolate: 'clamp',
  });

  const lockLeft = STAGE_W / 2 - LOCK_SIZE / 2;
  const lockBottom = (STAGE_H - LOCK_SIZE) / 2;
  const keyLeft = lockLeft + LOCK_SIZE + KEY_SIDE_GAP;
  const keyBottom = lockBottom + (LOCK_SIZE - KEY_SIZE) / 2;

  return (
    <View style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.stage}>
        <View
          style={[styles.lockAnchor, { left: lockLeft, bottom: lockBottom }]}
          pointerEvents="none"
        >
          <Animated.View style={[styles.lockClosedLayer, { opacity: closedOpacity }]}>
            <Ionicons name="lock-closed-outline" size={LOCK_SIZE} color={ACCENT} />
          </Animated.View>
          <Animated.View
            style={[
              styles.lockOpenLayer,
              { opacity: openOverlayOpacity, transform: [{ translateY: LOCK_OPEN_NUDGE_Y }] },
            ]}
          >
            <Ionicons name="lock-open-outline" size={LOCK_SIZE} color={ACCENT} />
          </Animated.View>
        </View>

        <Animated.View
          style={[
            styles.keyAnchor,
            {
              left: keyLeft,
              bottom: keyBottom,
              opacity: keyOpacity,
              transform: [{ translateX: keyTranslateX }, { rotate: keyRotate }, { scale: keyScale }],
            },
          ]}
          pointerEvents="none"
        >
          <Ionicons name="key-outline" size={KEY_SIZE} color={KEY_COLOR} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: STAGE_H + 12,
    paddingTop: 6,
    marginBottom: 4,
  },
  stage: {
    width: STAGE_W,
    height: STAGE_H,
    position: 'relative',
  },
  lockAnchor: {
    position: 'absolute',
    width: LOCK_SIZE,
    height: LOCK_SIZE,
  },
  lockClosedLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: LOCK_SIZE,
  },
  lockOpenLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: LOCK_SIZE,
  },
  keyAnchor: {
    position: 'absolute',
    width: KEY_SIZE,
    height: KEY_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
});
