import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated, Easing } from 'react-native';


export function ShimmerText({
  children,
  style,
  textStyle,
  duration = 2200,
}) {
  const wave = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wave, {
          toValue: 1,
          duration: duration / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(wave, {
          toValue: 0,
          duration: duration / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [duration, wave]);

  const color = wave.interpolate({
    inputRange: [0, 1],
    outputRange: ['#9A9A9A', '#E1FF00'],
  });

  return (
    <Animated.Text
      style={[styles.wrap, textStyle, style, { color }]}
      numberOfLines={3}
    >
      {children}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  wrap: {
    fontFamily: 'e-Ukraine',
    fontWeight: '300',
    textAlign: 'center',
    backgroundColor: 'transparent',
  },
});

export default ShimmerText;
