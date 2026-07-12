import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Platform,
  Animated,
  PanResponder,
  useWindowDimensions,
  Alert,
  Modal,
  Share,
  Linking,
  DeviceEventEmitter,
} from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import { getCachedOrRemoteAudioUri } from './audioGuideCache';
import { normalizePlaybackUri } from './app/landmarkTts';
import { useLandmarkSlideAudioguide } from './app/useLandmarkSlideAudioguide';
import { buildSlideAudioScripts } from './app/landmarkSlideAudioTexts';
import { prefetchLandmarkSlideAudio } from './app/landmarkAudioPrefetch';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { getSession } from './db';
import { ls } from './landmarkScannerI18n';
import { lq } from './landmarkQuizI18n';
import { hasPlayableStoryQuiz } from './landmarkQuizUtils';
import { getAppTheme } from './themeStorage';
import { ACCENT_BLUE, accentForTheme, onAccentButtonText } from './themeAccent';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { buildMiniExtract } from './landmarkIdentify';
import {
  recordLocationVisit,
  parseCityFromSubtitle,
  shouldRecordVisitFromLandmarkRoute,
} from './visitStatsStorage';
import {
  toggleSavedLandmark,
  isLandmarkSaved,
  KRAINA_SAVED_LANDMARKS_CHANGED,
} from './savedLandmarksStorage';
import { brandFontHeadMedium, brandFontSans, brandFontSansMedium } from './brandFont';
import LandmarkGlassHeaderBar, { LANDMARK_TITLE_SINGLE_LINE_PROPS } from './LandmarkGlassHeaderBar';
import LandmarkQuizContent from './LandmarkQuizContent';
import LandmarkPhotoCompare from './LandmarkPhotoCompare';
import { resolveOfflineUriSync } from './offline/localCacheStore';
import OfflineStatusBanner from './OfflineStatusBanner';

/** Ті самі кольори, що кнопка «Вхід» / «Реєстрація» у ThirdPage (`authOnboardCta*`). */
const AUTH_CTA_ACCENT = '#E1FF00';
const AUTH_CTA_BACK = '#6F8500';
const AUTH_CTA_FRONT_BORDER = '#7A9000';
/** Текст на тёмних панелях (Figma). */
const FIGMA_CREAM = '#F2F2EA';
const BODY_LINK_DARK = '#8EC5FF';
const BODY_LINK_LIGHT = '#1558C0';

const PREVIEW_BODY_LINES = 3;
const Speech = (() => {
  try {
    return require('expo-speech');
  } catch (error) {
    console.warn('[LandmarkResultPage] expo-speech native module unavailable', error?.message || error);
    return {
      stop: () => {},
      speak: () => {},
      isSpeakingAsync: async () => false,
    };
  }
})();
/** Трохи темніше за скляну «шапку» міні-екрана (~rgba(30,30,30,0.78)). */
const PARAM_MENU_SHEET_DARK = '#141414';
const PARAM_MENU_SHEET_LIGHT = '#FFFFFF';
const PARAM_MENU_REPORT = '#EB4335';

