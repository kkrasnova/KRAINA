import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Linking,
  Alert,
  Vibration,
  Platform,
  DeviceEventEmitter,
  AppState,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import * as FileSystem from 'expo-file-system';

const FILE_B64 = FileSystem.EncodingType?.Base64 ?? 'base64';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { ls } from './landmarkScannerI18n';
import { identifyLandmark } from './landmarkIdentify';
import { parseCityFromSubtitle, inferVisitCategoryFromTitle } from './visitStatsStorage';
import { getAppTheme, THEME_CHANGED_EVENT, resolveAppTheme } from './themeStorage';
import { LANDMARK_SCANNER_CAPTURE_EVENT } from './homeTabPagerConstants';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import { accentForTheme, ACCENT_LEMON } from './themeAccent';
import { tryLoadExpoCamera } from './tryLoadExpoCamera';
import { errorToUserText } from './errorText';

function CameraNativeMissing({ navigation, route }) {
  const language = useSyncedAppLanguage(route, 'uk');
  return (
    <View style={[styles.centered, { paddingHorizontal: 24 }]}>
      <Text style={styles.deniedText}>{ls(language, 'nativeCameraMissing')}</Text>
      <Pressable style={[styles.deniedBtn, { backgroundColor: ACCENT_LEMON }]} onPress={() => navigation.goBack()}>
        <Text style={styles.deniedBtnText}>{ls(language, 'goBack')}</Text>
      </Pressable>
    </View>
  );
}

const FRAME_SIDE_INSET = 0.08;
const CORNER_ARM = 58;
const CORNER_STROKE = 5;

function cornerGlowStyle(color) {
  return Platform.select({
    ios: {
      shadowColor: color,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.95,
      shadowRadius: 14,
    },
    android: {
      elevation: 10,
    },
    default: {},
  });
}

function ScanCorner({ color, placement }) {
  const glow = cornerGlowStyle(color);
  const armH = {
    position: 'absolute',
    height: CORNER_STROKE,
    width: CORNER_ARM,
    borderRadius: CORNER_STROKE / 2,
    backgroundColor: color,
    ...glow,
  };
  const armV = {
    position: 'absolute',
    width: CORNER_STROKE,
    height: CORNER_ARM,
    borderRadius: CORNER_STROKE / 2,
    backgroundColor: color,
    ...glow,
  };
  const shineH = {
    position: 'absolute',
    height: 2,
    width: CORNER_ARM - 10,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.42)',
  };
  const shineV = {
    position: 'absolute',
    width: 2,
    height: CORNER_ARM - 10,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.42)',
  };

  const layout = {
    tl: {
      root: { top: 0, left: 0 },
      armH: { top: 0, left: 0 },
      armV: { top: 0, left: 0 },
      shineH: { top: 1, left: 4 },
      shineV: { top: 4, left: 1 },
    },
    tr: {
      root: { top: 0, right: 0 },
      armH: { top: 0, right: 0 },
      armV: { top: 0, right: 0 },
      shineH: { top: 1, right: 4 },
      shineV: { top: 4, right: 1 },
    },
    bl: {
      root: { bottom: 0, left: 0 },
      armH: { bottom: 0, left: 0 },
      armV: { bottom: 0, left: 0 },
      shineH: { bottom: 1, left: 4 },
      shineV: { bottom: 4, left: 1 },
    },
    br: {
      root: { bottom: 0, right: 0 },
      armH: { bottom: 0, right: 0 },
      armV: { bottom: 0, right: 0 },
      shineH: { bottom: 1, right: 4 },
      shineV: { bottom: 4, right: 1 },
    },
  }[placement];

  return (
    <View style={[styles.scanCornerRoot, layout.root]}>
      <View style={[armH, layout.armH]} />
      <View style={[armV, layout.armV]} />
      <View style={[shineH, layout.shineH]} />
      <View style={[shineV, layout.shineV]} />
    </View>
  );
}

