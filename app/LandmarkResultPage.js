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
import { getCachedOrRemoteAudioUri } from './audioGuideCache';
import {
  startLandmarkNarration,
} from './landmarkTts';
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
import { RenderProfiler } from './performanceMetrics';
import { createLandmarkPagerPanResponder, LANDMARK_SCROLL_PULL_DISMISS_PX } from './landmarkPagerSwipe';
import { resolveHeroThumbRef, HERO_THUMB_MAP } from './krainaHeroThumbs';
import { shellPush } from './shellNavigate';
import { useAuthStore } from './auth/authStore';

/** Fallback hero thumbs for Maidan intro sub-pages (survives stale nav params). */
const MAIDAN_INTRO_PAGE_HERO = {
  'intro-2': 'maidanKozyeBolotoMap',
  'intro-4': 'maidanGudovskyHistoric',
  'intro-5': 'maidanHolovposhtamtTragedy',
  'intro-6': 'maidanCityDumaPostcard',
  'intro-7': 'maidan',
  'intro-8': 'maidanLyadskiGates',
  'intro-9': 'maidanZeroKilometerGlobe',
  'intro-10': 'maidanRevolutionGranite1990',
  'intro-11': 'maidanOrangeRevolution2004',
  'intro-12': 'maidan',
};

/** Same as above, keyed by introPart when nav params are stale. */
const MAIDAN_INTRO_PART_HERO = {
  2: 'maidanKozyeBolotoMap',
  4: 'maidanGudovskyHistoric',
  5: 'maidanHolovposhtamtTragedy',
  6: 'maidanCityDumaPostcard',
  7: 'maidan',
  8: 'maidanLyadskiGates',
  9: 'maidanZeroKilometerGlobe',
  10: 'maidanRevolutionGranite1990',
  11: 'maidanOrangeRevolution2004',
  12: 'maidan',
};

const MAIDAN_INTRO_PAGE_SECONDARY_HERO = {
  'intro-6': 'maidanKhreshchatykRuins',
  'intro-10': 'maidanRevolutionGraniteCamp',
};

/** Crop anchor for intro hero photos (object-position). */
const MAIDAN_INTRO_PAGE_HERO_POSITION = {
  'intro-5': { left: '72%', top: '50%' },
  'intro-6': { left: '50%', top: '34%' },
  'intro-8': { left: '50%', top: '2%' },
};

/** Fit mode for intro hero photos (`cover` default). */
const MAIDAN_INTRO_PAGE_HERO_FIT = {};

const MAIDAN_INTRO_PAGE_COMPARE_TOP_INSET = {
  'intro-2': 22,
  'intro-3': 22,
  'intro-7': 22,
};

const MAIDAN_INTRO_PAGE_SECONDARY_HERO_POSITION = {
  'intro-6': { left: '50%', top: '40%' },
};

/** Taller hero only on selected Maidan intro pages. */
const MAIDAN_INTRO_PAGE_HERO_HEIGHT = {
  'intro-2': { ratio: 0.4, max: 340 },
  'intro-5': { ratio: 0.68, max: 600 },
  'intro-6': { ratio: 0.48, max: 400 },
  'intro-7': { ratio: 0.62, max: 560 },
  'intro-8': { ratio: 0.46, max: 380 },
  'intro-9': { ratio: 0.44, max: 380 },
  'intro-10': { ratio: 0.44, max: 380 },
};

/** Shorter second photo on selected Maidan intro pages. */
const MAIDAN_INTRO_PAGE_SECONDARY_HERO_HEIGHT = {
  'intro-6': { ratio: 0.3, max: 260 },
  'intro-10': { ratio: 0.4, max: 340 },
};

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

function TextWithOptionalUrls({ children, style, linkColor, emphasisColor }) {
  const text = String(children ?? '');
  if (!/(https?:\/\/)/i.test(text) && !/\*\*/.test(text)) {
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
          <TextWithEmphasis key={`t-${i}`} text={part} emphasisColor={emphasisColor} />
        ),
      )}
    </Text>
  );
}

