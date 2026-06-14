import React, { useRef } from 'react';
import { Pressable, View, Text, StyleSheet, Animated, ActivityIndicator, Platform } from 'react-native';
import { noAndroidRipple } from './androidFeedback';

export default function Lemon3DButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  minHeight = 50,
  textStyle,
  style,
  accessibilityLabel,
  circleSize,

  selected,
  children,
}) {
  const isCircle = typeof circleSize === 'number' && circleSize > 0;
  const pillSelection = !isCircle && typeof selected === 'boolean';
  const pressAnim = useRef(new Animated.Value(0)).current;

  const onPressIn = () => {
    Animated.timing(pressAnim, { toValue: 1, duration: 90, useNativeDriver: true }).start();
  };

  const onPressOut = () => {
    Animated.timing(pressAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start();
  };

  const translateY = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: isCircle ? [-4, 0] : [-8, 0],
  });

  const outerStyle = isCircle
    ? [
        styles.outerCircle,
        { width: circleSize, height: circleSize, minHeight: circleSize },
        selected ? styles.outerCircleSelected : styles.outerCircleIdle,
        style,
      ]
    : [
        styles.outer,
        { minHeight },
        pillSelection && (selected ? styles.outerPillSelected : styles.outerPillIdle),
        style,
      ];

  const backStyle = [
    styles.back,
    isCircle && styles.backCircle,
    isCircle && (selected ? styles.backCircleOn : styles.backCircleOff),
    pillSelection && !isCircle && (selected ? styles.backCircleOn : styles.backCircleOff),
  ];

  const frontStyle = [
    styles.front,
    isCircle && styles.frontCircle,
    isCircle && (selected ? styles.frontCircleOn : styles.frontCircleOff),
    pillSelection &&
      !isCircle &&
      (selected ? styles.frontPillSelected : styles.frontPillIdle),
  ];

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled || loading}
      style={[outerStyle, (disabled || loading) && styles.disabled]}
      android_ripple={disabled || loading ? undefined : noAndroidRipple}
      accessibilityRole="button"
      accessibilityState={{
        disabled: disabled || loading,
        busy: loading,
        ...((isCircle || pillSelection) && typeof selected === 'boolean' ? { selected } : {}),
      }}
      accessibilityLabel={accessibilityLabel || label}
    >
      <View style={backStyle} />
      <Animated.View style={[frontStyle, { transform: [{ translateY }] }]}>
        <View
          style={[styles.frontGloss, isCircle && styles.frontGlossCircle]}
          pointerEvents="none"
        />
        {loading ? (
          <ActivityIndicator color="#101010" />
        ) : isCircle ? (
          children ?? (
            <Text style={[styles.circleEmoji, { fontSize: circleSize * 0.42, lineHeight: circleSize * 0.44 }]}>
              {label}
            </Text>
          )
        ) : children ? (
          children
        ) : (
          <Text style={[styles.text, textStyle]}>{label}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    borderRadius: 999,
    borderWidth: 5,
    borderColor: 'rgba(225, 255, 0, 0.55)',
    position: 'relative',
    overflow: 'visible',
    shadowColor: '#E1FF00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 8,
  },
  outerPillIdle: {
    borderColor: 'rgba(225, 255, 0, 0.34)',
    shadowColor: '#000000',
    shadowOpacity: 0.38,
  },
  outerPillSelected: {
    borderColor: 'rgba(225, 255, 0, 0.58)',
    shadowColor: '#E1FF00',
    shadowOpacity: 0.26,
  },
  outerCircle: {
    borderRadius: 999,
    borderWidth: 3,
    position: 'relative',
    overflow: 'visible',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
    elevation: 6,
  },
  outerCircleIdle: {
    borderColor: 'rgba(225, 255, 0, 0.32)',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
  },
  outerCircleSelected: {
    borderColor: 'rgba(225, 255, 0, 0.58)',
    shadowColor: '#E1FF00',
    shadowOpacity: 0.28,
  },
  back: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#4d5c00',
    borderWidth: 1,
    borderColor: '#2f3800',
  },
  backCircle: {
    borderWidth: 1,
  },
  backCircleOff: {
    backgroundColor: '#2f3800',
    borderColor: '#1e2400',
  },
  backCircleOn: {
    backgroundColor: '#4d5c00',
    borderColor: '#2f3800',
  },
  front: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    backgroundColor: '#E1FF00',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 10,
    shadowColor: '#3d4800',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  frontPillIdle: {
    backgroundColor: '#7a8824',
    borderColor: 'rgba(255, 255, 255, 0.22)',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
  },
  frontPillSelected: {
    backgroundColor: '#E1FF00',
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#3d4800',
    shadowOpacity: 0.45,
  },
  frontCircle: {
    borderWidth: 2,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
  },
  frontCircleOff: {
    backgroundColor: '#7a8824',
    borderColor: 'rgba(255, 255, 255, 0.22)',
    shadowColor: '#000000',
  },
  frontCircleOn: {
    backgroundColor: '#E1FF00',
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#3d4800',
  },
  frontGloss: {
    position: 'absolute',
    top: 4,
    left: '12%',
    right: '12%',
    height: 4,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    zIndex: 1,
  },
  frontGlossCircle: {
    top: 3,
    left: '18%',
    right: '18%',
    height: 2.5,
    borderRadius: 2,
  },
  circleEmoji: {
    zIndex: 2,
    textAlign: 'center',
  },
  text: {
    fontWeight: '700',
    color: '#0d0d0d',
    fontSize: 16,
    letterSpacing: 0.35,
    zIndex: 2,
    ...Platform.select({
      ios: {},
      android: { fontFamily: 'sans-serif-medium' },
    }),
  },
  disabled: {
    opacity: 0.52,
  },
});
