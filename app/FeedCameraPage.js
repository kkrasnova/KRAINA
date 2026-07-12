import { useAppTheme } from './useAppTheme';
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
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
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
import { clearComposerDraft } from './feedComposerDraft';
import { isAndroidEmulator, isVirtualDevice } from './virtualDevice';

function CameraNativeMissing({ navigation, route }) {
  const language = useSyncedAppLanguage(route, 'uk');
  const { isLight } = useAppTheme(route?.params?.appTheme, route);
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
  const { width: winW, height: winH } = useWindowDimensions();
  const isFocused = useIsFocused();
  const language = useSyncedAppLanguage(route, 'uk');
  const user = route?.params?.user;
  const countryId = route?.params?.countryId;
  const { appTheme, isLight } = useAppTheme(route?.params?.appTheme, route);
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
  const [busy, setBusy] = useState(false);
  const [thumb, setThumb] = useState(null);
  const [cameraSession, setCameraSession] = useState(0);
  const [cameraError, setCameraError] = useState(null);
  const [galleryFallback, setGalleryFallback] = useState(isVirtualDevice);
  /** DEV-only діагностика життєвого циклу CameraView: 'waiting' | 'ready' | 'mounterr:<msg>'. */
  const [camDebug, setCamDebug] = useState('waiting');
  /** Тап по затвору = фото, утримання = відео. Камера завжди у 'video' (фото теж працює),
   * мікрофон вмикаємо лише під час запису через mute. */
  const [isRecording, setIsRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const recordingRef = useRef(false);
  const holdActiveRef = useRef(false); // палець досі утримує затвор
  const holdTimerRef = useRef(null);
  const recordTickRef = useRef(null);
  const HOLD_TO_RECORD_MS = 260;
  const MIN_VIDEO_MS = 900; // коротше — вважаємо випадковим, ігноруємо
  const MAX_VIDEO_SECS = 60;
  /** Інлайн-прев'ю історії — без окремого FeedStoryShare. */
  const [storyPreviewUri, setStoryPreviewUri] = useState(null);
  const [storyCaption, setStoryCaption] = useState('');
  const [publishBusy, setPublishBusy] = useState(false);
  const zoomRef = useRef(0);
  const pinchRef = useRef(null);
  /** Скільки разів поспіль CameraView не змонтувалась — авто-ретрай перед fallback на галерею. */
  const mountRetryRef = useRef(0);
  const MAX_MOUNT_RETRIES = 2;
  /** Камера змонтувалась без onMountError, але й onCameraReady не прийшов (застряглий перший
   * кадр Fabric-в'юхи на New Arch → порожнє прев'ю). Один-два тихі перемонтажі «розганяють» сесію. */
  const readyKickRef = useRef(0);
  const MAX_READY_KICKS = 2;

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    setZoom(0);
    pinchRef.current = null;
    if (facing === 'front') setTorchOn(false);
  }, [facing]);

  useEffect(() => {
    if (permission?.granted || isVirtualDevice) return;
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
    // Мікрофон — щоб відео (по утриманню затвора) було зі звуком.
    if (typeof cameraMod.requestMicrophonePermissionsAsync === 'function') {
      void cameraMod.requestMicrophonePermissionsAsync().catch(() => {});
    }
  }, [cameraMod]);

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
      if (!isVirtualDevice) {
        setCameraError(null);
        mountRetryRef.current = 0;
        readyKickRef.current = 0;
        setCamDebug('waiting');
        setCameraSession((s) => s + 1);
      }
      return () => {
        cancelled = true;
        setTorchOn(false);
      };
    }, [refreshCameraGate]),
  );

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
      clearComposerDraft();
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
        if (!isVirtualDevice) throw libErr;
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
      try {
        const res = await launchMediaPicker({ isStory, allowMulti });
        if (res.canceled) return;
        const assets = res.assets || [];
        if (!assets.length) return;
        setBusy(true);
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
    clearComposerDraft();
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
    if (facing !== 'back' || isVirtualDevice) return;
    setTorchOn((t) => {
      const next = !t;
      if (Platform.OS === 'android' && next) Vibration.vibrate(12);
      return next;
    });
  }, [facing]);

  const flipCamera = useCallback(() => {
    if (isVirtualDevice) return;
    setTorchOn(false);
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
    if (Platform.OS === 'android') Vibration.vibrate(10);
  }, []);

  const takePhoto = useCallback(async () => {
    if (isVirtualDevice || galleryFallback || cameraError) {
      if (mode === 'story') {
        void pickFromSystemLibrary({ forceStory: true });
      } else {
        clearComposerDraft();
        navigation.navigate('FeedPostMediaPicker', {
          ...shell,
          publishVisibility,
        });
      }
      return;
    }
    if (busy) return;
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
    busy,
    mode,
    language,
    galleryFallback,
    cameraError,
    pickFromSystemLibrary,
    goAfterCapture,
    navigation,
    shell,
    publishVisibility,
  ]);

  // ── Відео по утриманню затвора (камера завжди у 'video' → без гонок перемикання) ──
  const stopRecordTick = useCallback(() => {
    if (recordTickRef.current) {
      clearInterval(recordTickRef.current);
      recordTickRef.current = null;
    }
    setRecordSecs(0);
  }, []);

  const stopRecording = useCallback(() => {
    holdActiveRef.current = false;
    try {
      camRef.current?.stopRecording();
    } catch {
      /* recordAsync resolve обробить решту */
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (isVirtualDevice || galleryFallback || cameraError || busy) return;
    if (recordingRef.current || !camRef.current) return;
    holdActiveRef.current = true;
    recordingRef.current = true;
    setIsRecording(true); // → mute=false, підключається мікрофон
    setTorchOn(false);
    setRecordSecs(0);
    if (Platform.OS === 'android') Vibration.vibrate(18);

    // Даємо мікрофону підключитись (mute:false) і перевіряємо, чи палець ще утримує.
    await new Promise((r) => setTimeout(r, 120));
    if (!holdActiveRef.current || !camRef.current) {
      recordingRef.current = false;
      setIsRecording(false);
      return;
    }

    const finish = () => {
      stopRecordTick();
      recordingRef.current = false;
      holdActiveRef.current = false;
      setIsRecording(false);
    };
    recordTickRef.current = setInterval(() => {
      setRecordSecs((s) => {
        const next = s + 1;
        if (next >= MAX_VIDEO_SECS) {
          try {
            camRef.current?.stopRecording();
          } catch {
            /* */
          }
        }
        return next;
      });
    }, 1000);

    const startTs = Date.now();
    try {
      if (__DEV__) console.warn('[FeedCamVid] recordAsync start');
      const result = await camRef.current.recordAsync({ maxDuration: MAX_VIDEO_SECS });
      const durationMs = Date.now() - startTs;
      if (__DEV__) console.warn('[FeedCamVid] done uri=', String(result?.uri), 'ms=', durationMs);
      finish();
      const uri = result?.uri;
      if (uri && durationMs >= MIN_VIDEO_MS) {
        setBusy(true);
        const persisted = await persistCapturedImage(uri, { mimeType: 'video/mp4' });
        setBusy(false);
        if (__DEV__) console.warn('[FeedCamVid] persisted=', String(persisted));
        if (persisted) {
          if (Platform.OS === 'android') Vibration.vibrate(22);
          goAfterCapture([persisted], { isStory: mode === 'story' });
        }
      } else if (__DEV__) {
        console.warn('[FeedCamVid] discarded (no uri or too short)');
      }
    } catch (e) {
      finish();
      if (__DEV__) console.warn('[FeedCamVid] recordAsync ERROR', e?.message);
    }
  }, [busy, galleryFallback, cameraError, mode, goAfterCapture, stopRecordTick]);

  // Прибирання таймерів при демонтажі.
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (recordTickRef.current) clearInterval(recordTickRef.current);
    };
  }, []);

  const onShutterPressIn = useCallback(() => {
    if (isVirtualDevice || galleryFallback || busy || cameraError) return;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      void startRecording();
    }, HOLD_TO_RECORD_MS);
  }, [galleryFallback, busy, cameraError, startRecording]);

  const onShutterPressOut = useCallback(() => {
    if (holdTimerRef.current) {
      // Відпустили до порогу утримання → це тап → фото.
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      void takePhoto();
      return;
    }
    if (recordingRef.current) {
      // Утримання перейшло у відео → зупиняємо запис.
      stopRecording();
      return;
    }
    // Утримання не почало відео (віртуальний/fallback) → трактуємо як фото/галерею.
    void takePhoto();
  }, [takePhoto, stopRecording]);

  const recordLabel = useMemo(() => {
    const m = Math.floor(recordSecs / 60);
    const s = recordSecs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }, [recordSecs]);

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
    mountRetryRef.current = 0;
    readyKickRef.current = 0;
    setCamDebug('waiting');
    setCameraError(null);
    setGalleryFallback(isVirtualDevice);
    setCameraSession((s) => s + 1);
  }, []);

  // Прев'ю не піднялось (немає ні onCameraReady, ні onMountError) — тихо перемонтовуємо в'юху,
  // щоб зрушити застряглу камеру-сесію. Якщо камера справна, camDebug === 'ready' і kick не буде.
  useEffect(() => {
    if (isVirtualDevice || galleryFallback || cameraError) return;
    if (camDebug === 'ready') return;
    if (readyKickRef.current >= MAX_READY_KICKS) {
      // Прев'ю не піднялось після перемонтажів — м'який fallback у галерею, щоб затвор
      // відкривав галерею, а не лишався «мертвим». Якщо onCameraReady прийде — камера повернеться.
      if (__DEV__) console.warn('[FeedCamera] preview never ready — falling back to gallery');
      setGalleryFallback(true);
      return;
    }
    const t = setTimeout(() => {
      readyKickRef.current += 1;
      if (__DEV__) console.warn('[FeedCamera] preview kick', readyKickRef.current);
      setCameraSession((s) => s + 1);
    }, 1600);
    return () => clearTimeout(t);
  }, [camDebug, galleryFallback, cameraError, cameraSession]);

  const cameraDenied =
    permission != null && !permission.granted && !isVirtualDevice && !cameraAllowedOverride;

  if (cameraDenied) {
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
  const showVirtualPreview = isVirtualDevice || galleryFallback;

  return (
    <View style={[styles.screen, isLight && styles.screenLight]}>
      <Pressable
        style={[styles.cameraShell, isLight && styles.cameraShellLight]}
        pointerEvents="box-none"
        collapsable={false}
        onPress={showVirtualPreview && !busy ? () => void takePhoto() : undefined}
        disabled={!showVirtualPreview || busy}
      >
        {showVirtualPreview ? (
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
              // Явні розміри екрана: під Fabric/New Arch absoluteFill інколи дає ширину 0
              // → прев'ю невидиме (біле), хоча знімок робиться. Фіксуємо конкретні px.
              { width: winW, height: winH },
            ]}
            facing={facing}
            zoom={zoom}
            flash={torchOn && facing === 'back' ? 'off' : 'auto'}
            enableTorch={torchOn && facing === 'back'}
            mirror={facing === 'front'}
            mode="video"
            mute={!isRecording}
            videoQuality="1080p"
            {...(Platform.OS === 'ios' ? { active: isFocused } : null)}
            {...(Platform.OS === 'android' ? { ratio: '16:9' } : null)}
            animateShutter={Platform.OS === 'ios'}
            onCameraReady={() => {
              if (__DEV__) console.warn('[FeedCamera] onCameraReady');
              setCamDebug('ready');
              mountRetryRef.current = 0;
              setCameraError(null);
              setGalleryFallback(false);
            }}
            onMountError={(e) => {
              if (__DEV__) console.warn('[FeedCamera] onMountError', e?.message, JSON.stringify(e?.nativeEvent || {}));
              setCamDebug('mounterr:' + (e?.message || 'unknown'));
              // Транзієнтний збій першого кадру (частий на iOS/New Arch) — тихо
              // перемонтовуємо камеру, а не «залипаємо» в сірому fallback назавжди.
              if (!isVirtualDevice && mountRetryRef.current < MAX_MOUNT_RETRIES) {
                mountRetryRef.current += 1;
                setTimeout(() => setCameraSession((s) => s + 1), 350);
                return;
              }
              setGalleryFallback(true);
              setCameraError(e?.message || fc(language, 'cameraError'));
            }}
          />
        )}
      </Pressable>

      <LinearGradient
        pointerEvents="none"
        colors={
          isLight ? ['rgba(255,255,255,0.72)', 'transparent'] : ['rgba(0,0,0,0.55)', 'transparent']
        }
        style={[styles.topFade, { height: insets.top + 72 }]}
      />

      {__DEV__ ? (
        <View style={[styles.debugBadge, { top: insets.top + 56 }]} pointerEvents="none">
          <Text style={styles.debugBadgeText}>
            {`cam:${camDebug} · perm:${permission?.status || '?'} · focus:${isFocused ? 1 : 0} · fb:${galleryFallback ? 1 : 0} · vd:${isVirtualDevice ? 1 : 0}`}
          </Text>
        </View>
      ) : null}

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
            opacity: facing === 'back' && !isVirtualDevice ? 1 : 0.35,
            backgroundColor: torchOn ? `${accent}33` : chromeBtnBg,
            borderColor: torchOn ? accent : chromeBtnBorder,
          },
        ]}
        onPress={toggleTorch}
        hitSlop={10}
        disabled={facing !== 'back' || isVirtualDevice}
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

      {isRecording ? (
        <View style={[styles.recordBadge, { top: insets.top + 12 }]} pointerEvents="none">
          <View style={styles.recordDot} />
          <Text style={styles.recordBadgeText}>{recordLabel}</Text>
        </View>
      ) : !showVirtualPreview && !cameraError && !busy ? (
        <View
          style={[styles.hintPill, isLight && styles.hintPillLight, { bottom: bottomChromeH + 6 }]}
          pointerEvents="none"
        >
          <Text style={[styles.hintPillText, isLight && styles.hintPillTextLight]}>
            {language === 'en' ? 'Tap — photo · hold — video' : 'Тап — фото · утримай — відео'}
          </Text>
        </View>
      ) : null}

      {cameraError && !isVirtualDevice ? (
        <View style={[styles.initOverlay, isLight && styles.initOverlayLight]} pointerEvents="box-none">
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
              onPressIn={onShutterPressIn}
              onPressOut={onShutterPressOut}
              disabled={busy && !isRecording}
              accessibilityLabel={mode === 'story' ? fc(language, 'story') : fc(language, 'publication')}
              accessibilityHint="Тап — фото, утримання — відео"
              style={({ pressed }) => [
                styles.shutterOuter,
                isLight && styles.shutterOuterLight,
                mode === 'story' && { borderColor: accent },
                isRecording && styles.shutterOuterRecording,
                busy && !isRecording && { opacity: 0.45 },
                pressed && !isRecording && { opacity: 0.9, transform: [{ scale: 0.94 }] },
              ]}
            >
              <View
                style={[
                  isRecording ? styles.shutterInnerRecording : styles.shutterInner,
                  !isRecording && isLight && styles.shutterInnerLight,
                  !isRecording && mode === 'story' && { backgroundColor: accent },
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
              disabled={zoom >= 1 || isVirtualDevice}
            >
              <Ionicons
                name="add"
                size={20}
                color={
                  zoom >= 1 || isVirtualDevice
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
            disabled={isVirtualDevice || isRecording}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Flip camera"
          >
            <Ionicons
              name="camera-reverse-outline"
              size={28}
              color={isVirtualDevice || isRecording ? (isLight ? 'rgba(30,30,30,0.28)' : 'rgba(255,255,255,0.35)') : chromeIcon}
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
  debugBadge: {
    position: 'absolute',
    alignSelf: 'center',
    left: 8,
    right: 8,
    zIndex: 40,
    alignItems: 'center',
  },
  debugBadgeText: {
    color: '#00FF88',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.78)',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
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
  shutterOuterRecording: {
    borderColor: '#FF3B30',
  },
  shutterInnerRecording: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FF3B30',
  },
  recordBadge: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  recordDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
  },
  recordBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  hintPill: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 14,
    backgroundColor: 'rgba(0,0,0,0.42)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  hintPillLight: {
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  hintPillText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '600',
  },
  hintPillTextLight: {
    color: 'rgba(30,30,30,0.75)',
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
