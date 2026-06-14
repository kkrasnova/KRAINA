import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Platform,
  Alert,
  DeviceEventEmitter,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { useSyncedAppLanguage } from './useAppLanguage';

import { pf } from './profileI18n';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { getAppTheme } from './themeStorage';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { getSavedRoutes, KRAINA_SAVED_ROUTES_CHANGED } from './profileStorage';
import ProfileSavedRouteCard from './ProfileSavedRouteCard';
import { getSavedLandmarks, KRAINA_SAVED_LANDMARKS_CHANGED } from './savedLandmarksStorage';
import { resolveSavedLandmarkRow } from './savedLandmarksResolve';
import { landmarkTitle, regionTitle } from './routeRegionsData';
import { landmarkResultExtrasFromResolvedLandmark } from './homeLandmarkResultParams';
import { dominantVisitCategoryFromLandmark } from './visitStatsStorage';
import { brandFontHeadMedium, brandFontSans, brandFontSansSemibold } from './brandFont';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { HOME_TAB_ROUTE, HOME_TAB } from './homeTabPagerConstants';

function pillShadow(isLight) {
  return Platform.select({
    ios: {
      shadowColor: isLight ? '#0212EB' : '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isLight ? 0.07 : 0.35,
      shadowRadius: 10,
    },
    android: { elevation: isLight ? 2 : 3 },
  });
}

function cardShadow(isLight) {
  return Platform.select({
    ios: {
      shadowColor: isLight ? '#0212EB' : '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isLight ? 0.09 : 0.28,
      shadowRadius: 16,
    },
    android: { elevation: isLight ? 4 : 5 },
  });
}

