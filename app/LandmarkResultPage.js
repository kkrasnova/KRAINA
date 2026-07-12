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
  BackHandler,
} from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';
import { APP_PLAYBACK_AUDIO_MODE } from './audioSession';
import { getCachedOrRemoteAudioUri, prefetchAudioGuideUrl } from './audioGuideCache';
import {
  normalizePlaybackUri,
  pickBestVoiceIdentifier,
  resolveLandmarkAudioScript,
  startLandmarkNarration,
  ttsLocaleForContent,
} from './landmarkTts';
import { buildSlideAudioScripts } from './landmarkSlideAudioTexts';
import { prefetchLandmarkSlideAudio } from './landmarkAudioPrefetch';
import { useLandmarkSlideAudioguide } from './useLandmarkSlideAudioguide';
import { LandmarkAudioGuideControls } from './LandmarkAudioGuideControls';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { getSession } from './db';
import { ls } from './landmarkScannerI18n';
import { lq } from './landmarkQuizI18n';
import { hasPlayableStoryQuiz } from './landmarkQuizUtils';
import { getAppTheme, resolveAppTheme } from './themeStorage';
import { ACCENT_BLUE, accentForTheme, onAccentButtonText } from './themeAccent';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { buildMiniExtract } from './landmarkIdentify';
import {
  recordLocationVisit,
  parseCityFromSubtitle,
  shouldRecordVisitFromLandmarkRoute,
} from './visitStatsStorage';
import { applyPhysicalVisitReward } from './physicalVisitRewards';
import {
  distanceMetersFromCoords,
  isWithinPhysicalVisitRadiusMeters,
  PHYSICAL_VISIT_RADIUS_M,
} from './landmarkProximity';
import * as Location from 'expo-location';
import { HOME_TAB_ROUTE, HOME_TAB } from './homeTabPagerConstants';
import { getLandmarkInRegion, getRegion, landmarkTitle } from './routeRegionsData';
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
import { RenderProfiler } from './performanceMetrics';
import { createLandmarkPagerPanResponder, LANDMARK_SCROLL_PULL_DISMISS_PX } from './landmarkPagerSwipe';
import { HERO_THUMB_MAP, resolveHeroThumbRef } from './krainaHeroThumbs';
import { prefetchLandmarkResultParams } from './landmarkImagePrefetch';
import { introPagesFromStory, homeHeroLayoutFromStory, resolveLandmarkHeroPhotoSource, resolveLandmarkHeroPhotoSourceFromLandmark, normalizeExpoImageSource } from './homeLandmarkResultParams';
import { resolveHomeLandmarkThumbSource } from './homeLandmarkDisplay';
import { splitIntroBodyAtHero, INTRO_BODY_HERO_MARKER } from './landmarkTextUtils';
import { shellPush } from './shellNavigate';
import { useAuthStore } from './auth/authStore';
import {
  runAfterParamMenuDismiss,
  shareLandmarkPublication,
  shareLandmarkLocation,
  reportLandmarkIssue,
} from './landmarkParamMenuActions';

import {
  TextWithOptionalUrls,
  TextWithEmphasis,
  LandmarkIntroFormattedBody,
} from './landmarkResultTextComponents';
import {
  resolveAssetAspect,
  fitAssetWithinBox,
  LandmarkIllustrationLightbox,
  IntroPhotoTap,
  AuthStylePrimaryCta,
} from './landmarkResultDisplayComponents';

/** Crop anchor for intro hero photos (object-position). */
function resolveHeroPosition(page, variant = 'primary') {
  const key =
    variant === 'secondary'
      ? 'secondaryHeroPosition'
      : variant === 'tertiary'
        ? 'tertiaryHeroPosition'
        : 'heroPosition';
  const pos = page?.[key];
  if (pos && typeof pos === 'object') return pos;
  return 'center';
}

/** Ті самі кольори, що кнопка «Вхід» / «Реєстрація» у ThirdPage (`authOnboardCta*`). */
const AUTH_CTA_ACCENT = '#E1FF00';
const AUTH_CTA_BACK = '#6F8500';
const AUTH_CTA_FRONT_BORDER = '#7A9000';
/** Текст на тёмних панелях (Figma). */
const FIGMA_CREAM = '#F2F2EA';
const BODY_LINK_DARK = '#8EC5FF';
const BODY_LINK_LIGHT = '#1558C0';

