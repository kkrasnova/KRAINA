import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { noAndroidRipple } from './androidFeedback';
import FittingText from './FittingText';
import { brandFontSans, brandFontHeadBold } from './brandFont';
import { homeImageRecyclingKey, normalizeHomeExpoImageSource } from './homeLandmarkDisplay';
import HomeScrollSafeMedia, { homeScrollSafeImageStyle } from './HomeScrollSafeMedia';

export const HOME_FEATURED_LANDMARK_H = 168;

/**
 * Hero-картка локації на головній — окремий memo, щоб скрол FlashList
 * не перемальовував усі зображення при зміні збережених / дистанції сусідів.
 */
function HomeFeaturedLandmarkCard({
  landmarkId,
  title,
  distLabel,
  thumb,
  isSaved,
  onPress,
  onPressIn,
  onToggleSave,
}) {
  const imageSource = useMemo(() => normalizeHomeExpoImageSource(thumb) || thumb || null, [thumb]);
  const imageKey = useMemo(
    () => homeImageRecyclingKey(landmarkId, imageSource, 'home-lm'),
    [landmarkId, imageSource],
  );

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      style={[styles.featuredOuter, { height: HOME_FEATURED_LANDMARK_H }]}
      android_ripple={noAndroidRipple}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${distLabel}`}
    >
      <HomeScrollSafeMedia>
        {imageSource ? (
          <ExpoImage
            key={imageKey}
            source={imageSource}
            style={homeScrollSafeImageStyle}
            contentFit="cover"
            contentPosition="center"
            cachePolicy="memory-disk"
            recyclingKey={imageKey}
            transition={0}
            allowDownscaling
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[homeScrollSafeImageStyle, styles.featuredFallback]} />
        )}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0.92)']}
          locations={[0, 0.4, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </HomeScrollSafeMedia>
      <Pressable
        style={[
          styles.featuredSave,
          {
            borderColor: 'rgba(255,255,255,0.35)',
            backgroundColor: isSaved ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.35)',
          },
        ]}
        onPress={onToggleSave}
        hitSlop={8}
        android_ripple={noAndroidRipple}
        accessibilityRole="button"
        accessibilityState={{ selected: isSaved }}
      >
        <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={16} color="#FFFFFF" />
      </Pressable>
      <View style={styles.featuredContent} pointerEvents="box-none">
        <FittingText
          style={[styles.featuredTitle, brandFontHeadBold]}
          numberOfLines={2}
          minimumFontScale={0.55}
        >
          {title}
        </FittingText>
        <Text style={[styles.featuredMeta, brandFontSans]} numberOfLines={1}>
          {distLabel}
        </Text>
      </View>
    </Pressable>
  );
}

export default memo(HomeFeaturedLandmarkCard);

const styles = StyleSheet.create({
  featuredOuter: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#121212',
    marginBottom: 12,
    marginHorizontal: 24,
  },
  featuredFallback: {
    backgroundColor: '#1A1A1A',
  },
  featuredSave: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  featuredContent: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
  },
  featuredMeta: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    marginTop: 4,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  featuredTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    letterSpacing: -0.4,
    width: '100%',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
});
