import React, { useMemo, useCallback, useState, useEffect, memo } from 'react';
import { FlashList } from '@shopify/flash-list';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  DeviceEventEmitter,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { useAppTheme } from './useAppTheme';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { useSyncedAppLanguage } from './useAppLanguage';

import { getSavedHomeCityRegionId, saveHomeCityRegionId } from './homeCityStorage';
import { getHomeRegionsForCountry, resolveRegionHeroSource, countRegionLandmarks } from './homeExploreData';
import { resolveCatalogRegionTitle } from './catalogDisplayI18n';
import { mt, mtHomeLocationsCount } from './mainPageI18n';
import { accentForTheme } from './themeAccent';
import { countryFlagSource } from './WavingCountryFlag';
import { useHomeLocationsEpoch } from './useHomeLocationsEpoch';

const CARD_DARK = '#141414';
const BORDER_DARK = '#2A2A2A';
const MUTED = '#888888';
const ROW_GAP = 12;
const THUMB_SIZE = 72;

const CityPickerRow = memo(function CityPickerRow({
  region,
  name,
  locationCount,
  selected,
  heroSource,
  heroIsKyiv,
  flagSource,
  isLight,
  accent,
  language,
  onPick,
  ripple,
}) {
  const thumbBg = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
  return (
    <Pressable
      onPress={() => onPick(region.id)}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: isLight ? '#FFFFFF' : CARD_DARK,
          borderColor: selected
            ? accent
            : isLight
              ? 'rgba(30,30,30,0.08)'
              : BORDER_DARK,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
      android_ripple={ripple}
    >
      <View style={[styles.rowThumbWrap, { backgroundColor: thumbBg }]}>
        {heroSource ? (
          <Image
            key={region.id}
            source={heroSource}
            style={[styles.rowThumbImg, heroIsKyiv && styles.rowThumbImgKyiv]}
            resizeMode="cover"
          />
        ) : flagSource ? (
          <View style={styles.rowThumbFallback}>
            <Image source={flagSource} style={styles.rowThumbFlagImg} resizeMode="contain" />
          </View>
        ) : (
          <View style={styles.rowThumbFallback}>
            <Text style={styles.rowFlag}>{region.flag}</Text>
          </View>
        )}
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: isLight ? '#1E1E1E' : '#FFFFFF' }]} numberOfLines={2}>
          {name}
        </Text>
        <Text style={[styles.rowMeta, { color: isLight ? '#5C5C5C' : MUTED }]}>
          {mtHomeLocationsCount(language, locationCount)}
        </Text>
      </View>
      <View style={styles.rowTrailing}>
        {selected ? (
          <Ionicons name="checkmark-circle" size={22} color={accent} />
        ) : (
          <Ionicons name="chevron-forward" size={20} color={accent} />
        )}
      </View>
    </Pressable>
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
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
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
    ({ item: r }) => (
      <CityPickerRow
        region={r}
        name={resolveCatalogRegionTitle(r, language)}
        locationCount={countRegionLandmarks(r)}
        selected={r.id === selectedId}
        heroSource={resolveRegionHeroSource(r)}
        heroIsKyiv={r.id === 'kyiv'}
        flagSource={flagSource}
        isLight={isLight}
        accent={accent}
        language={language}
        onPick={onPick}
        ripple={ripple}
      />
    ),
    [accent, flagSource, isLight, language, onPick, ripple, selectedId, homeLocationsEpoch, focusEpoch],
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
      <FlashList
        data={regions}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        estimatedItemSize={THUMB_SIZE + 24 + ROW_GAP}
        extraData={`${selectedId}:${homeLocationsEpoch}:${focusEpoch}`}
        style={styles.list}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: Math.max(24, insets.bottom + 24),
          paddingTop: 8,
        }}
        {...(Platform.OS === 'android' ? { overScrollMode: 'never' } : {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 12,
    marginBottom: ROW_GAP,
  },
  rowThumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 12,
    flexShrink: 0,
    overflow: 'hidden',
  },
  rowThumbImg: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
  },
  rowThumbImgKyiv: {
    height: THUMB_SIZE + 12,
    transform: [{ translateY: -6 }],
  },
  rowThumbFlagImg: {
    width: 40,
    height: 28,
    borderRadius: 3,
  },
  rowThumbFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowFlag: { fontSize: 26 },
  rowBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 16, fontWeight: '700' },
  rowMeta: { fontSize: 13, marginTop: 4, fontWeight: '600' },
  rowTrailing: {
    alignSelf: 'center',
    paddingRight: 12,
  },
});
