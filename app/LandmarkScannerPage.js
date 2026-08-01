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
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

const FILE_B64 = FileSystem.EncodingType?.Base64 ?? 'base64';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { ls } from './landmarkScannerI18n';
import { buildNotFoundLandmarkResult } from './landmarkIdentify';
import { ROUTE_REGIONS } from './routeRegionsData';
import { buildLandmarkResultParamsFromHomeLandmark } from './homeLandmarkResultParams';
import { distanceMetersFromCoords } from './landmarkProximity';
import { getAppTheme, THEME_CHANGED_EVENT, resolveAppTheme } from './themeStorage';
import { LANDMARK_SCANNER_CAPTURE_EVENT } from './homeTabPagerConstants';
import {
  lightTabBarExtraScrollPadding,
} from './LightBottomTabBar';
import { accentForTheme, ACCENT_LEMON } from './themeAccent';
import { tryLoadExpoCamera } from './tryLoadExpoCamera';
import { errorToUserText } from './errorText';
import { isVirtualDevice } from './virtualDevice';

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

const FRAME_SIDE_INSET = 16;
const CORNER_ARM = 58;
const CORNER_STROKE = 5;

/** Відступ знизу під плаваючу tab bar (без scroll clearance — лише для камери). */
function scannerTabBarInset(safeAreaBottom = 0) {
  return Math.max(0, Number(safeAreaBottom) || 0) + lightTabBarExtraScrollPadding();
}

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

function CornerFrame({ color, topInset, bottomInset, busy }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const pulse = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;

  const sideInset = FRAME_SIDE_INSET;
  const frameTop = topInset + 12;
  const frameBottom = bottomInset;
  const frameHeight = Math.max(200, winH - frameTop - frameBottom);
  const frameWidth = Math.max(200, winW - sideInset * 2);

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

      <View
        style={[
          styles.scanWindow,
          {
            top: frameTop,
            left: sideInset,
            width: frameWidth,
            height: frameHeight,
          },
        ]}
        pointerEvents="none"
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
      </View>
    </View>
  );
}