function CornerFrame({ color, topInset, bottomInset, busy, onCapturePress, captureDisabled }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const pulse = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;

  const sideInset = winW * FRAME_SIDE_INSET;
  const frameTop = topInset + 36;
  const frameBottom = bottomInset + 20;
  const frameHeight = Math.max(160, winH - frameTop - frameBottom);
  const frameWidth = Math.max(160, winW - sideInset * 2);

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const scanLoop = Animated.loop(
      Animated.timing(scan, {
        toValue: 1,
        duration: busy ? 1100 : 2600,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    pulseLoop.start();
    scanLoop.start();
    return () => {
      pulseLoop.stop();
      scanLoop.stop();
    };
  }, [pulse, scan, busy]);

  const cornerOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1],
  });
  const scanLineTravel = Math.max(0, frameHeight - 2);
  const scanTranslateY = scan.interpolate({
    inputRange: [0, 1],
    outputRange: [0, scanLineTravel],
  });

  const dimColor = 'rgba(0, 0, 0, 0.52)';

  return (
    <View style={styles.frameOverlay} pointerEvents="box-none">
      <View style={[styles.dimPanel, { top: 0, left: 0, right: 0, height: frameTop, backgroundColor: dimColor }]} />
      <View
        style={[
          styles.dimPanel,
          { bottom: 0, left: 0, right: 0, height: frameBottom, backgroundColor: dimColor },
        ]}
      />
      <View
        style={[
          styles.dimPanel,
          { top: frameTop, bottom: frameBottom, left: 0, width: sideInset, backgroundColor: dimColor },
        ]}
      />
      <View
        style={[
          styles.dimPanel,
          { top: frameTop, bottom: frameBottom, right: 0, width: sideInset, backgroundColor: dimColor },
        ]}
      />

      <Pressable
        style={[
          styles.scanWindow,
          {
            top: frameTop,
            left: sideInset,
            width: frameWidth,
            height: frameHeight,
          },
        ]}
        onPress={onCapturePress}
        disabled={busy || captureDisabled}
        accessibilityRole="button"
        accessibilityLabel="Scan landmark"
      >
        <View style={styles.scanLineClip} pointerEvents="none">
          <Animated.View
            style={[
              styles.scanLine,
              {
                backgroundColor: color,
                transform: [{ translateY: scanTranslateY }],
                ...cornerGlowStyle(color),
              },
            ]}
          />
        </View>
        <Animated.View style={[styles.cornerLayer, { opacity: cornerOpacity }]} pointerEvents="none">
          <ScanCorner color={color} placement="tl" />
          <ScanCorner color={color} placement="tr" />
          <ScanCorner color={color} placement="bl" />
          <ScanCorner color={color} placement="br" />
        </Animated.View>
      </Pressable>
    </View>
  );
}

