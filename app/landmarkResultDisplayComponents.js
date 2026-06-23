import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Platform,
  useWindowDimensions,
  Modal,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACCENT_BLUE, onAccentButtonText } from './themeAccent';
import { rippleOnDarkSurface } from './androidFeedback';

// ─── Constants ─────────────────────────────────────────────────────────────

const AUTH_CTA_ACCENT = '#E1FF00';
const AUTH_CTA_BACK = '#6F8500';
const AUTH_CTA_FRONT_BORDER = '#7A9000';

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  illustrationLightboxRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  illustrationLightboxScroll: {
    flex: 1,
    width: '100%',
  },
  illustrationLightboxScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  illustrationLightboxCaption: {
    position: 'absolute',
    left: 24,
    right: 24,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 18,
  },
  illustrationLightboxClose: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authCtaOuter: {
    alignSelf: 'stretch',
    width: '100%',
    minHeight: 48,
    height: 52,
    borderRadius: 999,
    marginTop: 8,
    marginBottom: 4,
    position: 'relative',
    overflow: 'visible',
  },
  authCtaBack: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  authCtaFront: {
    position: 'absolute',
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
    ...Platform.select({ android: { fontFamily: 'sans-serif-medium' } }),
  },
});

// ─── Asset helpers ─────────────────────────────────────────────────────────

function resolveAssetAspect(source) {
  const resolved = typeof source === 'number' ? Image.resolveAssetSource(source) : null;
  if (!resolved?.width || !resolved?.height) return 1;
  return resolved.width / Math.max(1, resolved.height);
}

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

// ─── Components ────────────────────────────────────────────────────────────

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

function IntroPhotoTap({ source, caption, onOpen, language, style, children }) {
  if (!source || !onOpen) return children;
  const label =
    String(caption || '').trim() ||
    (language === 'uk' ? 'Збільшити фото' : 'Enlarge photo');
  return (
    <Pressable
      onPress={() => onOpen(source, caption)}
      style={style}
      accessibilityRole="imagebutton"
      accessibilityLabel={label}
    >
      {children}
    </Pressable>
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

export {
  resolveAssetAspect,
  fitAssetWithinBox,
  LandmarkIllustrationLightbox,
  IntroPhotoTap,
  AuthStylePrimaryCta,
};
