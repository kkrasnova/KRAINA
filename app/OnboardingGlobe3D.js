import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const EARTH_MAP = require('./assets/earth-equirect.jpg');
const PERSON_IMAGE = require('./assets/person-12.png');
const PERSON_ASPECT = 570 / 823;
const SPIN_DURATION_MS = 24000;

export default function OnboardingGlobe3D({ size, centerX, centerY, style }) {
  const spin = useRef(new Animated.Value(0)).current;
  const isAbsolute = centerX != null && centerY != null;

  const layout = useMemo(() => {
    const globeSize = size;
    const personHeight = Math.round(globeSize * 0.74);
    const personWidth = Math.round(personHeight * PERSON_ASPECT);
    const globeDropPx = Math.round(globeSize * 0.02);
    const stackWidth = Math.max(globeSize, personWidth);
    const stackHeight = Math.round(globeSize + personHeight * 0.34 + globeDropPx);
    const mapWidth = globeSize * 2;
    return {
      globeSize,
      mapWidth,
      personHeight,
      personWidth,
      stackWidth,
      stackHeight,
      globeLeft: Math.round((stackWidth - globeSize) / 2),
      globeBottom: -globeDropPx,
      personLeft: Math.round((stackWidth - personWidth) / 2),
      personBottom: Math.round(globeSize * 0.52),
    };
  }, [size]);

  useEffect(() => {
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: SPIN_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      { resetBeforeIteration: true },
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const mapShiftX = spin.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -layout.mapWidth],
  });

  const halfW = layout.stackWidth / 2;
  const halfH = layout.stackHeight / 2;

  return (
    <View
      pointerEvents="none"
      collapsable={false}
      style={[
        isAbsolute ? styles.wrapAbsolute : styles.wrapInline,
        {
          width: layout.stackWidth,
          height: layout.stackHeight,
          zIndex: 50,
          elevation: 50,
        },
        isAbsolute && {
          left: centerX - halfW,
          top: centerY - halfH,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.globeWrap,
          {
            width: layout.globeSize,
            height: layout.globeSize,
            left: layout.globeLeft,
            bottom: layout.globeBottom,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.mapStrip,
            {
              transform: [{ translateX: mapShiftX }],
            },
          ]}
        >
          <Image
            source={EARTH_MAP}
            fadeDuration={0}
            style={[styles.mapTile, { width: layout.mapWidth, height: layout.globeSize }]}
            resizeMode="stretch"
            accessibilityIgnoresInvertColors
            accessible={false}
          />
          <Image
            source={EARTH_MAP}
            fadeDuration={0}
            style={[styles.mapTile, { width: layout.mapWidth, height: layout.globeSize }]}
            resizeMode="stretch"
            accessibilityIgnoresInvertColors
            accessible={false}
          />
        </Animated.View>

        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.18)', 'rgba(0, 0, 0, 0.62)']}
          locations={[0.42, 0.72, 1]}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(120, 180, 255, 0.28)', 'rgba(120, 180, 255, 0.08)', 'rgba(0, 0, 0, 0)']}
          locations={[0, 0.35, 0.72]}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 0.5, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      <Image
        source={PERSON_IMAGE}
        fadeDuration={0}
        style={[
          styles.person,
          {
            width: layout.personWidth,
            height: layout.personHeight,
            left: layout.personLeft,
            bottom: layout.personBottom,
          },
        ]}
        accessibilityLabel="Traveler"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapAbsolute: {
    position: 'absolute',
  },
  wrapInline: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  globeWrap: {
    position: 'absolute',
    borderRadius: 9999,
    overflow: 'hidden',
    backgroundColor: '#020814',
    zIndex: 10,
    ...Platform.select({
      android: { elevation: 10 },
      ios: {},
    }),
  },
  mapStrip: {
    flexDirection: 'row',
    height: '100%',
  },
  mapTile: {
    flexShrink: 0,
  },
  person: {
    position: 'absolute',
    resizeMode: 'contain',
    zIndex: 20,
    ...Platform.select({
      android: { elevation: 20 },
      ios: {},
    }),
  },
});