function LandmarkScannerPageInner({ navigation, route, cameraMod, isTabActive = true }) {
  const { CameraView, useCameraPermissions, getCameraPermissionsAsync, requestCameraPermissionsAsync } =
    cameraMod;
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const [permission, requestPermission] = useCameraPermissions();
  /** Після повернення з системних Налаштувань хук може лишатися «denied», хоча доступ уже видано. */
  const [cameraAllowedOverride, setCameraAllowedOverride] = useState(false);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const camRef = useRef(null);
  const pendingCaptureRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [appTheme, setAppTheme] = useState(resolveAppTheme(route?.params?.appTheme));

  const refreshCameraGate = useCallback(async () => {
    if (typeof getCameraPermissionsAsync !== 'function') return null;
    try {
      const r = await getCameraPermissionsAsync();
      setCameraAllowedOverride(!!r?.granted);
      return r;
    } catch {
      return null;
    }
  }, [getCameraPermissionsAsync]);

  useEffect(() => {
    if (permission?.granted) setCameraAllowedOverride(true);
  }, [permission?.granted]);

  useEffect(() => {
    if (!isTabActive) {
      setReady(false);
      return;
    }
    void refreshCameraGate();
    void Location.requestForegroundPermissionsAsync().catch(() => {});
  }, [isTabActive, refreshCameraGate]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && isTabActive) void refreshCameraGate();
    });
    return () => sub.remove();
  }, [isTabActive, refreshCameraGate]);

  const handleRequestCamera = useCallback(async () => {
    if (requestingPermission) return;
    setRequestingPermission(true);
    try {
      const requestFn =
        typeof requestCameraPermissionsAsync === 'function'
          ? requestCameraPermissionsAsync
          : requestPermission;
      let result = await requestFn();
      const refreshed = await refreshCameraGate();
      if (refreshed) result = refreshed;
      if (result?.granted || refreshed?.granted) return;
      if (result?.canAskAgain === false) {
        Alert.alert('', ls(language, 'cameraDenied'), [
          {
            text: ls(language, 'openSettings'),
            onPress: () => Linking.openSettings().catch(() => {}),
          },
          { text: ls(language, 'cancel'), style: 'cancel' },
        ]);
      }
    } catch (e) {
      if (__DEV__) console.warn('[LandmarkScanner] camera permission', e?.message);
      Alert.alert('', ls(language, 'cameraDenied'));
    } finally {
      setRequestingPermission(false);
    }
  }, [
    requestingPermission,
    requestCameraPermissionsAsync,
    requestPermission,
    refreshCameraGate,
    language,
  ]);

  useEffect(() => {
    let c = false;
    (async () => {
      const t = await getAppTheme();
      if (!c) setAppTheme(t === 'light' ? 'light' : 'dark');
    })();
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setAppTheme(v === 'light' ? 'light' : 'dark');
    });
    return () => sub.remove();
  }, []);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);

  const runCapture = useCallback(async () => {
    if (busy) return;
    if (!camRef.current || !ready) {
      Alert.alert('', ls(language, 'cameraNotReady'));
      pendingCaptureRef.current = false;
      return;
    }
    setBusy(true);
    try {
      let latitude = null;
      let longitude = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
        }
      } catch {
        /* ignore location */
      }

      const photo = await camRef.current.takePictureAsync({
        quality: 0.85,
        base64: true,
        ...(Platform.OS === 'android' ? { skipProcessing: true } : { skipProcessing: false }),
      });
      let base64 = photo?.base64 && String(photo.base64).length > 80 ? photo.base64 : null;
      const photoUri = photo?.uri;
      if (!base64 && photoUri) {
        try {
          base64 = await FileSystem.readAsStringAsync(photoUri, { encoding: FILE_B64 });
        } catch {
          /* ignore */
        }
      }

      if (!base64 && !photoUri) {
        Alert.alert('', ls(language, 'captureFailed'));
        return;
      }

      const result = await identifyLandmark({
        base64,
        latitude,
        longitude,
        language,
      });

      if (Platform.OS === 'android') {
        Vibration.vibrate(22);
      }

      if (result.notFound) {
        navigation.navigate('LandmarkNotFound', {
          user: route?.params?.user,
          language,
          ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
          appTheme,
          photoUri,
          requestRef: result.requestRef,
          scanLatitude: result.latitude,
          scanLongitude: result.longitude,
          visionHintTitle: result.visionHintTitle,
        });
        return;
      }

      const visitCity = parseCityFromSubtitle(result.subtitle) || '';
      navigation.navigate('LandmarkResult', {
        user: route?.params?.user,
        language,
        ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
        appTheme,
        photoUri,
        title: result.title,
        headerTitle: result.title,
        subtitle: result.subtitle,
        extract: result.extract,
        miniExtract: result.miniExtract,
        wikipediaUrl: result.wikipediaUrl,
        source: result.source,
        fromScanner: true,
        visitCity,
        visitCategory: inferVisitCategoryFromTitle(result.title),
        startPhase: 'mini',
        ...(latitude != null &&
        longitude != null &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude)
          ? { visitLat: latitude, visitLng: longitude }
          : {}),
      });
    } catch (e) {
      Alert.alert('', errorToUserText(e, language));
    } finally {
      setBusy(false);
    }
  }, [ready, busy, navigation, route, language, appTheme]);

  useEffect(() => {
    if (!isTabActive) return;
    const sub = DeviceEventEmitter.addListener(LANDMARK_SCANNER_CAPTURE_EVENT, () => {
      pendingCaptureRef.current = true;
      if (ready && !busy) {
        pendingCaptureRef.current = false;
        void runCapture();
      }
    });
    return () => sub.remove();
  }, [isTabActive, ready, busy, runCapture]);

  useEffect(() => {
    if (!isTabActive || !pendingCaptureRef.current || !ready || busy) return;
    pendingCaptureRef.current = false;
    void runCapture();
  }, [isTabActive, ready, busy, runCapture]);

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={accent} />
      </View>
    );
  }

  const cameraUnlocked = !!permission?.granted || cameraAllowedOverride;

  if (!cameraUnlocked) {
    return (
      <View style={[styles.centered, { paddingHorizontal: 24 }]}>
        <Text style={styles.deniedText}>{ls(language, 'needCamera')}</Text>
        <Pressable
          style={[
            styles.deniedBtn,
            { backgroundColor: accent },
            requestingPermission && { opacity: 0.6 },
          ]}
          onPress={handleRequestCamera}
          disabled={requestingPermission}
        >
          {requestingPermission ? (
            <ActivityIndicator color="#1E1E1E" />
          ) : (
            <Text style={styles.deniedBtnText}>{ls(language, 'grant')}</Text>
          )}
        </Pressable>
        <Pressable
          style={styles.linkBtn}
          onPress={() => Linking.openSettings().catch(() => {})}
        >
          <Text style={[styles.linkBtnText, { color: accent }]}>{ls(language, 'openSettings')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView
        ref={camRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="picture"
        active={isTabActive}
        animateShutter
        onCameraReady={() => setReady(true)}
      />
      <CornerFrame
        color={accent}
        topInset={insets.top}
        bottomInset={lightTabBarScrollContentPadding(insets.bottom)}
        busy={busy}
        captureDisabled={!ready}
        onCapturePress={() => {
          pendingCaptureRef.current = false;
          void runCapture();
        }}
      />
      {!busy && ready ? (
        <View
          pointerEvents="none"
          style={[styles.scanHintWrap, { bottom: lightTabBarScrollContentPadding(insets.bottom, 12) }]}
        >
          <Text style={styles.scanHintText}>{ls(language, 'tapToScan')}</Text>
        </View>
      ) : null}
      {insets.top > 0 ? <View style={{ height: insets.top }} pointerEvents="none" /> : null}
      {busy ? (
        <View style={styles.busyOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.busyText}>{ls(language, 'analyzing')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deniedText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  deniedBtn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginBottom: 12,
  },
  deniedBtnText: { color: '#1E1E1E', fontWeight: '600', fontSize: 16 },
  linkBtn: { padding: 8 },
  linkBtnText: { fontSize: 15 },
  frameOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    elevation: 10,
  },
  dimPanel: {
    position: 'absolute',
  },
  scanWindow: {
    position: 'absolute',
    overflow: 'visible',
  },
  scanLineClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  cornerLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 2,
    borderRadius: 0,
    opacity: 0.92,
  },
  scanHintWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
    zIndex: 12,
  },
  scanHintText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    textAlign: 'center',
  },
  scanCornerRoot: {
    position: 'absolute',
    width: CORNER_ARM,
    height: CORNER_ARM,
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  busyText: {
    color: '#FFF',
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default function LandmarkScannerPage({ isTabActive = true, ...props }) {
  const cameraMod = useMemo(() => tryLoadExpoCamera(), []);
  if (!cameraMod) {
    return <CameraNativeMissing navigation={props.navigation} route={props.route} />;
  }
  return <LandmarkScannerPageInner {...props} isTabActive={isTabActive} cameraMod={cameraMod} />;
}
