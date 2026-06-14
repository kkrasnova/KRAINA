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
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { getAppTheme, THEME_CHANGED_EVENT } from './themeStorage';
import { accentForTheme, ACCENT_LEMON } from './themeAccent';
import { tryLoadExpoCamera } from './tryLoadExpoCamera';

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

function CornerFrame({ color }) {
  const L = 28;
  const T = 3;
  const c = { borderColor: color };
  return (
    <View style={styles.frameOverlay} pointerEvents="none">
      <View style={[styles.corner, styles.tl, { width: L, height: L, borderTopWidth: T, borderLeftWidth: T }, c]} />
      <View style={[styles.corner, styles.tr, { width: L, height: L, borderTopWidth: T, borderRightWidth: T }, c]} />
      <View style={[styles.corner, styles.bl, { width: L, height: L, borderBottomWidth: T, borderLeftWidth: T }, c]} />
      <View style={[styles.corner, styles.br, { width: L, height: L, borderBottomWidth: T, borderRightWidth: T }, c]} />
    </View>
  );
}

function LandmarkScannerPageInner({ navigation, route, cameraMod }) {
  const { CameraView, useCameraPermissions } = cameraMod;
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const [permission, requestPermission] = useCameraPermissions();
  const camRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');

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

  const bottomReserve = lightTabBarExtraScrollPadding() + 8;

  const runCapture = useCallback(async () => {
    if (!camRef.current || !ready || busy) return;
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
        quality: 0.5,
        base64: true,
        ...(Platform.OS === 'android' ? { skipProcessing: true } : {}),
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
      Alert.alert('', typeof e?.message === 'string' ? e.message : 'Camera error');
    } finally {
      setBusy(false);
    }
  }, [ready, busy, navigation, route, language, appTheme]);

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.centered, { paddingHorizontal: 24 }]}>
        <Text style={styles.deniedText}>{ls(language, 'needCamera')}</Text>
        <Pressable style={[styles.deniedBtn, { backgroundColor: accent }]} onPress={requestPermission}>
          <Text style={styles.deniedBtnText}>{ls(language, 'grant')}</Text>
        </Pressable>
        <Pressable
          style={styles.linkBtn}
          onPress={() => Linking.openSettings().catch(() => {})}
        >
          <Text style={[styles.linkBtnText, { color: accent }]}>Settings</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} />
      <CornerFrame color={accent} />
      {insets.top > 0 ? <View style={{ height: insets.top }} pointerEvents="none" /> : null}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + bottomReserve }]}>
        <Pressable
          onPress={runCapture}
          disabled={!ready || busy}
          style={({ pressed }) => [
            styles.shutterOuter,
            (!ready || busy) && { opacity: 0.5 },
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={[styles.shutterInner, { backgroundColor: accent }]} />
        </Pressable>
      </View>
      {busy ? (
        <View style={styles.busyOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.busyText}>{ls(language, 'analyzing')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const MARGIN_X = '12%';
const MARGIN_Y = '22%';

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
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
  },
  tl: { top: MARGIN_Y, left: MARGIN_X },
  tr: { top: MARGIN_Y, right: MARGIN_X },
  bl: { bottom: MARGIN_Y, left: MARGIN_X },
  br: { bottom: MARGIN_Y, right: MARGIN_X },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
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

export default function LandmarkScannerPage(props) {
  const cameraMod = useMemo(() => tryLoadExpoCamera(), []);
  if (!cameraMod) {
    return <CameraNativeMissing navigation={props.navigation} route={props.route} />;
  }
  return <LandmarkScannerPageInner {...props} cameraMod={cameraMod} />;
}
