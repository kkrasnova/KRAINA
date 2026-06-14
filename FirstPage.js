import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Image, Platform, Animated, Easing } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { useResponsive } from './useResponsive';

const SPLASH_TITLE_VIDEO = require('./assets/Zoom Glass - Copy - Copy-Zoom 2-@720x-3.mp4');
const GLOBE_IMAGE = require('./assets/globe.png');

export default function FirstPage({ navigation, route }) {
  const { width: screenWidth, height: screenHeight, insets } = useResponsive();

  const isIPhoneLayout =
    (Platform.OS === 'ios' && !Platform.isPad) || Platform.OS === 'android';

  const logoTop =
    16 +
    (insets?.top ?? 0) +
    Math.round(screenHeight * 0.008) -
    (isIPhoneLayout ? Math.round(screenHeight * 0.054) : 0);

  const VIDEO_HEIGHT_SCALE = 3;
  const logoWidth = screenWidth * 0.98;
  const logoHeight = (63 / 223) * logoWidth * VIDEO_HEIGHT_SCALE;
  const safeBottom = insets?.bottom ?? 0;

  const PERSON_ASPECT = 570 / 823;
  const personHeight = screenHeight * 0.86;
  const personWidth = personHeight * PERSON_ASPECT;
  const personLeft = (screenWidth - personWidth) / 2;
  const personBottom = Math.round(-screenHeight * 0.17);

  const globeSize = useMemo(() => {
    // Очень большой глобус. На Android делаем ещё крупнее.
    // Разрешаем выходить за края экрана — будет как большой фон под персонажем.
    const k = Platform.OS === 'android' ? 1.85 : 1.72;
    const min = Platform.OS === 'android' ? 720 : 620;
    const max = Platform.OS === 'android' ? 1150 : 980;
    return Math.round(Math.min(max, Math.max(min, screenWidth * k)));
  }, [screenWidth]);
  // Сдвигаем вправо; на Android — сильнее.
  const globeLeft = Math.round(
    (screenWidth - globeSize) / 2 + screenWidth * (Platform.OS === 'android' ? 0.38 : 0.32),
  );
  // Ниже: на Android опускаем чуть сильнее.
  const globeBottom = Math.round(-screenHeight * (Platform.OS === 'android' ? 0.07 : 0.05));

  const rotateAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 30000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rotateAnim]);

  const globeRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  useEffect(() => {
    const ready = route?.params?.bootstrapReady === true;
    const nextRoute = route?.params?.nextRoute;
    const nextParams = route?.params?.nextRouteParams;
    if (!ready || nextRoute == null || typeof nextRoute !== 'string' || nextRoute.trim() === '') {
      return undefined;
    }
    /** Повернення в застосунок зі збереженою сесією: коротка заставка → одразу Main / план; вхід після виходу — без довгої паузи. */
    const delayMs =
      nextRoute === 'HomeTabPager'
        ? 620
        : nextRoute === 'ChoosePlan'
          ? 800
          : nextRoute === 'BackendAuth'
            ? 720
            : 1600;
    const t = setTimeout(() => {
      if (nextParams != null && typeof nextParams === 'object') {
        navigation.replace(nextRoute, nextParams);
      } else {
        navigation.replace(nextRoute);
      }
    }, delayMs);
    return () => clearTimeout(t);
  }, [
    navigation,
    route?.params?.nextRoute,
    route?.params?.nextRouteParams,
    route?.params?.bootstrapReady,
  ]);

  return (
    <View style={[styles.container, { paddingBottom: safeBottom, backgroundColor: '#000000' }]}>
      <View
        style={[
          styles.logoTextWrap,
          {
            width: logoWidth,
            height: logoHeight,
            top: logoTop,
            left: (screenWidth - logoWidth) / 2,
            zIndex: 10,
            elevation: 10,
          },
        ]}
      >
        <Video
          source={SPLASH_TITLE_VIDEO}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
          isLooping
          isMuted
          useNativeControls={false}
          accessibilityLabel="KRAЇNA"
          accessibilityIgnoresInvertColors
        />
      </View>

      <View
        pointerEvents="none"
        style={[
          styles.globeWrap,
          {
            width: globeSize,
            height: globeSize,
            left: globeLeft,
            bottom: globeBottom,
            zIndex: 20,
            elevation: 20,
          },
        ]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.Image
          source={GLOBE_IMAGE}
          style={[
            styles.globeImage,
            {
              width: globeSize,
              height: globeSize,
              transform: [{ rotate: globeRotate }],
            },
          ]}
          accessibilityIgnoresInvertColors
          fadeDuration={0}
        />
      </View>

      <Image
        source={require('./assets/person-12.png')}
        style={[
          styles.person,
          {
            width: personWidth,
            height: personHeight,
            left: personLeft,
            bottom: personBottom,
            zIndex: 30,
            elevation: 30,
          },
        ]}
        accessibilityLabel="Traveler"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  logoTextWrap: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  globeWrap: {
    position: 'absolute',
    borderRadius: 9999,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  globeImage: {
    position: 'absolute',
    left: 0,
    top: 0,
    resizeMode: 'cover',
    opacity: 0.98,
  },
  person: {
    position: 'absolute',
    resizeMode: 'contain',
  },
});
