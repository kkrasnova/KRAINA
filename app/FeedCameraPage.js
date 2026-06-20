import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
  Linking,
  Alert,
  Platform,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSyncedAppLanguage } from './useAppLanguage';

import { fc } from './feedComposerI18n';
import { persistCapturedImage } from './feedMediaPersist';
import { tryLoadExpoCamera } from './tryLoadExpoCamera';
import { errorToUserText } from './errorText';

const ACCENT = '#E1FF00';

function CameraNativeMissing({ navigation, route }) {
  const language = useSyncedAppLanguage(route, 'uk');
  return (
    <View style={[styles.center, { paddingHorizontal: 24 }]}>
      <Text style={styles.denied}>{fc(language, 'nativeCameraMissing')}</Text>
      <Pressable style={styles.btn} onPress={() => navigation.goBack()}>
        <Text style={styles.btnTxt}>{fc(language, 'goBack')}</Text>
      </Pressable>
    </View>
  );
}

function FeedCameraPageInner({ navigation, route, cameraMod }) {
  const { CameraView, useCameraPermissions, getCameraPermissionsAsync } = cameraMod;
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const user = route?.params?.user;
  const countryId = route?.params?.countryId;
  const appTheme = route?.params?.appTheme || 'dark';

  const [permission, requestPermission] = useCameraPermissions();
  /** Після повернення з системних Налаштувань getCameraPermissionsAsync може бути granted, а хук ще «denied». */
  const [cameraAllowedOverride, setCameraAllowedOverride] = useState(false);
  const initialCameraMode = route?.params?.cameraInitialMode === 'post' ? 'post' : 'story';
  const [mode, setMode] = useState(initialCameraMode);
  const [facing, setFacing] = useState('back');
  const [zoom, setZoom] = useState(0);
  /** Підсвітка кадру (ліхтарик), лише задня камера. Знімок — auto flash. */
  const [torchOn, setTorchOn] = useState(false);
  const camRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [thumb, setThumb] = useState(null);
  const zoomRef = useRef(0);
  const pinchRef = useRef(null);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    setZoom(0);
    pinchRef.current = null;
    if (facing === 'front') setTorchOn(false);
  }, [facing]);

  const refreshCameraGate = useCallback(async () => {
    if (typeof getCameraPermissionsAsync !== 'function') return;
    try {
      const r = await getCameraPermissionsAsync();
      setCameraAllowedOverride(!!r?.granted);
    } catch {
      /* */
    }
  }, [getCameraPermissionsAsync]);

  useEffect(() => {
    if (permission?.granted) setCameraAllowedOverride(true);
  }, [permission?.granted]);

  useFocusEffect(
    useCallback(() => {
      void refreshCameraGate();
    }, [refreshCameraGate]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshCameraGate();
    });
    return () => sub.remove();
  }, [refreshCameraGate]);

  const publishVisibility = route?.params?.publishVisibility === 'followers' ? 'followers' : 'public';
  const pickedLat =
    typeof route?.params?.pickedLat === 'number' && Number.isFinite(route.params.pickedLat)
      ? route.params.pickedLat
      : null;
  const pickedLng =
    typeof route?.params?.pickedLng === 'number' && Number.isFinite(route.params.pickedLng)
      ? route.params.pickedLng
      : null;
  const pickedLabel =
    typeof route?.params?.pickedLabel === 'string' ? route.params.pickedLabel.trim() : '';
  const shell = {
    user,
    language,
    appTheme,
    ...(countryId != null ? { countryId } : {}),
    publishVisibility,
    ...(pickedLat != null && pickedLng != null
      ? {
          pickedLat,
          pickedLng,
          ...(pickedLabel ? { pickedLabel } : {}),
        }
      : {}),
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ImagePicker.requestMediaLibraryPermissionsAsync();
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (cancelled || status !== 'granted') return;
        const a = await MediaLibrary.getAssetsAsync({
          mediaType: MediaLibrary.MediaType.photo,
          first: 1,
          sortBy: MediaLibrary.SortBy.creationTime,
        });
        const asset = a.assets?.[0];
        if (asset && !cancelled) {
          const info = await MediaLibrary.getAssetInfoAsync(asset);
          const u = info.localUri || info.uri || asset.uri;
          if (u) setThumb(u);
        }
      } catch {
        /* optional preview */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Після дозволу камери — ще раз запитуємо галерею (часто користувач вже в контексті). */
  useEffect(() => {
    if (!permission?.granted) return;
    let cancelled = false;
    (async () => {
      try {
        await ImagePicker.requestMediaLibraryPermissionsAsync();
        await MediaLibrary.requestPermissionsAsync();
      } catch {
        /* */
      }
      if (cancelled) return;
      try {
        const { status } = await MediaLibrary.getPermissionsAsync();
        if (status !== 'granted') return;
        const a = await MediaLibrary.getAssetsAsync({
          mediaType: MediaLibrary.MediaType.photo,
          first: 1,
          sortBy: MediaLibrary.SortBy.creationTime,
        });
        const asset = a.assets?.[0];
        if (asset && !cancelled) {
          const info = await MediaLibrary.getAssetInfoAsync(asset);
          const u = info.localUri || info.uri || asset.uri;
          if (u) setThumb(u);
        }
      } catch {
        /* */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [permission?.granted]);

  useEffect(() => {
    const next = route?.params?.cameraInitialMode === 'post' ? 'post' : 'story';
    setMode(next);
  }, [route?.params?.cameraInitialMode]);

  const openGallery = useCallback(async () => {
    if (mode === 'post') {
      const lib = await MediaLibrary.requestPermissionsAsync();
      if (lib.status !== 'granted') {
        Alert.alert('', fc(language, 'galleryDenied'), [
          { text: fc(language, 'openSettings'), onPress: () => Linking.openSettings().catch(() => {}) },
          { text: fc(language, 'cancel'), style: 'cancel' },
        ]);
        return;
      }
      navigation.navigate('FeedPostMediaPicker', {
        ...shell,
        publishVisibility,
        initialUris: [],
      });
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('', fc(language, 'galleryDenied'), [
        { text: fc(language, 'openSettings'), onPress: () => Linking.openSettings().catch(() => {}) },
        { text: fc(language, 'cancel'), style: 'cancel' },
      ]);
      return;
    }
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: false,
        quality: 0.88,
        videoMaxDuration: 180,
      });
      if (res.canceled) return;
      const assets = res.assets || [];
      if (!assets.length) return;
      const persisted = [];
      for (const a of assets) {
        if (!a?.uri) continue;
        const p = await persistCapturedImage(a.uri, { mimeType: a.mimeType || '' });
        if (p) persisted.push(p);
      }
      if (!persisted.length) {
        Alert.alert('', fc(language, 'pickError'));
        return;
      }
      navigation.replace('FeedStoryShare', {
        ...shell,
        uri: persisted[0],
      });
    } catch {
      Alert.alert('', fc(language, 'pickError'));
    }
  }, [mode, navigation, shell, language, publishVisibility]);

  const onPinchTouch = useCallback((e) => {
    const { touches } = e.nativeEvent;
    if (touches.length >= 2) {
      const ax = touches[0].pageX;
      const ay = touches[0].pageY;
      const bx = touches[1].pageX;
      const by = touches[1].pageY;
      const d = Math.hypot(ax - bx, ay - by);
      if (d < 10) return;
      if (!pinchRef.current) {
        pinchRef.current = { d0: d, z0: zoomRef.current };
      } else {
        const { d0, z0 } = pinchRef.current;
        if (d0 < 10) return;
        const ratio = d / d0;
        const next = Math.min(1, Math.max(0, z0 * ratio));
        setZoom(next);
      }
    }
  }, []);

  const onPinchRelease = useCallback((e) => {
    const { touches } = e.nativeEvent;
    if (touches.length < 2) pinchRef.current = null;
  }, []);

  const takePhoto = useCallback(async () => {
    if (!camRef.current || !ready || busy) return;
    setBusy(true);
    try {
      const photo = await camRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: false,
        shutterSound: true,
      });
      const uri = photo?.uri;
      if (!uri) return;
      const persisted = await persistCapturedImage(uri);
      if (!persisted) return;
      if (mode === 'story') {
        navigation.replace('FeedStoryShare', { ...shell, uri: persisted });
      } else {
        navigation.navigate('FeedPostMediaPicker', {
          ...shell,
          publishVisibility,
          initialUris: [persisted],
        });
      }
    } catch (e) {
      Alert.alert('', errorToUserText(e, language));
    } finally {
      setBusy(false);
    }
  }, [ready, busy, mode, navigation, shell, publishVisibility]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }

  const cameraUnlocked = !!permission?.granted || cameraAllowedOverride;

  if (!cameraUnlocked) {
    return (
      <View style={[styles.center, { paddingHorizontal: 24 }]}>
        <Text style={styles.denied}>{fc(language, 'needCamera')}</Text>
        <Pressable
          style={styles.btn}
          onPress={async () => {
            await requestPermission();
            await refreshCameraGate();
          }}
        >
          <Text style={styles.btnTxt}>{fc(language, 'grant')}</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={() => Linking.openSettings().catch(() => {})}>
          <Text style={styles.linkTxt}>Settings</Text>
        </Pressable>
      </View>
    );
  }

  const bottomChromeH = 168 + insets.bottom;
  const pinchTop = insets.top + 48;

  const zoomStepFine = facing === 'front' ? 0.1 : 0.08;
  const zoomStepCoarse = 0.22;

  return (
    <View style={styles.screen}>
      <View style={styles.cameraShell} pointerEvents="box-none" collapsable={false}>
        <CameraView
          ref={camRef}
          style={[styles.cameraBase, facing === 'front' && styles.cameraFrontScale]}
          facing={facing}
          zoom={zoom}
          flash="auto"
          enableTorch={torchOn && facing === 'back'}
          mirror={facing === 'front'}
          mode="picture"
          {...(Platform.OS === 'ios' ? { autofocus: 'off' } : {})}
          animateShutter
          onCameraReady={() => setReady(true)}
        />
      </View>
      <View
        style={[styles.pinchLayer, { top: pinchTop, bottom: bottomChromeH }]}
        pointerEvents="auto"
        onTouchStart={onPinchTouch}
        onTouchMove={onPinchTouch}
        onTouchEnd={onPinchRelease}
        onTouchCancel={onPinchRelease}
        collapsable={false}
      />
      <Pressable
        style={[styles.closeBtn, { top: insets.top + 10 }]}
        onPress={() => navigation.goBack()}
        hitSlop={14}
      >
        <Ionicons name="close" size={22} color="#F2F2EA" />
      </Pressable>

      <Pressable
        style={[styles.flashBtn, { top: insets.top + 10, opacity: facing === 'back' ? 1 : 0.35 }]}
        onPress={() => facing === 'back' && setTorchOn((t) => !t)}
        hitSlop={10}
        disabled={facing !== 'back'}
        accessibilityRole="button"
        accessibilityLabel="Torch"
      >
        <Ionicons name={torchOn ? 'flashlight' : 'flashlight-outline'} size={22} color="#F2F2EA" />
      </Pressable>

      <View style={[styles.zoomBadge, { top: insets.top + 52 }]} pointerEvents="none">
        <Text style={styles.zoomBadgeText}>{`${Math.round(zoom * 100)}%`}</Text>
      </View>

      {busy ? (
        <View style={styles.busyOverlay}>
          <ActivityIndicator size="large" color="#FFF" />
        </View>
      ) : null}

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.modeRow}>
          <Pressable onPress={() => setMode('story')} hitSlop={12} style={styles.modeHit}>
            <Text style={[styles.modeText, mode === 'story' && styles.modeTextActive]}>{fc(language, 'story')}</Text>
          </Pressable>
          <Pressable onPress={() => setMode('post')} hitSlop={12} style={styles.modeHit}>
            <Text style={[styles.modeText, mode === 'post' && styles.modeTextActive]}>
              {fc(language, 'publication')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.controlsRow}>
          <Pressable style={styles.sideBtn} onPress={openGallery}>
            <View style={styles.thumbBox}>
              {thumb ? (
                <Image source={{ uri: thumb }} style={styles.thumbImg} />
              ) : (
                <Ionicons name="images-outline" size={20} color="#FFFFFF" />
              )}
            </View>
          </Pressable>

          <View style={styles.shutterCluster}>
            <Pressable
              hitSlop={8}
              onPress={() => setZoom((z) => Math.max(0, z - zoomStepFine))}
              style={styles.zoomStepBtn}
              accessibilityLabel="Zoom out"
            >
              <Ionicons name="remove" size={22} color="#FFFFFF" />
            </Pressable>
            <Pressable
              onPress={takePhoto}
              disabled={!ready || busy}
              style={({ pressed }) => [
                styles.shutterOuter,
                (!ready || busy) && { opacity: 0.45 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={styles.shutterInner} />
            </Pressable>
            <Pressable
              hitSlop={6}
              onPress={() => setZoom((z) => Math.min(1, z + zoomStepFine))}
              style={styles.zoomStepBtn}
              accessibilityLabel="Zoom in"
            >
              <Ionicons name="add" size={22} color="#FFFFFF" />
            </Pressable>
            <Pressable
              hitSlop={6}
              onPress={() => setZoom((z) => Math.min(1, z + zoomStepCoarse))}
              style={styles.zoomStepBtnCoarse}
              accessibilityLabel="Zoom in more"
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
            </Pressable>
          </View>

          <Pressable
            style={styles.sideBtn}
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          >
            <Ionicons name="camera-reverse-outline" size={28} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  cameraShell: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  cameraBase: {
    ...StyleSheet.absoluteFillObject,
  },
  /** Трохи «віддалити» селфі, як на iPhone (менше крупний план у кадрі). */
  cameraFrontScale: {
    transform: [{ scale: 0.88 }],
  },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  denied: { color: 'rgba(255,255,255,0.9)', fontSize: 16, textAlign: 'center', marginBottom: 16 },
  btn: { backgroundColor: ACCENT, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 },
  btnTxt: { color: '#101010', fontWeight: '700' },
  link: { marginTop: 16 },
  linkTxt: { color: ACCENT, fontSize: 15 },
  pinchLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 8,
    backgroundColor: 'transparent',
  },
  closeBtn: {
    position: 'absolute',
    left: 20,
    zIndex: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashBtn: {
    position: 'absolute',
    right: 20,
    zIndex: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBadge: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0,
    right: 0,
    zIndex: 12,
    alignItems: 'center',
  },
  zoomBadgeText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.45)',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 15,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    paddingTop: 10,
    zIndex: 30,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  shutterCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Platform.OS === 'ios' ? 6 : 4,
    flexShrink: 1,
  },
  zoomStepBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomStepBtnCoarse: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBtn: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  thumbBox: {
    width: 32,
    height: 32,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  thumbImg: { width: '100%', height: '100%' },
  shutterOuter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF' },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 6,
    gap: 28,
  },
  modeHit: { paddingHorizontal: 6, paddingVertical: 6 },
  modeText: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.42)' },
  modeTextActive: { color: ACCENT },
});

export default function FeedCameraPage(props) {
  const cameraMod = useMemo(() => tryLoadExpoCamera(), []);
  if (!cameraMod) {
    return <CameraNativeMissing navigation={props.navigation} route={props.route} />;
  }
  return <FeedCameraPageInner {...props} cameraMod={cameraMod} />;
}
