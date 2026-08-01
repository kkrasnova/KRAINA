import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { noAndroidRipple } from './androidFeedback';
import FittingText from './FittingText';
import { brandFontSans, brandFontHeadBold } from './brandFont';
import { mtHomeLocationsCount } from './mainPageI18n';
import { homeImageRecyclingKey, normalizeHomeExpoImageSource } from './homeLandmarkDisplay';
import HomeScrollSafeMedia, { homeScrollSafeImageStyle } from './HomeScrollSafeMedia';

export const HOME_CITY_TILE_W = 128;
export const HOME_CITY_TILE_H = 148;

function HomeCityTile({
  regionId,
  name,
  hero,
  locs,
  selected,
  accent,
  language,
  onPress,
}) {
  const imageSource = useMemo(() => normalizeHomeExpoImageSource(hero) || hero || null, [hero]);
  const imageKey = useMemo(
    () => homeImageRecyclingKey(regionId || name, imageSource, 'home-city'),
    [regionId, name, imageSource],
  );

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.cityTile,
        {
          borderColor: selected ? accent : 'rgba(255,255,255,0.1)',
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
        },
      ]}
      android_ripple={noAndroidRipple}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={name}
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
          <View style={[homeScrollSafeImageStyle, styles.cityTileFallback]} />
        )}
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(0,0,0,0.88)']}
          locations={[0.35, 1]}
          style={StyleSheet.absoluteFill}
        />
      </HomeScrollSafeMedia>
      <View style={styles.cityTileLabel} pointerEvents="none">
        <FittingText style={[styles.cityTileName, brandFontHeadBold]} minimumFontScale={0.55}>
          {name}
        </FittingText>
        <Text style={[styles.cityTileMeta, brandFontSans]} numberOfLines={1}>
          {mtHomeLocationsCount(language, locs)}
        </Text>
      </View>
    </Pressable>
  );
}

export default memo(HomeCityTile);

const styles = StyleSheet.create({
  cityTile: {
    width: HOME_CITY_TILE_W,
    height: HOME_CITY_TILE_H,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#121212',
    marginRight: 10,
  },
  cityTileFallback: {
    backgroundColor: '#2A2A2A',
  },
  cityTileLabel: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
  },
  cityTileName: {
    color: '#FFFFFF',
    fontSize: 14,
    letterSpacing: -0.2,
    width: '100%',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  cityTileMeta: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    marginTop: 2,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
});
