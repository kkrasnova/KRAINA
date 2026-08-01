import React, { useRef, useCallback, useEffect, useMemo, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { mt, mtHomeLocationsCount, mtHomeSettlementsCount } from './mainPageI18n';
import { rippleOnDarkSurface, rippleOnLightSurface, noAndroidRipple } from './androidFeedback';
import { accentForTheme } from './themeAccent';
import { countryFlagSource } from './WavingCountryFlag';
import { brandFontHeadBold, brandFontSans } from './brandFont';
import FittingText from './FittingText';
import { homeImageRecyclingKey, normalizeHomeExpoImageSource } from './homeLandmarkDisplay';
import HomeScrollSafeMedia, { homeScrollSafeImageStyle } from './HomeScrollSafeMedia';

const CARD_RADIUS = 16;
const GAP = 10;
const CARD_H = 176;
/** Відступ зліва + peek наступної картки; ширина обмежена як раніше. */
const CARD_SIDE_PAD = 24;
const CARD_PEEK = 16;
const CARD_W_MAX = 332;
const CARD_W_MIN = 248;
const TITLE_PAD_H = 24;

export default memo(function HomeCountryCarousel({
  language,
  appTheme,
  countries,
  selectedCountryId,
  onSelectCountry,
  onOpenAllCountries,
}) {
  const { width: winW } = useWindowDimensions();
  const listRef = useRef(null);
  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;

  const cardW = useMemo(
    () => Math.min(CARD_W_MAX, Math.max(CARD_W_MIN, winW - CARD_SIDE_PAD - CARD_PEEK)),
    [winW],
  );
  const itemStride = cardW + GAP;

  const data = countries || [];

  const selectedIndex = useMemo(() => {
    const i = data.findIndex((c) => c.id === selectedCountryId);
    return i >= 0 ? i : 0;
  }, [data, selectedCountryId]);

  useEffect(() => {
    if (!data.length || !listRef.current) return;
    const idx = Math.min(selectedIndex, data.length - 1);
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index: idx, animated: false, viewPosition: 0 });
      } catch {
        /* */
      }
    });
  }, [selectedCountryId, data, selectedIndex]);

  const onScrollEnd = useCallback(
    (e) => {
      const x = e.nativeEvent.contentOffset.x;
      const idx = Math.min(data.length - 1, Math.max(0, Math.round(x / itemStride)));
      const row = data[idx];
      if (row?.id && row.id !== selectedCountryId) onSelectCountry?.(row.id);
    },
    [data, itemStride, onSelectCountry, selectedCountryId],
  );

  const renderItem = useCallback(
    ({ item }) => {
      const selected = item.id === selectedCountryId;
      const nPlaces = Number(item.cityCount) || 0;
      const settlementsLine = mtHomeSettlementsCount(language, nPlaces);
      const locationsLine = mtHomeLocationsCount(language, item.locationCount);
      const flagSrc = countryFlagSource(item.id);
      const heroSource =
        normalizeHomeExpoImageSource(item.heroThumb) || item.heroThumb || null;
      const heroKey = homeImageRecyclingKey(item.id, heroSource, 'country-hero');
      const flagKey = `flag:${item.id}`;
      return (
        <Pressable
          onPress={() => onSelectCountry?.(item.id)}
          hitSlop={4}
          android_ripple={noAndroidRipple}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          accessibilityLabel={item.countryLabel}
          style={[
            styles.cardOuter,
            {
              width: cardW,
              height: CARD_H,
              marginRight: GAP,
              borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
              borderColor: selected ? accent : 'rgba(255,255,255,0.12)',
            },
          ]}
        >
          <HomeScrollSafeMedia>
            {heroSource ? (
              <ExpoImage
                key={heroKey}
                source={heroSource}
                style={homeScrollSafeImageStyle}
                contentFit="cover"
                contentPosition="center"
                cachePolicy="memory-disk"
                recyclingKey={heroKey}
                transition={0}
                allowDownscaling
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View style={styles.heroPlaceholder} />
            )}
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.40)', 'rgba(0,0,0,0.92)']}
              locations={[0, 0.3, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.cardBottomFade}
            />
          </HomeScrollSafeMedia>
          <View style={styles.overlay} pointerEvents="none">
            <View style={styles.overlayRow}>
              <View style={styles.overlayTextCol}>
                <FittingText style={[styles.countryTitle, brandFontHeadBold]} numberOfLines={1} minimumFontScale={0.55}>
                  {item.countryLabel}
                </FittingText>
                <View style={styles.countsRow}>
                  <Text style={[styles.countPart, brandFontSans]}>{settlementsLine}</Text>
                  <Text style={styles.countSep}>·</Text>
                  <Text style={[styles.countPart, brandFontSans]}>{locationsLine}</Text>
                </View>
              </View>
              {flagSrc ? (
                <View style={styles.flagChip}>
                  <ExpoImage
                    key={flagKey}
                    source={flagSrc}
                    style={styles.countryFlagImg}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={flagKey}
                    transition={0}
                    accessibilityLabel={item.countryLabel}
                  />
                </View>
              ) : (
                <Text style={styles.flagEmoji} allowFontScaling={false} accessibilityLabel={item.countryLabel}>
                  {item.flag || '🏳️'}
                </Text>
              )}
            </View>
          </View>
        </Pressable>
      );
    },
    [accent, cardW, language, onSelectCountry, selectedCountryId],
  );

  const getItemLayout = useCallback(
    (_, index) => ({
      length: itemStride,
      offset: itemStride * index,
      index,
    }),
    [itemStride],
  );

  const keyExtractor = useCallback((item) => item.id, []);

  if (!data.length) return null;

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Text
          style={[
            styles.sectionTitle,
            brandFontHeadBold,
            { color: isLight ? '#1E1E1E' : '#FFFFFF', marginBottom: 0 },
          ]}
        >
          {mt(language, 'homeChooseCountry')}
        </Text>
        {typeof onOpenAllCountries === 'function' ? (
          <Pressable
            onPress={onOpenAllCountries}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            android_ripple={ripple}
            accessibilityRole="button"
            accessibilityLabel={mt(language, 'homeAllCountries')}
          >
            <Text style={[styles.allCountriesLink, brandFontSans, { color: accent }]}>
              {mt(language, 'homeAllCountries')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={itemStride}
        snapToAlignment="start"
        disableIntervalMomentum
        nestedScrollEnabled
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingLeft: CARD_SIDE_PAD, paddingRight: CARD_PEEK, paddingVertical: 4 }}
        onMomentumScrollEnd={onScrollEnd}
        getItemLayout={getItemLayout}
        removeClippedSubviews={false}
        maxToRenderPerBatch={4}
        windowSize={5}
        initialNumToRender={3}
        renderItem={renderItem}
        {...(Platform.OS === 'ios'
          ? { directionalLockEnabled: true, bounces: false, alwaysBounceHorizontal: false }
          : { overScrollMode: 'never' })}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, animated: false });
          }, 100);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  section: {
    marginBottom: 18,
    /** Full-bleed ряд карток: без від’ємного margin (він кліпав фото під час вертикального скролу). */
    alignSelf: 'stretch',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: TITLE_PAD_H,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    flex: 1,
    marginRight: 8,
    letterSpacing: -0.35,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  allCountriesLink: {
    fontSize: 14,
    fontWeight: '700',
  },
  cardOuter: {
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
  },
  heroPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#333',
  },
  cardBottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },
  overlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
  },
  overlayRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  overlayTextCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  countryTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    letterSpacing: -0.2,
    lineHeight: 22,
    width: '100%',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  countsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 6,
  },
  countPart: {
    fontSize: 12.5,
    color: '#FFFFFF',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  countSep: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
  },
  countryFlagImg: {
    width: 36,
    height: 36,
  },
  flagChip: {
    width: 36,
    height: 36,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  flagEmoji: {
    fontSize: 22,
    lineHeight: 36,
    textAlign: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
});