export default function ProfileLikesPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const language = useSyncedAppLanguage(route, 'uk');
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [savedPlaces, setSavedPlaces] = useState([]);

  const shell = useMemo(
    () => ({
      user: route?.params?.user,
      language,
      ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
      appTheme,
    }),
    [route?.params?.user, route?.params?.countryId, language, appTheme],
  );

  const reload = useCallback(async () => {
    const t = await getAppTheme();
    setAppTheme(t === 'light' ? 'light' : 'dark');
    const [routes, places] = await Promise.all([getSavedRoutes(), getSavedLandmarks()]);
    setSavedRoutes(Array.isArray(routes) ? routes : []);
    setSavedPlaces(Array.isArray(places) ? places : []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    const subL = DeviceEventEmitter.addListener(KRAINA_SAVED_LANDMARKS_CHANGED, () => {
      void reload();
    });
    const subR = DeviceEventEmitter.addListener(KRAINA_SAVED_ROUTES_CHANGED, () => {
      void reload();
    });
    return () => {
      subL.remove();
      subR.remove();
    };
  }, [reload]);

  const openMap = useCallback(() => {
    navigation.navigate(HOME_TAB_ROUTE, {
      ...shell,
      tabIndex: HOME_TAB.MAP,
      routeFinderExtras: {},
    });
  }, [navigation, shell]);

  const openSavedPlace = useCallback(
    (row) => {
      const resolved = resolveSavedLandmarkRow(row);
      if (!resolved) {
        Alert.alert('', pf(language, 'savedPlaceUnavailable'));
        return;
      }
      const { lm, region } = resolved;
      const title = landmarkTitle(lm, langUk);
      const cityName = regionTitle(region, langUk);
      const extract = langUk ? lm.descUk || '' : lm.descEn || lm.descUk || '';
      const rawAudio = typeof lm?.story?.audioUri === 'string' ? lm.story.audioUri.trim() : '';
      const audioGuideUrl = /^https?:\/\//i.test(rawAudio) ? rawAudio : undefined;
      const dist = lm?.distKm;
      const visitKm = dist != null && Number.isFinite(Number(dist)) ? Number(dist) : undefined;
      navigation.navigate('LandmarkResult', {
        language,
        appTheme,
        ...landmarkResultExtrasFromResolvedLandmark({
          lm,
          region,
          countryId: row.countryId,
          language,
          user: route?.params?.user,
        }),
        subtitle: `${region.flag} ${cityName}`,
        extract,
        source: 'sourceDemo',
        startPhase: 'full',
        visitCity: cityName,
        visitCategory: dominantVisitCategoryFromLandmark(lm),
        ...(visitKm != null ? { visitKm } : {}),
        ...(row.countryId ? { countryId: row.countryId } : {}),
        ...(audioGuideUrl ? { audioGuideUrl } : {}),
      });
    },
    [navigation, language, appTheme, langUk, route?.params?.user],
  );

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#727272' : '#A0A0A0';
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const sectionBg = isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)';
  const sectionBorder = isLight ? 'rgba(2, 18, 235, 0.1)' : 'rgba(255,255,255,0.1)';
  const heroGrad0 = isLight ? 'rgba(2,18,235,0.11)' : 'rgba(225,255,0,0.14)';
  /** Повноекранний фон: градієнт підходить під статус-бар і прозору шапку (edge-to-edge). */
  const pageGradColors = isLight
    ? [heroGrad0, 'rgba(230, 234, 248, 0.88)', LIGHT_BAR_BG]
    : [heroGrad0, 'rgba(22, 22, 22, 0.96)', APP_SCREEN_BG];
  const pageGradLocations = isLight ? [0, 0.22, 0.92] : [0, 0.2, 0.88];

  const nRoutes = savedRoutes.length;
  const nPlaces = savedPlaces.length;

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      <LinearGradient
        colors={pageGradColors}
        locations={pageGradLocations}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        centerSubtitle={pf(language, 'likesTitle')}
        hideSendButton
        transparentHeader
      />
      <ScrollView
        style={[styles.scroll, styles.scrollTransparent]}
        contentContainerStyle={{
          paddingBottom: insets.bottom + lightTabBarExtraScrollPadding() + 28,
        }}
        showsVerticalScrollIndicator={false}
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
      >
        <View style={[styles.heroGrad, { paddingHorizontal: Math.max(20, (winW - 400) / 2 + 20) }]}>
          <View style={styles.heroIconRing}>
            <LinearGradient
              colors={
                isLight
                  ? ['rgba(2,18,235,0.18)', 'rgba(2,18,235,0.04)']
                  : ['rgba(225,255,0,0.35)', 'rgba(225,255,0,0.08)']
              }
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name="heart" size={28} color={accent} />
          </View>
          <Text style={[styles.heroKicker, brandFontSansSemibold, { color: accent }]} numberOfLines={1}>
            {pf(language, 'likesHeroKicker')}
          </Text>
          <Text style={[styles.heroTitle, brandFontHeadMedium, { color: textMain }]} numberOfLines={3}>
            {pf(language, 'likesPageSubtitle')}
          </Text>
        </View>

        <View style={[styles.statsRow, { paddingHorizontal: 20 }]}>
          <View style={[styles.statPill, pillShadow(isLight), { borderColor: sectionBorder, backgroundColor: sectionBg }]}>
            <Text style={[styles.statNum, brandFontHeadMedium, { color: textMain }]}>{nRoutes}</Text>
            <Text style={[styles.statLabel, brandFontSans, { color: textMuted }]}>{pf(language, 'likesStatRoutes')}</Text>
          </View>
          <View style={[styles.statPill, pillShadow(isLight), { borderColor: sectionBorder, backgroundColor: sectionBg }]}>
            <Text style={[styles.statNum, brandFontHeadMedium, { color: textMain }]}>{nPlaces}</Text>
            <Text style={[styles.statLabel, brandFontSans, { color: textMuted }]}>{pf(language, 'likesStatPlaces')}</Text>
          </View>
        </View>

        <View style={[styles.section, cardShadow(isLight), { marginHorizontal: 20, backgroundColor: sectionBg, borderColor: sectionBorder }]}>
          <View style={styles.sectionHeadRow}>
            <View style={[styles.sectionIconWrap, { backgroundColor: isLight ? 'rgba(2,18,235,0.08)' : 'rgba(225,255,0,0.12)' }]}>
              <Ionicons name="navigate-circle" size={22} color={accent} />
            </View>
            <Text style={[styles.sectionTitle, brandFontHeadMedium, { color: textMain }]}>{pf(language, 'savedRoutes')}</Text>
          </View>
          {nRoutes === 0 ? (
            <View style={styles.emptyBlock}>
              <View style={[styles.emptySticker, { borderColor: accent }]}>
                <Text style={[styles.emptyStickerGlyph, { color: accent }]}>✦</Text>
                <Text style={[styles.emptyStickerLbl, brandFontSansSemibold, { color: textMain }]}>
                  {pf(language, 'profileRoutesEmptySticker')}
                </Text>
              </View>
              <Text style={[styles.emptyTitle, brandFontHeadMedium, { color: textMain }]}>{pf(language, 'profileRoutesEmptyTitle')}</Text>
              <Text style={[styles.emptyBody, brandFontSans, { color: textMuted }]}>{pf(language, 'profileRoutesEmptySubtitle')}</Text>
              <Pressable
                onPress={openMap}
                android_ripple={ripple}
                style={({ pressed }) => [
                  styles.emptyCta,
                  { backgroundColor: accent, opacity: pressed ? 0.92 : 1 },
                ]}>
                <Ionicons name="map-outline" size={20} color={onAccentButtonText(isLight)} style={{ marginRight: 8 }} />
                <Text style={[styles.emptyCtaTxt, brandFontSansSemibold, { color: onAccentButtonText(isLight) }]}>
                  {pf(language, 'profileRoutesEmptyCta')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.sectionBody}>
              {savedRoutes.map((item) => (
                <ProfileSavedRouteCard
                  key={item.id}
                  item={item}
                  language={language}
                  isLight={isLight}
                  accent={accent}
                  shell={shell}
                  navigation={navigation}
                  style={styles.routeCardGap}
                />
              ))}
            </View>
          )}
        </View>

        <View
          style={[
            styles.section,
            cardShadow(isLight),
            { marginHorizontal: 20, marginTop: 18, backgroundColor: sectionBg, borderColor: sectionBorder },
          ]}>
          <View style={styles.sectionHeadRow}>
            <View style={[styles.sectionIconWrap, { backgroundColor: isLight ? 'rgba(2,18,235,0.08)' : 'rgba(225,255,0,0.12)' }]}>
              <Ionicons name="location" size={22} color={accent} />
            </View>
            <Text style={[styles.sectionTitle, brandFontHeadMedium, { color: textMain }]}>{pf(language, 'savedPlacesHeading')}</Text>
          </View>
          {nPlaces === 0 ? (
            <View style={styles.emptyBlock}>
              <View style={[styles.emptySticker, { borderColor: accent }]}>
                <Text style={[styles.emptyStickerGlyph, { color: accent }]}>📍</Text>
                <Text style={[styles.emptyStickerLbl, brandFontSansSemibold, { color: textMain }]}>
                  {pf(language, 'savedPlacesHeading')}
                </Text>
              </View>
              <Text style={[styles.emptyTitle, brandFontHeadMedium, { color: textMain }]}>{pf(language, 'savedPlacesEmpty')}</Text>
              <Text style={[styles.emptyBody, brandFontSans, { color: textMuted }]}>{pf(language, 'likesPlacesExploreHint')}</Text>
            </View>
          ) : (
            <View style={styles.sectionBody}>
              {savedPlaces.map((row) => {
                const resolved = resolveSavedLandmarkRow(row);
                const placeTitle = langUk ? row.titleUk || row.titleEn : row.titleEn || row.titleUk;
                const regionLine = langUk ? row.regionTitleUk || row.regionTitleEn : row.regionTitleEn || row.regionTitleUk;
                const thumb = resolved?.lm?.thumb;
                return (
                  <Pressable
                    key={row.key}
                    onPress={() => openSavedPlace(row)}
                    android_ripple={ripple}
                    style={({ pressed }) => [
                      styles.placeCard,
                      { borderColor: sectionBorder, backgroundColor: isLight ? 'rgba(2,18,235,0.03)' : 'rgba(255,255,255,0.05)' },
                      pressed && { opacity: 0.9 },
                      !resolved && styles.placeCardStale,
                    ]}>
                    <View style={styles.placeThumbWrap}>
                      {thumb ? (
                        <Image source={thumb} style={styles.placeThumbImg} resizeMode="cover" />
                      ) : (
                        <View style={[styles.placeThumbImg, styles.placeThumbPh]}>
                          <Text style={styles.placeThumbFlag}>{row.flag || '🏳️'}</Text>
                        </View>
                      )}
                      {thumb ? (
                        <LinearGradient
                          colors={['transparent', 'rgba(0,0,0,0.28)']}
                          style={StyleSheet.absoluteFill}
                          pointerEvents="none"
                        />
                      ) : null}
                    </View>
                    <View style={styles.placeBody}>
                      <Text style={[styles.placeTag, brandFontSansSemibold, { color: accent }]} numberOfLines={1}>
                        {row.flag} {regionLine}
                      </Text>
                      <Text style={[styles.placeTitle, brandFontHeadMedium, { color: textMain }]} numberOfLines={2}>
                        {placeTitle}
                      </Text>
                      <View style={styles.placeMoreRow}>
                        <Text style={[styles.placeMore, brandFontSansSemibold, { color: accent }]}>{pf(language, 'more')}</Text>
                        <Ionicons name="chevron-forward" size={18} color={accent} />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' },
  scroll: { flex: 1 },
  scrollTransparent: { backgroundColor: 'transparent' },
  heroGrad: {
    paddingTop: 8,
    paddingBottom: 22,
    alignItems: 'center',
  },
  heroIconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroKicker: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
    maxWidth: 340,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statPill: {
    flex: 1,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  statNum: {
    fontSize: 26,
    lineHeight: 30,
  },
  statLabel: {
    fontSize: 13,
    marginTop: 4,
  },
  section: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingTop: 16,
    paddingBottom: 4,
  },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 18,
    flex: 1,
  },
  sectionBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  routeCardGap: {
    marginBottom: 12,
  },
  emptyBlock: {
    paddingHorizontal: 16,
    paddingBottom: 22,
    paddingTop: 4,
    alignItems: 'center',
  },
  emptySticker: {
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyStickerGlyph: {
    fontSize: 18,
    marginRight: 8,
  },
  emptyStickerLbl: {
    fontSize: 13,
  },
  emptyTitle: {
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 18,
    maxWidth: 320,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 16,
    minWidth: 220,
  },
  emptyCtaTxt: {
    fontSize: 15,
  },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    overflow: 'hidden',
  },
  placeCardStale: { opacity: 0.62 },
  placeThumbWrap: {
    width: 116,
    height: 128,
    overflow: 'hidden',
    backgroundColor: 'rgba(128,128,128,0.2)',
  },
  placeThumbImg: {
    width: 116,
    height: 128,
  },
  placeThumbPh: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeThumbFlag: { fontSize: 32 },
  placeBody: {
    flex: 1,
    paddingVertical: 14,
    paddingRight: 10,
    paddingLeft: 14,
    justifyContent: 'center',
    minWidth: 0,
  },
  placeTag: {
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  placeTitle: {
    fontSize: 17,
    lineHeight: 22,
    marginTop: 6,
  },
  placeMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  placeMore: {
    fontSize: 14,
    marginRight: 2,
  },
});
