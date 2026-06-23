import { resolveAppTheme } from './themeStorage';
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
  Vibration,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Video, ResizeMode } from './expoAvCompat';

import { fc } from './feedComposerI18n';
import { persistCapturedImage } from './feedMediaPersist';
import { tryLoadExpoCamera } from './tryLoadExpoCamera';
import { errorToUserText } from './errorText';
import { accentForTheme } from './themeAccent';
import { fetchDeviceGalleryPreview, emitDeviceGalleryChanged } from './deviceGallerySync';
import { prependUserFeedStory } from './feedLocalStorage';
import {
  ensureFeedSocialReady,
  feedCreateStoryFromUri,
} from './feedApi';
import { hasBackendSession } from './backendAuthApi';
import { resetToHomeFeedTab } from './homeTabSwitch';
import { useAuthStore } from './auth/authStore';
import { emitFeedMediaUpdated } from './feedSyncEvents';
import { useSyncedAppLanguage } from './useAppLanguage';

const isIosSimulator = Platform.OS === 'ios' && !Constants.isDevice;
const isAndroidEmulator = Platform.OS === 'android' && !Constants.isDevice;
const isSimulator = isIosSimulator;

function CameraNativeMissing({ navigation, route }) {
  const language = useSyncedAppLanguage(route, 'uk');
  const isLight = (resolveAppTheme(route?.params?.appTheme)) === 'light';
  const accent = accentForTheme(isLight);
  return (
    <View style={[styles.center, isLight && styles.centerLight, { paddingHorizontal: 24 }]}>
      <Text style={[styles.denied, isLight && styles.deniedLight]}>{fc(language, 'nativeCameraMissing')}</Text>
      <Pressable style={[styles.btn, { backgroundColor: accent }]} onPress={() => navigation.goBack()}>
        <Text style={styles.btnTxt}>{fc(language, 'goBack')}</Text>
      </Pressable>
    </View>
  );
}

function formatZoomLabel(zoom) {
  if (zoom <= 0.02) return null;
  const factor = 1 + zoom * 3;
  return `${factor.toFixed(1).replace(/\.0$/, '')}×`;
}

