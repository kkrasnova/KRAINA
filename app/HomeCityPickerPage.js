import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Platform, DeviceEventEmitter } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { getAppTheme, THEME_CHANGED_EVENT } from './themeStorage';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { getSavedHomeCityRegionId, saveHomeCityRegionId } from './homeCityStorage';
import { getHomeRegionsForCountry } from './homeExploreData';
import { regionTitle } from './routeRegionsData';
import { mt, mtHomeLocationsCount } from './mainPageI18n';
import { accentForTheme } from './themeAccent';
const CARD_DARK = '#141414';
const BORDER_DARK = '#2A2A2A';
const MUTED = '#888888';

export default function HomeCityPickerPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const user = route?.params?.user || {};
  const countryId = route?.params?.countryId;
  const language = useSyncedAppLanguage(route, 'en');
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme === 'light' ? 'light' : 'dark');
  const [selectedId, setSelectedId] = useState(null);
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;

  const regions = useMemo(() => (countryId ? getHomeRegionsForCountry(countryId) : []), [countryId]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setAppTheme(v === 'light' ? 'light' : 'dark');
    });
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const t = await getAppTheme();
        if (!cancelled) setAppTheme(t === 'light' ? 'light' : 'dark');
        if (!countryId || !regions.length) return;
        const saved = await getSavedHomeCityRegionId(user, countryId);
        if (cancelled) return;
        const ok = saved && regions.some((r) => r.id === saved);
        setSelectedId(ok ? saved : regions[0]?.id ?? null);
      })();
      return () => {
        cancelled = true;
      };
    }, [user, countryId, regions]),
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
    ({ item: r }) => {
      const name = regionTitle(r, langUk);
      const n = r.landmarks?.length || 0;
      const selected = r.id === selectedId;
      return (
        <Pressable
          onPress={() => onPick(r.id)}
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
          <Text style={styles.rowFlag}>{r.flag}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: isLight ? '#1E1E1E' : '#FFFFFF' }]} numberOfLines={2}>
              {name}
            </Text>
            <Text style={[styles.rowMeta, { color: isLight ? '#5C5C5C' : MUTED }]}>
              {mtHomeLocationsCount(language, n)}
            </Text>
          </View>
          {selected ? (
            <Ionicons name="checkmark-circle" size={22} color={accent} />
          ) : (
            <Ionicons name="chevron-forward" size={20} color={accent} />
          )}
        </Pressable>
      );
    },
    [accent, isLight, langUk, language, onPick, ripple, selectedId],
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
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: Math.max(24, insets.bottom + 24),
          paddingTop: 8,
        }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        {...(Platform.OS === 'android' ? { overScrollMode: 'never' } : {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  rowFlag: { fontSize: 26 },
  rowTitle: { fontSize: 16, fontWeight: '700' },
  rowMeta: { fontSize: 13, marginTop: 4, fontWeight: '600' },
});