function TextWithOptionalUrls({ children, style, linkColor }) {
  const text = String(children ?? '');
  if (!/(https?:\/\/)/i.test(text)) {
    return <Text style={style}>{text}</Text>;
  }
  const parts = text.split(/(https?:\/\/[^\s]+)/gi);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        /^https?:\/\//i.test(part) ? (
          <Text
            key={`u-${i}`}
            style={{ color: linkColor, textDecorationLine: 'underline' }}
            onPress={() => WebBrowser.openBrowserAsync(part).catch(() => {})}
          >
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

/** CTA як на вході: темна — лайм-стек; світла — синій без жовтого «ореолу» (нейтральна тінь). */
function AuthStylePrimaryCta({ onPress, label, androidRipple = rippleOnDarkSurface, isLight }) {
  const outerBorder = isLight ? 'rgba(2, 18, 235, 0.22)' : 'rgba(225, 255, 0, 0.45)';
  const backBg = isLight ? '#1c2d66' : AUTH_CTA_BACK;
  const frontBg = isLight ? ACCENT_BLUE : AUTH_CTA_ACCENT;
  const frontBorder = isLight ? '#2544c4' : AUTH_CTA_FRONT_BORDER;
  const shadowCol = isLight ? 'rgba(0, 0, 0, 0.28)' : AUTH_CTA_BACK;
  const shadowOpacity = isLight ? 0.2 : 0.32;
  const elevation = isLight ? 3 : 5;
  const txtColor = onAccentButtonText(!!isLight);
  const outerBorderW = isLight ? 3 : 5;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.authCtaOuter, { borderColor: outerBorder, borderWidth: outerBorderW }]}
      android_ripple={androidRipple}
    >
      {({ pressed }) => (
        <>
          <View style={[styles.authCtaBack, { backgroundColor: backBg }]} />
          <View
            style={[
              styles.authCtaFront,
              {
                backgroundColor: frontBg,
                borderColor: frontBorder,
                shadowColor: shadowCol,
                shadowOpacity,
                elevation,
                transform: [{ translateY: pressed ? 0 : -8 }],
              },
            ]}
          >
            <Text style={[styles.authCtaText, { color: txtColor }]}>{label}</Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

export default function LandmarkResultPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const language = useSyncedAppLanguage(route, 'uk');
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');

  const photoUri = resolveOfflineUriSync(route?.params?.photoUri);
  const title = route?.params?.title || '';
  const subtitle = route?.params?.subtitle;
  const extract = route?.params?.extract || '';
  const headerTitle = useMemo(() => {
    const h = typeof route?.params?.headerTitle === 'string' ? route.params.headerTitle.trim() : '';
    return h || title;
  }, [route?.params?.headerTitle, title]);
  const panelTagline = useMemo(() => {
    const t = typeof route?.params?.panelTagline === 'string' ? route.params.panelTagline.trim() : '';
    return t;
  }, [route?.params?.panelTagline]);
  const wikipediaUrl = route?.params?.wikipediaUrl;
  const source = route?.params?.source;
  const startPhaseParam = route?.params?.startPhase;
  const audioGuideUrl = useMemo(() => {
    const u = typeof route?.params?.audioGuideUrl === 'string' ? route.params.audioGuideUrl.trim() : '';
    const resolved = resolveOfflineUriSync(u);
    return resolved || (/^https?:\/\//i.test(u) ? u : '');
  }, [route?.params?.audioGuideUrl]);

  const audioPlayerRef = useRef(null);
  const fileAudioActiveRef = useRef(false);
  const fileAudioDoneCancelRef = useRef(null);
  const visitRecordedRef = useRef(false);

  const miniExtract = useMemo(() => {
    const m =
      typeof route?.params?.miniExtract === 'string' ? route.params.miniExtract.trim() : '';
    if (m) return m;
    return buildMiniExtract(extract);
  }, [route?.params?.miniExtract, extract]);

  const initialMiniBody = useMemo(() => {
    const p = route?.params || {};
    return (
      (typeof p.miniExtract === 'string' && p.miniExtract.trim()) || buildMiniExtract(p.extract || '')
    );
  }, [route?.params?.miniExtract, route?.params?.extract]);

  const returnToMiniOnBack =
    startPhaseParam === 'home' || (startPhaseParam === 'mini' && !!initialMiniBody);

  const [phase, setPhase] = useState(() => {
    if (startPhaseParam === 'full') return 'full';
    if (startPhaseParam === 'home') return 'mini';
    if (startPhaseParam === 'mini' && initialMiniBody) return 'mini';
    return 'full';
  });

  const miniSheetMaxH = useMemo(() => {
    const hasExplicitMini =
      typeof route?.params?.miniExtract === 'string' && route.params.miniExtract.trim();
    if (hasExplicitMini) {
      return Math.min(winH * 0.52, 440);
    }
    return Math.min(winH * 0.48, 420);
  }, [winH, route?.params?.miniExtract]);
  /** Вхід нижньої панелі: з’являється знизу. */
  const miniPanelEnterY = useRef(new Animated.Value(280)).current;
  /** Вхід верхньої «скляної» панелі: з’являється зверху. */
  const miniTopEnterY = useRef(new Animated.Value(-96)).current;

  useLayoutEffect(() => {
    if (phase !== 'mini') return undefined;
    miniPanelEnterY.setValue(0);
    miniTopEnterY.setValue(0);
    return undefined;
  }, [phase, miniSheetMaxH, winH, miniPanelEnterY, miniTopEnterY]);

  const [speaking, setSpeaking] = useState(false);
  const [paramsMenuOpen, setParamsMenuOpen] = useState(false);
  const [landmarkSaved, setLandmarkSaved] = useState(false);

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
    setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
  }, []);

  useEffect(() => {
    visitRecordedRef.current = false;
  }, [title, subtitle]);

  useEffect(() => {
    if (visitRecordedRef.current) return;
    if (!shouldRecordVisitFromLandmarkRoute(route)) return;
    const city =
      (typeof route?.params?.visitCity === 'string' && route.params.visitCity.trim()) ||
      parseCityFromSubtitle(subtitle);
    if (!city) return;
    visitRecordedRef.current = true;
    const rawCat = typeof route?.params?.visitCategory === 'string' ? route.params.visitCategory.trim() : '';
    const cat = ['monument', 'park', 'museum', 'other'].includes(rawCat) ? rawCat : 'other';
    const kmRaw = route?.params?.visitKm;
    const km = kmRaw != null && Number.isFinite(Number(kmRaw)) ? Number(kmRaw) : null;
    void recordLocationVisit({ city, category: cat, label: title, km });
  }, [
    title,
    subtitle,
    route,
    route?.params?.visitCity,
    route?.params?.visitCategory,
    route?.params?.visitKm,
    route?.params?.fromScanner,
    route?.params?.countAsPhysicalVisit,
  ]);

  const visitLandmarkSave = route?.params?.visitLandmarkSave;
  const routeUser = route?.params?.user;
  const countryIdParam = route?.params?.countryId;
  const visitLat =
    typeof route?.params?.visitLat === 'number' && Number.isFinite(route.params.visitLat)
      ? route.params.visitLat
      : undefined;
  const visitLng =
    typeof route?.params?.visitLng === 'number' && Number.isFinite(route.params.visitLng)
      ? route.params.visitLng
      : undefined;
  const visitSaveKey = visitLandmarkSave
    ? `${visitLandmarkSave.countryId}|${visitLandmarkSave.regionId}|${visitLandmarkSave.landmarkId}`
    : '';
  const quizLandmarkKey = visitSaveKey || `t:${String(headerTitle || title || '').slice(0, 120)}`;
  const storyQuiz = route?.params?.storyQuiz;
  const adminFactSlides = useMemo(() => {
    const candidateArrays = [
      route?.params?.factSlides,
      route?.params?.storyFactSlides,
      route?.params?.adminFactSlides,
      route?.params?.landmarkFactSlides,
      route?.params?.storySlides,
      route?.params?.slides,
    ];
    const raw = candidateArrays.find((arr) => Array.isArray(arr));
    if (!Array.isArray(raw)) return [];
    const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
    return raw
      .map((it, idx) => {
        if (!it || typeof it !== 'object') return null;
        const rawPhoto =
          (typeof it.photoUri === 'string' && it.photoUri.trim()) ||
          (typeof it.imageUri === 'string' && it.imageUri.trim()) ||
          (typeof it.afterUri === 'string' && it.afterUri.trim()) ||
          (typeof it.currentUri === 'string' && it.currentUri.trim()) ||
          (typeof it.newPhotoUri === 'string' && it.newPhotoUri.trim()) ||
          (typeof it.uri === 'string' && it.uri.trim()) ||
          '';
        const beforePhotoUri =
          (typeof it.beforePhotoUri === 'string' && it.beforePhotoUri.trim()) ||
          (typeof it.oldPhotoUri === 'string' && it.oldPhotoUri.trim()) ||
          (typeof it.historicPhotoUri === 'string' && it.historicPhotoUri.trim()) ||
          (typeof it.beforeUri === 'string' && it.beforeUri.trim()) ||
          (typeof it.oldUri === 'string' && it.oldUri.trim()) ||
          (typeof it.pastPhotoUri === 'string' && it.pastPhotoUri.trim()) ||
          (typeof it.previousPhotoUri === 'string' && it.previousPhotoUri.trim()) ||
          '';
        const pairPhotos = Array.isArray(it.photos) ? it.photos : [];
        const pairBefore =
          (typeof pairPhotos[0] === 'string' && pairPhotos[0].trim()) ||
          (pairPhotos[0] && typeof pairPhotos[0].uri === 'string' && pairPhotos[0].uri.trim()) ||
          '';
        const pairAfter =
          (typeof pairPhotos[1] === 'string' && pairPhotos[1].trim()) ||
          (pairPhotos[1] && typeof pairPhotos[1].uri === 'string' && pairPhotos[1].uri.trim()) ||
          '';
        const compareObj = it.compare && typeof it.compare === 'object' ? it.compare : null;
        const compareBefore =
          (compareObj && typeof compareObj.before === 'string' && compareObj.before.trim()) ||
          (compareObj && typeof compareObj.old === 'string' && compareObj.old.trim()) ||
          '';
        const compareAfter =
          (compareObj && typeof compareObj.after === 'string' && compareObj.after.trim()) ||
          (compareObj && typeof compareObj.current === 'string' && compareObj.current.trim()) ||
          '';
        const afterPhotoUri =
          (typeof it.afterPhotoUri === 'string' && it.afterPhotoUri.trim()) ||
          (typeof it.currentPhotoUri === 'string' && it.currentPhotoUri.trim()) ||
          (typeof it.afterUri === 'string' && it.afterUri.trim()) ||
          (typeof it.currentUri === 'string' && it.currentUri.trim()) ||
          compareAfter ||
          pairAfter ||
          rawPhoto;
        const titleUk = typeof it.titleUk === 'string' ? it.titleUk.trim() : '';
        const titleEn = typeof it.titleEn === 'string' ? it.titleEn.trim() : '';
        const factUk =
          (typeof it.factUk === 'string' && it.factUk.trim()) ||
          (typeof it.textUk === 'string' && it.textUk.trim()) ||
          '';
        const factEn =
          (typeof it.factEn === 'string' && it.factEn.trim()) ||
          (typeof it.textEn === 'string' && it.textEn.trim()) ||
          '';
        const subtitleUk = typeof it.subtitleUk === 'string' ? it.subtitleUk.trim() : '';
        const subtitleEn = typeof it.subtitleEn === 'string' ? it.subtitleEn.trim() : '';
        const title = langUk ? titleUk || titleEn : titleEn || titleUk;
        const fact = langUk ? factUk || factEn : factEn || factUk;
        const subtitle = langUk ? subtitleUk || subtitleEn : subtitleEn || subtitleUk;
        if (!rawPhoto || !fact) return null;
        return {
          id: String(it.id || idx),
          photoUri: rawPhoto,
          beforePhotoUri: beforePhotoUri || compareBefore || pairBefore,
          afterPhotoUri,
          title,
          subtitle,
          fact,
        };
      })
      .filter(Boolean);
  }, [
    route?.params?.factSlides,
    route?.params?.storyFactSlides,
    route?.params?.adminFactSlides,
    route?.params?.landmarkFactSlides,
    route?.params?.storySlides,
    route?.params?.slides,
    language,
  ]);

  useEffect(() => {
    if (!visitLandmarkSave?.countryId || !visitLandmarkSave?.regionId || !visitLandmarkSave?.landmarkId) {
      setLandmarkSaved(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const ok = await isLandmarkSaved(
          visitLandmarkSave.countryId,
          visitLandmarkSave.regionId,
          visitLandmarkSave.landmarkId,
        );
        if (!cancelled) setLandmarkSaved(ok);
      } catch {
        if (!cancelled) setLandmarkSaved(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visitSaveKey, visitLandmarkSave]);

  useEffect(() => {
    if (!visitSaveKey) return undefined;
    const sub = DeviceEventEmitter.addListener(KRAINA_SAVED_LANDMARKS_CHANGED, () => {
      const s = visitLandmarkSave;
      if (!s?.countryId || !s?.regionId || !s?.landmarkId) return;
      void isLandmarkSaved(s.countryId, s.regionId, s.landmarkId).then(setLandmarkSaved);
    });
    return () => sub.remove();
  }, [visitSaveKey, visitLandmarkSave]);

  const ensureLandmarkAudioPlayer = useCallback(() => {
    if (!audioPlayerRef.current) {
      const player = createAudioPlayer(null);
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          fileAudioActiveRef.current = false;
          setSpeaking(false);
        }
        if (status.error) {
          fileAudioActiveRef.current = false;
          setSpeaking(false);
          if (__DEV__) console.warn('[audioGuide] playback', status.error);
        }
      });
      audioPlayerRef.current = player;
    }
    return audioPlayerRef.current;
  }, []);

  const stopFileAudio = useCallback(async () => {
    fileAudioDoneCancelRef.current?.();
    fileAudioDoneCancelRef.current = null;
    fileAudioActiveRef.current = false;
    const player = audioPlayerRef.current;
    if (!player) return;
    try {
      player.pause();
      await player.seekTo(0);
    } catch {
      /* */
    }
  }, []);

  const playFileAudioUntilDone = useCallback(
    (localUri) =>
      new Promise((resolve, reject) => {
        const uri = normalizePlaybackUri(localUri);
        if (!uri) {
          reject(new Error('audio_empty_uri'));
          return;
        }
        fileAudioDoneCancelRef.current?.();
        fileAudioDoneCancelRef.current = null;
        Speech.stop?.();
        const player = ensureLandmarkAudioPlayer();
        let settled = false;
        let listener = null;
        let timeoutId = null;

        const finish = (fn) => {
          if (settled) return;
          settled = true;
          if (timeoutId != null) clearTimeout(timeoutId);
          listener?.remove?.();
          if (fileAudioDoneCancelRef.current === cancel) {
            fileAudioDoneCancelRef.current = null;
          }
          fileAudioActiveRef.current = false;
          fn();
        };

        const cancel = () => finish(() => reject(new Error('audio_cancelled')));
        fileAudioDoneCancelRef.current = cancel;

        timeoutId = setTimeout(() => {
          finish(() => reject(new Error('audio_playback_timeout')));
        }, 10 * 60 * 1000);

        listener = player.addListener('playbackStatusUpdate', (status) => {
          if (settled) return;
          if (status.error) {
            finish(() => reject(new Error(String(status.error))));
            return;
          }
          if (
            status.isLoaded &&
            status.duration > 0 &&
            status.currentTime >= status.duration - 0.15
          ) {
            finish(() => resolve());
            return;
          }
          if (status.didJustFinish) {
            finish(() => resolve());
          }
        });

        try {
          player.replace(uri);
          fileAudioActiveRef.current = true;
          player.play();
        } catch (e) {
          finish(() => reject(e));
        }
      }),
    [ensureLandmarkAudioPlayer],
  );

  useEffect(() => {
    return () => {
      fileAudioDoneCancelRef.current?.();
      fileAudioDoneCancelRef.current = null;
      Speech.stop();
      fileAudioActiveRef.current = false;
      try {
        audioPlayerRef.current?.remove?.();
      } catch {
        /* */
      }
      audioPlayerRef.current = null;
    };
  }, []);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const sheetBg = isLight ? '#FFFFFF' : '#0A0A0A';
  const titleColor = isLight ? '#1E1E1E' : FIGMA_CREAM;
  const subColor = isLight ? '#727272' : '#A8A8A8';
  const bodyColor = isLight ? '#333' : 'rgba(242,242,234,0.92)';
  const bodyLinkColor = isLight ? BODY_LINK_LIGHT : BODY_LINK_DARK;

  const fromScanner = route?.params?.fromScanner === true;
  const sourceLine = useMemo(() => {
    if (fromScanner && (source === 'vision_wiki' || source === 'geo_wiki')) {
      return ls(language, 'sourceScannerAr');
    }
    if (source === 'vision_wiki') return ls(language, 'sourceVision');
    if (source === 'geo_wiki') return ls(language, 'sourceGeo');
    return ls(language, 'sourceDemo');
  }, [language, source, fromScanner]);

  /** Рядок «Демо-режим» не показуємо — лише реальні джерела (AR / Vision / Geo). */
  const showSourceTag = useMemo(() => {
    if (fromScanner && (source === 'vision_wiki' || source === 'geo_wiki')) return true;
    return source === 'vision_wiki' || source === 'geo_wiki';
  }, [fromScanner, source]);

  const shareBody = useMemo(() => String(miniExtract || extract || '').trim(), [miniExtract, extract]);

  /** Повний екран після «Детальніше»: увесь текст; якщо `extract` порожній (напр. з карти) — показуємо уривок з прев’ю. */
  const fullBodyText = useMemo(() => {
    const e = String(extract ?? '').trim();
    if (e) return String(extract);
    return String(miniExtract ?? '').trim();
  }, [extract, miniExtract]);

  const postQuizSlides = useMemo(() => {
    if (adminFactSlides.length > 0) {
      return adminFactSlides.map((it) => ({
        ...it,
        photoUri: resolveOfflineUriSync(it.photoUri),
        beforePhotoUri: resolveOfflineUriSync(it.beforePhotoUri),
        afterPhotoUri: resolveOfflineUriSync(it.afterPhotoUri),
      }));
    }
    const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
    const routeBeforePhotoUri =
      (typeof route?.params?.beforePhotoUri === 'string' && route.params.beforePhotoUri.trim()) ||
      (typeof route?.params?.oldPhotoUri === 'string' && route.params.oldPhotoUri.trim()) ||
      (typeof route?.params?.historicPhotoUri === 'string' && route.params.historicPhotoUri.trim()) ||
      (typeof route?.params?.beforeUri === 'string' && route.params.beforeUri.trim()) ||
      (typeof route?.params?.oldUri === 'string' && route.params.oldUri.trim()) ||
      '';
    const routeAfterPhotoUri =
      (typeof route?.params?.afterPhotoUri === 'string' && route.params.afterPhotoUri.trim()) ||
      (typeof route?.params?.currentPhotoUri === 'string' && route.params.currentPhotoUri.trim()) ||
      (typeof route?.params?.afterUri === 'string' && route.params.afterUri.trim()) ||
      (typeof route?.params?.currentUri === 'string' && route.params.currentUri.trim()) ||
      '';
    const photoArray =
      (Array.isArray(route?.params?.extraPhotos) && route.params.extraPhotos) ||
      (Array.isArray(route?.params?.photoGallery) && route.params.photoGallery) ||
      (Array.isArray(route?.params?.galleryPhotos) && route.params.galleryPhotos) ||
      [];
    const factsArray =
      (Array.isArray(route?.params?.extraFacts) && route.params.extraFacts) ||
      (Array.isArray(route?.params?.facts) && route.params.facts) ||
      [];
    const mappedFromLooseArrays = photoArray
      .map((p, idx) => {
        const beforePhotoUri =
          (p && typeof p === 'object' && typeof p.beforePhotoUri === 'string' && p.beforePhotoUri.trim()) ||
          (p && typeof p === 'object' && typeof p.oldPhotoUri === 'string' && p.oldPhotoUri.trim()) ||
          (p && typeof p === 'object' && typeof p.beforeUri === 'string' && p.beforeUri.trim()) ||
          (p && typeof p === 'object' && typeof p.oldUri === 'string' && p.oldUri.trim()) ||
          '';
        const photoUri =
          (typeof p === 'string' && p.trim()) ||
          (p && typeof p === 'object' && typeof p.uri === 'string' && p.uri.trim()) ||
          (p && typeof p === 'object' && typeof p.photoUri === 'string' && p.photoUri.trim()) ||
          (p && typeof p === 'object' && typeof p.afterPhotoUri === 'string' && p.afterPhotoUri.trim()) ||
          (p && typeof p === 'object' && typeof p.afterUri === 'string' && p.afterUri.trim()) ||
          '';
        const factRaw = factsArray[idx];
        const fact =
          (typeof factRaw === 'string' && factRaw.trim()) ||
          (factRaw && typeof factRaw === 'object' && typeof (langUk ? factRaw.uk : factRaw.en) === 'string'
            ? String(langUk ? factRaw.uk : factRaw.en).trim()
            : '') ||
          '';
        if (!photoUri) return null;
        return {
          id: `auto-${idx}`,
          photoUri: resolveOfflineUriSync(photoUri),
          beforePhotoUri: resolveOfflineUriSync(beforePhotoUri || routeBeforePhotoUri),
          afterPhotoUri: resolveOfflineUriSync(routeAfterPhotoUri || photoUri),
          title: '',
          subtitle: '',
          fact: fact || (langUk ? 'Факт від адміністратора' : 'Admin fact'),
        };
      })
      .filter(Boolean);
    if (mappedFromLooseArrays.length > 0) return mappedFromLooseArrays;
    if (photoUri) {
      const teaser = String(fullBodyText || '').replace(/\s+/g, ' ').trim();
      return [
        {
          id: 'fallback-0',
          photoUri: resolveOfflineUriSync(photoUri),
          beforePhotoUri: resolveOfflineUriSync(routeBeforePhotoUri),
          afterPhotoUri: resolveOfflineUriSync(routeAfterPhotoUri || photoUri),
          title: headerTitle,
          subtitle: langUk
            ? 'Після вікторини тут відображаються додаткові фото та факти від адміністратора.'
            : 'After the quiz, additional admin photos and facts appear here.',
          fact: teaser.slice(0, 120) || (langUk ? 'Цікавий факт буде додано адміністратором.' : 'A landmark fact will be added by admin.'),
        },
      ];
    }
    return [];
  }, [
    adminFactSlides,
    language,
    route?.params?.extraPhotos,
    route?.params?.photoGallery,
    route?.params?.galleryPhotos,
    route?.params?.extraFacts,
    route?.params?.facts,
    route?.params?.beforePhotoUri,
    route?.params?.oldPhotoUri,
    route?.params?.historicPhotoUri,
    route?.params?.beforeUri,
    route?.params?.oldUri,
    route?.params?.afterPhotoUri,
    route?.params?.currentPhotoUri,
    route?.params?.afterUri,
    route?.params?.currentUri,
    photoUri,
    fullBodyText,
    headerTitle,
  ]);

  const effectiveStoryQuiz = useMemo(() => {
    if (hasPlayableStoryQuiz(storyQuiz)) return storyQuiz;
    const place = String(headerTitle || title || '').trim() || 'Landmark';
    const placeShort = String(title || headerTitle || '').trim() || place;
    return {
      questionUk: `Що найкраще описує "${placeShort}"?`,
      questionEn: `What best describes "${placeShort}"?`,
      options: [
        {
          textUk: 'Культурна/історична памʼятка',
          textEn: 'A cultural/historical landmark',
          correct: true,
        },
        {
          textUk: 'Спортивна арена',
          textEn: 'A sports arena',
          correct: false,
        },
        {
          textUk: 'Бізнес-центр',
          textEn: 'A business center',
          correct: false,
        },
      ],
      multiHintUk: `${place} має історичну або культурну цінність.`,
      multiHintEn: `${place} has historical or cultural value.`,
    };
  }, [storyQuiz, headerTitle, title]);

  const quizPagerRoute = useMemo(
    () => ({
      params: {
        storyQuiz: effectiveStoryQuiz,
        language,
        appTheme,
        headerTitle,
        quizLandmarkKey,
        rewardEnabled: shouldRecordVisitFromLandmarkRoute(route),
      },
    }),
    [effectiveStoryQuiz, language, appTheme, headerTitle, quizLandmarkKey, route],
  );

  const hasStoryQuiz = hasPlayableStoryQuiz(effectiveStoryQuiz);
  const postQuizSections = useMemo(() => {
    const pickDifferentUri = (preferred, fallbackPool = []) => {
      const base = String(preferred || '').trim();
      for (let i = 0; i < fallbackPool.length; i += 1) {
        const candidate = String(fallbackPool[i] || '').trim();
        if (candidate && candidate !== base) return candidate;
      }
      return base || '';
    };
    const allSlideUris = postQuizSlides
      .flatMap((s) => [s?.photoUri, s?.beforePhotoUri, s?.afterPhotoUri])
      .map((u) => String(u || '').trim())
      .filter(Boolean);

    const out = [];
    postQuizSlides.forEach((slide, idx) => {
      const currentPhoto = String(slide?.photoUri || '').trim();
      const beforePhoto = String(slide?.beforePhotoUri || '').trim();
      const afterPhoto = String(slide?.afterPhotoUri || '').trim();
      const neighborPhoto = String(postQuizSlides[idx + 1]?.photoUri || postQuizSlides[idx - 1]?.photoUri || '').trim();
      const fallbackPool = [neighborPhoto, ...allSlideUris];
      const compareBottomUri = pickDifferentUri(beforePhoto || currentPhoto, [afterPhoto, ...fallbackPool]);
      const compareTopUri = pickDifferentUri(afterPhoto || currentPhoto, [beforePhoto, ...fallbackPool]);

      out.push({
        ...slide,
        sectionId: `${String(slide.id || idx)}-fact-${idx}`,
        sectionType: 'fact',
        compareBottomUri,
        compareTopUri,
      });
      if (slide.photoUri || slide.beforePhotoUri || slide.afterPhotoUri) {
        out.push({
          ...slide,
          sectionId: `${String(slide.id || idx)}-compare-${idx}`,
          sectionType: 'compare',
          compareBottomUri,
          compareTopUri,
        });
      }
    });
    return out;
  }, [postQuizSlides]);
  const hasQuizPager = false;
  const fullReadTopClearance = 0;
  const isIntroTextShort = useMemo(() => String(fullBodyText || '').trim().length < 220, [fullBodyText]);
  const introAutoShift = useMemo(() => {
    if (!isIntroTextShort) return 0;
    const len = String(fullBodyText || '').trim().length;
    if (len < 90) return 34;
    if (len < 150) return 22;
    return 14;
  }, [isIntroTextShort, fullBodyText]);
  const smallHeroHeight = useMemo(
    () =>
      isIntroTextShort
        ? Math.min(620, Math.max(360, Math.round(winH * 0.56)))
        : Math.min(500, Math.max(260, Math.round(winH * 0.42))),
    [isIntroTextShort, winH],
  );
  const [fullReadViewportH, setFullReadViewportH] = useState(0);
  const factSlideHeight = useMemo(() => {
    const vh = Math.max(0, fullReadViewportH);
    if (vh > 0) return Math.max(420, Math.round(vh));
    return Math.max(680, Math.round(winH * 0.9));
  }, [fullReadViewportH, winH]);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const activeSectionIndexRef = useRef(0);
  const pageSections = useMemo(() => {
    const pages = [{ id: 'intro', type: 'intro' }];
    if (hasStoryQuiz) pages.push({ id: 'quiz', type: 'quiz' });
    postQuizSections.forEach((slide) => {
      pages.push({
        id: slide.sectionId,
        type: slide.sectionType === 'compare' ? 'compare' : 'fact',
        slide,
      });
    });
    return pages;
  }, [hasStoryQuiz, postQuizSections]);
  const sectionDotCount = pageSections.length;
  const headerDotsContent =
    phase === 'full' && sectionDotCount > 1 ? (
      <View style={styles.headerPagerDots}>
        {Array.from({ length: sectionDotCount }).map((_, idx) => (
          <View
            key={`dot-${idx}`}
            style={[
              styles.headerPagerDot,
              {
                backgroundColor:
                  idx === activeSectionIndex ? accent : isLight ? 'rgba(2,18,235,0.24)' : 'rgba(225,255,0,0.24)',
                opacity: idx === activeSectionIndex ? 1 : 0.55,
              },
            ]}
          />
        ))}
      </View>
    ) : null;
  const fullReadScrollRef = useRef(null);
  const fullReadScrollYRef = useRef(0);
  const [fullReadScrollY, setFullReadScrollY] = useState(0);
  const introSectionYRef = useRef(0);
  const introSectionHRef = useRef(0);
  const quizSectionYRef = useRef(0);
  const quizSectionHRef = useRef(0);
  const factSectionsRef = useRef({});
  const fullReadViewportHRef = useRef(0);
  const fullReadContentHRef = useRef(0);

  const ttsLang = language === 'uk' ? 'uk-UA' : 'en-US';
  const textForTts = phase === 'mini' ? (miniExtract || extract) : fullBodyText;
  const miniAudioText = String(miniExtract || extract || '').trim();
  const slideScripts = useMemo(
    () => buildSlideAudioScripts(pageSections, fullBodyText),
    [pageSections, fullBodyText],
  );
  const hasSlideAudioguide = useMemo(
    () =>
      slideScripts.some((entry) => entry.text) ||
      (phase === 'mini' && !!miniAudioText),
    [slideScripts, phase, miniAudioText],
  );

  const onAudioguideError = useCallback(() => {
    Alert.alert('', ls(language, 'audioGuideError'));
  }, [language]);

  useEffect(() => {
    if (!hasSlideAudioguide) return undefined;
    void prefetchLandmarkSlideAudio({
      slideScripts,
      miniText: miniAudioText,
      language,
      audioGuideUrl,
      fromIndex: activeSectionIndex,
    });
    return undefined;
  }, [
    hasSlideAudioguide,
    slideScripts,
    miniAudioText,
    language,
    audioGuideUrl,
    activeSectionIndex,
  ]);

  const slideAudioguide = useLandmarkSlideAudioguide({
    Speech,
    language,
    phase,
    slideScripts,
    miniText: miniAudioText,
    activeSectionIndex,
    activeSectionIndexRef,
    goToSectionIndex,
    playFileAudioUntilDone,
    stopFileAudio,
    onPlaybackError: onAudioguideError,
  });

  const toggleSpeech = useCallback(async () => {
    if (hasSlideAudioguide) {
      await slideAudioguide.toggle();
      return;
    }
    if (audioGuideUrl) {
      if (fileAudioActiveRef.current) {
        await stopFileAudio();
        setSpeaking(false);
        return;
      }
      Speech.stop();
      try {
        const localUri = await getCachedOrRemoteAudioUri(audioGuideUrl);
        const uri = normalizePlaybackUri(localUri);
        if (!uri) throw new Error('audio_empty_uri');
        const player = ensureLandmarkAudioPlayer();
        fileAudioActiveRef.current = true;
        setSpeaking(true);
        player.replace(uri);
        player.play();
      } catch (e) {
        setSpeaking(false);
        fileAudioActiveRef.current = false;
        await stopFileAudio();
        if (__DEV__) console.warn('[audioGuide]', e?.message);
        Alert.alert('', ls(language, 'audioGuideError'));
      }
      return;
    }

    const t = (textForTts || '').trim();
    if (!t) return;
    const on = await Speech.isSpeakingAsync();
    if (on) {
      Speech.stop();
      setSpeaking(false);
    } else {
      setSpeaking(true);
      Speech.speak(t, {
        language: ttsLang,
        onDone: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
    }
  }, [
    hasSlideAudioguide,
    slideAudioguide,
    audioGuideUrl,
    language,
    stopFileAudio,
    textForTts,
    ttsLang,
    ensureLandmarkAudioPlayer,
  ]);

  const openFull = useCallback(() => {
    if (phase !== 'mini') return;
    setPhase('full');
  }, [phase]);

  const onBack = useCallback(() => {
    if (phase === 'full' && returnToMiniOnBack) {
      setPhase('mini');
      return;
    }
    Speech.stop();
    stopFileAudio();
    setSpeaking(false);
    navigation.goBack();
  }, [phase, returnToMiniOnBack, navigation, stopFileAudio]);

  const onIntroSectionLayout = useCallback((e) => {
    const nextY = Number(e?.nativeEvent?.layout?.y);
    const nextH = Number(e?.nativeEvent?.layout?.height);
    introSectionYRef.current = Number.isFinite(nextY) ? Math.max(0, nextY) : 0;
    introSectionHRef.current = Number.isFinite(nextH) ? Math.max(0, nextH) : 0;
  }, []);

  const onQuizSectionLayout = useCallback((e) => {
    const nextY = Number(e?.nativeEvent?.layout?.y);
    const nextH = Number(e?.nativeEvent?.layout?.height);
    quizSectionYRef.current = Number.isFinite(nextY) ? Math.max(0, nextY) : 0;
    quizSectionHRef.current = Number.isFinite(nextH) ? Math.max(0, nextH) : 0;
  }, []);

  const onFactSlideLayout = useCallback((id, e) => {
    const y = Number(e?.nativeEvent?.layout?.y);
    const h = Number(e?.nativeEvent?.layout?.height);
    if (!Number.isFinite(y) || !Number.isFinite(h)) return;
    factSectionsRef.current[String(id)] = { y: Math.max(0, y), h: Math.max(0, h) };
  }, []);

  const computeActiveSectionIndex = useCallback(
    (scrollY) => {
      const viewportH = Math.max(0, fullReadViewportHRef.current);
      if (!(viewportH > 0)) return 0;
      const viewportCenterY = Math.max(0, scrollY) + viewportH / 2;
      const starts = [
        {
          idx: 0,
          start: Math.max(0, introSectionYRef.current || 0),
        },
      ];
      if (hasStoryQuiz && quizSectionHRef.current > 0) {
        starts.push({ idx: 1, start: Math.max(0, quizSectionYRef.current) });
      }
      const factsOffset = 1 + (hasStoryQuiz ? 1 : 0);
      postQuizSections.forEach((slide, factIdx) => {
        const m = factSectionsRef.current[String(slide.sectionId)];
        if (!m || !(m.h > 0)) return;
        starts.push({ idx: factsOffset + factIdx, start: Math.max(0, m.y) });
      });
      starts.sort((a, b) => a.start - b.start);
      let active = starts[0]?.idx || 0;
      for (let i = 0; i < starts.length; i += 1) {
        const cur = starts[i];
        const next = starts[i + 1];
        const inCurrentRange =
          viewportCenterY >= cur.start && (!next || viewportCenterY < next.start);
        if (inCurrentRange) {
          active = cur.idx;
          break;
        }
      }
      return active;
    },
    [hasStoryQuiz, postQuizSections],
  );

  const snapToClosestReadSection = useCallback(() => {
    if (phase !== 'full') return;
    const viewportH = Math.max(0, fullReadViewportHRef.current);
    if (!(viewportH > 0)) return;
    const contentH = Math.max(viewportH, fullReadContentHRef.current);
    const maxScrollY = Math.max(0, contentH - viewportH);
    const y = Math.max(0, fullReadScrollYRef.current);
    const currentCenter = y + viewportH / 2;
    const candidateTargets = [];
    if (introSectionHRef.current > 0) {
      const introCenter = introSectionYRef.current + introSectionHRef.current / 2;
      candidateTargets.push(Math.max(0, Math.min(maxScrollY, introCenter - viewportH / 2)));
    } else {
      candidateTargets.push(0);
    }
    if (quizSectionYRef.current >= 0 && quizSectionHRef.current > 0) {
      const quizCenter = quizSectionYRef.current + quizSectionHRef.current / 2;
      candidateTargets.push(Math.max(0, Math.min(maxScrollY, quizCenter - viewportH / 2)));
    }
    Object.values(factSectionsRef.current).forEach((it) => {
      const center = Number(it?.y) + Number(it?.h) / 2;
      if (Number.isFinite(center) && center > 0) {
        candidateTargets.push(Math.max(0, Math.min(maxScrollY, center - viewportH / 2)));
      }
    });
    const uniqueTargets = [...new Set(candidateTargets.map((v) => Math.round(v)))];
    if (uniqueTargets.length === 0) return;
    let targetY = uniqueTargets[0];
    let bestDist = Math.abs((targetY + viewportH / 2) - currentCenter);
    for (let i = 1; i < uniqueTargets.length; i += 1) {
      const t = uniqueTargets[i];
      const d = Math.abs((t + viewportH / 2) - currentCenter);
      if (d < bestDist) {
        bestDist = d;
        targetY = t;
      }
    }
    const distance = Math.abs(y - targetY);
    if (distance < 12) return;
    fullReadScrollRef.current?.scrollTo({ y: targetY, animated: true });
  }, [phase]);

  const goToSectionIndex = useCallback(
    (index) => {
      const maxIdx = Math.max(0, pageSections.length - 1);
      const next = Math.max(0, Math.min(maxIdx, Number(index) || 0));
      activeSectionIndexRef.current = next;
      setActiveSectionIndex(next);
      return true;
    },
    [pageSections.length],
  );

  const goToAdjacentSection = useCallback(
    (dir) => {
      const current = Number.isFinite(activeSectionIndexRef.current)
        ? activeSectionIndexRef.current
        : activeSectionIndex;
      const minIdx = 0;
      const maxIdx = Math.max(0, pageSections.length - 1);
      const next = Math.max(minIdx, Math.min(maxIdx, current + dir));
      if (next === current) return;
      goToSectionIndex(next);
    },
    [activeSectionIndex, goToSectionIndex, pageSections.length],
  );

  const onFullReadLayout = useCallback((e) => {
    const h = Number(e?.nativeEvent?.layout?.height);
    const next = Number.isFinite(h) ? Math.max(0, h) : 0;
    fullReadViewportHRef.current = next;
    setFullReadViewportH((prev) => (Math.abs(prev - next) > 1 ? next : prev));
  }, []);

  const onFullReadContentSizeChange = useCallback((_, h) => {
    const nextH = Number(h);
    fullReadContentHRef.current = Number.isFinite(nextH) ? Math.max(0, nextH) : 0;
  }, []);

  useEffect(() => {
    factSectionsRef.current = {};
    introSectionYRef.current = 0;
    introSectionHRef.current = 0;
    quizSectionYRef.current = 0;
    quizSectionHRef.current = 0;
    activeSectionIndexRef.current = 0;
    setActiveSectionIndex(0);
  }, [postQuizSections, hasStoryQuiz, phase]);

  const onFullReadScroll = useCallback((e) => {
    const y = Number(e?.nativeEvent?.contentOffset?.y);
    const nextY = Number.isFinite(y) ? y : 0;
    fullReadScrollYRef.current = nextY;
    setFullReadScrollY((prev) => (Math.abs(prev - nextY) > 3 ? nextY : prev));
    const nextSection = computeActiveSectionIndex(nextY);
    activeSectionIndexRef.current = nextSection;
    setActiveSectionIndex((prev) => (prev === nextSection ? prev : nextSection));
  }, [computeActiveSectionIndex]);

  const getFactCardOpacity = useCallback(
    (slideId) => {
      const m = factSectionsRef.current[String(slideId)];
      if (!m) return 1;
      // Keep fact card clearly visible for most of the section; fade only near the end.
      const rel = Math.max(0, fullReadScrollY - m.y);
      const fadeStart = m.h * 0.42;
      const fadeEnd = m.h * 0.86;
      if (rel <= fadeStart) return 1;
      if (rel >= fadeEnd) return 0;
      const t = (rel - fadeStart) / Math.max(1, fadeEnd - fadeStart);
      return Math.max(0, Math.min(1, 1 - t));
    },
    [fullReadScrollY],
  );

  const onFullReadScrollEndDrag = useCallback(
    (e) => {
      const y = Number(e?.nativeEvent?.contentOffset?.y);
      fullReadScrollYRef.current = Number.isFinite(y) ? y : 0;
    },
    [],
  );

  const onFullReadMomentumEnd = useCallback(
    (e) => {
      const y = Number(e?.nativeEvent?.contentOffset?.y);
      fullReadScrollYRef.current = Number.isFinite(y) ? y : 0;
      const nextSection = computeActiveSectionIndex(fullReadScrollYRef.current);
      activeSectionIndexRef.current = nextSection;
      setActiveSectionIndex((prev) => (prev === nextSection ? prev : nextSection));
      snapToClosestReadSection();
    },
    [snapToClosestReadSection, computeActiveSectionIndex],
  );

  const miniOpenPanResponder = useMemo(() => {
    if (phase !== 'mini') return null;
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 12 || Math.abs(g.dy) > 12,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 18 || Math.abs(g.dy) > 18,
      onPanResponderRelease: (_, g) => {
        const { dx, dy } = g;
        const shouldOpen = dx < -30 || dy < -28;
        const shouldGoBack = dx > 24;
        if (shouldGoBack) {
          onBack();
          return;
        }
        if (shouldOpen) openFull();
      },
    });
  }, [phase, openFull, onBack]);

  const fullBackPanResponder = useMemo(() => {
    if (phase !== 'full') return null;
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => {
        if (currentPage?.type === 'compare') return false;
        const ax = Math.abs(g.dx);
        const ay = Math.abs(g.dy);
        return ax > 14 && ax >= ay;
      },
      onMoveShouldSetPanResponder: (_, g) => {
        if (currentPage?.type === 'compare') return false;
        const ax = Math.abs(g.dx);
        const ay = Math.abs(g.dy);
        return ax > 18 && ax >= ay;
      },
      onPanResponderRelease: (_, g) => {
        if (currentPage?.type === 'compare') return;
        const ax = Math.abs(g.dx);
        if (ax < 24) return;
        if (g.dx < 0) goToAdjacentSection(1);
        else goToAdjacentSection(-1);
      },
    });
  }, [phase, goToAdjacentSection, currentPage?.type]);

  const closeParamsMenu = useCallback(() => setParamsMenuOpen(false), []);

  const onMoreMenu = useCallback(() => setParamsMenuOpen(true), []);

  const openMapsRoute = useCallback(() => {
    const url =
      visitLat != null && visitLng != null
        ? `https://www.google.com/maps/dir/?api=1&destination=${visitLat},${visitLng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(headerTitle)}`;
    Linking.openURL(url).catch(() => {});
  }, [visitLat, visitLng, headerTitle]);

  const onParamPostStory = useCallback(async () => {
    closeParamsMenu();
    let u = routeUser;
    if (!(u?.id || u?.firebaseUid)) {
      try {
        const s = await getSession();
        if (s?.user && (s.user.id || s.user.firebaseUid)) u = s.user;
      } catch {
        /* */
      }
    }
    if (!(u?.id || u?.firebaseUid)) {
      Alert.alert('', ls(language, 'paramMenuNeedLogin'));
      return;
    }
    // Прямий флоу: камера → знімок → FeedPostComposer (через FeedCamera.goAfterCapture,
    // яка після першого фото навіґує у FeedPostComposer з uris:[persisted]).
    navigation.navigate('FeedCamera', {
      user: u,
      language,
      appTheme,
      ...(countryIdParam != null ? { countryId: countryIdParam } : {}),
      publishVisibility: 'public',
      cameraInitialMode: 'post',
      ...(visitLat != null && visitLng != null
        ? { pickedLat: visitLat, pickedLng: visitLng, pickedLabel: headerTitle }
        : {}),
    });
  }, [
    closeParamsMenu,
    navigation,
    routeUser,
    language,
    appTheme,
    countryIdParam,
    visitLat,
    visitLng,
    headerTitle,
  ]);

  const onParamSave = useCallback(async () => {
    closeParamsMenu();
    const s = visitLandmarkSave;
    if (!s?.countryId || !s?.regionId || !s?.landmarkId) {
      Alert.alert('', ls(language, 'paramMenuSaveUnavailable'));
      return;
    }
    try {
      await toggleSavedLandmark(s);
      const next = await isLandmarkSaved(s.countryId, s.regionId, s.landmarkId);
      setLandmarkSaved(next);
    } catch {
      Alert.alert('', ls(language, 'paramMenuSaveUnavailable'));
    }
  }, [closeParamsMenu, visitLandmarkSave, language]);

  const onParamSharePublication = useCallback(() => {
    closeParamsMenu();
    const msg = `${headerTitle}\n\n${shareBody.slice(0, 2000)}`.trim();
    const payload =
      Platform.OS === 'ios'
        ? { message: msg, title: headerTitle }
        : { message: msg, title: headerTitle, subject: headerTitle };
    Share.share(payload).catch(() => {});
  }, [closeParamsMenu, headerTitle, shareBody]);

  const onParamShareLocation = useCallback(() => {
    closeParamsMenu();
    const url =
      visitLat != null && visitLng != null
        ? `https://www.google.com/maps/search/?api=1&query=${visitLat},${visitLng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(headerTitle)}`;
    const message = `${headerTitle}\n${url}`;
    const payload =
      Platform.OS === 'ios' ? { message, title: headerTitle } : { message, title: headerTitle, subject: headerTitle };
    Share.share(payload).catch(() => {});
  }, [closeParamsMenu, visitLat, visitLng, headerTitle]);

  const onParamReport = useCallback(() => {
    closeParamsMenu();
    Alert.alert(ls(language, 'paramMenuReport'), ls(language, 'paramMenuReportHint'));
  }, [closeParamsMenu, language]);

  const onParamRoute = useCallback(() => {
    closeParamsMenu();
    openMapsRoute();
  }, [closeParamsMenu, openMapsRoute]);

  const onParamWiki = useCallback(() => {
    closeParamsMenu();
    if (wikipediaUrl) WebBrowser.openBrowserAsync(wikipediaUrl).catch(() => {});
  }, [closeParamsMenu, wikipediaUrl]);

  const openWiki = useCallback(() => {
    if (wikipediaUrl) WebBrowser.openBrowserAsync(wikipediaUrl).catch(() => {});
  }, [wikipediaUrl]);

  const sheetTagline = panelTagline || (subtitle ? String(subtitle) : '');
  const isHomeMiniPanel = startPhaseParam === 'home';
  const explicitMiniExtract =
    typeof route?.params?.miniExtract === 'string' ? route.params.miniExtract.trim() : '';
  const miniSheetTitle = isHomeMiniPanel ? String(title || headerTitle).trim() : headerTitle;
  const miniSheetTagline = isHomeMiniPanel && panelTagline ? panelTagline : sheetTagline;
  const miniSheetBody = explicitMiniExtract || miniExtract || extract;
  const miniBodyUnlimited = !!explicitMiniExtract;

  const paramMenuRipple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const paramRowLabelColor = isLight ? '#1E1E1E' : FIGMA_CREAM;
  const paramMenuSheetBg = isLight ? PARAM_MENU_SHEET_LIGHT : PARAM_MENU_SHEET_DARK;

  const landmarkParamsMenu = (
    <Modal
      visible={paramsMenuOpen}
      transparent
      animationType="fade"
      onRequestClose={closeParamsMenu}
    >
      <View style={styles.paramMenuRoot}>
        <Pressable style={styles.paramMenuBackdrop} onPress={closeParamsMenu} accessibilityRole="button" />
        <View
          style={[
            styles.paramMenuSheet,
            {
              backgroundColor: paramMenuSheetBg,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <Text style={[styles.paramMenuTitle, brandFontHeadMedium, { color: paramRowLabelColor }]}>
            {ls(language, 'paramMenuTitle')}
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false} showsVerticalScrollIndicator={false}>
            <Pressable
              style={styles.paramMenuRow}
              onPress={onParamPostStory}
              android_ripple={paramMenuRipple}
              accessibilityRole="button"
            >
              <Ionicons name="camera-outline" size={22} color={paramRowLabelColor} />
              <Text style={[styles.paramMenuRowLabel, brandFontSans, { color: paramRowLabelColor }]}>
                {ls(language, 'paramMenuPostStory')}
              </Text>
            </Pressable>
            <Pressable
              style={styles.paramMenuRow}
              onPress={onParamSave}
              android_ripple={paramMenuRipple}
              accessibilityRole="button"
            >
              <Ionicons
                name={landmarkSaved ? 'bookmark' : 'bookmark-outline'}
                size={22}
                color={paramRowLabelColor}
              />
              <Text style={[styles.paramMenuRowLabel, brandFontSans, { color: paramRowLabelColor }]}>
                {ls(language, landmarkSaved ? 'paramMenuUnsave' : 'paramMenuSave')}
              </Text>
            </Pressable>
            <Pressable
              style={styles.paramMenuRow}
              onPress={onParamRoute}
              android_ripple={paramMenuRipple}
              accessibilityRole="button"
            >
              <Ionicons name="map-outline" size={22} color={paramRowLabelColor} />
              <Text style={[styles.paramMenuRowLabel, brandFontSans, { color: paramRowLabelColor }]}>
                {ls(language, 'paramMenuRoute')}
              </Text>
            </Pressable>
            <Pressable
              style={styles.paramMenuRow}
              onPress={onParamSharePublication}
              android_ripple={paramMenuRipple}
              accessibilityRole="button"
            >
              <Ionicons name="share-social-outline" size={22} color={paramRowLabelColor} />
              <Text style={[styles.paramMenuRowLabel, brandFontSans, { color: paramRowLabelColor }]}>
                {ls(language, 'paramMenuSharePublication')}
              </Text>
            </Pressable>
            <Pressable
              style={styles.paramMenuRow}
              onPress={onParamShareLocation}
              android_ripple={paramMenuRipple}
              accessibilityRole="button"
            >
              <Ionicons name="location-outline" size={22} color={paramRowLabelColor} />
              <Text style={[styles.paramMenuRowLabel, brandFontSans, { color: paramRowLabelColor }]}>
                {ls(language, 'paramMenuShareLocation')}
              </Text>
            </Pressable>
            {wikipediaUrl ? (
              <Pressable
                style={styles.paramMenuRow}
                onPress={onParamWiki}
                android_ripple={paramMenuRipple}
                accessibilityRole="button"
              >
                <Ionicons name="book-outline" size={22} color={paramRowLabelColor} />
                <Text style={[styles.paramMenuRowLabel, brandFontSans, { color: paramRowLabelColor }]}>
                  {ls(language, 'paramMenuWikipedia')}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.paramMenuRow}
              onPress={onParamReport}
              android_ripple={paramMenuRipple}
              accessibilityRole="button"
            >
              <Ionicons name="warning-outline" size={22} color={PARAM_MENU_REPORT} />
              <Text style={[styles.paramMenuRowLabel, brandFontSans, styles.paramMenuRowDanger]}>
                {ls(language, 'paramMenuReport')}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const currentPage = pageSections[activeSectionIndex] || pageSections[0];

  if (phase === 'mini') {
    return (
      <>
      <View
        style={[styles.screen, isLight && styles.screenLight]}
        {...(miniOpenPanResponder?.panHandlers || {})}
      >
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.heroPlaceholder, isLight && styles.heroPlaceholderLight]} />
        )}
        <View
          style={[styles.miniTopDock, { paddingTop: insets.top + 10, paddingHorizontal: 14 }]}
          pointerEvents="box-none"
        >
          <LandmarkGlassHeaderBar
            Shell={Animated.View}
            shellStyle={{
              transform: [{ translateY: miniTopEnterY }],
            }}
            isLight={isLight}
            accent={accent}
            headerTitle={headerTitle}
            onBack={onBack}
            onMorePress={onMoreMenu}
            bottomContent={headerDotsContent}
          />
        </View>
        <Animated.View
          style={[
            styles.miniBottomStack,
            {
              transform: [{ translateY: miniPanelEnterY }],
            },
          ]}
        >
          <View style={styles.miniFabStraddle}>
            <Pressable
              style={[styles.audioFabMini, isLight && styles.audioFabMiniLight]}
              onPress={toggleSpeech}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={ls(language, 'audioGuide')}
            >
              <Ionicons name="headset" size={18} color={isLight ? ACCENT_BLUE : '#1E1E1E'} />
            </Pressable>
          </View>
          <Animated.View
            style={[
              styles.miniSheet,
              isLight ? styles.miniSheetShadowLight : styles.miniSheetShadowDark,
              {
                paddingBottom: Math.max(insets.bottom, 20),
              },
            ]}
          >
            {Platform.OS === 'ios' && !isLight ? (
              <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
            ) : Platform.OS === 'ios' && isLight ? (
              <BlurView intensity={48} tint="light" style={StyleSheet.absoluteFill} />
            ) : null}
            <View
              style={[
                styles.miniSheetTint,
                isLight
                  ? { backgroundColor: 'rgba(255,255,255,0.93)' }
                  : { backgroundColor: 'rgba(30,30,30,0.82)' },
              ]}
            />
            <View style={styles.miniSheetInner}>
              <View style={styles.miniSheetBottomContent}>
                <Text
                  style={[styles.title, styles.titleFigma, brandFontHeadMedium, { color: titleColor }]}
                  {...LANDMARK_TITLE_SINGLE_LINE_PROPS}
                >
                  {miniSheetTitle}
                </Text>
                {miniSheetTagline ? (
                  <Text
                    style={[styles.subtitle, brandFontSans, { color: subColor }]}
                    numberOfLines={isHomeMiniPanel ? undefined : 2}
                    ellipsizeMode="tail"
                  >
                    {miniSheetTagline}
                  </Text>
                ) : null}
                <Text
                  style={[styles.miniBody, styles.miniBodyClamp, brandFontSans, { color: bodyColor }]}
                  {...(miniBodyUnlimited
                    ? {}
                    : { numberOfLines: PREVIEW_BODY_LINES, ellipsizeMode: 'tail' })}
                >
                  {miniSheetBody}
                </Text>
                <AuthStylePrimaryCta
                  onPress={openFull}
                  label={ls(language, 'more')}
                  isLight={isLight}
                  androidRipple={isLight ? rippleOnLightSurface : rippleOnDarkSurface}
                />
              </View>
            </View>
          </Animated.View>
        </Animated.View>
      </View>
      {landmarkParamsMenu}
      </>
    );
  }

  const readArticleColumn = (
    <View style={[styles.readQuizPagePad, { paddingTop: fullReadTopClearance, backgroundColor: sheetBg }]}>
      {currentPage?.type === 'intro' ? (
        <View style={[styles.fullReadPage, { backgroundColor: sheetBg }]}>
          <View
            style={[
              styles.fullReadHeroCard,
              { height: smallHeroHeight, marginHorizontal: 0, marginTop: 0 },
              isLight && styles.fullReadHeroCardLight,
            ]}
          >
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                style={[
                  styles.fullReadHeroImg,
                  isIntroTextShort ? { transform: [{ translateY: 22 + introAutoShift }] } : { transform: [{ translateY: 0 }] },
                ]}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.fullReadHeroImg, styles.heroPlaceholder, isLight && styles.heroPlaceholderLight]} />
            )}
          </View>
          <ScrollView
            style={styles.fullReadIntroScroll}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 12 + introAutoShift,
              paddingBottom: Math.max(insets.bottom, 96),
            }}
            showsVerticalScrollIndicator={false}
          >
            <Text
              style={[styles.title, styles.titleFigma, brandFontHeadMedium, { color: titleColor }]}
              {...LANDMARK_TITLE_SINGLE_LINE_PROPS}
            >
              {headerTitle}
            </Text>
            {sheetTagline ? (
              <Text style={[styles.subtitle, styles.fullReadSubtitle, brandFontSans, { color: subColor }]}>{sheetTagline}</Text>
            ) : null}
            {showSourceTag ? (
              <Text style={[styles.sourceTag, brandFontSansMedium, { color: accent }]}>{sourceLine}</Text>
            ) : null}
            <TextWithOptionalUrls style={[styles.body, styles.fullReadBody, brandFontSans, { color: bodyColor }]} linkColor={bodyLinkColor}>
              {fullBodyText}
            </TextWithOptionalUrls>
            {wikipediaUrl ? (
              <AuthStylePrimaryCta
                onPress={openWiki}
                label={ls(language, 'more')}
                isLight={isLight}
                androidRipple={isLight ? rippleOnLightSurface : rippleOnDarkSurface}
              />
            ) : null}
          </ScrollView>
        </View>
      ) : null}

      {currentPage?.type === 'quiz' ? (
        <View
          style={[
            styles.fullReadPage,
            styles.quizPageBg,
            isLight ? styles.quizPageBgLight : styles.quizPageBgDark,
          ]}
        >
          <View style={styles.quizPageTitleRow}>
            <Text
              style={[
                styles.quizPageTitle,
                brandFontHeadMedium,
                { color: isLight ? '#0C2FA8' : '#E1FF00' },
              ]}
            >
              {language === 'uk' ? 'Вікторина' : 'Quiz'}
            </Text>
          </View>
          <View style={styles.quizPageInner}>
            <LandmarkQuizContent
              navigation={navigation}
              route={quizPagerRoute}
              pagerMode
              hideHeader
              inlineMode
            />
          </View>
        </View>
      ) : null}

      {currentPage?.type === 'fact' || currentPage?.type === 'compare' ? (
        <View
          style={[
            styles.fullReadPage,
            styles.readFactSlide,
            isLight && styles.readFactSlideLight,
          ]}
        >
          {currentPage.type === 'compare' ? (
            <LandmarkPhotoCompare
              beforeUri={currentPage.slide?.compareBottomUri}
              afterUri={currentPage.slide?.compareTopUri}
              initialPosition={0.5}
              isLight={isLight}
              style={styles.readFactCompare}
            />
          ) : (
            <Image
              source={{ uri: currentPage.slide?.photoUri }}
              style={[styles.readFactImage, styles.readFactImageBleed]}
              resizeMode="cover"
            />
          )}
          {currentPage.type === 'fact' ? (
            <View style={styles.readFactOverlay} />
          ) : null}
          {currentPage.type === 'fact' ? (
            <View style={[styles.readFactCard, isLight && styles.readFactCardLight, { opacity: 1 }]}>
              {currentPage.slide?.title ? (
                <Text style={[styles.readFactTitle, brandFontHeadMedium, { color: titleColor }]}>
                  {currentPage.slide.title}
                </Text>
              ) : null}
              <Text style={[styles.readFactBody, brandFontHeadMedium, { color: accent }]}>
                {String(currentPage.slide?.fact || '').trim() ||
                  (language === 'uk'
                    ? 'Факт для цієї памʼятки буде додано адміністратором.'
                    : 'A fact for this landmark will be added by admin.')}
              </Text>
              {currentPage.slide?.subtitle ? (
                <Text style={[styles.readFactSubtitle, brandFontSans, { color: bodyColor }]}>
                  {currentPage.slide.subtitle}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <View
        style={[styles.screen, isLight && styles.screenLight]}
        {...(currentPage?.type === 'compare' ? {} : fullBackPanResponder?.panHandlers || {})}
      >
        <View style={[styles.miniTopDock, { paddingTop: insets.top + 2, paddingHorizontal: 6 }]} pointerEvents="box-none">
          <LandmarkGlassHeaderBar
            isLight={isLight}
            accent={accent}
            headerTitle={headerTitle}
            onBack={onBack}
            onMorePress={onMoreMenu}
            bottomContent={headerDotsContent}
          />
        </View>
        <OfflineStatusBanner isLight={isLight} top={insets.top + 70} />
        {speaking ? (
          <Pressable
            onPress={toggleSpeech}
            style={[
              styles.audioBar,
              styles.fullAudioBarOverlay,
              {
                top: insets.top + 10 + 56 + (hasQuizPager ? 22 : 8),
                borderTopColor: accent,
                backgroundColor: isLight ? 'rgba(255,255,255,0.97)' : 'rgba(30,30,30,0.92)',
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={ls(language, 'audioGuide')}
          >
            <Ionicons name="pause" size={22} color={accent} />
            <Text style={[styles.audioBarText, { color: titleColor }]}>{ls(language, 'audioGuide')}</Text>
            <View style={styles.audioBarTrack}>
              <View style={[styles.audioBarFill, { backgroundColor: accent }]} />
            </View>
          </Pressable>
        ) : null}

        <View style={styles.readQuizPager}>{readArticleColumn}</View>

        <View
          pointerEvents="box-none"
          style={[styles.bottomActionRow, { bottom: Math.max(insets.bottom, 16) + 18 }]}
        >
          {phase === 'full' && activeSectionIndex < sectionDotCount - 1 ? (
            <Pressable
              style={[
                styles.pageNextBtn,
                isLight && styles.pageNextBtnLight,
              ]}
              onPress={() => goToAdjacentSection(1)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Next section"
            >
              <Ionicons name="arrow-forward" size={24} color={isLight ? ACCENT_BLUE : '#1E1E1E'} />
            </Pressable>
          ) : null}
          <Pressable
            style={[
              styles.audioFabFull,
              isLight && styles.audioFabFullLight,
            ]}
            onPress={toggleSpeech}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={ls(language, 'audioGuide')}
          >
            <Ionicons name="headset" size={24} color={isLight ? ACCENT_BLUE : '#1E1E1E'} />
          </Pressable>
        </View>
      </View>
      {landmarkParamsMenu}
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  screenLight: {
    backgroundColor: '#E8E8E8',
  },
  heroClip: {
    width: '100%',
    height: '40%',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  heroClipLight: {
    backgroundColor: '#DDE0E8',
  },
  hero: {
    width: '100%',
    height: '100%',
    backgroundColor: '#111',
  },
  heroPlaceholder: {
    backgroundColor: '#1A1A1A',
  },
  heroPlaceholderLight: {
    backgroundColor: '#E4E6ED',
  },
  miniBottomStack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    overflow: 'visible',
  },
  /** FAB сидить на «шві» картки: більша частина кола над верхом листа. */
  miniFabStraddle: {
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingRight: 18,
    marginBottom: -32,
    zIndex: 10,
    overflow: 'visible',
  },
  fullSheetScrollContent: {
    flexGrow: 1,
    paddingBottom: 28,
  },
  miniSheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginHorizontal: 10,
    overflow: 'hidden',
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  miniSheetShadowDark: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 14,
      },
      android: { elevation: 14 },
    }),
  },
  miniSheetShadowLight: {
    ...Platform.select({
      ios: {
        shadowColor: '#0212EB',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 12 },
    }),
  },
  miniSheetTint: {
    ...StyleSheet.absoluteFillObject,
  },
  miniSheetInner: {
    position: 'relative',
    zIndex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 6,
    justifyContent: 'flex-start',
  },
  miniSheetBottomContent: {
    marginTop: 'auto',
  },
  miniBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  miniBodyClamp: {
    marginBottom: 12,
  },
  miniTopDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 5,
  },
  readQuizPager: {
    flex: 1,
  },
  readQuizPage: {
    flex: 1,
  },
  readQuizPagePad: {
    flex: 1,
  },
  fullReadPage: {
    flex: 1,
    height: '100%',
  },
  fullReadHeroCard: {
    marginHorizontal: 0,
    alignSelf: 'stretch',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    overflow: 'hidden',
    marginBottom: 0,
    backgroundColor: '#111',
  },
  fullReadHeroCardLight: {
    backgroundColor: '#DDE0E8',
  },
  fullReadHeroImg: {
    width: '100%',
    height: '100%',
  },
  fullReadScroll: {
    flex: 1,
    marginTop: 0,
  },
  headerPagerDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerPagerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  fullAudioBarOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9,
    borderRadius: 12,
  },
  readPagerHint: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  readSectionContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  readSectionQuizDock: {
    paddingTop: 12,
    paddingBottom: 2,
  },
  quizPageBg: {
    paddingHorizontal: 14,
    paddingTop: 146,
  },
  quizPageBgLight: {
    backgroundColor: '#EAF1FF',
  },
  quizPageBgDark: {
    backgroundColor: '#10192B',
  },
  quizPageTitleRow: {
    marginTop: 72,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizPageTitle: {
    fontSize: 22,
    lineHeight: 27,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  quizPageInner: {
    flex: 1,
    marginTop: 0,
    marginBottom: 12,
    justifyContent: 'flex-start',
    paddingTop: 16,
    paddingBottom: 18,
  },
  readFactsDeck: {
    marginTop: 0,
    rowGap: 0,
    paddingBottom: 0,
    marginHorizontal: -20,
  },
  readFactSlide: {
    flex: 1,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#0E0E0E',
  },
  readFactFrame: {
    ...StyleSheet.absoluteFillObject,
    borderTopWidth: 2.5,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    zIndex: 2,
  },
  readFactSlideLight: {
    backgroundColor: '#DDE0E8',
  },
  readFactImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  readFactImageBleed: {
    transform: [{ scale: 1.06 }, { translateY: -8 }],
  },
  readFactCompare: {
    ...StyleSheet.absoluteFillObject,
  },
  readFactOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  readFactOverlayCompare: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  readFactCard: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '50%',
    transform: [{ translateY: -74 }],
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(22,22,22,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(225,255,0,0.28)',
  },
  readFactCardLight: {
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderColor: 'rgba(2,18,235,0.2)',
  },
  readFactTitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
    textAlign: 'center',
  },
  readFactBody: {
    fontSize: 22,
    lineHeight: 27,
    textAlign: 'center',
    marginBottom: 4,
  },
  readFactSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  chevronHint: {
    alignSelf: 'center',
    fontSize: 12,
    marginTop: -8,
    marginBottom: 4,
  },
  audioFabMini: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: FIGMA_CREAM,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -10 }],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.22,
        shadowRadius: 5,
      },
      android: { elevation: 5 },
    }),
  },
  audioFabMiniLight: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(2, 18, 235, 0.22)',
    ...Platform.select({
      ios: {
        shadowColor: '#0212EB',
        shadowOpacity: 0.15,
      },
    }),
  },
  audioBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 2,
  },
  audioBarText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  audioBarTrack: {
    height: 4,
    width: 100,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.35)',
    overflow: 'hidden',
  },
  audioBarFill: {
    height: '100%',
    width: '40%',
    borderRadius: 2,
  },
  audioFabFull: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: FIGMA_CREAM,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 5,
      },
      android: { elevation: 5 },
    }),
  },
  audioFabFullLight: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(2, 18, 235, 0.2)',
    ...Platform.select({
      ios: {
        shadowColor: '#0212EB',
        shadowOpacity: 0.12,
      },
    }),
  },
  bottomActionRow: {
    position: 'absolute',
    right: 20,
    flexDirection: 'column',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    rowGap: 12,
    zIndex: 10,
  },
  pageNextBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: FIGMA_CREAM,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 5,
      },
      android: { elevation: 5 },
    }),
  },
  pageNextBtnLight: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(2, 18, 235, 0.2)',
    ...Platform.select({
      ios: {
        shadowColor: '#0212EB',
        shadowOpacity: 0.12,
      },
    }),
  },
  backGlyph: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '300',
    marginTop: -2,
  },
  sheet: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    marginBottom: 6,
    paddingRight: 8,
  },
  titleFigma: {
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 10,
  },
  fullReadSubtitle: {
    fontSize: 12,
    lineHeight: 14,
    marginBottom: 8,
  },
  sourceTag: {
    fontSize: 12,
    marginBottom: 14,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
  },
  fullReadBody: {
    lineHeight: 22,
  },
  authCtaOuter: {
    alignSelf: 'stretch',
    width: '100%',
    minHeight: 48,
    height: 52,
    borderRadius: 999,
    position: 'relative',
    overflow: 'visible',
    marginTop: 8,
    marginBottom: 4,
  },
  authCtaBack: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  authCtaFront: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 8,
    elevation: 5,
  },
  authCtaText: {
    fontWeight: '400',
    fontSize: 15,
    lineHeight: 19,
    textAlign: 'center',
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif-medium' } : {}),
  },
  paramMenuRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  paramMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  paramMenuSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    paddingTop: 16,
    paddingHorizontal: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.22,
        shadowRadius: 12,
      },
      android: { elevation: 16 },
    }),
  },
  paramMenuTitle: {
    fontSize: 17,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  paramMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  paramMenuRowLabel: {
    flex: 1,
    fontSize: 16,
  },
  paramMenuRowDanger: {
    color: PARAM_MENU_REPORT,
  },
});
