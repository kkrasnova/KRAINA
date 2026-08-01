import React, { memo, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import {
  resolveCatalogLandmarkTitle,
  resolveLandmarkDescI18n,
} from './catalogDisplayI18n';
import { mt, mtHomePlaceLine } from './mainPageI18n';
import {
  resolveHomeLandmarkThumbSource,
  homeLandmarkThumbKey,
  homeImageRecyclingKey,
  normalizeHomeExpoImageSource,
} from './homeLandmarkDisplay';
import { HERO_THUMB_MAP } from './krainaHeroThumbs';
import { countryFlagSource } from './WavingCountryFlag';
import FittingText from './FittingText';

export const HOME_LANDMARK_CARD_DARK = '#1A1A1A';
export const HOME_LANDMARK_CARD_BORDER_DARK = '#2A2A2A';
export const HOME_LANDMARK_CARD_BORDER_LIGHT = 'rgba(30,30,30,0.08)';
export const HOME_LANDMARK_CARD_MUTED_DARK = '#9A9A9A';
export const HOME_LANDMARK_CARD_MUTED_LIGHT = '#5C5C5C';

function HomeLandmarkCard({
  lm,
  region,
  countryId,
  language,
  isLight,
  accent,
  cardBg,
  cardBorder,
  textMain,
  textMuted,
  regionLabel,
  dist,
  isSaved,
  onOpen,
  onPressIn,
  onToggleSave,
  homeLocationsEpoch = 0,
  style,
}) {
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const flagImgSrc = useMemo(() => countryFlagSource(countryId), [countryId]);
  const line = mtHomePlaceLine(language, regionLabel, dist);
  const catalogCtx = useMemo(
    () => ({ regionId: region?.id, landmarkId: lm?.id }),
    [region?.id, lm?.id],
  );
  const title = resolveCatalogLandmarkTitle(lm, language, {
    ...catalogCtx,
    region,
  });
  const desc = resolveLandmarkDescI18n(lm, language, catalogCtx);
  const thumbKey = homeLandmarkThumbKey(lm);
  const resolvedThumb = useMemo(() => {
    const raw = resolveHomeLandmarkThumbSource(lm);
    return normalizeHomeExpoImageSource(raw) || raw || null;
  }, [lm, thumbKey, homeLocationsEpoch]);
  const thumbIdentity = `${region?.id || ''}:${lm?.id || ''}:${thumbKey}:${homeLocationsEpoch}`;
  const [failedIdentity, setFailedIdentity] = useState(null);
  const fallbackSource = useMemo(
    () => normalizeHomeExpoImageSource(HERO_THUMB_MAP.t1) || HERO_THUMB_MAP.t1,
    [],
  );
  const thumbSource = failedIdentity === thumbIdentity ? fallbackSource : resolvedThumb;
  const imageRecyclingKey = useMemo(
    () => homeImageRecyclingKey(`${region?.id || ''}:${lm?.id || ''}`, thumbSource, 'home-lm-card'),
    [region?.id, lm?.id, thumbSource],
  );

  return (
    <View style={[styles.locCard, { backgroundColor: cardBg, borderColor: cardBorder }, style]}>
      <Pressable
        style={({ pressed }) => [styles.locThumbWrap, pressed && styles.pressedThumb]}
        onPress={onOpen}
        onPressIn={onPressIn}
        android_ripple={ripple}
        accessibilityRole="button"
        accessibilityLabel={title}
      >
        <ExpoImage
          key={imageRecyclingKey}
          source={thumbSource}
          style={styles.locThumbImg}
          contentFit="cover"
          contentPosition="center"
          cachePolicy="memory-disk"
          recyclingKey={imageRecyclingKey}
          transition={0}
          allowDownscaling
          onError={() => setFailedIdentity(thumbIdentity)}
        />
      </Pressable>
      <Pressable
        style={styles.locBody}
        onPress={onOpen}
        onPressIn={onPressIn}
        android_ripple={ripple}
        accessibilityRole="button"
        accessibilityLabel={title}
      >
        <View style={styles.locBodyTop}>
          <View style={styles.locTopRow}>
            <View style={styles.locTopRowLeft}>
              {flagImgSrc ? (
                <ExpoImage
                  source={flagImgSrc}
                  style={styles.locFlagImg}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={0}
                />
              ) : (
                <Text style={styles.locFlagFallback}>{region.flag}</Text>
              )}
              <Text style={[styles.locMeta, { color: textMain }]} numberOfLines={1}>
                {line}
              </Text>
            </View>
            <Pressable
              style={[
                styles.saveCircle,
                {
                  borderColor: isLight ? 'rgba(2, 18, 235, 0.45)' : 'rgba(225,255,0,0.45)',
                  backgroundColor: isSaved
                    ? isLight
                      ? 'rgba(2, 18, 235, 0.12)'
                      : 'rgba(225, 255, 0, 0.14)'
                    : 'transparent',
                },
              ]}
              onPress={onToggleSave}
              android_ripple={ripple}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ selected: isSaved }}
              accessibilityLabel={
                isSaved ? mt(language, 'homeRemoveSavedLandmarkA11y') : mt(language, 'homeSaveLandmarkA11y')
              }
            >
              <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={15} color={accent} />
            </Pressable>
          </View>
          <FittingText style={[styles.locTitle, { color: textMain }]} numberOfLines={2} minimumFontScale={0.6}>
            {title}
          </FittingText>
          <Text style={[styles.locDesc, { color: textMuted }]} numberOfLines={2} ellipsizeMode="tail">
            {desc}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

export default memo(HomeLandmarkCard);

const styles = StyleSheet.create({
  locCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    minHeight: 88,
    overflow: 'hidden',
  },
  pressedThumb: { opacity: 0.88 },
  locThumbWrap: {
    width: 76,
    height: 76,
    alignSelf: 'center',
    marginVertical: 6,
    marginLeft: 6,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  locThumbImg: {
    width: 76,
    height: 76,
  },
  locBody: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  locBodyTop: { flexShrink: 1 },
  locTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  locTopRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flex: 1,
    marginRight: 6,
    minWidth: 0,
  },
  locFlagImg: {
    width: 18,
    height: 18,
    borderRadius: 5,
    overflow: 'hidden',
  },
  locFlagFallback: { fontSize: 11, lineHeight: 14 },
  locMeta: { fontSize: 11, flex: 1, marginRight: 0 },
  saveCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
    width: '100%',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  locDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
});
