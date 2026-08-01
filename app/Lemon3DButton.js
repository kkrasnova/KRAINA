import React, { useRef } from 'react';
import { Pressable, View, Text, StyleSheet, Animated, ActivityIndicator, Platform } from 'react-native';
import { noAndroidRipple } from './androidFeedback';
import FittingText from './FittingText';

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
    outputRange: isCircle ? [-2, 0] : [-4, 0],
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
    (disabled || loading) && styles.frontDisabled,
  ];

  const isInactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={isInactive}
      style={[outerStyle, isInactive && styles.outerDisabled]}
      android_ripple={disabled || loading ? undefined : noAndroidRipple}
      accessibilityRole="button"
      accessibilityState={{
        disabled: disabled || loading,
        busy: loading,
        ...((isCircle || pillSelection) && typeof selected === 'boolean' ? { selected } : {}),
      }}
      accessibilityLabel={accessibilityLabel || label}
    >
      <View style={[backStyle, isInactive && styles.backDisabled]} />
      <Animated.View style={[frontStyle, { transform: [{ translateY }] }]}>
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
          <FittingText
            style={[styles.text, isInactive && styles.textDisabled, textStyle]}
            numberOfLines={1}
            minimumFontScale={0.55}
          >
            {label}
          </FittingText>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    borderRadius: 999,
    borderWidth: 3,
    borderColor: '#b8cc00',
    backgroundColor: '#3d4800',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 6,
  },
  outerPillIdle: {
    borderColor: '#8a9600',
    shadowOpacity: 0.22,
  },
  outerPillSelected: {
    borderColor: '#c4d900',
    shadowOpacity: 0.3,
  },
  outerDisabled: {
    borderColor: '#4a5200',
    backgroundColor: '#2a3000',
    shadowOpacity: 0,
    elevation: 0,
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
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: '#E1FF00',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 10,
  },
  frontPillIdle: {
    backgroundColor: '#7a8824',
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  frontPillSelected: {
    backgroundColor: '#E1FF00',
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  frontDisabled: {
    backgroundColor: '#5a6420',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  backDisabled: {
    backgroundColor: '#2f3800',
    borderColor: '#1e2400',
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
  circleEmoji: {
    zIndex: 2,
    textAlign: 'center',
  },
  text: {
    width: '100%',
    textAlign: 'center',
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
  textDisabled: {
    color: 'rgba(13, 13, 13, 0.42)',
  },
});
