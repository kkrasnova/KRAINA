import React, { useRef, useCallback, useEffect, useMemo, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Image,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { mt, mtHomeLocationsCount } from './mainPageI18n';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { accentForTheme } from './themeAccent';
import { countryFlagSource } from './WavingCountryFlag';
const CARD_RADIUS = 16;
const GAP = 12;
/** Одна висота для всіх карток; фото — на всю площу, contain + градієнт лише знизу. */
const CARD_H = 200;

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
  const textMain = '#FFFFFF';
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;

  const cardW = useMemo(() => Math.min(305, Math.max(236, winW - 78)), [winW]);
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
      const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
      const langBase = String(language || 'en').split(/[-_]/)[0].toLowerCase();
      const nPlaces = Number(item.cityCount) || 0;
      const settlementsLine =
        langUk
          ? `${nPlaces} міст і сіл`
          : langBase === 'pl'
            ? `${nPlaces} miast i wioseł`
            : langBase === 'de'
              ? `${nPlaces} Städte & Dörfer`
              : `${nPlaces} cities & towns`;
      const locationsLine = mtHomeLocationsCount(language, item.locationCount);
      const titleLine = item.countryLabel;
      const flagSrc = countryFlagSource(item.id);
      return (
        <Pressable
          onPress={() => onSelectCountry?.(item.id)}
          hitSlop={4}
          delayPressIn={0}
          delayPressOut={0}
          style={({ pressed }) => [
            styles.cardOuter,
            {
              width: cardW,
              height: CARD_H,
              marginRight: GAP,
              opacity: pressed ? 0.72 : 1,
              borderWidth: selected ? 2 : 0,
              borderColor: selected ? accent : 'transparent',
            },
          ]}
        >
           <View style={styles.cardMedia} pointerEvents="none">
            {item.heroThumb ? (
              <Image
                source={item.heroThumb}
                style={styles.heroImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.heroPlaceholder} />
            )}
          </View>
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.40)', 'rgba(0,0,0,0.92)']}
            locations={[0, 0.3, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.cardBottomFade}
          />
          <View style={styles.overlay} pointerEvents="none">
            <View style={styles.overlayRow}>
              <View style={styles.overlayTextCol}>
                <Text style={[styles.countryTitle, { color: textMain }]} numberOfLines={2}>
                  {titleLine}
                </Text>
                <View style={styles.countsRow}>
                  <Text style={styles.countPart}>{settlementsLine}</Text>
                  <Text style={styles.countSep}>·</Text>
                  <Text style={styles.countPart}>{locationsLine}</Text>
                </View>
              </View>
              {flagSrc ? (
                <Image
                  source={flagSrc}
                  style={styles.countryFlagImg}
                  resizeMode="cover"
                  accessibilityLabel={item.countryLabel}
                />
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
    [accent, cardW, isLight, language, onSelectCountry, selectedCountryId, textMain],
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
        <Text style={[styles.sectionTitle, { color: isLight ? '#1E1E1E' : '#FFFFFF', marginBottom: 0 }]}>
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
            <Text style={[styles.allCountriesLink, { color: accent }]}>{mt(language, 'homeAllCountries')}</Text>
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
        contentContainerStyle={{ paddingRight: 24, paddingVertical: 4 }}
        onMomentumScrollEnd={onScrollEnd}
        getItemLayout={getItemLayout}
        removeClippedSubviews={Platform.OS === 'android'}
        maxToRenderPerBatch={6}
        windowSize={3}
        initialNumToRender={4}
        renderItem={renderItem}
        {...(Platform.OS === 'android' ? { overScrollMode: 'never' } : {})}
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
    marginHorizontal: -24,
    paddingLeft: 24,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingRight: 24,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
    marginRight: 8,
  },
  allCountriesLink: {
    fontSize: 14,
    fontWeight: '800',
  },
  cardOuter: {
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
  },
  /** Фото на всю ширину й висоту картки (contain = усе зображення видно). */
  cardMedia: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1A1A1A',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#333',
  },
  /** Лише низ картки — затемнення під текст, фото зверху не перекривається повністю. */
  cardBottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '52%',
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
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 22,
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
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  countSep: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
  },
  countryFlagImg: {
    width: 50,
    height: 36,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  flagEmoji: {
    fontSize: 28,
    lineHeight: 32,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
});