const PREVIEW_BODY_LINES = 3;
const PARAM_MENU_DISMISS_DRAG_PX = 56;
const MINI_SHEET_OPEN_DRAG_PX = 44;
const MINI_SHEET_OPEN_VY = -0.26;
const MINI_SHEET_OPEN_VX = -0.26;
const MINI_SHEET_BACK_VX = 0.26;
const MINI_SHEET_AXIS_LOCK_PX = 8;
const INTRO_COMPARE_HPAD = 16;
/** Share of screen height for intro sub-page hero / compare card. */
const INTRO_SUB_HERO_HEIGHT_RATIO = 0.56;
/** Only the intro before/after slider card — keep shorter than map/photo pages. */
const INTRO_COMPARE_HEIGHT_RATIO = 0.4;
const INTRO_COMPARE_HEIGHT_MAX = 400;
let speechModuleAvailable = false;
const Speech = (() => {
  try {
    const mod = require('expo-speech');
    speechModuleAvailable = !!mod?.speak;
    return mod;
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

export default function LandmarkResultPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const language = useSyncedAppLanguage(route, 'uk');
  const [appTheme, setAppTheme] = useState(resolveAppTheme(route?.params?.appTheme));

  const photoUri = resolveOfflineUriSync(route?.params?.photoUri);
  const visitLandmarkSaveParam = route?.params?.visitLandmarkSave;
  const catalogLandmark = useMemo(() => {
    if (!visitLandmarkSaveParam?.regionId || !visitLandmarkSaveParam?.landmarkId) return null;
    return getLandmarkInRegion(visitLandmarkSaveParam.regionId, visitLandmarkSaveParam.landmarkId);
  }, [visitLandmarkSaveParam?.regionId, visitLandmarkSaveParam?.landmarkId]);
  const defaultHeroPhotoSource = useMemo(() => {
    const resolved =
      resolveLandmarkHeroPhotoSource({
        photoAsset: route?.params?.photoAsset,
        photoUri: route?.params?.photoUri,
        heroThumb: route?.params?.heroThumb,
        lm: catalogLandmark,
      }) ||
      (catalogLandmark ? resolveLandmarkHeroPhotoSourceFromLandmark(catalogLandmark) : null);
    return resolved || HERO_THUMB_MAP.t1;
  }, [
    route?.params?.photoAsset,
    route?.params?.photoUri,
    route?.params?.heroThumb,
    catalogLandmark,
  ]);
  const [miniHeroFallback, setMiniHeroFallback] = useState(null);
  const [miniHeroUseRnImage, setMiniHeroUseRnImage] = useState(false);
  useEffect(() => {
    setMiniHeroFallback(null);
    setMiniHeroUseRnImage(false);
  }, [defaultHeroPhotoSource, visitLandmarkSaveParam?.landmarkId]);
  const miniHeroPhotoSource = miniHeroFallback || defaultHeroPhotoSource;
  const miniHeroExpoSource = useMemo(
    () => normalizeExpoImageSource(miniHeroPhotoSource) || miniHeroPhotoSource,
    [miniHeroPhotoSource],
  );
  const miniHeroImageKey = useMemo(() => {
    if (typeof miniHeroPhotoSource === 'number') {
      return Image.resolveAssetSource(miniHeroPhotoSource)?.uri || `asset:${miniHeroPhotoSource}`;
    }
    if (miniHeroPhotoSource?.uri) return String(miniHeroPhotoSource.uri);
    const landmarkId = String(visitLandmarkSaveParam?.landmarkId || '').trim();
    if (landmarkId) return `mini-hero:${landmarkId}`;
    return 'mini-hero:fallback';
  }, [miniHeroPhotoSource, visitLandmarkSaveParam?.landmarkId]);
  const onMiniHeroError = useCallback(() => {
    if (miniHeroUseRnImage) return;
    if (!miniHeroFallback) {
      if (catalogLandmark) {
        const thumb = resolveHomeLandmarkThumbSource(catalogLandmark);
        if (thumb && thumb !== defaultHeroPhotoSource) {
          setMiniHeroFallback(thumb);
          return;
        }
      }
      if (defaultHeroPhotoSource !== HERO_THUMB_MAP.t1) {
        setMiniHeroFallback(HERO_THUMB_MAP.t1);
        return;
      }
    } else if (miniHeroFallback !== HERO_THUMB_MAP.t1) {
      setMiniHeroFallback(HERO_THUMB_MAP.t1);
      return;
    }
    setMiniHeroUseRnImage(true);
  }, [miniHeroUseRnImage, miniHeroFallback, catalogLandmark, defaultHeroPhotoSource]);
  const title = route?.params?.title || '';
  const subtitle = route?.params?.subtitle;
  const extract = route?.params?.extract || '';
  const introContinuation = useMemo(() => {
    const raw = route?.params?.introContinuation;
    return typeof raw === 'string' ? raw.trim() : '';
  }, [route?.params?.introContinuation]);
  const homeHeroLayout = useMemo(() => {
    const fromRoute = homeHeroLayoutFromStory({
      homeHeroHeightRatio: route?.params?.homeHeroHeightRatio,
      homeHeroHeightMax: route?.params?.homeHeroHeightMax,
      homeHeroContentPosition: route?.params?.homeHeroContentPosition,
      homeHeroContentFit: route?.params?.homeHeroContentFit,
    });
    if (catalogLandmark) {
      return { ...homeHeroLayoutFromStory(catalogLandmark?.story), ...fromRoute };
    }
    return fromRoute;
  }, [
    route?.params?.homeHeroHeightRatio,
    route?.params?.homeHeroHeightMax,
    route?.params?.homeHeroContentPosition,
    route?.params?.homeHeroContentFit,
    visitLandmarkSaveParam,
    catalogLandmark,
  ]);
  const introPages = useMemo(() => {
    let raw = route?.params?.introPages;
    if (catalogLandmark && visitLandmarkSaveParam?.regionId && visitLandmarkSaveParam?.landmarkId) {
      const fresh = introPagesFromStory(catalogLandmark?.story, language, {
        regionId: visitLandmarkSaveParam.regionId,
        landmarkId: visitLandmarkSaveParam.landmarkId,
      });
      if (Array.isArray(fresh) && fresh.length > 0) {
        raw = fresh;
      }
    }
    if (!Array.isArray(raw)) return [];
    return raw
      .map((page) => {
        const compareBeforeThumb =
          typeof page?.compareBeforeThumb === 'string' ? page.compareBeforeThumb.trim() : '';
        const compareAfterThumb =
          typeof page?.compareAfterThumb === 'string' ? page.compareAfterThumb.trim() : '';
        const compareBeforeAsset =
          typeof page?.compareBeforeAsset === 'number'
            ? page.compareBeforeAsset
            : resolveHeroThumbRef(compareBeforeThumb);
        const compareAfterAsset =
          typeof page?.compareAfterAsset === 'number'
            ? page.compareAfterAsset
            : resolveHeroThumbRef(compareAfterThumb);
        const compareBeforeUri =
          typeof page?.compareBeforeUri === 'string' ? page.compareBeforeUri.trim() : '';
        const compareAfterUri =
          typeof page?.compareAfterUri === 'string' ? page.compareAfterUri.trim() : '';
        if (
          (typeof compareBeforeAsset === 'number' && typeof compareAfterAsset === 'number') ||
          (compareBeforeUri && compareAfterUri)
        ) {
          const bodyEarly = typeof page?.body === 'string' ? page.body.trim() : '';
          if (!bodyEarly) {
            return {
              compareOnly: true,
              ...(typeof compareBeforeAsset === 'number' ? { compareBeforeAsset } : {}),
              ...(typeof compareAfterAsset === 'number' ? { compareAfterAsset } : {}),
              ...(compareBeforeThumb ? { compareBeforeThumb } : {}),
              ...(compareAfterThumb ? { compareAfterThumb } : {}),
              ...(compareBeforeUri ? { compareBeforeUri } : {}),
              ...(compareAfterUri ? { compareAfterUri } : {}),
            };
          }
        }
        const bodyRaw = typeof page?.body === 'string' ? page.body.trim() : '';
        const bodyAfterHeroFromPage =
          typeof page?.bodyAfterHero === 'string' ? page.bodyAfterHero.trim() : '';
        const splitSource =
          bodyRaw.includes(INTRO_BODY_HERO_MARKER)
            ? bodyRaw
            : bodyAfterHeroFromPage
              ? `${bodyRaw}${INTRO_BODY_HERO_MARKER}${bodyAfterHeroFromPage}`
              : bodyRaw;
        const split = splitIntroBodyAtHero(splitSource);
        const body = split.body;
        const bodyAfterHero = split.bodyAfterHero;
        if (!body && !bodyAfterHero) return null;
        const heroThumb = typeof page?.heroThumb === 'string' ? page.heroThumb.trim() : '';
        const secondaryHeroThumb =
          typeof page?.secondaryHeroThumb === 'string' ? page.secondaryHeroThumb.trim() : '';
        const photoAsset =
          typeof page?.photoAsset === 'number'
            ? page.photoAsset
            : resolveHeroThumbRef(heroThumb) || undefined;
        const secondaryPhotoAsset =
          typeof page?.secondaryPhotoAsset === 'number'
            ? page.secondaryPhotoAsset
            : resolveHeroThumbRef(secondaryHeroThumb) || undefined;
        const illustrationThumb =
          typeof page?.illustrationThumb === 'string' ? page.illustrationThumb.trim() : '';
        const illustrationAsset =
          typeof page?.illustrationAsset === 'number'
            ? page.illustrationAsset
            : resolveHeroThumbRef(illustrationThumb) || undefined;
        const illustrationLink =
          typeof page?.illustrationLink === 'string'
            ? page.illustrationLink.trim()
            : String(page?.illustrationLinkUk || page?.illustrationLinkEn || '').trim();
        const illustrationCaption =
          typeof page?.illustrationCaption === 'string'
            ? page.illustrationCaption.trim()
            : String(page?.illustrationCaptionUk || page?.illustrationCaptionEn || '').trim();
        const heroCaption =
          typeof page?.heroCaption === 'string'
            ? page.heroCaption.trim()
            : String(page?.heroCaptionUk || page?.heroCaptionEn || '').trim();
        const secondaryHeroCaption =
          typeof page?.secondaryHeroCaption === 'string'
            ? page.secondaryHeroCaption.trim()
            : String(page?.secondaryHeroCaptionUk || page?.secondaryHeroCaptionEn || '').trim();
        const tertiaryHeroThumb =
          typeof page?.tertiaryHeroThumb === 'string' ? page.tertiaryHeroThumb.trim() : '';
        const tertiaryPhotoAsset =
          typeof page?.tertiaryPhotoAsset === 'number'
            ? page.tertiaryPhotoAsset
            : resolveHeroThumbRef(tertiaryHeroThumb) || undefined;
        const tertiaryHeroCaption =
          typeof page?.tertiaryHeroCaption === 'string'
            ? page.tertiaryHeroCaption.trim()
            : String(page?.tertiaryHeroCaptionUk || page?.tertiaryHeroCaptionEn || '').trim();
        const pageUri = typeof page?.photoUri === 'string' ? page.photoUri.trim() : '';
        const photoUri =
          pageUri ||
          (photoAsset ? Image.resolveAssetSource(photoAsset)?.uri || undefined : undefined);
        const hasCompare =
          (typeof compareBeforeAsset === 'number' && typeof compareAfterAsset === 'number') ||
          (compareBeforeUri && compareAfterUri);
        const compareHeroHeightRatio = Number(page?.compareHeroHeightRatio);
        const compareHeroHeightMax = Number(page?.compareHeroHeightMax);
        const compareHeroTopInset = Number(page?.compareHeroTopInset);
        const heroHeightRatio = Number(page?.heroHeightRatio);
        const heroHeightMax = Number(page?.heroHeightMax);
        const secondaryHeroHeightRatio = Number(page?.secondaryHeroHeightRatio);
        const secondaryHeroHeightMax = Number(page?.secondaryHeroHeightMax);
        const heroStackGap = Number(page?.heroStackGap);
        const heroCaptionGap = Number(page?.heroCaptionGap);
        const heroTextGap = Number(page?.heroTextGap);
        const secondaryStackGap = Number(page?.secondaryStackGap);
        return {
          body,
          ...(bodyAfterHero
            ? { bodyAfterHero, introHeroAfterText: true }
            : {}),
          ...(hasCompare
            ? {
                ...(compareBeforeAsset ? { compareBeforeAsset } : {}),
                ...(compareAfterAsset ? { compareAfterAsset } : {}),
                ...(compareBeforeThumb ? { compareBeforeThumb } : {}),
                ...(compareAfterThumb ? { compareAfterThumb } : {}),
                ...(compareBeforeUri ? { compareBeforeUri } : {}),
                ...(compareAfterUri ? { compareAfterUri } : {}),
                ...(Number.isFinite(compareHeroHeightRatio) && compareHeroHeightRatio > 0
                  ? { compareHeroHeightRatio }
                  : {}),
                ...(Number.isFinite(compareHeroHeightMax) && compareHeroHeightMax > 0
                  ? { compareHeroHeightMax }
                  : {}),
                ...(Number.isFinite(compareHeroTopInset) && compareHeroTopInset > 0
                  ? { compareHeroTopInset }
                  : {}),
              }
            : {}),
          ...(photoAsset ? { photoAsset } : {}),
          ...(heroThumb ? { heroThumb } : {}),
          ...(secondaryHeroThumb ? { secondaryHeroThumb } : {}),
          ...(secondaryPhotoAsset ? { secondaryPhotoAsset } : {}),
          ...(Number.isFinite(heroHeightRatio) && heroHeightRatio > 0 ? { heroHeightRatio } : {}),
          ...(Number.isFinite(heroHeightMax) && heroHeightMax > 0 ? { heroHeightMax } : {}),
          ...(Number.isFinite(secondaryHeroHeightRatio) && secondaryHeroHeightRatio > 0
            ? { secondaryHeroHeightRatio }
            : {}),
          ...(Number.isFinite(secondaryHeroHeightMax) && secondaryHeroHeightMax > 0
            ? { secondaryHeroHeightMax }
            : {}),
          ...(Number.isFinite(heroStackGap) && heroStackGap >= 0 ? { heroStackGap } : {}),
          ...(Number.isFinite(heroCaptionGap) && heroCaptionGap >= 0 ? { heroCaptionGap } : {}),
          ...(Number.isFinite(heroTextGap) && heroTextGap >= 0 ? { heroTextGap } : {}),
          ...(Number.isFinite(secondaryStackGap) && secondaryStackGap >= 0
            ? { secondaryStackGap }
            : {}),
          ...(photoUri ? { photoUri } : {}),
          ...(illustrationAsset ? { illustrationAsset } : {}),
          ...(illustrationLink ? { illustrationLink } : {}),
          ...(illustrationCaption ? { illustrationCaption } : {}),
          ...(heroCaption ? { heroCaption } : {}),
          ...(secondaryHeroCaption ? { secondaryHeroCaption } : {}),
          ...(tertiaryHeroThumb ? { tertiaryHeroThumb } : {}),
          ...(tertiaryPhotoAsset ? { tertiaryPhotoAsset } : {}),
          ...(tertiaryHeroCaption ? { tertiaryHeroCaption } : {}),
          ...(page.introNoHero ? { introNoHero: true } : {}),
          ...(page.introFullBleedPhoto ? { introFullBleedPhoto: true } : {}),
          ...(page.introHeroAfterText ? { introHeroAfterText: true } : {}),
          ...(page.introHeroBleedTop ? { introHeroBleedTop: true } : {}),
          ...(page.introFactCard ? { introFactCard: true } : {}),
          ...(page.introHeroInsetRounded ? { introHeroInsetRounded: true } : {}),
          ...(page.introCompareRounded ? { introCompareRounded: true } : {}),
          ...(page.introHeroSideBySide ? { introHeroSideBySide: true } : {}),
          ...(page.heroPosition && typeof page.heroPosition === 'object'
            ? { heroPosition: page.heroPosition }
            : {}),
          ...(page.compareBeforePosition && typeof page.compareBeforePosition === 'object'
            ? { compareBeforePosition: page.compareBeforePosition }
            : {}),
          ...(page.compareAfterPosition && typeof page.compareAfterPosition === 'object'
            ? { compareAfterPosition: page.compareAfterPosition }
            : {}),
          ...(page.secondaryHeroPosition && typeof page.secondaryHeroPosition === 'object'
            ? { secondaryHeroPosition: page.secondaryHeroPosition }
            : {}),
          ...(typeof page.heroFit === 'string' && page.heroFit.trim()
            ? { heroFit: page.heroFit.trim() }
            : {}),
          ...(Number.isFinite(Number(page?.sideBySideCellGap)) && Number(page.sideBySideCellGap) >= 0
            ? { sideBySideCellGap: Number(page.sideBySideCellGap) }
            : {}),
          ...(Number.isFinite(Number(page?.sideBySideCenterOffsetTop)) &&
          Number(page.sideBySideCenterOffsetTop) >= 0
            ? { sideBySideCenterOffsetTop: Number(page.sideBySideCenterOffsetTop) }
            : {}),
          ...(Number.isFinite(Number(page?.sideBySideOuterFlex)) && Number(page.sideBySideOuterFlex) > 0
            ? { sideBySideOuterFlex: Number(page.sideBySideOuterFlex) }
            : {}),
          ...(Number.isFinite(Number(page?.sideBySideCenterFlex)) &&
          Number(page.sideBySideCenterFlex) > 0
            ? { sideBySideCenterFlex: Number(page.sideBySideCenterFlex) }
            : {}),
          ...(Number.isFinite(Number(page?.sideBySideRowPaddingHorizontal)) &&
          Number(page.sideBySideRowPaddingHorizontal) >= 0
            ? {
                sideBySideRowPaddingHorizontal: Number(page.sideBySideRowPaddingHorizontal),
              }
            : {}),
        };
      })
      .filter(Boolean);
  }, [route?.params?.introPages, visitLandmarkSaveParam, catalogLandmark, language]);
  const headerTitle = useMemo(() => {
    const h = typeof route?.params?.headerTitle === 'string' ? route.params.headerTitle.trim() : '';
    return h || title;
  }, [route?.params?.headerTitle, title]);
  const panelTagline = useMemo(() => {
    const t = typeof route?.params?.panelTagline === 'string' ? route.params.panelTagline.trim() : '';
    return t;
  }, [route?.params?.panelTagline]);
  const previewBodyLines = useMemo(() => {
    const n = Number(route?.params?.previewBodyLines);
    return Number.isFinite(n) && n > 0 ? n : PREVIEW_BODY_LINES;
  }, [route?.params?.previewBodyLines]);
  const wikipediaUrl = route?.params?.wikipediaUrl;
  const source = route?.params?.source;
  const startPhaseParam = route?.params?.startPhase;
  const isLavraHomeMini =
    startPhaseParam === 'home' && route?.params?.visitLandmarkSave?.landmarkId === 'lavra';
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
    const previewLines = Number(route?.params?.previewBodyLines);
    const isHomeLandmark = startPhaseParam === 'home';
    if (hasExplicitMini) {
      if (isHomeLandmark) {
        if (isLavraHomeMini) {
          return Math.min(winH * 0.38, 330);
        }
        return Math.min(winH * 0.34, 292);
      }
      return Math.min(winH * 0.52, 440);
    }
    if (Number.isFinite(previewLines) && previewLines > PREVIEW_BODY_LINES) {
      return Math.min(winH * 0.46, 400);
    }
    return Math.min(winH * 0.36, 320);
  }, [winH, route?.params?.previewBodyLines, route?.params?.miniExtract, startPhaseParam, isLavraHomeMini]);
  const miniHeroClipHeight = useMemo(() => {
    if (startPhaseParam === 'home') return null;

    const ratio = Number(homeHeroLayout.homeHeroHeightRatio);
    const max = Number(homeHeroLayout.homeHeroHeightMax);
    const fit = homeHeroLayout.homeHeroContentFit;
    const source = defaultHeroPhotoSource;

    if (fit === 'contain' && source) {
      const resolved = typeof source === 'number' ? Image.resolveAssetSource(source) : null;
      if (resolved?.width && resolved?.height) {
        const aspect = resolved.width / resolved.height;
        const heightFromWidth = winW / aspect;
        const cap = Number.isFinite(max) && max > 0 ? max : Math.round(winH * 0.78);
        return Math.min(cap, Math.max(240, Math.round(heightFromWidth)));
      }
    }

    if (!Number.isFinite(ratio) || ratio <= 0) return null;
    const cap = Number.isFinite(max) && max > 0 ? max : Math.round(winH * 0.55);
    return Math.min(cap, Math.max(220, Math.round(winH * ratio)));
  }, [
    startPhaseParam,
    homeHeroLayout.homeHeroHeightRatio,
    homeHeroLayout.homeHeroHeightMax,
    homeHeroLayout.homeHeroContentFit,
    defaultHeroPhotoSource,
    winW,
    winH,
  ]);
  /** Вхід нижньої панелі: з’являється знизу. */
  const miniPanelEnterY = useRef(new Animated.Value(280)).current;
  /** Інтерактивний свайп картки вгору (від’ємне значення — тягнемо вгору). */
  const miniSheetDragY = useRef(new Animated.Value(0)).current;
  /** Інтерактивний свайп картки вліво (від’ємне значення — тягнемо вліво). */
  const miniSheetDragX = useRef(new Animated.Value(0)).current;
  /** Зафіксована вісь жесту на mini-екрані: up | left | back. */
  const miniDragAxisRef = useRef(null);
  /** Вхід верхньої «скляної» панелі: з’являється зверху. */
  const miniTopEnterY = useRef(new Animated.Value(-96)).current;

  useLayoutEffect(() => {
    if (phase !== 'mini') return undefined;
    miniPanelEnterY.setValue(0);
    miniTopEnterY.setValue(0);
    miniSheetDragY.setValue(0);
    miniSheetDragX.setValue(0);
    miniDragAxisRef.current = null;
    return undefined;
  }, [phase, miniSheetMaxH, winH, miniPanelEnterY, miniTopEnterY, miniSheetDragY, miniSheetDragX]);

  useEffect(() => {
    void prefetchLandmarkResultParams(route?.params || {});
  }, [
    route?.params?.photoAsset,
    route?.params?.photoUri,
    route?.params?.visitLandmarkSave?.landmarkId,
  ]);

  const [speaking, setSpeaking] = useState(false);
  const [paramsMenuOpen, setParamsMenuOpen] = useState(false);
  const [landmarkSaved, setLandmarkSaved] = useState(false);
  const [introPhotoLightbox, setIntroPhotoLightbox] = useState(null);

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
    setAudioModeAsync(APP_PLAYBACK_AUDIO_MODE).catch(() => {});
  }, []);

  const visitLandmarkSave = route?.params?.visitLandmarkSave;
  const routeUser = route?.params?.user;
  const authStoreUser = useAuthStore((s) => s.user);
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
  const shareLocationCoords = useMemo(() => {
    if (visitLat != null && visitLng != null) {
      return { lat: visitLat, lng: visitLng };
    }
    if (visitLandmarkSave?.regionId && visitLandmarkSave?.landmarkId) {
      const lm = getLandmarkInRegion(visitLandmarkSave.regionId, visitLandmarkSave.landmarkId);
      if (lm && Number.isFinite(lm.lat) && Number.isFinite(lm.lng)) {
        return { lat: lm.lat, lng: lm.lng };
      }
    }
    return { lat: undefined, lng: undefined };
  }, [visitLat, visitLng, visitLandmarkSave]);
  const quizLandmarkKey = visitSaveKey || `t:${String(headerTitle || title || '').slice(0, 120)}`;
  const storyQuiz = route?.params?.storyQuiz;

  useEffect(() => {
    visitRecordedRef.current = false;
  }, [title, subtitle, route?.params?.visitKm, route?.params?.countAsPhysicalVisit]);

  useEffect(() => {
    if (shouldRecordVisitFromLandmarkRoute(route)) return;
    if (route?.params?.fromScanner === true) return;
    if (visitLat == null || visitLng == null) return;

    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const distM = distanceMetersFromCoords(
          pos.coords.latitude,
          pos.coords.longitude,
          visitLat,
          visitLng,
        );
        if (cancelled || distM == null) return;
        if (isWithinPhysicalVisitRadiusMeters(distM)) {
          navigation.setParams({
            visitKm: distM / 1000,
            countAsPhysicalVisit: true,
          });
        }
      } catch {
        /* optional GPS */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visitLat, visitLng, navigation, route, route?.params?.fromScanner, route?.params?.visitKm]);

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
    void applyPhysicalVisitReward(quizLandmarkKey);
  }, [
    title,
    subtitle,
    route,
    route?.params?.visitCity,
    route?.params?.visitCategory,
    route?.params?.visitKm,
    route?.params?.countAsPhysicalVisit,
    quizLandmarkKey,
  ]);
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

  const playLocalAudioUri = useCallback(
    async (localUri) => {
      const uri = normalizePlaybackUri(localUri);
      if (!uri) throw new Error('audio_empty_uri');
      Speech.stop();
      await setAudioModeAsync(APP_PLAYBACK_AUDIO_MODE);
      const player = ensureLandmarkAudioPlayer();
      player.replace(uri);
      fileAudioActiveRef.current = true;
      setSpeaking(true);
      player.play();
    },
    [ensureLandmarkAudioPlayer],
  );

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
        Speech.stop();
        void setAudioModeAsync(APP_PLAYBACK_AUDIO_MODE)
          .then(() => {
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
              if (status.isLoaded && status.duration > 0 && status.currentTime >= status.duration - 0.15) {
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
          })
          .catch(reject);
      }),
    [ensureLandmarkAudioPlayer],
  );

  useEffect(() => {
    return () => {
      fileAudioDoneCancelRef.current?.();
      fileAudioDoneCancelRef.current = null;
      Speech.stop();
      fileAudioActiveRef.current = false;
      audioPlayerRef.current?.remove?.();
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
  const emphasisColor = isLight ? '#0C2FA8' : AUTH_CTA_ACCENT;

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

  const hasInlineIntroFactCard = useMemo(
    () => introPages.some((page) => page.introFactCard),
    [introPages],
  );
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
    if (photoUri && !hasInlineIntroFactCard) {
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
    hasInlineIntroFactCard,
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
  const fullReadTopClearance = 0;
  const introHeaderClearance = Math.max(insets.top + 86, 104);
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
        ? Math.min(680, Math.max(400, Math.round(winH * 0.62)))
        : Math.min(560, Math.max(300, Math.round(winH * 0.48))),
    [isIntroTextShort, winH],
  );
  const [fullReadViewportH, setFullReadViewportH] = useState(0);
  const factSlideHeight = useMemo(() => {
    const vh = Math.max(0, fullReadViewportH);
    if (vh > 0) return Math.max(420, Math.round(vh));
    return Math.max(680, Math.round(winH * 0.9));
  }, [fullReadViewportH, winH]);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [compareDragLock, setCompareDragLock] = useState(false);
  const activeSectionIndexRef = useRef(0);
  const pageSections = useMemo(() => {
    const pages = [{ id: 'intro', type: 'intro', introPart: 1 }];
    if (introPages.length > 0) {
      introPages.forEach((page, i) => {
        if (page.compareOnly && (page.compareBeforeAsset || page.compareBeforeUri)) {
          pages.push({
            id: `intro-compare-${i + 2}`,
            type: 'compare',
            slide: {
              compareBottomSource: page.compareBeforeAsset,
              compareTopSource: page.compareAfterAsset,
              compareBottomUri: page.compareBeforeUri,
              compareTopUri: page.compareAfterUri,
            },
          });
          return;
        }
        if (page.introFactCard) {
          const heroThumb = typeof page.heroThumb === 'string' ? page.heroThumb.trim() : '';
          const photoAsset =
            typeof page.photoAsset === 'number' ? page.photoAsset : resolveHeroThumbRef(heroThumb);
          const photoUriResolved =
            typeof page.photoUri === 'string' && page.photoUri.trim()
              ? page.photoUri.trim()
              : typeof photoAsset === 'number'
                ? Image.resolveAssetSource(photoAsset)?.uri || ''
                : '';
          pages.push({
            id: `intro-${i + 2}`,
            type: 'fact',
            slide: {
              introFact: true,
              ...(typeof photoAsset === 'number' ? { photoAsset } : {}),
              photoUri: photoUriResolved,
              fact: page.body,
              title: '',
              subtitle: '',
            },
          });
          if (hasStoryQuiz && i + 2 === 7) {
            pages.push({ id: 'quiz', type: 'quiz' });
          }
          return;
        }
        pages.push({
          id: `intro-${i + 2}`,
          type: 'intro',
          introPart: i + 2,
          body: page.body,
          bodyAfterHero: page.bodyAfterHero,
          photoAsset:
            typeof page.photoAsset === 'number'
              ? page.photoAsset
              : resolveHeroThumbRef(
                  typeof page.heroThumb === 'string' ? page.heroThumb.trim() : '',
                ) || undefined,
          photoUri: page.photoUri,
          heroThumb: page.heroThumb,
          secondaryHeroThumb: page.secondaryHeroThumb,
          secondaryPhotoAsset: page.secondaryPhotoAsset,
          illustrationAsset: page.illustrationAsset,
          illustrationLink: page.illustrationLink,
          illustrationCaption: page.illustrationCaption,
          heroCaption: page.heroCaption,
          secondaryHeroCaption: page.secondaryHeroCaption,
          tertiaryHeroThumb: page.tertiaryHeroThumb,
          tertiaryPhotoAsset: page.tertiaryPhotoAsset,
          tertiaryHeroCaption: page.tertiaryHeroCaption,
          compareBeforeAsset: page.compareBeforeAsset,
          compareAfterAsset: page.compareAfterAsset,
          compareBeforeThumb: page.compareBeforeThumb,
          compareAfterThumb: page.compareAfterThumb,
          compareBeforeUri: page.compareBeforeUri,
          compareAfterUri: page.compareAfterUri,
          compareHeroHeightRatio: page.compareHeroHeightRatio,
          compareHeroHeightMax: page.compareHeroHeightMax,
          compareHeroTopInset: page.compareHeroTopInset,
          heroHeightRatio: page.heroHeightRatio,
          heroHeightMax: page.heroHeightMax,
          secondaryHeroHeightRatio: page.secondaryHeroHeightRatio,
          secondaryHeroHeightMax: page.secondaryHeroHeightMax,
          heroStackGap: page.heroStackGap,
          heroCaptionGap: page.heroCaptionGap,
          heroTextGap: page.heroTextGap,
          secondaryStackGap: page.secondaryStackGap,
          heroPosition: page.heroPosition,
          compareBeforePosition: page.compareBeforePosition,
          compareAfterPosition: page.compareAfterPosition,
          secondaryHeroPosition: page.secondaryHeroPosition,
          tertiaryHeroPosition: page.tertiaryHeroPosition,
          heroFit: page.heroFit,
          introFullBleedPhoto: page.introFullBleedPhoto,
          introNoHero: page.introNoHero,
          introHeroAfterText: page.introHeroAfterText,
          introHeroBleedTop: page.introHeroBleedTop,
          introHeroInsetRounded: page.introHeroInsetRounded,
          introCompareRounded: page.introCompareRounded,
          introHeroSideBySide: page.introHeroSideBySide,
          sideBySideCellGap: page.sideBySideCellGap,
          sideBySideCenterOffsetTop: page.sideBySideCenterOffsetTop,
          sideBySideOuterFlex: page.sideBySideOuterFlex,
          sideBySideCenterFlex: page.sideBySideCenterFlex,
          sideBySideRowPaddingHorizontal: page.sideBySideRowPaddingHorizontal,
        });
        if (hasStoryQuiz && i + 2 === 7) {
          pages.push({ id: 'quiz', type: 'quiz' });
        }
      });
    } else if (introContinuation) {
      pages.push({ id: 'intro-2', type: 'intro', introPart: 2, body: introContinuation });
    }
    if (hasStoryQuiz && !pages.some((page) => page.id === 'quiz')) {
      pages.push({ id: 'quiz', type: 'quiz' });
    }
    postQuizSections.forEach((slide) => {
      pages.push({
        id: slide.sectionId,
        type: slide.sectionType === 'compare' ? 'compare' : 'fact',
        slide,
      });
    });
    return pages;
  }, [hasStoryQuiz, postQuizSections, introContinuation, introPages]);
  const slideScripts = useMemo(
    () => buildSlideAudioScripts(pageSections, fullBodyText),
    [pageSections, fullBodyText],
  );
  const currentPage = pageSections[activeSectionIndex] || pageSections[0];
  const heroPhotoSource = useMemo(() => {
    if (currentPage?.type === 'intro' && currentPage.introPart > 1) {
      if (currentPage.introNoHero) return null;
      const fromPage = resolveLandmarkHeroPhotoSource({
        photoAsset: currentPage.photoAsset,
        photoUri: currentPage.photoUri,
        heroThumb: currentPage.heroThumb,
      });
      if (fromPage) return fromPage;
      if (catalogLandmark) {
        const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
        const storyKey = langUk ? 'introPagesUk' : 'introPagesEn';
        const storyPage = catalogLandmark?.story?.[storyKey]?.[currentPage.introPart - 2];
        const storyThumb =
          typeof storyPage?.heroThumb === 'string' ? storyPage.heroThumb.trim() : '';
        const storyAsset = resolveHeroThumbRef(storyThumb);
        if (typeof storyAsset === 'number') return storyAsset;
      }
      if (catalogLandmark) return resolveLandmarkHeroPhotoSourceFromLandmark(catalogLandmark);
    }
    return defaultHeroPhotoSource;
  }, [currentPage, defaultHeroPhotoSource, catalogLandmark, language]);
  const secondaryHeroPhotoSource = useMemo(() => {
    if (currentPage?.type !== 'intro' || !(currentPage.introPart > 1)) return null;
    if (typeof currentPage.secondaryPhotoAsset === 'number') return currentPage.secondaryPhotoAsset;
    const secondaryHeroThumb =
      typeof currentPage.secondaryHeroThumb === 'string' ? currentPage.secondaryHeroThumb.trim() : '';
    const thumbAsset = resolveHeroThumbRef(secondaryHeroThumb);
    if (typeof thumbAsset === 'number') return thumbAsset;
    return null;
  }, [currentPage]);
  const introPrimaryPhotoSource = heroPhotoSource;
  const introSecondaryPhotoSource = secondaryHeroPhotoSource;
  const tertiaryHeroPhotoSource = useMemo(() => {
    if (currentPage?.type !== 'intro' || !(currentPage.introPart > 1)) return null;
    if (typeof currentPage.tertiaryPhotoAsset === 'number') return currentPage.tertiaryPhotoAsset;
    const tertiaryHeroThumb =
      typeof currentPage.tertiaryHeroThumb === 'string' ? currentPage.tertiaryHeroThumb.trim() : '';
    const thumbAsset = resolveHeroThumbRef(tertiaryHeroThumb);
    if (typeof thumbAsset === 'number') return thumbAsset;
    return null;
  }, [currentPage]);
  const introTertiaryPhotoSource = tertiaryHeroPhotoSource;
  const currentIllustration = useMemo(() => {
    if (currentPage?.type !== 'intro' || !(currentPage.introPart > 1)) return null;
    if (typeof currentPage.illustrationAsset !== 'number') return null;
    return {
      asset: currentPage.illustrationAsset,
      link: String(currentPage.illustrationLink || '').trim(),
      caption: String(currentPage.illustrationCaption || '').trim(),
    };
  }, [currentPage]);
  const currentIntroCompare = useMemo(() => {
    if (currentPage?.type !== 'intro' || !(currentPage.introPart > 1)) return null;
    const beforeThumb =
      typeof currentPage.compareBeforeThumb === 'string' ? currentPage.compareBeforeThumb.trim() : '';
    const afterThumb =
      typeof currentPage.compareAfterThumb === 'string' ? currentPage.compareAfterThumb.trim() : '';
    const beforeAsset =
      typeof currentPage.compareBeforeAsset === 'number'
        ? currentPage.compareBeforeAsset
        : resolveHeroThumbRef(beforeThumb);
    const afterAsset =
      typeof currentPage.compareAfterAsset === 'number'
        ? currentPage.compareAfterAsset
        : resolveHeroThumbRef(afterThumb);
    const beforeUri = typeof currentPage.compareBeforeUri === 'string' ? currentPage.compareBeforeUri.trim() : '';
    const afterUri = typeof currentPage.compareAfterUri === 'string' ? currentPage.compareAfterUri.trim() : '';
    if (!(beforeAsset && afterAsset) && !(beforeUri && afterUri)) return null;
    return {
      beforeAsset,
      afterAsset,
      beforeUri,
      afterUri,
      beforePosition:
        currentPage.compareBeforePosition && typeof currentPage.compareBeforePosition === 'object'
          ? currentPage.compareBeforePosition
          : null,
      afterPosition:
        currentPage.compareAfterPosition && typeof currentPage.compareAfterPosition === 'object'
          ? currentPage.compareAfterPosition
          : null,
    };
  }, [currentPage]);
  const introCompareLayout = useMemo(() => {
    if (!currentIntroCompare) return null;
    const ratio = Number(currentPage?.compareHeroHeightRatio);
    const maxH = Number(currentPage?.compareHeroHeightMax);
    const heightRatio =
      Number.isFinite(ratio) && ratio > 0 ? ratio : INTRO_COMPARE_HEIGHT_RATIO;
    const heightMax =
      Number.isFinite(maxH) && maxH > 0 ? maxH : INTRO_COMPARE_HEIGHT_MAX;
    const topInsetRaw = Number(currentPage?.compareHeroTopInset);
    const topInset =
      Number.isFinite(topInsetRaw) && topInsetRaw > 0 ? Math.round(topInsetRaw) : 0;
    return {
      topInset,
      height: Math.min(
        heightMax,
        Math.max(260, Math.round(winH * heightRatio)),
      ),
      horizontalPad: INTRO_COMPARE_HPAD,
    };
  }, [
    currentIntroCompare,
    currentPage?.compareHeroHeightRatio,
    currentPage?.compareHeroHeightMax,
    currentPage?.compareHeroTopInset,
    winH,
  ]);
  const introSubPageHeroHeight = useMemo(() => {
    if (currentPage?.type !== 'intro' || !(currentPage.introPart > 1)) return null;
    if (currentIntroCompare || !introPrimaryPhotoSource) return null;
    const ratioRaw = Number(currentPage?.heroHeightRatio);
    const maxRaw = Number(currentPage?.heroHeightMax);
    const ratio =
      Number.isFinite(ratioRaw) && ratioRaw > 0 ? ratioRaw : INTRO_SUB_HERO_HEIGHT_RATIO;
    const maxH = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 540;
    const minH = currentPage?.introHeroSideBySide ? 200 : 320;
    return Math.min(maxH, Math.max(minH, Math.round(winH * ratio)));
  }, [currentPage, currentIntroCompare, introPrimaryPhotoSource, winH]);
  const introHeroTopInset = introCompareLayout?.topInset ?? 0;
  const introHeroHeight = useMemo(() => {
    if (introCompareLayout) return introCompareLayout.height;
    if (introSubPageHeroHeight) return introSubPageHeroHeight;
    if (currentIntroCompare) {
      return Math.min(Math.round(winH * 0.58), 600);
    }
    return smallHeroHeight;
  }, [introCompareLayout, introSubPageHeroHeight, currentIntroCompare, smallHeroHeight, winH]);
  const currentIntroBody = useMemo(() => {
    if (currentPage?.type !== 'intro') return '';
    if (currentPage.introPart > 1) return String(currentPage.body || '').trim();
    return fullBodyText;
  }, [currentPage, fullBodyText]);
  const currentIntroBodyAfter = useMemo(() => {
    if (currentPage?.type !== 'intro' || !(currentPage.introPart > 1)) return '';
    return String(currentPage.bodyAfterHero || '').trim();
  }, [currentPage]);
  const isIntroSubPage = currentPage?.type === 'intro' && currentPage?.introPart > 1;
  const isIntroFullBleedPhotoPage =
    currentPage?.type === 'intro' && currentPage.introFullBleedPhoto === true;
  const isIntroHeroAfterTextPage =
    currentPage?.type === 'intro' && currentPage.introHeroAfterText === true;
  const isIntroHeroBleedTopPage =
    currentPage?.type === 'intro' && currentPage.introHeroBleedTop === true;
  const isIntroCompareRoundedPage =
    currentPage?.type === 'intro' &&
    !!currentIntroCompare &&
    currentPage.introCompareRounded === true;
  const isIntroIllustrationPage =
    currentPage?.type === 'intro' && !!currentIllustration;
  const isIntroHeroSideBySidePage =
    currentPage?.type === 'intro' &&
    currentPage.introHeroSideBySide === true &&
    !!introPrimaryPhotoSource &&
    !!introSecondaryPhotoSource &&
    !currentIntroCompare;
  const isIntroHeroInsetRoundedPage =
    currentPage?.type === 'intro' && currentPage.introHeroInsetRounded === true;
  const isIntroHeroInsetRoundedHeroFirstPage =
    isIntroHeroInsetRoundedPage && !isIntroHeroAfterTextPage;
  const isIntroNoHeroPage =
    currentPage?.type === 'intro' && currentPage.introNoHero === true;
  const introScrollTopPad =
    isIntroSubPage && isIntroHeroBleedTopPage && !isIntroNoHeroPage
      ? 0
      : isIntroSubPage &&
          (isIntroCompareRoundedPage ||
            isIntroIllustrationPage ||
            isIntroHeroInsetRoundedHeroFirstPage)
        ? Math.max(
            insets.top + (isIntroHeroSideBySidePage ? 74 : 66),
            isIntroHeroSideBySidePage ? 90 : 82,
          )
        : isIntroSubPage && isIntroHeroAfterTextPage
          ? Math.max(insets.top + 72, 88)
          : isIntroSubPage
            ? introHeaderClearance
            : 0;
  const isIntroFirstPage = currentPage?.type === 'intro' && Number(currentPage?.introPart || 1) === 1;
  useEffect(() => {
    isIntroFirstPageRef.current = isIntroFirstPage;
  }, [isIntroFirstPage]);
  useEffect(() => {
    currentPageTypeRef.current = currentPage?.type || 'intro';
  }, [currentPage?.type]);
  const introScrollBottomPad = Math.max(insets.bottom + 88, 112);
  const quizHeaderClearance = Math.max(insets.top + 68, 84);
  const quizScrollBottomPad = Math.max(insets.bottom + 88, 108);
  const quizViewportMinHeight = useMemo(
    () => Math.max(320, Math.round(winH - quizScrollBottomPad - quizHeaderClearance)),
    [winH, quizScrollBottomPad, quizHeaderClearance],
  );
  const sectionDotCount = pageSections.length;
  const fullReadScrollRef = useRef(null);
  const introPageScrollRef = useRef(null);
  const quizPageScrollRef = useRef(null);
  const fullReadScrollYRef = useRef(0);
  const introScrollYRef = useRef(0);
  const isIntroFirstPageRef = useRef(false);
  const currentPageTypeRef = useRef('intro');
  const introPullDismissArmedRef = useRef(false);
  /** true лише поки палець на екрані — щоб вихід давав свідоме протягування, а не інерційний відскок. */
  const introScrollDraggingRef = useRef(false);
  const [fullReadScrollY, setFullReadScrollY] = useState(0);
  const introSectionYRef = useRef(0);
  const introSectionHRef = useRef(0);
  const quizSectionYRef = useRef(0);
  const quizSectionHRef = useRef(0);
  const factSectionsRef = useRef({});
  const fullReadViewportHRef = useRef(0);
  const fullReadContentHRef = useRef(0);

  const audioScriptText = useMemo(
    () => resolveLandmarkAudioScript(route, language),
    [
      language,
      route?.params?.audioScriptUk,
      route?.params?.audioScriptEn,
      route?.params?.visitLandmarkSave?.landmarkId,
      route?.params?.visitLandmarkSave?.regionId,
    ],
  );
  const textForTts = useMemo(() => {
    if (audioScriptText) return audioScriptText;
    return phase === 'mini' ? (miniExtract || extract) : fullBodyText;
  }, [audioScriptText, phase, miniExtract, extract, fullBodyText]);
  const shortNarrationFallback = useMemo(() => {
    const short = (phase === 'mini' ? miniExtract || extract : extract || miniExtract) || '';
    return String(short).trim();
  }, [phase, miniExtract, extract]);
  const miniAudioText = useMemo(
    () => String(miniExtract || extract || audioScriptText || '').trim(),
    [miniExtract, extract, audioScriptText],
  );
  const hasSlideAudioguide = useMemo(
    () =>
      slideScripts.some((entry) => entry.text) ||
      (phase === 'mini' && !!miniAudioText),
    [slideScripts, phase, miniAudioText],
  );

  useEffect(() => {
    ensureLandmarkAudioPlayer();
    void setAudioModeAsync(APP_PLAYBACK_AUDIO_MODE).catch(() => {});
    void pickBestVoiceIdentifier(Speech, ttsLocaleForContent(language));
    if (audioGuideUrl) void prefetchAudioGuideUrl(audioGuideUrl);
  }, [ensureLandmarkAudioPlayer, audioGuideUrl, language]);

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

  const runLandmarkNarration = useCallback(
    async (text) => {
      const primary = String(text || '').trim();
      const fallbackTexts =
        shortNarrationFallback && shortNarrationFallback !== primary
          ? [shortNarrationFallback]
          : [];
      return startLandmarkNarration({
        Speech,
        text: primary,
        fallbackTexts,
        appLanguage: language,
        playFileAudio: playLocalAudioUri,
        callbacks: {
          onDone: () => setSpeaking(false),
          onStopped: () => setSpeaking(false),
          onError: () => setSpeaking(false),
        },
      });
    },
    [language, playLocalAudioUri, shortNarrationFallback],
  );

  const toggleSpeechLegacy = useCallback(async () => {
    const filePlaying = fileAudioActiveRef.current || !!audioPlayerRef.current?.playing;
    if (audioGuideUrl) {
      if (filePlaying) {
        await stopFileAudio();
        setSpeaking(false);
        return;
      }
      Speech.stop();
      setSpeaking(true);
      try {
        const localUri = await getCachedOrRemoteAudioUri(audioGuideUrl);
        await playLocalAudioUri(localUri);
      } catch (e) {
        setSpeaking(false);
        await stopFileAudio();
        const t = (textForTts || '').trim();
        if (t) {
          try {
            const mode = await runLandmarkNarration(t);
            if (mode) return;
          } catch (fallbackErr) {
            if (__DEV__) console.warn('[audioGuide] tts fallback', fallbackErr?.message);
          }
        }
        if (__DEV__) console.warn('[audioGuide]', e?.message);
        Alert.alert('', ls(language, 'audioGuideError'));
      }
      return;
    }

    const t = (textForTts || '').trim();
    if (!t) return;
    const on = await Speech.isSpeakingAsync();
    if (on || filePlaying) {
      Speech.stop();
      await stopFileAudio();
      setSpeaking(false);
      return;
    }

    setSpeaking(true);
    try {
      const mode = await runLandmarkNarration(t);
      if (!mode) {
        Alert.alert('', ls(language, 'audioGuideError'));
      }
    } catch (e) {
      setSpeaking(false);
      await stopFileAudio();
      if (__DEV__) console.warn('[audioGuide]', e?.message);
      Alert.alert('', ls(language, 'audioGuideError'));
    }
  }, [audioGuideUrl, language, playLocalAudioUri, runLandmarkNarration, stopFileAudio, textForTts]);

  const resetMiniSheetDrag = useCallback(() => {
    miniSheetDragY.stopAnimation();
    miniSheetDragX.stopAnimation();
    miniSheetDragY.setValue(0);
    miniSheetDragX.setValue(0);
  }, [miniSheetDragY, miniSheetDragX]);

  const openFull = useCallback(() => {
    if (phase !== 'mini') return;
    resetMiniSheetDrag();
    setPhase('full');
  }, [phase, resetMiniSheetDrag]);

  const finishMiniSheetOpenVertical = useCallback(() => {
    miniSheetDragX.setValue(0);
    miniSheetDragY.stopAnimation();
    Animated.timing(miniSheetDragY, {
      toValue: -Math.max(winH * 0.92, 480),
      duration: 240,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      resetMiniSheetDrag();
      setPhase('full');
    });
  }, [miniSheetDragY, winH, resetMiniSheetDrag]);

  const finishMiniSheetOpenHorizontal = useCallback(() => {
    miniSheetDragY.setValue(0);
    miniSheetDragX.stopAnimation();
    Animated.timing(miniSheetDragX, {
      toValue: -Math.max(winW * 1.05, 360),
      duration: 240,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      resetMiniSheetDrag();
      setPhase('full');
    });
  }, [miniSheetDragX, winW, resetMiniSheetDrag]);

  const finishMiniSheetOpenVerticalRef = useRef(finishMiniSheetOpenVertical);
  const finishMiniSheetOpenHorizontalRef = useRef(finishMiniSheetOpenHorizontal);
  useEffect(() => {
    finishMiniSheetOpenVerticalRef.current = finishMiniSheetOpenVertical;
    finishMiniSheetOpenHorizontalRef.current = finishMiniSheetOpenHorizontal;
  }, [finishMiniSheetOpenVertical, finishMiniSheetOpenHorizontal]);

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
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useLayoutEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    navigation.setOptions({
      gestureEnabled: false,
      fullScreenGestureEnabled: false,
    });
    return undefined;
  }, [navigation]);

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
      introScrollYRef.current = 0;
      setActiveSectionIndex(next);
      return true;
    },
    [pageSections.length],
  );

  const onAudioguideError = useCallback(() => {
    Alert.alert('', ls(language, 'audioGuideError'));
  }, [language]);

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
    await toggleSpeechLegacy();
  }, [hasSlideAudioguide, slideAudioguide, toggleSpeechLegacy]);

  useEffect(() => {
    setSpeaking(slideAudioguide.isSpeaking);
  }, [slideAudioguide.isSpeaking]);

  useEffect(() => {
    if (!slideAudioguide.isPaused || phase === 'mini') return;
    slideAudioguide.syncPausedIndex(activeSectionIndex);
  }, [activeSectionIndex, slideAudioguide.isPaused, phase, slideAudioguide.syncPausedIndex]);

  const audioFabIcon = slideAudioguide.isSpeaking
    ? 'pause'
    : slideAudioguide.isPaused
      ? 'play'
      : speaking
        ? 'pause'
        : 'headset';
  const audioFabActive = slideAudioguide.isSpeaking || slideAudioguide.isPaused || speaking;

  const showAudioControls =
    hasSlideAudioguide && slideAudioguide.isActive && phase === 'full' && pageSections.length > 1;

  const goToSectionIndexWithAudio = useCallback(
    (index) => {
      if (slideAudioguide.isActive) {
        void slideAudioguide.seekToSlide(index);
        return;
      }
      goToSectionIndex(index);
    },
    [slideAudioguide, goToSectionIndex],
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

  const quizHasNextSection = useMemo(() => {
    const quizIdx = pageSections.findIndex((p) => p.id === 'quiz');
    return quizIdx >= 0 && quizIdx < pageSections.length - 1;
  }, [pageSections]);

  const handleQuizContinue = useCallback(() => {
    goToAdjacentSection(1);
  }, [goToAdjacentSection]);

  const scrollQuizIntoView = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        quizPageScrollRef.current?.scrollToEnd({ animated: true });
      });
    });
  }, []);

  const headerDotsContent =
    phase === 'full' && sectionDotCount > 1 ? (
      <View style={styles.headerPagerDots}>
        {Array.from({ length: sectionDotCount }).map((_, idx) => (
          <Pressable
            key={`dot-${idx}`}
            onPress={() => goToSectionIndexWithAudio(idx)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${idx + 1} / ${sectionDotCount}`}
          >
            <View
              style={[
                styles.headerPagerDot,
                {
                  backgroundColor:
                    idx === activeSectionIndex ? accent : isLight ? 'rgba(2,18,235,0.24)' : 'rgba(225,255,0,0.24)',
                  opacity: idx === activeSectionIndex ? 1 : 0.55,
                },
              ]}
            />
          </Pressable>
        ))}
      </View>
    ) : null;

  /** На повному екрані: попередня секція пейджера або mini / goBack — не одразу на головну. */
  const handleFullPhaseStepBack = useCallback(() => {
    const current = Number.isFinite(activeSectionIndexRef.current)
      ? activeSectionIndexRef.current
      : activeSectionIndex;
    if (current > 0) {
      goToAdjacentSection(-1);
      return;
    }
    onBackRef.current();
  }, [activeSectionIndex, goToAdjacentSection]);
  const handleFullPhaseStepBackRef = useRef(handleFullPhaseStepBack);
  useEffect(() => {
    handleFullPhaseStepBackRef.current = handleFullPhaseStepBack;
  }, [handleFullPhaseStepBack]);

  const handleLandmarkPagerSwipe = useCallback(
    (dx) => {
      const current = Number.isFinite(activeSectionIndexRef.current)
        ? activeSectionIndexRef.current
        : activeSectionIndex;
      const maxIdx = Math.max(0, pageSections.length - 1);
      if (dx < 0) {
        if (current < maxIdx) goToAdjacentSection(1);
        return;
      }
      handleFullPhaseStepBackRef.current();
    },
    [activeSectionIndex, goToAdjacentSection, pageSections.length],
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

  const openIntroPhotoLightbox = useCallback((source, caption = '') => {
    if (!source) return;
    setIntroPhotoLightbox({
      source,
      caption: String(caption || '').trim(),
    });
  }, []);

  useEffect(() => {
    setIntroPhotoLightbox(null);
    setCompareDragLock(false);
    introPullDismissArmedRef.current = false;
    introScrollDraggingRef.current = false;
    introScrollYRef.current = 0;
    requestAnimationFrame(() => {
      introPageScrollRef.current?.scrollTo({ y: 0, animated: false });
    });
  }, [activeSectionIndex]);

  useEffect(() => {
    factSectionsRef.current = {};
    introSectionYRef.current = 0;
    introSectionHRef.current = 0;
    quizSectionYRef.current = 0;
    quizSectionHRef.current = 0;
    activeSectionIndexRef.current = 0;
    introScrollYRef.current = 0;
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

  const miniPhasePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => {
          if (phase !== 'mini' || paramsMenuOpen) return false;
          const ax = Math.abs(g.dx);
          const ay = Math.abs(g.dy);
          return (
            (g.dy < -4 && ay > ax * 0.45) ||
            (g.dx < -4 && ax > ay * 0.45) ||
            (g.dx > 4 && ax > ay * 0.45)
          );
        },
        onMoveShouldSetPanResponder: (_, g) => {
          if (phase !== 'mini' || paramsMenuOpen) return false;
          const ax = Math.abs(g.dx);
          const ay = Math.abs(g.dy);
          return (
            (g.dy < -3 && ay > ax * 0.45) ||
            (g.dx < -3 && ax > ay * 0.45) ||
            (g.dx > 3 && ax > ay * 0.45)
          );
        },
        onPanResponderTerminationRequest: () => miniDragAxisRef.current == null,
        onPanResponderGrant: () => {
          miniDragAxisRef.current = null;
        },
        onPanResponderMove: (_, g) => {
          const ax = Math.abs(g.dx);
          const ay = Math.abs(g.dy);
          if (!miniDragAxisRef.current) {
            if (g.dy < -MINI_SHEET_AXIS_LOCK_PX && ay >= ax * 0.55) {
              miniDragAxisRef.current = 'up';
            } else if (g.dx < -MINI_SHEET_AXIS_LOCK_PX && ax >= ay * 0.55) {
              miniDragAxisRef.current = 'left';
            } else if (g.dx > MINI_SHEET_AXIS_LOCK_PX && ax >= ay * 0.55) {
              miniDragAxisRef.current = 'back';
            }
          }
          const axis = miniDragAxisRef.current;
          if (axis === 'up') {
            miniSheetDragX.setValue(0);
            miniSheetDragY.setValue(Math.min(0, g.dy));
            return;
          }
          if (axis === 'left') {
            miniSheetDragY.setValue(0);
            miniSheetDragX.setValue(Math.min(0, g.dx));
          }
        },
        onPanResponderRelease: (_, g) => {
          const axis = miniDragAxisRef.current;
          miniDragAxisRef.current = null;
          if (axis === 'up' && (g.dy < -MINI_SHEET_OPEN_DRAG_PX || g.vy < MINI_SHEET_OPEN_VY)) {
            finishMiniSheetOpenVerticalRef.current();
            return;
          }
          if (axis === 'left' && (g.dx < -MINI_SHEET_OPEN_DRAG_PX || g.vx < MINI_SHEET_OPEN_VX)) {
            finishMiniSheetOpenHorizontalRef.current();
            return;
          }
          if (axis === 'back' && (g.dx > MINI_SHEET_OPEN_DRAG_PX || g.vx > MINI_SHEET_BACK_VX)) {
            onBackRef.current();
            return;
          }
          Animated.parallel([
            Animated.spring(miniSheetDragY, {
              toValue: 0,
              useNativeDriver: true,
              damping: 22,
              stiffness: 280,
            }),
            Animated.spring(miniSheetDragX, {
              toValue: 0,
              useNativeDriver: true,
              damping: 22,
              stiffness: 280,
            }),
          ]).start();
        },
      }),
    [phase, paramsMenuOpen, miniSheetDragY, miniSheetDragX],
  );

  const onIntroScroll = useCallback((e) => {
    const y = Number(e?.nativeEvent?.contentOffset?.y);
    const rawY = Number.isFinite(y) ? y : 0;
    introScrollYRef.current = Math.max(0, rawY);
    if (
      isIntroFirstPageRef.current &&
      introScrollDraggingRef.current &&
      rawY < -LANDMARK_SCROLL_PULL_DISMISS_PX &&
      !introPullDismissArmedRef.current
    ) {
      introPullDismissArmedRef.current = true;
      handleFullPhaseStepBackRef.current();
    }
  }, []);

  const onIntroScrollBeginDrag = useCallback(() => {
    introScrollDraggingRef.current = true;
  }, []);

  const onIntroScrollEnd = useCallback(() => {
    introScrollDraggingRef.current = false;
    introPullDismissArmedRef.current = false;
  }, []);

  const introScrollProps = useMemo(
    () =>
      isIntroFirstPage
        ? {
            onScroll: onIntroScroll,
            onScrollBeginDrag: onIntroScrollBeginDrag,
            onScrollEndDrag: onIntroScrollEnd,
            onMomentumScrollEnd: onIntroScrollEnd,
            scrollEventThrottle: 16,
          }
        : {},
    [isIntroFirstPage, onIntroScroll, onIntroScrollBeginDrag, onIntroScrollEnd],
  );

  const fullBackPanResponder = useMemo(
    () =>
      createLandmarkPagerPanResponder({
        enabled: phase === 'full' && !paramsMenuOpen,
        preferVerticalScroll: () => {
          const t = currentPageTypeRef.current;
          return t === 'intro' || t === 'quiz';
        },
        canSwipeDown: () => isIntroFirstPageRef.current && introScrollYRef.current <= 32,
        onSwipeDown: () => handleFullPhaseStepBackRef.current(),
        canSwipeUp: () => isIntroFirstPageRef.current && introScrollYRef.current <= 32,
        onSwipeUp: () => handleFullPhaseStepBackRef.current(),
        onSwipeLeft: () => handleLandmarkPagerSwipe(-1),
        onSwipeRight: () => handleLandmarkPagerSwipe(1),
      }),
    [phase, paramsMenuOpen, handleLandmarkPagerSwipe],
  );

  const fullBackSwipeHandlers =
    paramsMenuOpen ? {} : fullBackPanResponder?.panHandlers || {};
  const landmarkSwipeHandlers =
    paramsMenuOpen ? {} : fullBackSwipeHandlers;
  const miniPhaseSwipeHandlers = paramsMenuOpen ? {} : miniPhasePanResponder.panHandlers;

  const paramMenuSheetHRef = useRef(360);
  const paramMenuDragY = useRef(new Animated.Value(0)).current;

  const dismissParamsMenu = useCallback(() => {
    paramMenuDragY.stopAnimation();
    paramMenuDragY.setValue(0);
    setParamsMenuOpen(false);
  }, [paramMenuDragY]);
  const dismissParamsMenuRef = useRef(dismissParamsMenu);
  useEffect(() => {
    dismissParamsMenuRef.current = dismissParamsMenu;
  }, [dismissParamsMenu]);

  const finishDismissParamsMenu = useCallback(() => {
    const travel = Math.max(paramMenuSheetHRef.current, 280);
    paramMenuDragY.stopAnimation();
    Animated.timing(paramMenuDragY, {
      toValue: travel,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      dismissParamsMenuRef.current();
    });
  }, [paramMenuDragY]);
  const finishDismissParamsMenuRef = useRef(finishDismissParamsMenu);
  useEffect(() => {
    finishDismissParamsMenuRef.current = finishDismissParamsMenu;
  }, [finishDismissParamsMenu]);

  const requestDismissParamsMenu = useCallback(() => {
    finishDismissParamsMenuRef.current();
  }, []);

  useEffect(() => {
    if (!paramsMenuOpen) return undefined;
    const travel = Math.min(winH * 0.55, 460);
    paramMenuDragY.setValue(travel);
    Animated.spring(paramMenuDragY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 26,
      stiffness: 240,
      mass: 0.9,
    }).start();
    return undefined;
  }, [paramsMenuOpen, paramMenuDragY, winH]);

  useEffect(() => {
    if (!paramsMenuOpen) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      requestDismissParamsMenu();
      return true;
    });
    return () => sub.remove();
  }, [paramsMenuOpen, requestDismissParamsMenu]);

  const paramMenuBackdropOpacity = useMemo(
    () =>
      paramMenuDragY.interpolate({
        inputRange: [0, 460],
        outputRange: [0.45, 0],
        extrapolate: 'clamp',
      }),
    [paramMenuDragY],
  );

  const paramMenuSheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_, g) => g.dy > 2 && g.dy >= Math.abs(g.dx) * 0.85,
        onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 4 && g.dy > Math.abs(g.dx),
        onPanResponderTerminationRequest: (_, g) => !(g.dy > 4 && g.dy > Math.abs(g.dx)),
        onPanResponderMove: (_, g) => {
          paramMenuDragY.setValue(Math.max(0, g.dy));
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > PARAM_MENU_DISMISS_DRAG_PX || g.vy > 0.24) {
            finishDismissParamsMenuRef.current();
            return;
          }
          Animated.spring(paramMenuDragY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 22,
            stiffness: 280,
          }).start();
        },
      }),
    [paramMenuDragY],
  );

  const onMoreMenu = useCallback(() => {
    if (paramsMenuOpen) {
      finishDismissParamsMenuRef.current();
      return;
    }
    setParamsMenuOpen(true);
  }, [paramsMenuOpen]);

  const openMapsRoute = useCallback(() => {
    const url =
      visitLat != null && visitLng != null
        ? `https://www.google.com/maps/dir/?api=1&destination=${visitLat},${visitLng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(headerTitle)}`;
    Linking.openURL(url).catch(() => {});
  }, [visitLat, visitLng, headerTitle]);

  const onParamPostStory = useCallback(async () => {
    dismissParamsMenu();
    let u = routeUser || authStoreUser;
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
    shellPush(
      'FeedCamera',
      {
        user: u,
        publishVisibility: 'public',
        cameraInitialMode: 'post',
        ...(countryIdParam != null ? { countryId: countryIdParam } : {}),
        ...(visitLat != null && visitLng != null
          ? { pickedLat: visitLat, pickedLng: visitLng, pickedLabel: headerTitle }
          : {}),
      },
      appTheme,
    );
    void useAuthStore.getState().hydrate();
  }, [
    dismissParamsMenu,
    routeUser,
    authStoreUser,
    language,
    appTheme,
    countryIdParam,
    visitLat,
    visitLng,
    headerTitle,
  ]);

  const onParamSave = useCallback(async () => {
    dismissParamsMenu();
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
  }, [dismissParamsMenu, visitLandmarkSave, language]);

  const onParamSharePublication = useCallback(() => {
    dismissParamsMenu();
    const body = fullBodyText || shareBody;
    runAfterParamMenuDismiss(() => {
      void shareLandmarkPublication({
        language,
        headerTitle,
        subtitle,
        body,
      });
    });
  }, [dismissParamsMenu, headerTitle, subtitle, fullBodyText, shareBody, language]);

  const onParamShareLocation = useCallback(() => {
    dismissParamsMenu();
    const { lat, lng } = shareLocationCoords;
    runAfterParamMenuDismiss(() => {
      void shareLandmarkLocation({
        language,
        headerTitle,
        visitLat: lat,
        visitLng: lng,
      });
    });
  }, [dismissParamsMenu, shareLocationCoords, headerTitle, language]);

  const onParamReport = useCallback(() => {
    dismissParamsMenu();
    const { lat, lng } = shareLocationCoords;
    runAfterParamMenuDismiss(() => {
      void reportLandmarkIssue({
        language,
        headerTitle,
        subtitle,
        landmarkKey: quizLandmarkKey,
        visitLat: lat,
        visitLng: lng,
      });
    });
  }, [
    dismissParamsMenu,
    language,
    headerTitle,
    subtitle,
    quizLandmarkKey,
    shareLocationCoords,
  ]);

  const onParamRoute = useCallback(() => {
    dismissParamsMenu();
    const langUk = String(language || 'uk').split(/[-_]/)[0].toLowerCase() === 'uk';
    let point = null;

    if (visitLandmarkSave?.regionId && visitLandmarkSave?.landmarkId) {
      const lm = getLandmarkInRegion(visitLandmarkSave.regionId, visitLandmarkSave.landmarkId);
      const region = getRegion(visitLandmarkSave.regionId);
      if (lm && Number.isFinite(lm.lat) && Number.isFinite(lm.lng)) {
        point = {
          id: String(lm.id),
          title: landmarkTitle(lm, langUk),
          city: region ? (langUk ? region.titleUk : region.titleEn) : '',
          country: region?.flag || '',
          category: lm.category || 'other',
          lat: lm.lat,
          lng: lm.lng,
        };
      }
    } else if (visitLat != null && visitLng != null) {
      point = {
        id: visitSaveKey || `pin_${visitLat}_${visitLng}`,
        title: String(headerTitle || title || '').trim(),
        city:
          (typeof route?.params?.visitCity === 'string' && route.params.visitCity.trim()) ||
          parseCityFromSubtitle(subtitle) ||
          '',
        country: '',
        category:
          typeof route?.params?.visitCategory === 'string' ? route.params.visitCategory : 'other',
        lat: visitLat,
        lng: visitLng,
        ...(typeof route?.params?.photoUri === 'string' && route.params.photoUri.trim()
          ? { cover_image_url: route.params.photoUri.trim() }
          : {}),
      };
    }

    if (point) {
      navigation.navigate(HOME_TAB_ROUTE, {
        user: routeUser || authStoreUser,
        language,
        appTheme,
        ...(countryIdParam != null ? { countryId: countryIdParam } : {}),
        tabIndex: HOME_TAB.MAP,
        routeFinderExtras: {
          mapInitialRoutePoint: point,
        },
      });
      return;
    }
    openMapsRoute();
  }, [
    dismissParamsMenu,
    visitLandmarkSave,
    visitLat,
    visitLng,
    visitSaveKey,
    headerTitle,
    title,
    subtitle,
    route?.params?.visitCity,
    route?.params?.visitCategory,
    route?.params?.photoUri,
    language,
    navigation,
    routeUser,
    authStoreUser,
    appTheme,
    countryIdParam,
    openMapsRoute,
  ]);

  const onParamWiki = useCallback(() => {
    dismissParamsMenu();
    if (wikipediaUrl) WebBrowser.openBrowserAsync(wikipediaUrl).catch(() => {});
  }, [dismissParamsMenu, wikipediaUrl]);

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
  const miniBodyUnlimited = !!explicitMiniExtract && !isHomeMiniPanel;
  const miniBodyLineLimit = isLavraHomeMini ? 3 : previewBodyLines;

  const paramMenuRipple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const paramRowLabelColor = isLight ? '#1E1E1E' : FIGMA_CREAM;
  const paramMenuSheetBg = isLight ? PARAM_MENU_SHEET_LIGHT : PARAM_MENU_SHEET_DARK;

  const landmarkParamsMenu = (
    <Modal
      visible={paramsMenuOpen}
      transparent
      animationType="fade"
      onRequestClose={requestDismissParamsMenu}
      statusBarTranslucent
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' } : {})}
    >
      <View style={styles.paramMenuModalRoot}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={requestDismissParamsMenu}
          accessibilityRole="button"
          accessibilityLabel={ls(language, 'goBack')}
        >
          <Animated.View
            style={[styles.paramMenuBackdropPress, { opacity: paramMenuBackdropOpacity }]}
            pointerEvents="none"
          />
        </Pressable>
        <Animated.View
          onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height);
            if (h > 0) paramMenuSheetHRef.current = h;
          }}
          style={[
            styles.paramMenuSheet,
            {
              backgroundColor: paramMenuSheetBg,
              paddingBottom: Math.max(insets.bottom, 16),
              transform: [{ translateY: paramMenuDragY }],
            },
          ]}
        >
          <View style={styles.paramMenuDragZone} {...paramMenuSheetPanResponder.panHandlers}>
            <View style={styles.paramMenuHandleWrap}>
              <View
                style={[
                  styles.paramMenuHandle,
                  isLight ? styles.paramMenuHandleLight : styles.paramMenuHandleDark,
                ]}
              />
            </View>
            <Text style={[styles.paramMenuTitle, brandFontHeadMedium, { color: paramRowLabelColor }]}>
              {ls(language, 'paramMenuTitle')}
            </Text>
          </View>
          <View style={styles.paramMenuRows}>
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
          </View>
        </Animated.View>
      </View>
    </Modal>
  );

  if (phase === 'mini') {
    const miniHeroFrameStyle = { width: winW, height: winH };
    const miniHeroContentPosition =
      homeHeroLayout.homeHeroContentFit === 'contain'
        ? 'center'
        : homeHeroLayout.homeHeroContentPosition || 'center';
    const renderMiniHeroImage = (imageStyle, frameDims) => {
      const sizedStyle = frameDims ? [imageStyle, frameDims] : imageStyle;
      if (miniHeroUseRnImage) {
        return (
          <Image
            key={miniHeroImageKey}
            source={miniHeroPhotoSource}
            style={sizedStyle}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        );
      }
      return (
        <ExpoImage
          key={miniHeroImageKey}
          source={miniHeroExpoSource}
          style={sizedStyle}
          contentFit={homeHeroLayout.homeHeroContentFit || 'cover'}
          contentPosition={miniHeroContentPosition}
          cachePolicy="memory-disk"
          transition={0}
          allowDownscaling
          onError={onMiniHeroError}
          pointerEvents="none"
          accessibilityIgnoresInvertColors
        />
      );
    };

    return (
      <RenderProfiler id="LandmarkResultPage">
      <View style={styles.screen} {...miniPhaseSwipeHandlers}>
        {miniHeroPhotoSource ? (
          miniHeroClipHeight ? (
            <View
              style={[
                styles.heroClip,
                isLight && styles.heroClipLight,
                { height: miniHeroClipHeight },
              ]}
              pointerEvents="none"
            >
              {renderMiniHeroImage(styles.hero)}
            </View>
          ) : (
            <View style={styles.miniHeroFrame} pointerEvents="none">
              {renderMiniHeroImage(styles.miniHeroImage, miniHeroFrameStyle)}
            </View>
          )
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
            moreMenuOpen={paramsMenuOpen}
            bottomContent={headerDotsContent}
          />
        </View>
        <Animated.View
          style={[
            styles.miniBottomStack,
            isLight && styles.miniBottomStackLight,
            isLavraHomeMini ? { bottom: Math.max(insets.bottom, 10) } : null,
            {
              transform: [
                { translateY: Animated.add(miniPanelEnterY, miniSheetDragY) },
                { translateX: miniSheetDragX },
              ],
            },
          ]}
        >
          <View style={styles.miniFabStraddle} pointerEvents="box-none">
            <Pressable
              style={[
                styles.audioFabMini,
                isLight && styles.audioFabMiniLight,
                audioFabActive && styles.audioFabMiniActive,
                audioFabActive && isLight && styles.audioFabMiniActiveLight,
                audioFabActive && !isLight && { borderColor: accent, shadowColor: accent },
              ]}
              onPress={toggleSpeech}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={ls(language, 'audioGuide')}
            >
              <Ionicons
                name={audioFabIcon}
                size={audioFabActive ? 20 : 18}
                color={audioFabActive ? accent : isLight ? ACCENT_BLUE : '#1E1E1E'}
              />
            </Pressable>
          </View>
          <Animated.View
            style={[
              styles.miniSheet,
              isLight ? styles.miniSheetLight : styles.miniSheetShadowDark,
              !isLight && { borderWidth: 1, borderColor: accent },
              !isLight &&
                Platform.OS === 'ios' && {
                  shadowColor: accent,
                  shadowOffset: { width: 0, height: -6 },
                  shadowOpacity: 0.24,
                  shadowRadius: 18,
                },
              {
                maxHeight: miniSheetMaxH,
                paddingBottom: isLavraHomeMini
                  ? Math.max(insets.bottom + 4, 18)
                  : isLight
                    ? 16
                    : Math.max(insets.bottom, 16),
                marginBottom: isLavraHomeMini
                  ? Math.max(insets.bottom + 2, 12)
                  : isLight
                    ? Math.max(insets.bottom, 12)
                    : Math.max(insets.bottom, 8),
              },
            ]}
            accessibilityRole="adjustable"
            accessibilityLabel={ls(language, 'miniSwipeHint')}
          >
            {Platform.OS === 'ios' && !isLight ? (
              <BlurView intensity={68} tint="dark" style={StyleSheet.absoluteFill} />
            ) : null}
            <View
              style={[
                styles.miniSheetTint,
                isLight
                  ? styles.miniSheetTintLight
                  : { backgroundColor: 'rgba(22,22,22,0.84)' },
              ]}
            />
            {!isLight ? <View style={styles.miniSheetTopHighlight} pointerEvents="none" /> : null}
            <View style={styles.miniSheetInner}>
              <View style={styles.miniSheetHandleRow}>
                <View style={styles.miniSheetHandleHit} />
                <View
                  style={[
                    styles.miniSheetHandlePill,
                    isLight ? styles.miniSheetHandlePillLight : styles.miniSheetHandlePillDark,
                  ]}
                />
              </View>
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
                    : { numberOfLines: miniBodyLineLimit, ellipsizeMode: 'tail' })}
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
      </RenderProfiler>
    );
  }

  const introArticleBody = (
    <>
      {!isIntroSubPage ? (
        <>
          <Text
            style={[styles.title, styles.titleFigma, brandFontHeadMedium, { color: titleColor }]}
            {...LANDMARK_TITLE_SINGLE_LINE_PROPS}
          >
            {headerTitle}
          </Text>
          {sheetTagline ? (
            <View
              style={[
                styles.introTaglineBlock,
                { borderBottomColor: isLight ? 'rgba(2, 18, 235, 0.1)' : 'rgba(255,255,255,0.12)' },
              ]}
            >
              <Text
                style={[
                  styles.subtitle,
                  styles.fullReadSubtitle,
                  brandFontSans,
                  { color: isLight ? 'rgba(2, 18, 235, 0.72)' : subColor },
                ]}
              >
                {sheetTagline}
              </Text>
            </View>
          ) : null}
          {showSourceTag ? (
            <Text style={[styles.sourceTag, brandFontSansMedium, { color: accent }]}>{sourceLine}</Text>
          ) : null}
        </>
      ) : null}
      <LandmarkIntroFormattedBody
        text={currentIntroBody}
        isLight={isLight}
        accent={accent}
        titleColor={titleColor}
        bodyColor={bodyColor}
        bodyLinkColor={bodyLinkColor}
        emphasisColor={emphasisColor}
        brandFontSans={brandFontSans}
        brandFontHeadMedium={brandFontHeadMedium}
        leadOnly={isIntroSubPage}
        uniformParagraphs={isIntroSubPage}
        compactPreHero={isIntroSubPage && (isIntroHeroAfterTextPage || isIntroHeroSideBySidePage)}
        compactTop={isIntroHeroSideBySidePage}
      />
      {currentIllustration ? (
        <Pressable
          onPress={() =>
            openIntroPhotoLightbox(currentIllustration.asset, currentIllustration.caption)
          }
          style={styles.introIllustrationLinkWrap}
          android_ripple={isLight ? rippleOnLightSurface : rippleOnDarkSurface}
        >
          <Text style={[styles.introIllustrationLinkText, brandFontSansMedium, { color: accent }]}>
            {currentIllustration.link ||
              (language === 'uk' ? 'Подивитися, як це могло виглядати' : 'See how it might have looked')}
          </Text>
          {currentIllustration.caption ? (
            <Text style={[styles.introIllustrationCaption, brandFontSans, { color: bodyColor }]}>
              {currentIllustration.caption}
            </Text>
          ) : null}
        </Pressable>
      ) : null}
      {!isIntroSubPage && wikipediaUrl ? (
        <AuthStylePrimaryCta
          onPress={openWiki}
          label={ls(language, 'more')}
          isLight={isLight}
          androidRipple={isLight ? rippleOnLightSurface : rippleOnDarkSurface}
        />
      ) : null}
    </>
  );

  const introHeroCard = (variant = 'primary') => {
    const source = variant === 'secondary' ? introSecondaryPhotoSource : introPrimaryPhotoSource;
    const secondaryRatioRaw = Number(currentPage?.secondaryHeroHeightRatio);
    const secondaryMaxRaw = Number(currentPage?.secondaryHeroHeightMax);
    const height =
      variant === 'secondary'
        ? Number.isFinite(secondaryRatioRaw) && secondaryRatioRaw > 0
          ? Math.min(
              Number.isFinite(secondaryMaxRaw) && secondaryMaxRaw > 0 ? secondaryMaxRaw : 420,
              Math.max(200, Math.round(winH * secondaryRatioRaw)),
            )
          : Math.min(420, Math.max(260, Math.round(winH * 0.44)))
        : introHeroHeight;
    if (!source && variant === 'secondary') return null;
    const heroPosition = resolveHeroPosition(currentPage, variant);
    const heroFit =
      variant === 'secondary'
        ? 'cover'
        : typeof currentPage?.heroFit === 'string' && currentPage.heroFit.trim()
          ? currentPage.heroFit.trim()
          : 'cover';
    const heroCaption =
      variant === 'secondary'
        ? String(currentPage?.secondaryHeroCaption || '').trim()
        : String(currentPage?.heroCaption || '').trim();
    const stackGapRaw =
      variant === 'secondary'
        ? Number(currentPage?.secondaryStackGap)
        : Number(currentPage?.heroStackGap);
    const insetRoundedGap =
      Number.isFinite(stackGapRaw) && stackGapRaw >= 0 ? stackGapRaw : 12;
    const stackGap =
      variant === 'secondary'
        ? Number.isFinite(stackGapRaw) && stackGapRaw >= 0
          ? stackGapRaw
          : 10
        : isIntroHeroBleedTopPage
          ? Number.isFinite(stackGapRaw) && stackGapRaw > 0
            ? stackGapRaw
            : 0
          : isIntroCompareRoundedPage ||
              isIntroIllustrationPage ||
              (isIntroHeroInsetRoundedHeroFirstPage && variant === 'primary')
            ? insetRoundedGap
            : isIntroHeroAfterTextPage
              ? Number.isFinite(stackGapRaw) && stackGapRaw >= 0
                ? stackGapRaw
                : 8
              : introHeroTopInset;
    const useContainRoundedHero =
      heroFit === 'contain' &&
      variant === 'primary' &&
      !currentIntroCompare &&
      (isIntroHeroInsetRoundedPage || isIntroHeroAfterTextPage);
    const heroAssetAspect = source ? resolveAssetAspect(source) : 1;
    const containHeroLayout = useContainRoundedHero
      ? (() => {
          const horizontalPad = isIntroHeroInsetRoundedPage ? 40 : 0;
          const maxW = Math.max(1, Math.round(winW - horizontalPad));
          const maxImgH = Math.max(1, Math.round(height));
          let imgW = maxW;
          let imgH = Math.round(imgW / Math.max(0.01, heroAssetAspect));
          if (imgH > maxImgH) {
            imgH = maxImgH;
            imgW = Math.round(imgH * heroAssetAspect);
          }
          return { width: imgW, height: imgH };
        })()
      : null;
    return (
    <View
      style={[
        styles.fullReadHeroCard,
        {
          height,
          marginHorizontal: currentIntroCompare
            ? INTRO_COMPARE_HPAD
            : isIntroHeroInsetRoundedPage
              ? 20
              : 0,
          marginTop: stackGap,
          position: 'relative',
        },
        isLight &&
          !useContainRoundedHero &&
          (heroFit === 'contain'
            ? styles.fullReadHeroSideBySideCellLight
            : styles.fullReadHeroCardLight),
        useContainRoundedHero && styles.fullReadHeroCardContainOuter,
        useContainRoundedHero && isLight && styles.fullReadHeroSideBySideCellLight,
        currentIntroCompare && styles.fullReadHeroCardCompare,
        currentIntroCompare && isLight && styles.fullReadHeroCardCompareLight,
        isIntroCompareRoundedPage && styles.fullReadHeroCardCompareRoundedAll,
        variant === 'secondary' && styles.fullReadHeroCardSecondary,
        isIntroHeroAfterTextPage && variant === 'primary' && styles.fullReadHeroCardInsetRounded,
        isIntroHeroInsetRoundedPage && styles.fullReadHeroCardInsetRounded,
        useContainRoundedHero &&
          containHeroLayout && {
            width: containHeroLayout.width,
            height: containHeroLayout.height,
            alignSelf: 'center',
            marginHorizontal: 0,
          },
        isIntroHeroBleedTopPage && variant === 'primary' && styles.fullReadHeroCardBleedTop,
      ]}
    >
      {variant === 'primary' && currentIntroCompare ? (
        <LandmarkPhotoCompare
          beforeSource={currentIntroCompare.beforeAsset}
          afterSource={currentIntroCompare.afterAsset}
          beforeUri={currentIntroCompare.beforeUri}
          afterUri={currentIntroCompare.afterUri}
          beforeContentPosition={currentIntroCompare.beforePosition || 'center'}
          afterContentPosition={currentIntroCompare.afterPosition || 'center'}
          initialPosition={0.5}
          containerHeight={introHeroHeight}
          isLight={isLight}
          nestedInScroll
          onDragStateChange={setCompareDragLock}
          onPhotoPress={() => {
            const src =
              currentIntroCompare.afterAsset ||
              currentIntroCompare.beforeAsset ||
              (currentIntroCompare.afterUri ? { uri: currentIntroCompare.afterUri } : null) ||
              (currentIntroCompare.beforeUri ? { uri: currentIntroCompare.beforeUri } : null);
            openIntroPhotoLightbox(src, heroCaption);
          }}
          style={[
            styles.fullReadHeroCompare,
            isIntroCompareRoundedPage && styles.fullReadHeroCompareRounded,
          ]}
        />
      ) : source ? (
        useContainRoundedHero ? (
          <IntroPhotoTap
            source={source}
            caption={heroCaption}
            onOpen={openIntroPhotoLightbox}
            language={language}
            style={[
              styles.fullReadHeroInsetContainCell,
              containHeroLayout,
              isLight && styles.fullReadHeroSideBySideCellLight,
            ]}
          >
            <ExpoImage
              source={source}
              style={containHeroLayout}
              contentFit="contain"
              contentPosition={heroPosition}
              cachePolicy="memory-disk"
              transition={0}
              allowDownscaling
              accessibilityIgnoresInvertColors
            />
          </IntroPhotoTap>
        ) : (
        <IntroPhotoTap
          source={source}
          caption={heroCaption}
          onOpen={openIntroPhotoLightbox}
          language={language}
          style={styles.fullReadHeroImgPressable}
        >
        <ExpoImage
          source={source}
          style={[
            styles.fullReadHeroImg,
            (isIntroHeroAfterTextPage || isIntroHeroInsetRoundedPage) &&
              styles.fullReadHeroImgInsetRounded,
            variant === 'primary' &&
              isIntroTextShort &&
              !isIntroHeroAfterTextPage &&
              !isIntroHeroInsetRoundedPage
              ? { transform: [{ translateY: 22 + introAutoShift }] }
              : null,
          ]}
          contentFit={heroFit}
          contentPosition={heroPosition}
          cachePolicy="memory-disk"
          transition={0}
          allowDownscaling
          accessibilityIgnoresInvertColors
        />
        </IntroPhotoTap>
        )
      ) : (
        <View style={[styles.fullReadHeroImg, styles.heroPlaceholder, isLight && styles.heroPlaceholderLight]} />
      )}
    </View>
    );
  };

  const introHeroSideBySideRow = () => {
    const stackGapRaw = Number(currentPage?.heroStackGap);
    const stackGap = Number.isFinite(stackGapRaw) && stackGapRaw >= 0 ? stackGapRaw : 12;
    const heroTextGapRaw = Number(currentPage?.heroTextGap);
    const heroTextGap =
      Number.isFinite(heroTextGapRaw) && heroTextGapRaw >= 0 ? heroTextGapRaw : 16;
    const sideBySideCellGapRaw = Number(currentPage?.sideBySideCellGap);
    const cellGap =
      Number.isFinite(sideBySideCellGapRaw) && sideBySideCellGapRaw >= 0
        ? sideBySideCellGapRaw
        : introTertiaryPhotoSource
          ? 6
          : 8;
    const sideBySideCenterOffsetTopRaw = Number(currentPage?.sideBySideCenterOffsetTop);
    const sideBySideCenterOffsetTop =
      Number.isFinite(sideBySideCenterOffsetTopRaw) && sideBySideCenterOffsetTopRaw >= 0
        ? sideBySideCenterOffsetTopRaw
        : 0;
    const outerFlexRaw = Number(currentPage?.sideBySideOuterFlex);
    const centerFlexRaw = Number(currentPage?.sideBySideCenterFlex);
    const hasTripleFlex =
      introTertiaryPhotoSource &&
      Number.isFinite(outerFlexRaw) &&
      outerFlexRaw > 0 &&
      Number.isFinite(centerFlexRaw) &&
      centerFlexRaw > 0;
    const sideBySideRowPaddingRaw = Number(currentPage?.sideBySideRowPaddingHorizontal);
    const sideBySideRowPaddingHorizontal =
      Number.isFinite(sideBySideRowPaddingRaw) && sideBySideRowPaddingRaw >= 0
        ? sideBySideRowPaddingRaw
        : null;
    const heroFit =
      typeof currentPage?.heroFit === 'string' && currentPage.heroFit.trim()
        ? currentPage.heroFit.trim()
        : 'cover';
    const heroCaption = String(currentPage?.heroCaption || '').trim();
    const secondaryHeroCaption = String(currentPage?.secondaryHeroCaption || '').trim();
    const tertiaryHeroCaption = String(currentPage?.tertiaryHeroCaption || '').trim();
    const heroCaptionGapRaw = Number(currentPage?.heroCaptionGap);
    const heroCaptionGap =
      Number.isFinite(heroCaptionGapRaw) && heroCaptionGapRaw >= 0 ? heroCaptionGapRaw : 2;
    const useContainLayout = heroFit === 'contain';
    const cellBgStyle = isLight ? styles.fullReadHeroSideBySideCellLight : null;
    const cells = [
      {
        source: introPrimaryPhotoSource,
        caption: heroCaption,
        position: resolveHeroPosition(currentPage, 'primary'),
      },
      {
        source: introSecondaryPhotoSource,
        caption: secondaryHeroCaption,
        position: resolveHeroPosition(currentPage, 'secondary'),
      },
    ];
    if (introTertiaryPhotoSource) {
      cells.push({
        source: introTertiaryPhotoSource,
        caption: tertiaryHeroCaption,
        position: resolveHeroPosition(currentPage, 'tertiary'),
      });
    }
    const renderCell = (cell, index) => {
      const assetAspect = cell.source ? resolveAssetAspect(cell.source) : 1;
      return (
      <View key={`intro-side-cell-${index}`} style={[
        styles.fullReadHeroSideBySideCol,
        hasTripleFlex && (index === 0 || index === 2) ? { flex: outerFlexRaw } : null,
        hasTripleFlex && index === 1 ? { flex: centerFlexRaw } : null,
        introTertiaryPhotoSource &&
        index === 1 &&
        sideBySideCenterOffsetTop > 0
          ? { marginTop: sideBySideCenterOffsetTop }
          : null,
      ]}>
        <View
          style={[
            styles.fullReadHeroSideBySideCell,
            !useContainLayout ? { height: introHeroHeight } : styles.fullReadHeroSideBySideCellContain,
            cellBgStyle,
          ]}
        >
          <IntroPhotoTap
            source={cell.source}
            caption={cell.caption}
            onOpen={openIntroPhotoLightbox}
            language={language}
            style={styles.fullReadHeroSideBySideImgPressable}
          >
          <ExpoImage
            source={cell.source}
            style={[
              styles.fullReadHeroSideBySideImg,
              useContainLayout
                ? {
                    width: '100%',
                    aspectRatio: assetAspect,
                    maxHeight: introHeroHeight,
                  }
                : styles.fullReadHeroImg,
            ]}
            contentFit={heroFit}
            contentPosition={cell.position}
            cachePolicy="memory-disk"
            transition={0}
            allowDownscaling
            accessibilityIgnoresInvertColors
          />
          </IntroPhotoTap>
        </View>
        {cell.caption ? (
          <Text
            style={[
              styles.introHeroSideCaption,
              introTertiaryPhotoSource
                ? styles.introHeroSideCaptionTriple
                : styles.introHeroSideCaptionDual,
              { marginTop: heroCaptionGap },
              brandFontSans,
              { color: bodyColor },
            ]}
          >
            {cell.caption}
          </Text>
        ) : null}
      </View>
    );
    };
    return (
      <View
        style={[
          styles.fullReadHeroSideBySideRow,
          {
            marginTop: stackGap,
            marginBottom: heroTextGap,
            ...(sideBySideRowPaddingHorizontal != null
              ? { paddingHorizontal: sideBySideRowPaddingHorizontal }
              : {}),
          },
          isIntroHeroBleedTopPage && styles.fullReadHeroSideBySideRowBleedTop,
        ]}
      >
        {cells.map((cell, index) => (
          <React.Fragment key={`intro-side-gap-${index}`}>
            {index > 0 ? <View style={{ width: cellGap }} /> : null}
            {renderCell(cell, index)}
          </React.Fragment>
        ))}
      </View>
    );
  };

  const readArticleColumn = (
    <View
      style={[
        styles.readQuizPagePad,
        {
          paddingTop: fullReadTopClearance,
          backgroundColor: isIntroFullBleedPhotoPage ? '#000' : sheetBg,
        },
      ]}
    >
      {currentPage?.type === 'intro' && isIntroFullBleedPhotoPage ? (
        <View style={[styles.fullReadPage, styles.introFullBleedPage]}>
          {introPrimaryPhotoSource ? (
            <IntroPhotoTap
              source={introPrimaryPhotoSource}
              caption={String(currentPage?.heroCaption || '').trim()}
              onOpen={openIntroPhotoLightbox}
              language={language}
              style={styles.introFullBleedImgPressable}
            >
            <ExpoImage
              source={introPrimaryPhotoSource}
              style={styles.introFullBleedImg}
              contentFit="cover"
              contentPosition="center"
              cachePolicy="memory-disk"
              transition={0}
              allowDownscaling
              accessibilityIgnoresInvertColors
            />
            </IntroPhotoTap>
          ) : (
            <View style={[styles.introFullBleedImg, styles.heroPlaceholder, isLight && styles.heroPlaceholderLight]} />
          )}
        </View>
      ) : currentPage?.type === 'intro' ? (
        <View
          style={[styles.fullReadPage, { backgroundColor: sheetBg }]}
        >
          <ScrollView
            ref={introPageScrollRef}
            key={`intro-scroll-${currentPage?.id ?? activeSectionIndex}`}
            style={styles.fullReadScroll}
            contentContainerStyle={{
              paddingBottom: introScrollBottomPad,
              paddingTop: introScrollTopPad,
            }}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            scrollEnabled={!compareDragLock}
            bounces={isIntroFirstPage}
            overScrollMode={isIntroFirstPage ? 'always' : 'never'}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS === 'android'}
            {...introScrollProps}
          >
            {isIntroHeroAfterTextPage ? (
              <>
                <View
                  style={[
                    styles.introScrollTextBlock,
                    styles.introScrollTextBlockFirst,
                    styles.introScrollTextBlockHeroFirst,
                  ]}
                >
                  {introArticleBody}
                </View>
                {introPrimaryPhotoSource || currentIntroCompare
                  ? introHeroCard('primary')
                  : null}
                {currentIntroBodyAfter ? (
                  <View style={[styles.introScrollTextBlock, { paddingTop: 8 }]}>
                    <LandmarkIntroFormattedBody
                      text={currentIntroBodyAfter}
                      isLight={isLight}
                      accent={accent}
                      titleColor={titleColor}
                      bodyColor={bodyColor}
                      bodyLinkColor={bodyLinkColor}
                      emphasisColor={emphasisColor}
                      brandFontSans={brandFontSans}
                      brandFontHeadMedium={brandFontHeadMedium}
                      leadOnly
                      uniformParagraphs
                    />
                  </View>
                ) : null}
              </>
            ) : (
              <>
                {isIntroHeroSideBySidePage ? (
                  introHeroSideBySideRow()
                ) : (
                  <>
                    {introPrimaryPhotoSource || currentIntroCompare
                      ? introHeroCard('primary')
                      : null}
                    {!isIntroHeroSideBySidePage &&
                    String(currentPage?.heroCaption || '').trim() ? (
                      <Text
                        style={[
                          styles.introHeroSideCaption,
                          styles.introHeroSingleCaption,
                          brandFontSans,
                          { color: bodyColor },
                        ]}
                      >
                        {String(currentPage.heroCaption).trim()}
                      </Text>
                    ) : null}
                    {introSecondaryPhotoSource ? introHeroCard('secondary') : null}
                  </>
                )}
                <View
                  style={[
                    styles.introScrollTextBlock,
                    isIntroHeroSideBySidePage && styles.introScrollTextBlockSideBySide,
                    !currentIntroCompare &&
                      !isIntroSubPage &&
                      !isIntroHeroSideBySidePage && { paddingTop: 12 + introAutoShift },
                  ]}
                >
                  {introArticleBody}
                </View>
              </>
            )}
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
          <ScrollView
            ref={quizPageScrollRef}
            style={styles.quizPageScroll}
            contentContainerStyle={[
              styles.quizPageScrollContent,
              { paddingBottom: quizScrollBottomPad },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            bounces
            overScrollMode="always"
            removeClippedSubviews={Platform.OS === 'android'}
          >
            <View
              style={[
                styles.quizPageViewportCenter,
                {
                  minHeight: quizViewportMinHeight,
                  paddingTop: quizHeaderClearance,
                },
              ]}
            >
              <View style={styles.quizPageCenterColumn}>
              <View style={styles.quizPageTitleRow}>
                <Text
                  style={[
                    styles.quizPageTitle,
                    brandFontHeadMedium,
                    isLight ? styles.quizPageTitleLight : styles.quizPageTitleDark,
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
                  onContinue={quizHasNextSection ? handleQuizContinue : undefined}
                  onAfterReveal={scrollQuizIntoView}
                />
              </View>
              </View>
            </View>
          </ScrollView>
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
              beforeSource={currentPage.slide?.compareBottomSource}
              afterSource={currentPage.slide?.compareTopSource}
              beforeUri={currentPage.slide?.compareBottomUri}
              afterUri={currentPage.slide?.compareTopUri}
              initialPosition={0.5}
              containerHeight={Math.round(winH * 0.92)}
              isLight={isLight}
              style={styles.readFactCompare}
            />
          ) : typeof currentPage.slide?.photoAsset === 'number' ? (
            <ExpoImage
              source={currentPage.slide.photoAsset}
              style={[styles.readFactImage, styles.readFactImageBleed]}
              contentFit="cover"
              contentPosition="center"
              cachePolicy="memory-disk"
              transition={0}
              allowDownscaling
              accessibilityIgnoresInvertColors
            />
          ) : currentPage.slide?.photoUri ? (
            <ExpoImage
              source={{ uri: currentPage.slide.photoUri }}
              style={[styles.readFactImage, styles.readFactImageBleed]}
              contentFit="cover"
              contentPosition="center"
              cachePolicy="memory-disk"
              transition={0}
              allowDownscaling
              accessibilityIgnoresInvertColors
            />
          ) : null}
          {currentPage.type === 'fact' ? (
            <View style={styles.readFactOverlay} />
          ) : null}
          {currentPage.type === 'fact' ? (
            currentPage.slide?.introFact ? (
              <View
                style={[
                  styles.readFactCard,
                  styles.readFactCardIntro,
                  isLight && styles.readFactCardLight,
                  { opacity: 1, maxHeight: Math.round(winH * 0.5) },
                ]}
              >
                <ScrollView
                  contentContainerStyle={styles.readFactCardIntroScrollContent}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  bounces={false}
                >
                  <LandmarkIntroFormattedBody
                    text={String(currentPage.slide?.fact || '').trim()}
                    isLight={isLight}
                    accent={accent}
                    titleColor={titleColor}
                    bodyColor={accent}
                    bodyLinkColor={bodyLinkColor}
                    emphasisColor={emphasisColor}
                    brandFontSans={brandFontSans}
                    brandFontHeadMedium={brandFontHeadMedium}
                    leadOnly
                    uniformParagraphs
                  />
                </ScrollView>
              </View>
            ) : (
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
            )
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <RenderProfiler id="LandmarkResultPage">
      <View
        style={[styles.screen, isLight && styles.screenLight]}
      >
        <View
          style={[styles.miniTopDock, { paddingTop: insets.top + 2, paddingHorizontal: 6 }]}
          pointerEvents="box-none"
        >
          <LandmarkGlassHeaderBar
            isLight={isLight}
            accent={accent}
            headerTitle={headerTitle}
            onBack={onBack}
            onMorePress={onMoreMenu}
            moreMenuOpen={paramsMenuOpen}
            bottomContent={headerDotsContent}
          />
        </View>
        <View style={styles.readQuizPager} {...landmarkSwipeHandlers}>
          {readArticleColumn}
        </View>

        <LandmarkAudioGuideControls
          visible={showAudioControls}
          slideIndex={slideAudioguide.slideIndex}
          slideCount={pageSections.length}
          accent={accent}
          isLight={isLight}
          language={language}
          isPlaying={slideAudioguide.isSpeaking}
          onToggle={toggleSpeech}
          onSeek={slideAudioguide.seekToSlide}
          onPrev={() => slideAudioguide.seekRelative(-1)}
          onNext={() => slideAudioguide.seekRelative(1)}
          bottomInset={Math.max(insets.bottom, 16) + 78}
        />
        <View
          pointerEvents="box-none"
          style={[styles.bottomActionRow, { bottom: Math.max(insets.bottom, 16) + 18 }]}
        >
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
            <Ionicons
              name={audioFabIcon}
              size={24}
              color={
                slideAudioguide.isSpeaking || slideAudioguide.isPaused || speaking
                  ? accent
                  : isLight
                    ? ACCENT_BLUE
                    : '#1E1E1E'
              }
            />
          </Pressable>
        </View>
      </View>
      <LandmarkIllustrationLightbox
        visible={!!introPhotoLightbox?.source}
        source={introPhotoLightbox?.source}
        caption={introPhotoLightbox?.caption}
        onClose={() => setIntroPhotoLightbox(null)}
      />
      {landmarkParamsMenu}
    </RenderProfiler>
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
  miniHeroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  miniHeroFrame: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  heroClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
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
  miniBottomStackLight: {
    backgroundColor: 'transparent',
  },
  /** FAB сидить на «шві» картки: більша частина кола над верхом листа. */
  miniFabStraddle: {
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingRight: 20,
    marginBottom: -36,
    zIndex: 10,
    overflow: 'visible',
  },
  fullSheetScrollContent: {
    flexGrow: 1,
    paddingBottom: 28,
  },
  miniSheet: {
    borderRadius: 28,
    marginHorizontal: 14,
    overflow: 'hidden',
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  miniSheetLight: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(2, 18, 235, 0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#0212EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  miniSheetShadowDark: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.38,
        shadowRadius: 20,
      },
      android: { elevation: 16 },
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
  miniSheetTintLight: {
    backgroundColor: '#FFFFFF',
  },
  miniSheetInner: {
    position: 'relative',
    zIndex: 1,
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 4,
    justifyContent: 'flex-start',
  },
  miniSheetTopHighlight: {
    position: 'absolute',
    top: 0,
    left: 28,
    right: 28,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.14)',
    zIndex: 2,
  },
  miniSheetHandleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  miniSheetHandlePill: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  miniSheetHandlePillLight: {
    backgroundColor: 'rgba(2, 18, 235, 0.22)',
  },
  miniSheetHandlePillDark: {
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  miniSheetHandleHit: {
    position: 'absolute',
    top: 0,
    left: '20%',
    right: '20%',
    height: 36,
  },
  miniSheetBottomContent: {
    marginTop: 'auto',
  },
  miniBody: {
    fontSize: 15,
    lineHeight: 23,
    letterSpacing: 0.1,
  },
  miniBodyClamp: {
    marginBottom: 8,
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
  fullReadHeroCardCompare: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#0E0E0E',
  },
  fullReadHeroCardCompareLight: {
    backgroundColor: '#FFFFFF',
  },
  fullReadHeroCardCompareRoundedAll: {
    borderRadius: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  fullReadHeroCardSecondary: {
    borderRadius: 20,
    marginBottom: 6,
  },
  fullReadHeroSideBySideRow: {
    flexDirection: 'row',
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 0,
  },
  fullReadHeroSideBySideRowBleedTop: {
    paddingHorizontal: 0,
    marginHorizontal: 0,
  },
  fullReadHeroSideBySideCol: {
    flex: 1,
  },
  fullReadHeroSideBySideCell: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  fullReadHeroSideBySideCellContain: {
    alignItems: 'stretch',
  },
  fullReadHeroSideBySideImg: {
    borderRadius: 16,
  },
  fullReadHeroSideBySideImgPressable: {
    width: '100%',
    flex: 1,
  },
  fullReadHeroImgPressable: {
    width: '100%',
    height: '100%',
    flex: 1,
  },
  fullReadHeroSideBySideCellLight: {
    backgroundColor: '#FFFFFF',
  },
  introHeroSideCaption: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
    opacity: 0.82,
  },
  introHeroSideCaptionTriple: {
    fontSize: 9,
    lineHeight: 12,
  },
  introHeroSideCaptionDual: {
    fontSize: 9,
    lineHeight: 12,
    paddingHorizontal: 1,
  },
  introHeroSingleCaption: {
    marginHorizontal: 20,
    marginBottom: 4,
  },
  fullReadHeroCompare: {
    flex: 1,
    width: '100%',
  },
  fullReadHeroCompareRounded: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  fullReadHeroImg: {
    width: '100%',
    height: '100%',
  },
  fullReadHeroImgInsetRounded: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  introIllustrationLinkWrap: {
    marginTop: 16,
    marginRight: 56,
  },
  introIllustrationLinkText: {
    fontSize: 16,
    lineHeight: 22,
    textDecorationLine: 'underline',
  },
  introIllustrationCaption: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.78,
  },
  illustrationLightboxRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
  },
  illustrationLightboxScroll: {
    flex: 1,
  },
  illustrationLightboxScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  illustrationLightboxCaption: {
    position: 'absolute',
    left: 20,
    right: 20,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  illustrationLightboxClose: {
    position: 'absolute',
    right: 18,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  introScrollTextBlock: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  introScrollTextBlockSideBySide: {
    paddingTop: 12,
    marginTop: 0,
  },
  introScrollTextBlockFirst: {
    paddingTop: 0,
    paddingBottom: 4,
  },
  introScrollTextBlockHeroFirst: {
    paddingTop: 28,
    paddingBottom: 0,
  },
  fullReadHeroCardInsetRounded: {
    borderRadius: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    marginHorizontal: 20,
    alignSelf: 'stretch',
    marginBottom: 12,
    overflow: 'hidden',
  },
  fullReadHeroCardContainOuter: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  fullReadHeroInsetContainCell: {
    borderRadius: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
  },
  fullReadHeroCardBleedTop: {
    marginTop: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  introFullBleedPage: {
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  introFullBleedImg: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  introFullBleedImgPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  fullReadIntroScrollWrap: {
    flex: 1,
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
    paddingHorizontal: Platform.OS === 'android' ? 14 : 12,
  },
  quizPageBgLight: {
    backgroundColor: '#EAF1FF',
  },
  quizPageBgDark: {
    backgroundColor: '#0D1520',
  },
  quizPageScroll: {
    flex: 1,
  },
  quizPageScrollContent: {
    flexGrow: 1,
    alignItems: 'stretch',
  },
  quizPageViewportCenter: {
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
  },
  quizPageCenterColumn: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: 520,
  },
  quizPageTitleRow: {
    marginTop: 0,
    marginBottom: Platform.OS === 'android' ? 12 : 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizPageTitle: {
    fontSize: Platform.OS === 'android' ? 19 : 18,
    lineHeight: Platform.OS === 'android' ? 24 : 22,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
    ...Platform.select({
      android: { includeFontPadding: false },
    }),
  },
  quizPageTitleLight: {
    color: '#0C2FA8',
  },
  quizPageTitleDark: {
    color: '#E1FF00',
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(225, 255, 0, 0.16)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
      },
      android: {
        letterSpacing: 1,
      },
    }),
  },
  quizPageInner: {
    flexGrow: 0,
    flexShrink: 1,
    justifyContent: 'center',
    paddingTop: 0,
    paddingBottom: Platform.OS === 'android' ? 4 : 0,
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
  readFactCardIntro: {
    top: '46%',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  readFactCardIntroScrollContent: {
    paddingBottom: 2,
  },
  readFactBodyIntro: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: FIGMA_CREAM,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -12 }],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
      },
      android: { elevation: 7 },
    }),
  },
  audioFabMiniLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(2, 18, 235, 0.18)',
    ...Platform.select({
      ios: {
        shadowColor: '#0212EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.16,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  audioFabMiniActive: {
    backgroundColor: '#FAFAF4',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.42,
        shadowRadius: 12,
      },
      android: { elevation: 10 },
    }),
  },
  audioFabMiniActiveLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(2, 18, 235, 0.42)',
    ...Platform.select({
      ios: {
        shadowColor: '#0212EB',
        shadowOpacity: 0.28,
        shadowRadius: 12,
      },
    }),
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
    zIndex: 10,
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
    lineHeight: 20,
    marginBottom: 10,
    letterSpacing: 0.15,
  },
  fullReadSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.2,
  },
  introTaglineBlock: {
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  introFormattedBody: {
    paddingTop: 2,
  },
  introFormattedBodyCompactTop: {
    paddingTop: 0,
    marginTop: 0,
  },
  introLeadParagraph: {
    fontSize: 17,
    lineHeight: 27,
    marginBottom: 20,
  },
  introEmphasisParagraph: {
    fontSize: 18,
    lineHeight: 29,
    letterSpacing: 0.1,
  },
  introParagraph: {
    fontSize: 16,
    lineHeight: 26,
    marginBottom: 18,
  },
  introParagraphPreHero: {
    marginBottom: 8,
  },
  introSectionHeadingWrap: {
    marginTop: 4,
    marginBottom: 22,
  },
  introSectionHeadingWrapPreHero: {
    marginBottom: 8,
  },
  introSectionHeadingRule: {
    width: 36,
    height: 3,
    borderRadius: 999,
    marginBottom: 12,
  },
  introSectionHeading: {
    fontSize: 21,
    lineHeight: 28,
    letterSpacing: 0.15,
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
  paramMenuModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  /** Тап по затемненому фону закриває панель. */
  paramMenuBackdropPress: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  paramMenuSheet: {
    width: '100%',
    zIndex: 2,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    paddingTop: 4,
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
  paramMenuDragZone: {
    paddingBottom: 2,
    minHeight: 64,
  },
  paramMenuHandleWrap: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 10,
  },
  paramMenuHandle: {
    width: 40,
    height: 5,
    borderRadius: 999,
  },
  paramMenuHandleLight: {
    backgroundColor: 'rgba(30,30,30,0.22)',
  },
  paramMenuHandleDark: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  paramMenuRows: {
    paddingBottom: 4,
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