function FeedCameraPageInner({ navigation, route, cameraMod }) {
  const {
    CameraView,
    useCameraPermissions,
    getCameraPermissionsAsync,
    requestCameraPermissionsAsync,
  } = cameraMod;
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const language = useSyncedAppLanguage(route, 'uk');
  const user = route?.params?.user;
  const countryId = route?.params?.countryId;
  const appTheme = resolveAppTheme(route?.params?.appTheme);
  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const chromeIcon = isLight ? '#1E1E1E' : '#F2F2EA';
  const chromeBtnBg = isLight ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.42)';
  const chromeBtnBorder = isLight ? 'rgba(30,30,30,0.1)' : 'rgba(255,255,255,0.14)';

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
  const [ready, setReady] = useState(isSimulator || isAndroidEmulator);
  const [busy, setBusy] = useState(false);
  const [thumb, setThumb] = useState(null);
  const [cameraSession, setCameraSession] = useState(0);
  const [cameraError, setCameraError] = useState(null);
  /** Інлайн-прев'ю історії — без окремого FeedStoryShare. */
  const [storyPreviewUri, setStoryPreviewUri] = useState(null);
  const [storyCaption, setStoryCaption] = useState('');
  const [publishBusy, setPublishBusy] = useState(false);
  const zoomRef = useRef(0);
  const pinchRef = useRef(null);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    setZoom(0);
    pinchRef.current = null;
    if (facing === 'front') setTorchOn(false);
    if (!isSimulator) setReady(false);
  }, [facing]);

  useEffect(() => {
    if (permission?.granted || isSimulator) return;
    let cancelled = false;
    (async () => {
      try {
        const req =
          typeof requestCameraPermissionsAsync === 'function'
            ? requestCameraPermissionsAsync
            : requestPermission;
        const r = await req();
        if (!cancelled && r?.granted) setCameraAllowedOverride(true);
      } catch {
        /* */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [permission?.granted, requestCameraPermissionsAsync, requestPermission]);

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

  useEffect(() => {
    void ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => {});
    void MediaLibrary.requestPermissionsAsync().catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        try {
          const result = await fetchDeviceGalleryPreview({ limit: 1, quickThumbs: true });
          const latest = result.items?.[0];
          if (latest?.uri && !cancelled) setThumb(latest.uri);
        } catch {
          /* */
        }
      })();
      void refreshCameraGate();
      if (!isSimulator) setCameraError(null);
      return () => {
        cancelled = true;
        setTorchOn(false);
      };
    }, [refreshCameraGate]),
  );

  /**
   * Запасний таймер: якщо onCameraReady не спрацював за 1 с (типово для
   * емулятора/повільних пристроїв), все одно прибираємо «Запуск камери…»
   * і вмикаємо затвор, щоб екран не залипав на спінері.
   */
  useEffect(() => {
    if (isSimulator || isAndroidEmulator || ready || cameraError) return;
    const t = setTimeout(() => setReady(true), 1000);
    return () => clearTimeout(t);
  }, [ready, cameraError, cameraSession]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshCameraGate();
    });
    return () => sub.remove();
  }, [refreshCameraGate]);

  const publishVisibility = route?.params?.publishVisibility === 'public' ? 'public' : 'followers';
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
  const shell = useMemo(
    () => ({
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
    }),
    [user, language, appTheme, countryId, publishVisibility, pickedLat, pickedLng, pickedLabel],
  );

  const mediaPickerTypes = useMemo(() => ['images', 'videos'], []);

  const goAfterCapture = useCallback(
    (persistedUris, { isStory }) => {
      const list = Array.isArray(persistedUris) ? persistedUris.filter(Boolean) : [];
      if (!list.length) {
        Alert.alert('', fc(language, 'pickError'));
        return;
      }
      setThumb(list[0]);
      emitDeviceGalleryChanged();
      if (isStory) {
        setStoryCaption('');
        setStoryPreviewUri(list[0]);
        return;
      }
      // Пост: повний флоу — один знімок → композер; кілька → медіа-пікер.
      if (list.length === 1) {
        navigation.navigate('FeedPostComposer', {
          ...shell,
          uris: list,
          publishVisibility,
        });
        return;
      }
      navigation.navigate('FeedPostMediaPicker', {
        ...shell,
        publishVisibility,
        initialUris: list,
      });
    },
    [language, navigation, publishVisibility, shell],
  );

  const launchMediaPicker = useCallback(
    async ({ isStory, allowMulti }) => {
      const pickerOptions = {
        mediaTypes: mediaPickerTypes,
        allowsMultipleSelection: allowMulti,
        quality: 0.92,
        selectionLimit: isStory ? 1 : 10,
        videoMaxDuration: 180,
      };
      try {
        return await ImagePicker.launchImageLibraryAsync(pickerOptions);
      } catch (libErr) {
        if (!isAndroidEmulator && !isSimulator) throw libErr;
        const camPerm = await ImagePicker.requestCameraPermissionsAsync();
        if (!camPerm.granted) throw libErr;
        return await ImagePicker.launchCameraAsync({
          mediaTypes: mediaPickerTypes,
          quality: 0.92,
          videoMaxDuration: 180,
        });
      }
    },
    [mediaPickerTypes],
  );

  useEffect(() => {
    const next = route?.params?.cameraInitialMode === 'post' ? 'post' : 'story';
    setMode(next);
  }, [route?.params?.cameraInitialMode]);

  const pickFromSystemLibrary = useCallback(
    async ({ forceStory, forcePostMulti } = {}) => {
      // iOS: системний PHPicker (launchImageLibraryAsync) працює без дозволу на
      // фотогалерею — він виконується поза процесом застосунку. Тому НЕ блокуємо
      // запуск, інакше галерея «не відкривається», коли доступ обмежено/відхилено.
      // Android: дозвіл обов'язковий, тож там лишаємо перевірку.
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted && Platform.OS !== 'ios') {
        Alert.alert('', fc(language, 'galleryDenied'), [
          { text: fc(language, 'openSettings'), onPress: () => Linking.openSettings().catch(() => {}) },
          { text: fc(language, 'cancel'), style: 'cancel' },
        ]);
        return;
      }
      const isStory = forceStory ?? mode === 'story';
      const allowMulti = forcePostMulti ?? !isStory;
      setBusy(true);
      try {
        const res = await launchMediaPicker({ isStory, allowMulti });
        if (res.canceled) return;
        const assets = res.assets || [];
        if (!assets.length) return;
        const persisted = [];
        for (const a of assets) {
          if (!a?.uri) continue;
          const p = await persistCapturedImage(a.uri, { mimeType: a.mimeType || '' });
          if (p) persisted.push(p);
        }
        goAfterCapture(persisted, { isStory });
      } catch (e) {
        if (__DEV__) console.warn('[FeedCamera] pickFromSystemLibrary', e);
        Alert.alert('', fc(language, 'mediaPickerFailed'));
      } finally {
        setBusy(false);
      }
    },
    [mode, language, launchMediaPicker, goAfterCapture],
  );

  const openGallery = useCallback(() => {
    if (busy) return;
    if (mode === 'story') {
      void pickFromSystemLibrary({ forceStory: true });
      return;
    }
    navigation.navigate('FeedPostMediaPicker', {
      ...shell,
      publishVisibility,
    });
  }, [busy, mode, pickFromSystemLibrary, navigation, shell, publishVisibility]);

  const onPinchRelease = useCallback(() => {
    pinchRef.current = null;
  }, []);

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

  const toggleTorch = useCallback(() => {
    if (facing !== 'back' || isSimulator) return;
    setTorchOn((t) => {
      const next = !t;
      if (Platform.OS === 'android' && next) Vibration.vibrate(12);
      return next;
    });
  }, [facing]);

  const flipCamera = useCallback(() => {
    if (isSimulator) return;
    setTorchOn(false);
    setReady(false);
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
    if (Platform.OS === 'android') Vibration.vibrate(10);
  }, []);

  const takePhoto = useCallback(async () => {
    if (isSimulator || isAndroidEmulator) {
      if (mode === 'story') {
        void pickFromSystemLibrary({ forceStory: true });
      } else {
        navigation.navigate('FeedPostMediaPicker', {
          ...shell,
          publishVisibility,
        });
      }
      return;
    }
    if (busy) return;
    if (!ready) {
      Alert.alert('', fc(language, 'cameraNotReady'));
      return;
    }
    if (!camRef.current) {
      if (isAndroidEmulator) {
        await pickFromSystemLibrary();
        return;
      }
      Alert.alert('', fc(language, 'captureFailed'));
      return;
    }
    setBusy(true);
    try {
      const photo = await camRef.current.takePictureAsync({
        quality: 0.92,
        ...(Platform.OS === 'android' ? { skipProcessing: true } : { skipProcessing: false }),
        shutterSound: Platform.OS === 'ios',
      });
      const uri = photo?.uri;
      if (!uri) {
        Alert.alert('', fc(language, 'captureFailed'));
        return;
      }
      const persisted = await persistCapturedImage(uri);
      if (!persisted) {
        Alert.alert('', fc(language, 'captureFailed'));
        return;
      }
      if (Platform.OS === 'android') Vibration.vibrate(22);
      goAfterCapture([persisted], { isStory: mode === 'story' });
    } catch (e) {
      if (isAndroidEmulator) {
        await pickFromSystemLibrary();
        return;
      }
      Alert.alert('', fc(language, 'captureFailed'), [
        { text: fc(language, 'addFromGallery'), onPress: () => void pickFromSystemLibrary() },
        { text: fc(language, 'cancel'), style: 'cancel' },
      ]);
      if (__DEV__) console.warn('[FeedCamera] takePicture', errorToUserText(e, language));
    } finally {
      setBusy(false);
    }
  }, [
    ready,
    busy,
    mode,
    language,
    pickFromSystemLibrary,
    goAfterCapture,
    navigation,
    shell,
    publishVisibility,
  ]);

  const retakeStory = useCallback(() => {
    setStoryPreviewUri(null);
    setStoryCaption('');
  }, []);

  const publishStoryNow = useCallback(async () => {
    const uri = storyPreviewUri;
    if (publishBusy || !uri) return;
    const activeUser = user || useAuthStore.getState().user;
    if (!activeUser?.id) {
      Alert.alert(
        '',
        language === 'en' ? 'Sign in to share a story.' : 'Увійдіть в акаунт, щоб поділитись історією.',
      );
      return;
    }
    setPublishBusy(true);
    const captionTrimmed = storyCaption.trim();
    const userId = String(useAuthStore.getState().profileMe?.profile?.user_id || activeUser.id);
    try {
      const localStory = await prependUserFeedStory(activeUser, { uri, caption: captionTrimmed });
      emitFeedMediaUpdated({ kind: 'story', userId, story: localStory });
      emitDeviceGalleryChanged();
      setStoryPreviewUri(null);
      setStoryCaption('');
      resetToHomeFeedTab(navigation, shell);

      void (async () => {
        try {
          await ensureFeedSocialReady(activeUser);
          if (!hasBackendSession()) return;
          await feedCreateStoryFromUri(uri, captionTrimmed);
          emitFeedMediaUpdated({ kind: 'story', userId, story: localStory });
        } catch (uploadErr) {
          if (__DEV__) console.warn('[FeedCamera] story background upload', uploadErr);
        }
      })();
    } catch (e) {
      Alert.alert('', errorToUserText(e, language));
    } finally {
      setPublishBusy(false);
    }
  }, [storyPreviewUri, publishBusy, storyCaption, user, navigation, shell, language]);

  const retryCamera = useCallback(() => {
    setCameraError(null);
    setReady(false);
    setCameraSession((s) => s + 1);
  }, []);

  if (!permission) {
    return (
      <View style={[styles.center, isLight && styles.centerLight]}>
        <ActivityIndicator color={accent} />
      </View>
    );
  }

  const cameraUnlocked = isSimulator || !!permission?.granted || cameraAllowedOverride;

  if (!cameraUnlocked) {
    return (
      <View style={[styles.center, isLight && styles.centerLight, { paddingHorizontal: 24 }]}>
        <Text style={[styles.denied, isLight && styles.deniedLight]}>{fc(language, 'needCamera')}</Text>
        <Pressable
          style={[styles.btn, { backgroundColor: accent }]}
          onPress={async () => {
            await requestPermission();
            await refreshCameraGate();
          }}
        >
          <Text style={styles.btnTxt}>{fc(language, 'grant')}</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={() => Linking.openSettings().catch(() => {})}>
          <Text style={[styles.linkTxt, { color: accent }]}>{fc(language, 'openSettings')}</Text>
        </Pressable>
      </View>
    );
  }

  // Інлайн-прев'ю історії: підпис + «Поділитись» без окремого екрана.
  if (storyPreviewUri) {
    const previewIsVideo = /\.(mp4|mov|m4v)(\?|$)/i.test(String(storyPreviewUri));
    return (
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : insets.bottom}
      >
        <View style={styles.screen}>
          <View style={styles.previewFill}>
            {previewIsVideo ? (
              <Video
                source={{ uri: storyPreviewUri }}
                style={styles.previewImg}
                resizeMode={ResizeMode.COVER}
                shouldPlay
                isLooping
                isMuted
                useNativeControls={false}
              />
            ) : (
              <Image source={{ uri: storyPreviewUri }} style={styles.previewImg} resizeMode="cover" />
            )}
          </View>

          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,0,0,0.5)', 'transparent']}
            style={[styles.topFade, { height: insets.top + 72 }]}
          />

          <View style={[styles.previewTopRow, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
            <Pressable
              style={styles.previewTopBtn}
              onPress={retakeStory}
              hitSlop={14}
              accessibilityLabel={fc(language, 'goBack')}
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
          <Text
            style={[styles.previewStoryTitle, { top: insets.top + 18 }]}
            pointerEvents="none"
          >
            {fc(language, 'story')}
          </Text>

          <View style={[styles.previewBottom, { paddingBottom: Math.max(insets.bottom, 14) + 12 }]}>
            <View style={styles.previewCaptionWrap}>
              <TextInput
                style={styles.previewCaptionInput}
                placeholder={fc(language, 'addDescription')}
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={storyCaption}
                onChangeText={setStoryCaption}
                multiline
                maxLength={500}
              />
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.previewPublishBtn,
                { backgroundColor: accent, opacity: publishBusy ? 0.6 : pressed ? 0.9 : 1 },
              ]}
              onPress={publishStoryNow}
              disabled={publishBusy}
            >
              {publishBusy ? (
                <ActivityIndicator size="small" color="#101010" />
              ) : (
                <Text style={styles.previewPublishBtnText}>{fc(language, 'shareStory')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  const bottomChromeH = 188 + insets.bottom;
  const pinchTop = insets.top + 48;
  const zoomStepFine = facing === 'front' ? 0.1 : 0.08;
  const zoomLabel = formatZoomLabel(zoom);
  const shutterReady = isSimulator || isAndroidEmulator || (ready && !cameraError);

  return (
    <View style={[styles.screen, isLight && styles.screenLight]}>
      <View style={[styles.cameraShell, isLight && styles.cameraShellLight]} pointerEvents="box-none" collapsable={false}>
        {isSimulator ? (
          <View style={[styles.simulatorPreview, isLight && styles.simulatorPreviewLight]}>
            {thumb ? (
              <Image source={{ uri: thumb }} style={styles.simulatorPreviewImg} blurRadius={Platform.OS === 'ios' ? 6 : 0} />
            ) : (
              <LinearGradient
                colors={isLight ? ['#E4E6EC', '#D8DCE6', '#ECEFF4'] : ['#1a1a1a', '#0a0a0a', '#111111']}
                style={StyleSheet.absoluteFill}
              />
            )}
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
            key={`cam-${cameraSession}-${facing}`}
            ref={camRef}
            style={[
              styles.cameraBase,
              facing === 'front' && Platform.OS === 'ios' && styles.cameraFrontScale,
            ]}
            facing={facing}
            zoom={zoom}
            flash={torchOn && facing === 'back' ? 'off' : 'auto'}
            enableTorch={torchOn && facing === 'back'}
            mirror={facing === 'front'}
            mode="picture"
            {...(Platform.OS === 'ios' ? { active: isFocused } : null)}
            {...(Platform.OS === 'android' ? { ratio: '16:9' } : null)}
            animateShutter={Platform.OS === 'ios'}
            onCameraReady={() => {
              setReady(true);
              setCameraError(null);
            }}
            onMountError={(e) => {
              setReady(false);
              setCameraError(e?.message || fc(language, 'cameraError'));
            }}
          />
        )}
      </View>

      <LinearGradient
        pointerEvents="none"
        colors={
          isLight ? ['rgba(255,255,255,0.72)', 'transparent'] : ['rgba(0,0,0,0.55)', 'transparent']
        }
        style={[styles.topFade, { height: insets.top + 72 }]}
      />

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
        style={[
          styles.closeBtn,
          styles.chromeBtnElevated,
          { top: insets.top + 10, backgroundColor: chromeBtnBg, borderColor: chromeBtnBorder },
        ]}
        onPress={() => navigation.goBack()}
        hitSlop={14}
      >
        <Ionicons name="close" size={22} color={chromeIcon} />
      </Pressable>

      <Pressable
        style={[
          styles.flashBtn,
          styles.chromeBtnElevated,
          {
            top: insets.top + 10,
            opacity: facing === 'back' && !isSimulator ? 1 : 0.35,
            backgroundColor: torchOn ? `${accent}33` : chromeBtnBg,
            borderColor: torchOn ? accent : chromeBtnBorder,
          },
        ]}
        onPress={toggleTorch}
        hitSlop={10}
        disabled={facing !== 'back' || isSimulator}
        accessibilityRole="button"
        accessibilityLabel="Torch"
        accessibilityState={{ selected: torchOn }}
      >
        <Ionicons
          name={torchOn ? 'flashlight' : 'flashlight-outline'}
          size={22}
          color={torchOn ? accent : chromeIcon}
        />
      </Pressable>

      {zoomLabel ? (
        <View style={[styles.zoomBadge, { top: insets.top + 52 }]} pointerEvents="none">
          <Text
            style={[
              styles.zoomBadgeText,
              isLight && styles.zoomBadgeTextLight,
            ]}
          >
            {zoomLabel}
          </Text>
        </View>
      ) : null}

      {!isSimulator && !ready && !cameraError ? (
        <View style={[styles.initOverlay, isLight && styles.initOverlayLight]} pointerEvents="none">
          <ActivityIndicator color={accent} size="small" />
          <Text style={[styles.initText, isLight && styles.initTextLight]}>{fc(language, 'cameraInitializing')}</Text>
        </View>
      ) : null}

      {cameraError ? (
        <View style={[styles.initOverlay, isLight && styles.initOverlayLight]}>
          <Ionicons name="warning-outline" size={32} color={isLight ? 'rgba(30,30,30,0.55)' : 'rgba(255,255,255,0.75)'} />
          <Text style={[styles.initText, isLight && styles.initTextLight]}>{cameraError}</Text>
          <Pressable style={[styles.btn, { backgroundColor: accent }]} onPress={retryCamera}>
            <Text style={styles.btnTxt}>{fc(language, 'retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {busy ? (
        <View style={styles.busyOverlay}>
          <ActivityIndicator size="large" color="#FFF" />
        </View>
      ) : null}

      <View style={[styles.bottomBar, styles.chromeBarElevated, { paddingBottom: insets.bottom + 14 }]}>
        <LinearGradient
          pointerEvents="none"
          colors={
            isLight
              ? ['transparent', 'rgba(255,255,255,0.82)', 'rgba(255,255,255,0.98)']
              : ['transparent', 'rgba(0,0,0,0.72)', 'rgba(0,0,0,0.96)']
          }
          style={styles.bottomFade}
        />
        {Platform.OS === 'ios' ? (
          <BlurView intensity={28} tint={isLight ? 'light' : 'dark'} style={styles.bottomBlur} pointerEvents="none" />
        ) : null}

        <View
          style={[
            styles.modePill,
            isLight ? styles.modePillLight : null,
          ]}
        >
          <Pressable
            onPress={() => setMode('story')}
            hitSlop={8}
            style={[
              styles.modeTab,
              mode === 'story' && styles.modeTabActive,
              mode === 'story' && isLight && styles.modeTabActiveLight,
            ]}
          >
            <Text
              style={[
                styles.modeText,
                isLight && styles.modeTextLight,
                mode === 'story' && { color: accent },
              ]}
            >
              {fc(language, 'story')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('post')}
            hitSlop={8}
            style={[
              styles.modeTab,
              mode === 'post' && styles.modeTabActive,
              mode === 'post' && isLight && styles.modeTabActiveLight,
            ]}
          >
            <Text
              style={[
                styles.modeText,
                isLight && styles.modeTextLight,
                mode === 'post' && { color: accent },
              ]}
            >
              {fc(language, 'publication')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.controlsRow}>
          <Pressable style={styles.sideBtn} onPress={openGallery}>
            <View
              style={[
                styles.thumbBox,
                isLight && styles.thumbBoxLight,
              ]}
            >
              {thumb ? (
                <Image source={{ uri: thumb }} style={styles.thumbImg} />
              ) : (
                <Ionicons name="images-outline" size={20} color={isLight ? '#1E1E1E' : '#FFFFFF'} />
              )}
            </View>
          </Pressable>

          <View style={styles.shutterCluster}>
            <Pressable
              hitSlop={8}
              onPress={() => setZoom((z) => Math.max(0, z - zoomStepFine))}
              style={[
                styles.zoomStepBtn,
                isLight && styles.zoomStepBtnLight,
                zoom <= 0 && styles.zoomStepBtnDisabled,
              ]}
              accessibilityLabel="Zoom out"
              disabled={zoom <= 0}
            >
              <Ionicons
                name="remove"
                size={20}
                color={zoom <= 0 ? (isLight ? 'rgba(30,30,30,0.22)' : 'rgba(255,255,255,0.28)') : chromeIcon}
              />
            </Pressable>
            <Pressable
              onPress={takePhoto}
              disabled={!shutterReady || busy}
              style={({ pressed }) => [
                styles.shutterOuter,
                isLight && styles.shutterOuterLight,
                mode === 'story' && { borderColor: accent },
                (!shutterReady || busy) && { opacity: 0.45 },
                pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
              ]}
            >
              <View
                style={[
                  styles.shutterInner,
                  isLight && styles.shutterInnerLight,
                  mode === 'story' && { backgroundColor: accent },
                ]}
              />
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => setZoom((z) => Math.min(1, z + zoomStepFine))}
              style={[
                styles.zoomStepBtn,
                isLight && styles.zoomStepBtnLight,
                zoom >= 1 && styles.zoomStepBtnDisabled,
              ]}
              accessibilityLabel="Zoom in"
              disabled={zoom >= 1 || isSimulator}
            >
              <Ionicons
                name="add"
                size={20}
                color={
                  zoom >= 1 || isSimulator
                    ? isLight
                      ? 'rgba(30,30,30,0.22)'
                      : 'rgba(255,255,255,0.28)'
                    : chromeIcon
                }
              />
            </Pressable>
          </View>

          <Pressable
            style={styles.sideBtn}
            onPress={flipCamera}
            disabled={isSimulator}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Flip camera"
          >
            <Ionicons
              name="camera-reverse-outline"
              size={28}
              color={isSimulator ? (isLight ? 'rgba(30,30,30,0.28)' : 'rgba(255,255,255,0.35)') : chromeIcon}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  screenLight: { backgroundColor: '#F4F5F8' },
  cameraShell: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#0a0a0a',
  },
  cameraShellLight: {
    backgroundColor: '#E8EBF0',
  },
  cameraBase: {
    ...StyleSheet.absoluteFillObject,
  },
  cameraFrontScale: {
    transform: [{ scale: 0.88 }],
  },
  simulatorPreview: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  simulatorPreviewLight: {
    backgroundColor: '#ECEFF4',
  },
  simulatorPreviewImg: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.55,
  },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  centerLight: { backgroundColor: '#F4F5F8' },
  denied: { color: 'rgba(255,255,255,0.9)', fontSize: 16, textAlign: 'center', marginBottom: 16 },
  deniedLight: { color: 'rgba(30,30,30,0.88)' },
  btn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 },
  btnTxt: { color: '#101010', fontWeight: '700' },
  link: { marginTop: 16 },
  linkTxt: { fontSize: 15 },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 6,
  },
  previewFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  previewImg: { width: '100%', height: '100%' },
  previewTopRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  previewTopBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCountBadge: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCountText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  previewStoryTitle: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0,
    right: 0,
    zIndex: 21,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  previewBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  previewCaptionWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  previewCaptionInput: {
    minHeight: 44,
    maxHeight: 100,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFFFFF',
  },
  previewPublishBtn: {
    borderRadius: 23,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPublishBtnText: { color: '#101010', fontSize: 17, fontWeight: '700' },
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
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashBtn: {
    position: 'absolute',
    right: 20,
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chromeBtnElevated: Platform.select({
    android: { elevation: 8 },
    default: {},
  }),
  chromeBarElevated: Platform.select({
    android: { elevation: 12 },
    default: {},
  }),
  zoomBadge: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0,
    right: 0,
    zIndex: 12,
    alignItems: 'center',
  },
  zoomBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.52)',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  zoomBadgeTextLight: {
    color: '#1E1E1E',
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  initOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  initOverlayLight: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  initText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    fontWeight: '500',
  },
  initTextLight: {
    color: 'rgba(30,30,30,0.65)',
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
    paddingTop: 28,
    zIndex: 30,
  },
  bottomFade: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomBlur: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 2,
  },
  shutterCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  zoomStepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomStepBtnLight: {
    backgroundColor: 'rgba(30,30,30,0.08)',
    borderColor: 'rgba(30,30,30,0.1)',
  },
  zoomStepBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  sideBtn: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  thumbBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  thumbBoxLight: {
    borderColor: '#1E1E1E',
    backgroundColor: 'rgba(30,30,30,0.06)',
  },
  thumbImg: { width: '100%', height: '100%' },
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuterLight: {
    borderColor: 'rgba(30,30,30,0.88)',
  },
  shutterInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFFFFF',
  },
  shutterInnerLight: {
    backgroundColor: '#1E1E1E',
  },
  modePill: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    padding: 3,
    gap: 2,
  },
  modePillLight: {
    backgroundColor: 'rgba(30,30,30,0.08)',
  },
  modeTab: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
  },
  modeTabActive: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  modeTabActiveLight: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  modeText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.45)' },
  modeTextLight: { color: 'rgba(30,30,30,0.45)' },
});

export default function FeedCameraPage(props) {
  const cameraMod = useMemo(() => tryLoadExpoCamera(), []);
  if (!cameraMod) {
    return <CameraNativeMissing navigation={props.navigation} route={props.route} />;
  }
  return <FeedCameraPageInner {...props} cameraMod={cameraMod} />;
}
