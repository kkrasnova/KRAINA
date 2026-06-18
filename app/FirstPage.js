import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Image, Platform, Animated, Easing } from 'react-native';
import SplashTitleVideo from './SplashTitleVideo';
import { useResponsive } from './useResponsive';
import { notifySplashLogoPainted, subscribeSplashHidden } from './splashLogoGate';

const SPLASH_TITLE_VIDEO_IOS = require('./assets/Zoom Glass - Copy - Copy-Zoom 2-@720x-3.mp4');
const SPLASH_TITLE_VIDEO_ANDROID = require('./assets/kraina-splash-android.mp4');
const SPLASH_TITLE_VIDEO =
  Platform.OS === 'android' ? SPLASH_TITLE_VIDEO_ANDROID : SPLASH_TITLE_VIDEO_IOS;
const SPLASH_TITLE_POSTER = require('./assets/kraina-title-splash-frame0.png');
const GLOBE_IMAGE = require('./assets/globe.png');
const PERSON_IMAGE = require('./assets/person-12.png');

/** Android потребує більше часу для рендера FirstPage (assets, відео, глобус). */
const FIRST_LAUNCH_SPLASH_MIN_MS = 2600;
const RETURNING_USER_SPLASH_MS = Platform.OS === 'android' ? 700 : 200;

function resolveSplashDelayMs(nextRoute, nextParams) {
  const isFirstLaunchOnboarding =
    nextRoute === 'SecondPage' || nextParams?.firstLaunchOnboarding === true;
  if (isFirstLaunchOnboarding) return FIRST_LAUNCH_SPLASH_MIN_MS;
  if (nextRoute === 'HomeTabPager' || nextRoute === 'BackendAuth') {
    return RETURNING_USER_SPLASH_MS;
  }
  if (nextRoute === 'ChoosePlan') return 100;
  return 150;
}

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
    const k = Platform.OS === 'android' ? 1.85 : 1.72;
    const min = Platform.OS === 'android' ? 720 : 620;
    const max = Platform.OS === 'android' ? 1150 : 980;
    return Math.round(Math.min(max, Math.max(min, screenWidth * k)));
  }, [screenWidth]);
  const globeLeft = Math.round(
    (screenWidth - globeSize) / 2 + screenWidth * (Platform.OS === 'android' ? 0.38 : 0.32),
  );
  const globeBottom = Math.round(-screenHeight * (Platform.OS === 'android' ? 0.07 : 0.05));

  const mountTimeRef = useRef(Date.now());
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const [imagesLoaded, setImagesLoaded] = useState({
    poster: false,
    globe: false,
    person: false,
  });
  const [splashHidden, setSplashHidden] = useState(false);
  const overlayOpacity = useRef(new Animated.Value(1)).current;

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

  /** Чекаємо, поки всі зображення завантажаться, і тільки тоді сигналимо про готовність. */
  const allImagesLoaded =
    imagesLoaded.poster && imagesLoaded.globe && imagesLoaded.person;
  useEffect(() => {
    if (allImagesLoaded) {
      notifySplashLogoPainted();
    }
  }, [allImagesLoaded]);

  /** Після того як нативний сплеш сховався, плавно прибираємо чорний оверлей. */
  useEffect(() => {
    const unsub = subscribeSplashHidden(() => {
      // Даємо один кадр після hideAsync, щоб системний transition завершився
      requestAnimationFrame(() => {
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => setSplashHidden(true));
      });
    });
    return unsub;
  }, [overlayOpacity]);

  const imageOnLoad = useCallback(
    (key) => () => {
      setImagesLoaded((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
    },
    [],
  );

  useEffect(() => {
    const ready = route?.params?.bootstrapReady === true;
    const nextRoute = route?.params?.nextRoute;
    const nextParams = route?.params?.nextRouteParams;
    if (!ready || nextRoute == null || typeof nextRoute !== 'string' || nextRoute.trim() === '') {
      return undefined;
    }
    const minSplashMs = resolveSplashDelayMs(nextRoute, nextParams);
    const elapsedMs = Date.now() - mountTimeRef.current;
    const delayMs = Math.max(0, minSplashMs - elapsedMs);
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
        collapsable={false}
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
        <Image
          source={SPLASH_TITLE_POSTER}
          style={styles.logoPoster}
          resizeMode="contain"
          fadeDuration={0}
          onLoad={imageOnLoad('poster')}
          onError={imageOnLoad('poster')}
          accessibilityIgnoresInvertColors
        />
        <SplashTitleVideo
          source={SPLASH_TITLE_VIDEO}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View
        pointerEvents="none"
        collapsable={false}
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
          onLoad={imageOnLoad('globe')}
          onError={imageOnLoad('globe')}
        />
      </View>

      <Image
        source={PERSON_IMAGE}
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
        fadeDuration={0}
        onLoad={imageOnLoad('person')}
        onError={imageOnLoad('person')}
        accessibilityLabel="Traveler"
      />

      {/* Чорний оверлей — маскує системний splash transition. Ховається після notifySplashHidden(). */}
      <Animated.View
        pointerEvents={splashHidden ? 'none' : 'auto'}
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: '#000000',
            opacity: overlayOpacity,
            zIndex: 100,
            elevation: 100,
          },
        ]}
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
  logoPoster: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
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
