import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const EARTH_MAP = require('./assets/earth-equirect.webp');
const GLOBE_IMAGE = require('./assets/globe.webp');
const PERSON_IMAGE = require('./assets/person-12.webp');
const PERSON_ASPECT = 570 / 823;
const SPIN_DURATION_MS = 24000;

function PhotoGlobe({ size }) {
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  const glowScale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });
  const glowOpacity = breathe.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.34, 0.52, 0.34],
  });
  const globeScale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.012],
  });

  const glowSize = Math.round(size * 1.08);

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.photoGlobeGlow,
          {
            width: glowSize,
            height: glowSize,
            borderRadius: glowSize / 2,
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />
      <Animated.Image
        source={GLOBE_IMAGE}
        fadeDuration={0}
        style={{
          width: size,
          height: size,
          transform: [{ scale: globeScale }],
        }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        accessible={false}
      />
    </View>
  );
}

export default function OnboardingGlobe3D({
  size,
  centerX,
  centerY,
  style,
  showPerson = true,
  mapNudgeY = 0,
  photoGlobe = !showPerson,
}) {
  const spin = useRef(new Animated.Value(0)).current;
  const isAbsolute = centerX != null && centerY != null;

  const layout = useMemo(() => {
    const globeSize = size;
    const personHeight = Math.round(globeSize * 0.74);
    const personWidth = Math.round(personHeight * PERSON_ASPECT);
    const globeDropPx = Math.round(globeSize * 0.02);
    const stackWidth = Math.max(globeSize, personWidth);
    const stackHeight = showPerson
      ? Math.round(globeSize + personHeight * 0.34 + globeDropPx)
      : globeSize;
    const mapWidth = globeSize * 2;
    return {
      globeSize,
      mapWidth,
      personHeight,
      personWidth,
      stackWidth,
      stackHeight,
      globeLeft: Math.round((stackWidth - globeSize) / 2),
      globeBottom: showPerson ? -globeDropPx : 0,
      personLeft: Math.round((stackWidth - personWidth) / 2),
      personBottom: Math.round(globeSize * 0.52),
    };
  }, [size, showPerson]);

  useEffect(() => {
    if (photoGlobe) return undefined;
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
  }, [photoGlobe, spin]);

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
          photoGlobe ? styles.photoGlobeWrap : styles.globeWrap,
          {
            width: layout.globeSize,
            height: layout.globeSize,
            left: layout.globeLeft,
            bottom: layout.globeBottom,
          },
        ]}
      >
        {photoGlobe ? (
          <PhotoGlobe size={layout.globeSize} />
        ) : (
          <>
            <Animated.View
              style={[
                styles.mapStrip,
                {
                  transform: [
                    { translateX: mapShiftX },
                    ...(mapNudgeY !== 0 ? [{ translateY: mapNudgeY }] : []),
                  ],
                },
              ]}
            >
              <Image
                source={EARTH_MAP}
                fadeDuration={0}
                style={[styles.mapTile, { width: layout.mapWidth, height: layout.globeSize }]}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
                accessible={false}
              />
              <Image
                source={EARTH_MAP}
                fadeDuration={0}
                style={[styles.mapTile, { width: layout.mapWidth, height: layout.globeSize }]}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
                accessible={false}
              />
            </Animated.View>

            <LinearGradient
              pointerEvents="none"
              colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.22)', 'rgba(0, 0, 0, 0.58)']}
              locations={[0.42, 0.72, 1]}
              start={{ x: 0.5, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFillObject}
            />
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(120, 180, 255, 0.32)', 'rgba(120, 180, 255, 0.1)', 'rgba(0, 0, 0, 0)']}
              locations={[0, 0.35, 0.72]}
              start={{ x: 0.5, y: 0.5 }}
              end={{ x: 0.5, y: 0 }}
              style={StyleSheet.absoluteFillObject}
            />
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255, 255, 255, 0.14)', 'rgba(255, 255, 255, 0)', 'rgba(0, 0, 0, 0.38)']}
              locations={[0, 0.42, 1]}
              start={{ x: 0.22, y: 0.18 }}
              end={{ x: 0.88, y: 0.92 }}
              style={StyleSheet.absoluteFillObject}
            />
          </>
        )}
      </View>

      {showPerson ? (
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapAbsolute: {
    position: 'absolute',
    overflow: 'visible',
  },
  wrapInline: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  photoGlobeWrap: {
    position: 'absolute',
    overflow: 'visible',
    backgroundColor: 'transparent',
    zIndex: 10,
    ...Platform.select({
      android: { elevation: 10 },
      ios: {},
    }),
  },
  photoGlobeGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(72, 148, 255, 0.22)',
    shadowColor: '#5eb0ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 28,
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