function TextWithEmphasis({ text, emphasisColor }) {
  const segments = useMemo(() => {
    const src = String(text || '');
    if (!/\*\*/.test(src)) return [{ type: 'plain', text: src }];
    const out = [];
    const re = /\*\*([^*]+)\*\*/g;
    let last = 0;
    let match;
    while ((match = re.exec(src)) !== null) {
      if (match.index > last) out.push({ type: 'plain', text: src.slice(last, match.index) });
      out.push({ type: 'emphasis', text: match[1] });
      last = match.index + match[0].length;
    }
    if (last < src.length) out.push({ type: 'plain', text: src.slice(last) });
    return out.length ? out : [{ type: 'plain', text: src }];
  }, [text]);

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'emphasis' ? (
          <Text key={`e-${i}`} style={{ color: emphasisColor, fontWeight: '600' }}>
            {seg.text}
          </Text>
        ) : (
          seg.text
        ),
      )}
    </>
  );
}

function isIntroSectionHeading(block) {
  const t = String(block || '').trim();
  if (!t || t.length > 96) return false;
  const sentences = t.split(/(?<=[.!?…])\s+/).filter(Boolean);
  if (sentences.length !== 1) return false;
  if (t.length > 72 && /[,;:—–-]/.test(t)) return false;
  return true;
}

function parseIntroBodyBlocks(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => ({
      type: isIntroSectionHeading(block) ? 'heading' : 'paragraph',
      text: block,
    }));
}

const LandmarkIntroFormattedBody = React.memo(function LandmarkIntroFormattedBody({
  text,
  isLight,
  accent,
  titleColor,
  bodyColor,
  bodyLinkColor,
  emphasisColor,
  brandFontSans,
  brandFontHeadMedium,
  leadOnly = false,
  uniformParagraphs = false,
}) {
  const blocks = useMemo(() => parseIntroBodyBlocks(text), [text]);
  const mutedBody = isLight ? '#4A4A4A' : 'rgba(242,242,234,0.88)';

  return (
    <View style={styles.introFormattedBody}>
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          return (
            <View key={`h-${idx}`} style={styles.introSectionHeadingWrap}>
              <View style={[styles.introSectionHeadingRule, { backgroundColor: accent }]} />
              <Text
                style={[
                  styles.introSectionHeading,
                  brandFontHeadMedium,
                  { color: titleColor },
                ]}
              >
                {block.text}
              </Text>
            </View>
          );
        }
        const isLead = !uniformParagraphs && idx === 0;
        const isEmphasisLead = leadOnly && idx === 0 && !uniformParagraphs;
        return (
          <TextWithOptionalUrls
            key={`p-${idx}`}
            style={[
              styles.introParagraph,
              isLead && styles.introLeadParagraph,
              isEmphasisLead && styles.introEmphasisParagraph,
              brandFontSans,
              { color: uniformParagraphs || isLead ? bodyColor : mutedBody },
            ]}
            linkColor={bodyLinkColor}
            emphasisColor={emphasisColor}
          >
            {block.text}
          </TextWithOptionalUrls>
        );
      })}
    </View>
  );
});

function fitAssetWithinBox(source, maxWidth, maxHeight) {
  const resolved = typeof source === 'number' ? Image.resolveAssetSource(source) : null;
  if (!resolved?.width || !resolved?.height) {
    return { width: maxWidth, height: maxHeight };
  }
  const assetScale = Number(resolved.scale) || 1;
  const nativeWidthPt = resolved.width / assetScale;
  const aspect = resolved.width / Math.max(1, resolved.height);
  let width = Math.min(maxWidth, nativeWidthPt);
  let height = width / aspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }
  // У lightbox дозволяємо масштабувати портретні ілюстрації до ширини екрана.
  if (width < maxWidth * 0.98 && height < maxHeight * 0.98) {
    const scaleUp = Math.min(maxWidth / width, maxHeight / height);
    if (scaleUp > 1.02) {
      width = Math.min(maxWidth, Math.round(width * scaleUp));
      height = Math.min(maxHeight, Math.round(width / aspect));
    }
  }
  return { width: Math.round(width), height: Math.round(height) };
}