function LandmarkScannerPageInner({ navigation, route, cameraMod, isTabActive = true }) {
  const { CameraView, useCameraPermissions, getCameraPermissionsAsync, requestCameraPermissionsAsync } =
    cameraMod;
  const insets = useSafeAreaInsets();
  const { width: scanW, height: scanH } = useWindowDimensions();
  const language = useSyncedAppLanguage(route, 'uk');
  const [permission, requestPermission] = useCameraPermissions();
  /** Після повернення з системних Налаштувань хук може лишатися «denied», хоча доступ уже видано. */
  const [cameraAllowedOverride, setCameraAllowedOverride] = useState(false);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const camRef = useRef(null);
  const pendingCaptureRef = useRef(false);
  /** Авто-ретрай монтування камери перед показом помилки (транзієнтний збій на iOS/New Arch). */
  const mountRetryRef = useRef(0);
  const MAX_MOUNT_RETRIES = 2;
  /** onCameraReady реально прийшов (окремо від `ready`, який ставиться і по таймауту). */
  const cameraReadyRef = useRef(false);
  /** Перемонтаж застряглого прев'ю (є в'юха, але немає onCameraReady) — до 2 разів. */
  const readyKickRef = useRef(0);
  const MAX_READY_KICKS = 3;
  const [ready, setReady] = useState(isVirtualDevice);
  const [busy, setBusy] = useState(false);
  const [cameraSession, setCameraSession] = useState(0);
  const [cameraError, setCameraError] = useState(null);
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
    setCameraError(null);
    setReady(isVirtualDevice);
    mountRetryRef.current = 0;
    readyKickRef.current = 0;
    cameraReadyRef.current = false;
    setCameraSession((s) => s + 1);
    void refreshCameraGate();
    void Location.requestForegroundPermissionsAsync().catch(() => {});
  }, [isTabActive, refreshCameraGate]);

  useEffect(() => {
    if (!isTabActive || isVirtualDevice) return;
    if (permission?.granted) return;
    let cancelled = false;
    (async () => {
      try {
        const requestFn =
          typeof requestCameraPermissionsAsync === 'function'
            ? requestCameraPermissionsAsync
            : requestPermission;
        const r = await requestFn();
        if (!cancelled && r?.granted) setCameraAllowedOverride(true);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isTabActive, permission?.granted, requestCameraPermissionsAsync, requestPermission]);

  useEffect(() => {
    if (isVirtualDevice || !isTabActive || ready || cameraError) return;
    const t = setTimeout(() => setReady(true), 1200);
    return () => clearTimeout(t);
  }, [isTabActive, ready, cameraError, cameraSession]);

  // Прев'ю застрягло (в'юха є, onCameraReady не прийшов) — тихо перемонтовуємо, щоб зрушити сесію.
  useEffect(() => {
    if (isVirtualDevice || !isTabActive || cameraError) return;
    if (cameraReadyRef.current) return;
    if (readyKickRef.current >= MAX_READY_KICKS) {
      // Прев'ю не піднялось — м'який сигнал помилки, щоб з'явився шлях «Додати з галереї»,
      // а зйомка йшла через галерею (runCapture перевіряє cameraError).
      if (__DEV__) console.warn('[LandmarkScanner] preview never ready — enabling gallery path');
      setCameraError(ls(language, 'cameraError'));
      return;
    }
    const t = setTimeout(() => {
      if (cameraReadyRef.current) return;
      readyKickRef.current += 1;
      if (__DEV__) console.warn('[LandmarkScanner] preview kick', readyKickRef.current);
      setCameraSession((s) => s + 1);
    }, 2200);
    return () => clearTimeout(t);
  }, [isTabActive, cameraError, cameraSession, language]);

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
      if (!c) setAppTheme(t === 'dark' ? 'dark' : 'light');
    })();
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setAppTheme(v === 'dark' ? 'dark' : 'light');
    });
    return () => sub.remove();
  }, []);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);

  const findNearestCatalogLandmark = useCallback((latitude, longitude) => {
    const lat = typeof latitude === 'number' ? latitude : null;
    const lng = typeof longitude === 'number' ? longitude : null;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    let best = null;
    for (const region of Object.values(ROUTE_REGIONS || {})) {
      const list = Array.isArray(region?.landmarks) ? region.landmarks : [];
      for (const lm of list) {
        const dM = distanceMetersFromCoords(lat, lng, lm?.lat, lm?.lng);
        if (dM == null) continue;
        if (!best || dM < best.distanceM) {
          best = { region, lm, distanceM: dM };
        }
      }
    }
    return best;
  }, []);

  const resolveScanLocation = useCallback(async () => {
    let latitude = null;
    let longitude = null;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return { latitude, longitude };
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
      } catch {
        const last = await Location.getLastKnownPositionAsync();
        if (last?.coords) {
          latitude = last.coords.latitude;
          longitude = last.coords.longitude;
        }
      }
    } catch {
      /* ignore location */
    }
    return { latitude, longitude };
  }, []);

  const processLandmarkScan = useCallback(
    async ({ photoUri }) => {
      const { latitude, longitude } = await resolveScanLocation();

      if (Platform.OS === 'android') {
        Vibration.vibrate(22);
      }

      const nearest = findNearestCatalogLandmark(latitude, longitude);
      // UX: якщо користувач реально біля точки — відкриваємо одразу. Інакше — «немає такої локації».
      const MATCH_RADIUS_M = 450;
      if (nearest?.lm && nearest?.region && nearest.distanceM != null && nearest.distanceM <= MATCH_RADIUS_M) {
        const params = buildLandmarkResultParamsFromHomeLandmark({
          lm: nearest.lm,
          region: nearest.region,
          countryId: route?.params?.countryId,
          language,
          appTheme,
          user: route?.params?.user,
        });
        navigation.navigate('LandmarkResult', {
          ...params,
          fromScanner: true,
          ...(photoUri ? { photoUri } : {}),
          ...(typeof latitude === 'number' && typeof longitude === 'number'
            ? { visitLat: latitude, visitLng: longitude }
            : {}),
        });
        return;
      }

      const notFound = buildNotFoundLandmarkResult({ latitude, longitude, visionHintTitle: null });
      navigation.navigate('LandmarkNotFound', {
        user: route?.params?.user,
        language,
        ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
        appTheme,
        ...(photoUri ? { photoUri } : {}),
        requestRef: notFound.requestRef,
        scanLatitude: notFound.latitude,
        scanLongitude: notFound.longitude,
        visionHintTitle: null,
      });
    },
    [resolveScanLocation, findNearestCatalogLandmark, navigation, route, language, appTheme],
  );

  const pickFromGallery = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted && Platform.OS !== 'ios') {
        Alert.alert('', ls(language, 'cameraDenied'), [
          {
            text: ls(language, 'openSettings'),
            onPress: () => Linking.openSettings().catch(() => {}),
          },
          { text: ls(language, 'cancel'), style: 'cancel' },
        ]);
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        base64: true,
        allowsEditing: false,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('', ls(language, 'captureFailed'));
        return;
      }
      let base64 = asset.base64 && String(asset.base64).length > 80 ? asset.base64 : null;
      const photoUri = asset.uri;
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
      await processLandmarkScan({ base64, photoUri });
    } catch (e) {
      Alert.alert('', errorToUserText(e, language));
    } finally {
      setBusy(false);
    }
  }, [busy, language, processLandmarkScan]);

  const runCapture = useCallback(async () => {
    if (busy) return;
    if (isVirtualDevice || cameraError) {
      await pickFromGallery();
      return;
    }
    if (!camRef.current || !ready) {
      Alert.alert('', ls(language, 'cameraNotReady'));
      pendingCaptureRef.current = false;
      return;
    }
    setBusy(true);
    try {
      const photo = await camRef.current.takePictureAsync({
        quality: 0.85,
        base64: true,
        // Base64 потрібен для UI-потоку з фото (на деяких девайсах без обробки base64 може бути порожнім),
        // тому залишаємо обробку увімкненою.
        skipProcessing: false,
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
        Alert.alert('', ls(language, 'captureFailed'), [
          { text: ls(language, 'addFromGallery'), onPress: () => void pickFromGallery() },
          { text: ls(language, 'cancel'), style: 'cancel' },
        ]);
        return;
      }

      await processLandmarkScan({ base64, photoUri });
    } catch (e) {
      Alert.alert('', errorToUserText(e, language), [
        { text: ls(language, 'addFromGallery'), onPress: () => void pickFromGallery() },
        { text: ls(language, 'cancel'), style: 'cancel' },
      ]);
    } finally {
      setBusy(false);
    }
  }, [ready, busy, language, cameraError, pickFromGallery, processLandmarkScan]);

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

  const cameraUnlocked = isVirtualDevice || !!permission?.granted || cameraAllowedOverride;

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

  const tabBarInset = scannerTabBarInset(insets.bottom);

  return (
    <View style={styles.screen}>
      <View style={styles.cameraShell}>
        {isVirtualDevice ? (
          <View style={[styles.simulatorPreview, { width: scanW, height: scanH }]}>
            <LinearGradient
              colors={isLight ? ['#E4E6EC', '#D8DCE6', '#ECEFF4'] : ['#1a1a1a', '#0a0a0a', '#111111']}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={
                isLight
                  ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.42)']
                  : ['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)']
              }
              style={StyleSheet.absoluteFill}
            />
          </View>
        ) : (
          <CameraView
            key={`scanner-cam-${cameraSession}`}
            ref={camRef}
            style={[styles.cameraBase, { width: scanW, height: scanH }]}
            facing="back"
            mode="picture"
            active={isTabActive}
            animateShutter
            {...(Platform.OS === 'android' ? { ratio: '16:9' } : null)}
            onCameraReady={() => {
              if (__DEV__) console.warn('[LandmarkScanner] onCameraReady');
              cameraReadyRef.current = true;
              mountRetryRef.current = 0;
              setReady(true);
              setCameraError(null);
            }}
            onMountError={(e) => {
              if (__DEV__) console.warn('[LandmarkScanner] onMountError', e?.message, JSON.stringify(e || {}));
              if (!isVirtualDevice && mountRetryRef.current < MAX_MOUNT_RETRIES) {
                mountRetryRef.current += 1;
                setTimeout(() => setCameraSession((s) => s + 1), 350);
                return;
              }
              setReady(false);
              setCameraError(e?.message || ls(language, 'cameraError'));
            }}
          />
        )}
      </View>
      <CornerFrame
        color={accent}
        topInset={insets.top}
        bottomInset={tabBarInset}
        busy={busy}
      />
      <Pressable
        style={[
          styles.galleryFab,
          {
            bottom: tabBarInset + 12,
            borderColor: `${accent}88`,
            backgroundColor: 'rgba(0,0,0,0.45)',
          },
        ]}
        onPress={() => void pickFromGallery()}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={ls(language, 'addFromGallery')}
      >
        <Ionicons name="images-outline" size={22} color={accent} />
      </Pressable>
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
  cameraShell: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#0a0a0a',
  },
  cameraBase: {
    ...StyleSheet.absoluteFillObject,
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
  simulatorPreview: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  galleryFab: {
    position: 'absolute',
    left: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.22,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
});

export default function LandmarkScannerPage({ isTabActive = true, ...props }) {
  const cameraMod = useMemo(() => tryLoadExpoCamera(), []);
  if (!cameraMod) {
    return <CameraNativeMissing navigation={props.navigation} route={props.route} />;
  }
  return <LandmarkScannerPageInner {...props} isTabActive={isTabActive} cameraMod={cameraMod} />;
}
