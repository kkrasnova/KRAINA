import React, { useMemo, useCallback, useState, useEffect, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { useAppTheme } from './useAppTheme';
import { noAndroidRipple } from './androidFeedback';
import { useSyncedAppLanguage } from './useAppLanguage';

import { getSavedHomeCityRegionId, saveHomeCityRegionId } from './homeCityStorage';
import { getHomeRegionsForCountry, resolveRegionHeroSource, countRegionLandmarks } from './homeExploreData';
import { resolveCatalogRegionTitle } from './catalogDisplayI18n';
import { mt, mtHomeLocationsCount } from './mainPageI18n';
import { accentForTheme } from './themeAccent';
import { countryFlagSource } from './WavingCountryFlag';
import { useHomeLocationsEpoch } from './useHomeLocationsEpoch';
import {
  brandFontSans,
  brandFontHeadBold,
} from './brandFont';
import FittingText from './FittingText';
import HomeScrollSafeMedia, { homeScrollSafeImageStyle } from './HomeScrollSafeMedia';

const CARD_H = 168;
const ROW_GAP = 14;

const CityHeroCard = memo(function CityHeroCard({
  region,
  name,
  locationCount,
  selected,
  heroSource,
  flagSource,
  accent,
  language,
  onPick,
  isLast,
}) {
  const heroKey = `city-picker:${region.id}`;

  return (
    <View style={{ marginBottom: isLast ? 0 : ROW_GAP }}>
      <View
        style={[
          styles.heroOuter,
          { height: CARD_H },
          selected && { borderColor: accent, borderWidth: 2 },
        ]}
        collapsable={false}
      >
        <HomeScrollSafeMedia style={styles.heroMediaBg}>
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
            <View style={[homeScrollSafeImageStyle, styles.heroFallback]}>
              {flagSource ? (
                <ExpoImage
                  source={flagSource}
                  style={styles.heroFlagFallback}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  transition={0}
                />
              ) : (
                <Text style={styles.heroEmojiFallback}>{region.flag || '🏙️'}</Text>
              )}
            </View>
          )}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.32)', 'rgba(0,0,0,0.90)']}
            locations={[0, 0.45, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </HomeScrollSafeMedia>
        <Pressable
          onPress={() => onPick(region.id)}
          style={StyleSheet.absoluteFill}
          android_ripple={noAndroidRipple}
          accessibilityRole="button"
          accessibilityLabel={name}
          accessibilityState={{ selected }}
        >
          <View style={styles.heroContent} pointerEvents="box-none">
            <View style={styles.heroTextBlock}>
              <FittingText style={[styles.heroTitle, brandFontHeadBold]} minimumFontScale={0.55}>
                {name}
              </FittingText>
              <Text style={[styles.heroMeta, brandFontSans]} numberOfLines={1}>
                {mtHomeLocationsCount(language, locationCount)}
              </Text>
            </View>
            <View
              style={[
                styles.trailingBtn,
                { backgroundColor: selected ? accent : 'rgba(255,255,255,0.92)' },
              ]}
            >
              <Ionicons
                name={selected ? 'checkmark' : 'chevron-forward'}
                size={selected ? 18 : 17}
                color={selected ? '#FFFFFF' : accent}
              />
            </View>
          </View>
        </Pressable>
      </View>
    </View>
  );
});

export default function HomeCityPickerPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const user = route?.params?.user || {};
  const countryId = route?.params?.countryId;
  const language = useSyncedAppLanguage(route, 'en');
  const { appTheme, isLight } = useAppTheme(route?.params?.appTheme, route);
  const [selectedId, setSelectedId] = useState(null);
  const accent = accentForTheme(isLight);
  const flagSource = useMemo(() => (countryId ? countryFlagSource(countryId) : null), [countryId]);
  const homeLocationsEpoch = useHomeLocationsEpoch();
  const [focusEpoch, setFocusEpoch] = useState(0);

  const regions = useMemo(
    () => (countryId ? getHomeRegionsForCountry(countryId) : []),
    [countryId, homeLocationsEpoch, focusEpoch],
  );

  useFocusEffect(
    useCallback(() => {
      setFocusEpoch((n) => n + 1);
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!countryId) return;
        const currentRegions = getHomeRegionsForCountry(countryId);
        if (!currentRegions.length) return;
        const saved = await getSavedHomeCityRegionId(user, countryId);
        if (cancelled) return;
        const ok = saved && currentRegions.some((r) => r.id === saved);
        setSelectedId(ok ? saved : currentRegions[0]?.id ?? null);
      })();
      return () => {
        cancelled = true;
      };
    }, [user, countryId]),
  );

  useEffect(() => {
    if (!countryId || !regions.length) {
      navigation.goBack();
    }
  }, [countryId, regions.length, navigation]);

  const onPick = useCallback(
    async (regionId) => {
      if (!countryId) return;
      await saveHomeCityRegionId(user, countryId, regionId);
      setSelectedId(regionId);
      navigation.goBack();
    },
    [navigation, user, countryId],
  );

  const renderItem = useCallback(
    ({ item: r, index }) => (
      <CityHeroCard
        region={r}
        name={resolveCatalogRegionTitle(r, language)}
        locationCount={countRegionLandmarks(r)}
        selected={r.id === selectedId}
        heroSource={resolveRegionHeroSource(r)}
        flagSource={flagSource}
        accent={accent}
        language={language}
        onPick={onPick}
        isLast={index === regions.length - 1}
      />
    ),
    [accent, flagSource, language, onPick, selectedId, regions.length],
  );

  if (!countryId || !regions.length) {
    return null;
  }

  return (
    <View style={[styles.safe, { backgroundColor: isLight ? LIGHT_BAR_BG : APP_SCREEN_BG }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        hideSendButton
        replaceCenterTitle={mt(language, 'homePickCity')}
      />
      <FlatList
        data={regions}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        extraData={`${selectedId}:${homeLocationsEpoch}:${focusEpoch}`}
        style={styles.list}
        removeClippedSubviews={false}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={7}
        updateCellsBatchingPeriod={50}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: Math.max(24, insets.bottom + 24),
          paddingTop: 12,
        }}
        {...(Platform.OS === 'android' ? { overScrollMode: 'never' } : {})}
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { flex: 1 },
  heroOuter: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#121212',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  heroMediaBg: {
    backgroundColor: '#121212',
  },
  heroFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A1A',
  },
  heroFlagFallback: {
    width: 64,
    height: 44,
    borderRadius: 4,
  },
  heroEmojiFallback: {
    fontSize: 40,
  },
  heroContent: {
    position: 'absolute',
    left: 16,
    right: 14,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  heroTextBlock: { flex: 1, minWidth: 0, paddingBottom: 1 },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    letterSpacing: -0.55,
    width: '100%',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroMeta: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12.5,
    marginTop: 3,
    letterSpacing: 0.1,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  trailingBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
});