function LandmarkIllustrationLightbox({ visible, source, caption, onClose }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const zoomScaleRef = useRef(1);
  const scrollRef = useRef(null);
  const imageSize = useMemo(() => {
    const captionReserve = caption ? 96 : 48;
    const maxW = width - 8;
    const maxH = height - insets.top - insets.bottom - captionReserve;
    return fitAssetWithinBox(source, maxW, Math.max(320, maxH));
  }, [source, width, height, insets.top, insets.bottom, caption]);

  useEffect(() => {
    if (!visible) {
      zoomScaleRef.current = 1;
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    zoomScaleRef.current = 1;
    onClose();
  }, [onClose]);

  const tryCloseOnTap = useCallback(() => {
    if (zoomScaleRef.current <= 1.02) handleClose();
  }, [handleClose]);

  if (!visible || !source) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.illustrationLightboxRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={tryCloseOnTap} accessibilityRole="button" />
        <ScrollView
          ref={scrollRef}
          style={styles.illustrationLightboxScroll}
          contentContainerStyle={styles.illustrationLightboxScrollContent}
          maximumZoomScale={Platform.OS === 'ios' ? 4 : 1}
          minimumZoomScale={1}
          centerContent
          bouncesZoom
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => {
            zoomScaleRef.current = Number(e.nativeEvent?.zoomScale) || 1;
          }}
          scrollEventThrottle={16}
        >
          <Pressable onPress={tryCloseOnTap} accessibilityRole="imagebutton">
            <ExpoImage
              source={source}
              style={imageSize}
              contentFit="contain"
              contentPosition="center"
              cachePolicy="memory-disk"
              transition={0}
              allowDownscaling
              accessibilityIgnoresInvertColors
            />
          </Pressable>
        </ScrollView>
        {caption ? (
          <Text
            style={[styles.illustrationLightboxCaption, { bottom: Math.max(insets.bottom, 20) + 12 }]}
            pointerEvents="none"
          >
            {caption}
          </Text>
        ) : null}
        <Pressable
          style={[styles.illustrationLightboxClose, { top: insets.top + 8 }]}
          onPress={handleClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </Pressable>
      </View>
    </Modal>
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
  const { width: winW, height: winH } = useWindowDimensions();
  const language = useSyncedAppLanguage(route, 'uk');
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');

  const photoUri = resolveOfflineUriSync(route?.params?.photoUri);
  const defaultHeroPhotoSource = useMemo(() => {
    const asset = route?.params?.photoAsset;
    if (typeof asset === 'number') return asset;
    if (photoUri) return { uri: photoUri };
    return null;
  }, [route?.params?.photoAsset, photoUri]);
  const title = route?.params?.title || '';
  const subtitle = route?.params?.subtitle;
  const extract = route?.params?.extract || '';
  const introContinuation = useMemo(() => {
    const raw = route?.params?.introContinuation;
    return typeof raw === 'string' ? raw.trim() : '';
  }, [route?.params?.introContinuation]);
  const introPages = useMemo(() => {
    const raw = route?.params?.introPages;
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
        const body = typeof page?.body === 'string' ? page.body.trim() : '';
        if (!body) return null;
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
        const illustrationAsset =
          typeof page?.illustrationAsset === 'number' ? page.illustrationAsset : undefined;
        const illustrationLink =
          typeof page?.illustrationLink === 'string' ? page.illustrationLink.trim() : '';
        const illustrationCaption =
          typeof page?.illustrationCaption === 'string' ? page.illustrationCaption.trim() : '';
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
        return {
          body,
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
          ...(photoUri ? { photoUri } : {}),
          ...(illustrationAsset ? { illustrationAsset } : {}),
          ...(illustrationLink ? { illustrationLink } : {}),
          ...(illustrationCaption ? { illustrationCaption } : {}),
          ...(page.introFullBleedPhoto ? { introFullBleedPhoto: true } : {}),
          ...(page.introHeroAfterText ? { introHeroAfterText: true } : {}),
          ...(page.introHeroBleedTop ? { introHeroBleedTop: true } : {}),
          ...(page.introFactCard ? { introFactCard: true } : {}),
          ...(page.introHeroInsetRounded ? { introHeroInsetRounded: true } : {}),
        };
      })
      .filter(Boolean);
  }, [route?.params?.introPages]);
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
  const audioGuideUrl = useMemo(() => {
    const u = typeof route?.params?.audioGuideUrl === 'string' ? route.params.audioGuideUrl.trim() : '';
    const resolved = resolveOfflineUriSync(u);
    return resolved || (/^https?:\/\//i.test(u) ? u : '');
  }, [route?.params?.audioGuideUrl]);

  const audioPlayerRef = useRef(null);
  const fileAudioActiveRef = useRef(false);
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
      return isHomeLandmark
        ? Math.min(winH * 0.34, 292)
        : Math.min(winH * 0.52, 440);
    }
    if (Number.isFinite(previewLines) && previewLines > PREVIEW_BODY_LINES) {
      return Math.min(winH * 0.46, 400);
    }
    return Math.min(winH * 0.36, 320);
  }, [winH, route?.params?.previewBodyLines, route?.params?.miniExtract, startPhaseParam]);
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

  const [speaking, setSpeaking] = useState(false);
  const [paramsMenuOpen, setParamsMenuOpen] = useState(false);
  const [landmarkSaved, setLandmarkSaved] = useState(false);
  const [illustrationLightboxOpen, setIllustrationLightboxOpen] = useState(false);

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
      const uri = String(localUri || '').trim();
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

  useEffect(() => {
    return () => {
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
          photoAsset: page.photoAsset,
          photoUri: page.photoUri,
          heroThumb: page.heroThumb,
          secondaryHeroThumb: page.secondaryHeroThumb,
          secondaryPhotoAsset: page.secondaryPhotoAsset,
          illustrationAsset: page.illustrationAsset,
          illustrationLink: page.illustrationLink,
          illustrationCaption: page.illustrationCaption,
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
          introFullBleedPhoto: page.introFullBleedPhoto,
          introHeroAfterText: page.introHeroAfterText,
          introHeroBleedTop: page.introHeroBleedTop,
          introHeroInsetRounded: page.introHeroInsetRounded,
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
  const currentPage = pageSections[activeSectionIndex] || pageSections[0];
  const heroPhotoSource = useMemo(() => {
    if (currentPage?.type === 'intro' && currentPage.introPart > 1) {
      const pageHeroKey =
        MAIDAN_INTRO_PAGE_HERO[currentPage?.id] || MAIDAN_INTRO_PART_HERO[currentPage.introPart];
      if (pageHeroKey) {
        const forced = HERO_THUMB_MAP[pageHeroKey] || resolveHeroThumbRef(pageHeroKey);
        if (forced) return forced;
      }
      if (typeof currentPage.photoAsset === 'number') return currentPage.photoAsset;
      const heroThumb =
        typeof currentPage.heroThumb === 'string' ? currentPage.heroThumb.trim() : '';
      const thumbAsset = resolveHeroThumbRef(heroThumb);
      if (typeof thumbAsset === 'number') return thumbAsset;
      const subUri = typeof currentPage.photoUri === 'string' ? currentPage.photoUri.trim() : '';
      if (subUri) return { uri: subUri };
    }
    return defaultHeroPhotoSource;
  }, [currentPage, defaultHeroPhotoSource]);
  const isMaidanDumaIntroPage =
    currentPage?.id === 'intro-6' || currentPage?.introPart === 6;
  const secondaryHeroPhotoSource = useMemo(() => {
    if (currentPage?.type !== 'intro' || !(currentPage.introPart > 1)) return null;
    const pageHeroKey =
      MAIDAN_INTRO_PAGE_SECONDARY_HERO[currentPage?.id] ||
      (currentPage.introPart === 6 ? 'maidanKhreshchatykRuins' : null);
    if (pageHeroKey) {
      const forced = HERO_THUMB_MAP[pageHeroKey] || resolveHeroThumbRef(pageHeroKey);
      if (forced) return forced;
    }
    if (typeof currentPage.secondaryPhotoAsset === 'number') return currentPage.secondaryPhotoAsset;
    const secondaryHeroThumb =
      typeof currentPage.secondaryHeroThumb === 'string' ? currentPage.secondaryHeroThumb.trim() : '';
    const thumbAsset = resolveHeroThumbRef(secondaryHeroThumb);
    if (typeof thumbAsset === 'number') return thumbAsset;
    return null;
  }, [currentPage]);
  const introPrimaryPhotoSource = useMemo(() => {
    if (isMaidanDumaIntroPage) {
      return HERO_THUMB_MAP.maidanCityDumaPostcard || heroPhotoSource;
    }
    return heroPhotoSource;
  }, [isMaidanDumaIntroPage, heroPhotoSource]);
  const introSecondaryPhotoSource = useMemo(() => {
    if (isMaidanDumaIntroPage) {
      return HERO_THUMB_MAP.maidanKhreshchatykRuins || secondaryHeroPhotoSource;
    }
    return secondaryHeroPhotoSource;
  }, [isMaidanDumaIntroPage, secondaryHeroPhotoSource]);
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
    const topInsetFallback = MAIDAN_INTRO_PAGE_COMPARE_TOP_INSET[currentPage?.id];
    const topInset =
      Number.isFinite(topInsetRaw) && topInsetRaw > 0
        ? Math.round(topInsetRaw)
        : Number.isFinite(topInsetFallback) && topInsetFallback > 0
          ? topInsetFallback
          : 0;
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
    const customHeight = MAIDAN_INTRO_PAGE_HERO_HEIGHT[currentPage?.id];
    const ratioRaw = Number(currentPage?.heroHeightRatio);
    const maxRaw = Number(currentPage?.heroHeightMax);
    const ratio =
      Number.isFinite(ratioRaw) && ratioRaw > 0
        ? ratioRaw
        : customHeight?.ratio ?? INTRO_SUB_HERO_HEIGHT_RATIO;
    const maxH =
      Number.isFinite(maxRaw) && maxRaw > 0
        ? maxRaw
        : customHeight?.max ?? 540;
    return Math.min(maxH, Math.max(320, Math.round(winH * ratio)));
  }, [currentPage, currentIntroCompare, heroPhotoSource, winH]);
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
  const isIntroSubPage = currentPage?.type === 'intro' && currentPage?.introPart > 1;
  const isIntroFullBleedPhotoPage =
    currentPage?.type === 'intro' && currentPage.introFullBleedPhoto === true;
  const isIntroHeroAfterTextPage =
    currentPage?.type === 'intro' &&
    (currentPage.introHeroAfterText || currentPage?.id === 'intro-9');
  const isIntroHeroBleedTopPage =
    currentPage?.type === 'intro' &&
    (currentPage.introHeroBleedTop === true ||
      currentPage?.id === 'intro-4' ||
      currentPage?.introPart === 4 ||
      currentPage?.id === 'intro-5' ||
      currentPage?.introPart === 5 ||
      currentPage?.id === 'intro-6' ||
      currentPage?.introPart === 6 ||
      currentPage?.id === 'intro-10' ||
      currentPage?.introPart === 10);
  const isMaidanCompareIntroPage =
    currentPage?.type === 'intro' &&
    !!currentIntroCompare &&
    (currentPage?.id === 'intro-3' || currentPage?.introPart === 3);
  const isMaidanMapIntroPage =
    currentPage?.type === 'intro' &&
    (currentPage?.id === 'intro-2' || currentPage?.introPart === 2);
  const isIntroHeroInsetRoundedPage =
    currentPage?.type === 'intro' &&
    (currentPage.introHeroInsetRounded === true ||
      currentPage?.id === 'intro-2' ||
      currentPage?.introPart === 2 ||
      currentPage?.id === 'intro-7' ||
      currentPage?.introPart === 7);
  const isIntroHeroInsetRoundedHeroFirstPage =
    isIntroHeroInsetRoundedPage && !isIntroHeroAfterTextPage;
  const introScrollTopPad =
    isIntroSubPage && isIntroHeroBleedTopPage
      ? 0
      : isIntroSubPage &&
          (isMaidanCompareIntroPage ||
            isMaidanMapIntroPage ||
            isIntroHeroInsetRoundedHeroFirstPage)
        ? Math.max(insets.top + 66, 82)
      : isIntroSubPage && isIntroHeroAfterTextPage
        ? Math.max(insets.top + 98, 116)
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
  const quizHeaderClearance = Math.max(insets.top + 90, 108);
  const quizScrollBottomPad = Math.max(insets.bottom + 104, 128);
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
  const [fullReadScrollY, setFullReadScrollY] = useState(0);
  const introSectionYRef = useRef(0);
  const introSectionHRef = useRef(0);
  const quizSectionYRef = useRef(0);
  const quizSectionHRef = useRef(0);
  const factSectionsRef = useRef({});
  const fullReadViewportHRef = useRef(0);
  const fullReadContentHRef = useRef(0);

  const audioScriptText = useMemo(() => {
    const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
    const raw = langUk ? route?.params?.audioScriptUk : route?.params?.audioScriptEn;
    return typeof raw === 'string' ? raw.trim() : '';
  }, [language, route?.params?.audioScriptUk, route?.params?.audioScriptEn]);
  const textForTts = useMemo(() => {
    if (audioScriptText) return audioScriptText;
    return phase === 'mini' ? (miniExtract || extract) : fullBodyText;
  }, [audioScriptText, phase, miniExtract, extract, fullBodyText]);

  const toggleSpeech = useCallback(async () => {
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
            const mode = await startLandmarkNarration({
              Speech,
              text: t,
              appLanguage: language,
              playFileAudio: playLocalAudioUri,
              callbacks: {
                onDone: () => setSpeaking(false),
                onStopped: () => setSpeaking(false),
                onError: () => {
                  setSpeaking(false);
                  Alert.alert('', ls(language, 'audioGuideError'));
                },
              },
            });
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
      const mode = await startLandmarkNarration({
        Speech,
        text: t,
        appLanguage: language,
        playFileAudio: playLocalAudioUri,
        callbacks: {
          onDone: () => setSpeaking(false),
          onStopped: () => setSpeaking(false),
          onError: () => {
            setSpeaking(false);
            Alert.alert('', ls(language, 'audioGuideError'));
          },
        },
      });
      if (!mode) {
        setSpeaking(false);
        Alert.alert('', ls(language, 'audioGuideError'));
      }
    } catch (e) {
      setSpeaking(false);
      await stopFileAudio();
      if (__DEV__) console.warn('[audioGuide]', e?.message);
      Alert.alert('', ls(language, 'audioGuideError'));
    }
  }, [audioGuideUrl, language, playLocalAudioUri, stopFileAudio, textForTts]);

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
            onPress={() => goToSectionIndex(idx)}
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

  useEffect(() => {
    setIllustrationLightboxOpen(false);
    setCompareDragLock(false);
    introPullDismissArmedRef.current = false;
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
      rawY < -LANDMARK_SCROLL_PULL_DISMISS_PX &&
      !introPullDismissArmedRef.current
    ) {
      introPullDismissArmedRef.current = true;
      handleFullPhaseStepBackRef.current();
    }
  }, []);

  const onIntroScrollEnd = useCallback(() => {
    introPullDismissArmedRef.current = false;
  }, []);

  const introScrollProps = useMemo(
    () =>
      isIntroFirstPage
        ? {
            onScroll: onIntroScroll,
            onScrollEndDrag: onIntroScrollEnd,
            onMomentumScrollEnd: onIntroScrollEnd,
            scrollEventThrottle: 32,
          }
        : {},
    [isIntroFirstPage, onIntroScroll, onIntroScrollEnd],
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
    const msg = `${headerTitle}\n\n${shareBody.slice(0, 2000)}`.trim();
    const payload =
      Platform.OS === 'ios'
        ? { message: msg, title: headerTitle }
        : { message: msg, title: headerTitle, subject: headerTitle };
    Share.share(payload).catch(() => {});
  }, [dismissParamsMenu, headerTitle, shareBody]);

  const onParamShareLocation = useCallback(() => {
    dismissParamsMenu();
    const url =
      visitLat != null && visitLng != null
        ? `https://www.google.com/maps/search/?api=1&query=${visitLat},${visitLng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(headerTitle)}`;
    const message = `${headerTitle}\n${url}`;
    const payload =
      Platform.OS === 'ios' ? { message, title: headerTitle } : { message, title: headerTitle, subject: headerTitle };
    Share.share(payload).catch(() => {});
  }, [dismissParamsMenu, visitLat, visitLng, headerTitle]);

  const onParamReport = useCallback(() => {
    dismissParamsMenu();
    Alert.alert(ls(language, 'paramMenuReport'), ls(language, 'paramMenuReportHint'));
  }, [dismissParamsMenu, language]);

  const onParamRoute = useCallback(() => {
    dismissParamsMenu();
    openMapsRoute();
  }, [dismissParamsMenu, openMapsRoute]);

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
  const miniBodyUnlimited = !!explicitMiniExtract;

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
    return (
      <RenderProfiler id="LandmarkResultPage">
      <View style={styles.screen} {...miniPhaseSwipeHandlers}>
        {heroPhotoSource ? (
          <Image
            source={heroPhotoSource}
            style={styles.miniHeroImage}
            resizeMode="cover"
            pointerEvents="none"
          />
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
              style={[styles.audioFabMini, isLight && styles.audioFabMiniLight]}
              onPress={toggleSpeech}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={ls(language, 'audioGuide')}
            >
              <Ionicons
                name={speaking ? 'pause' : 'headset'}
                size={18}
                color={speaking ? accent : isLight ? ACCENT_BLUE : '#1E1E1E'}
              />
            </Pressable>
          </View>
          <Animated.View
            style={[
              styles.miniSheet,
              isLight ? styles.miniSheetLight : styles.miniSheetShadowDark,
              {
                maxHeight: miniSheetMaxH,
                paddingBottom: isLight ? 16 : Math.max(insets.bottom, 16),
                marginBottom: isLight ? Math.max(insets.bottom, 12) : Math.max(insets.bottom, 8),
              },
            ]}
            accessibilityRole="adjustable"
            accessibilityLabel={ls(language, 'miniSwipeHint')}
          >
            {Platform.OS === 'ios' && !isLight ? (
              <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
            ) : null}
            <View
              style={[
                styles.miniSheetTint,
                isLight
                  ? styles.miniSheetTintLight
                  : { backgroundColor: 'rgba(30,30,30,0.82)' },
              ]}
            />
            <View style={styles.miniSheetInner}>
              <View style={styles.miniSheetHandleRow}>
                <View style={styles.miniSheetHandleHit} />
                <Ionicons
                  name="chevron-up"
                  size={24}
                  color={isLight ? 'rgba(2, 18, 235, 0.42)' : 'rgba(255,255,255,0.55)'}
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
                    : { numberOfLines: previewBodyLines, ellipsizeMode: 'tail' })}
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
      />
      {currentIllustration ? (
        <Pressable
          onPress={() => setIllustrationLightboxOpen(true)}
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
    const secondaryHeightConfig = MAIDAN_INTRO_PAGE_SECONDARY_HERO_HEIGHT[currentPage?.id];
    const height =
      variant === 'secondary'
        ? secondaryHeightConfig
          ? Math.min(
              secondaryHeightConfig.max,
              Math.max(200, Math.round(winH * secondaryHeightConfig.ratio)),
            )
          : Math.min(420, Math.max(260, Math.round(winH * 0.44)))
        : introHeroHeight;
    if (!source && variant === 'secondary') return null;
    const heroPosition =
      variant === 'secondary'
        ? MAIDAN_INTRO_PAGE_SECONDARY_HERO_POSITION[currentPage?.id] || 'center'
        : MAIDAN_INTRO_PAGE_HERO_POSITION[currentPage?.id] || 'center';
    const heroFit =
      variant === 'secondary'
        ? 'cover'
        : MAIDAN_INTRO_PAGE_HERO_FIT[currentPage?.id] || 'cover';
    const insetRoundedGap = MAIDAN_INTRO_PAGE_COMPARE_TOP_INSET[currentPage?.id] ?? 12;
    const stackGap =
      isMaidanDumaIntroPage && variant === 'secondary'
        ? 0
        : variant === 'primary'
          ? isIntroHeroBleedTopPage
            ? 0
            : isMaidanMapIntroPage ||
                isMaidanCompareIntroPage ||
                (isIntroHeroInsetRoundedHeroFirstPage && variant === 'primary')
              ? insetRoundedGap
              : isIntroHeroAfterTextPage
                ? 20
                : introHeroTopInset
          : 10;
    return (
    <View
      style={[
        styles.fullReadHeroCard,
        {
          height,
          marginHorizontal: currentIntroCompare
            ? INTRO_COMPARE_HPAD
            : isIntroHeroInsetRoundedPage && variant === 'primary'
              ? 20
              : 0,
          marginTop: stackGap,
        },
        isLight && styles.fullReadHeroCardLight,
        currentIntroCompare && styles.fullReadHeroCardCompare,
        currentIntroCompare && isLight && styles.fullReadHeroCardCompareLight,
        isMaidanCompareIntroPage && styles.fullReadHeroCardCompareRoundedAll,
        variant === 'secondary' && styles.fullReadHeroCardSecondary,
        isIntroHeroAfterTextPage && variant === 'primary' && styles.fullReadHeroCardInsetRounded,
        isIntroHeroInsetRoundedPage && variant === 'primary' && styles.fullReadHeroCardInsetRounded,
        isIntroHeroBleedTopPage && variant === 'primary' && styles.fullReadHeroCardBleedTop,
      ]}
    >
      {variant === 'primary' && currentIntroCompare ? (
        <LandmarkPhotoCompare
          beforeSource={currentIntroCompare.beforeAsset}
          afterSource={currentIntroCompare.afterAsset}
          beforeUri={currentIntroCompare.beforeUri}
          afterUri={currentIntroCompare.afterUri}
          initialPosition={0.5}
          containerHeight={introHeroHeight}
          isLight={isLight}
          nestedInScroll
          onDragStateChange={setCompareDragLock}
          style={[
            styles.fullReadHeroCompare,
            isMaidanCompareIntroPage && styles.fullReadHeroCompareRounded,
          ]}
        />
      ) : source ? (
        <ExpoImage
          source={source}
          style={[
            styles.fullReadHeroImg,
            variant === 'primary' && isIntroTextShort
              ? { transform: [{ translateY: 22 + introAutoShift }] }
              : { transform: [{ translateY: 0 }] },
          ]}
          contentFit={heroFit}
          contentPosition={heroPosition}
          cachePolicy="memory-disk"
          transition={0}
          allowDownscaling
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[styles.fullReadHeroImg, styles.heroPlaceholder, isLight && styles.heroPlaceholderLight]} />
      )}
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
                {introPrimaryPhotoSource ? introHeroCard('primary') : null}
              </>
            ) : (
              <>
                {introPrimaryPhotoSource ? introHeroCard('primary') : null}
                {(isMaidanDumaIntroPage || introSecondaryPhotoSource) && introHeroCard('secondary')}
                <View
                  style={[
                    styles.introScrollTextBlock,
                    !currentIntroCompare && !isIntroSubPage && { paddingTop: 12 + introAutoShift },
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
              name={speaking ? 'pause' : 'headset'}
              size={24}
              color={speaking ? accent : isLight ? ACCENT_BLUE : '#1E1E1E'}
            />
          </Pressable>
        </View>
      </View>
      <LandmarkIllustrationLightbox
        visible={illustrationLightboxOpen}
        source={currentIllustration?.asset}
        caption={currentIllustration?.caption}
        onClose={() => setIllustrationLightboxOpen(false)}
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
  miniBottomStackLight: {
    backgroundColor: 'transparent',
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
  miniSheetTintLight: {
    backgroundColor: '#FFFFFF',
  },
  miniSheetInner: {
    position: 'relative',
    zIndex: 1,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
    justifyContent: 'flex-start',
  },
  miniSheetHandleRow: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
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
    lineHeight: 22,
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
  introScrollTextBlockFirst: {
    paddingTop: 0,
    paddingBottom: 4,
  },
  introScrollTextBlockHeroFirst: {
    paddingTop: 32,
    paddingBottom: 20,
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
    paddingHorizontal: 12,
  },
  quizPageBgLight: {
    backgroundColor: '#EAF1FF',
  },
  quizPageBgDark: {
    backgroundColor: '#10192B',
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
    marginBottom: 10,
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
    flexGrow: 0,
    flexShrink: 1,
    justifyContent: 'center',
    paddingTop: 0,
    paddingBottom: 0,
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
    marginBottom: 10,
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
  introSectionHeadingWrap: {
    marginTop: 4,
    marginBottom: 22,
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
