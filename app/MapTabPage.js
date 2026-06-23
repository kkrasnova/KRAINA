import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  Text,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from './useAppTheme';
import { useSyncedAppLanguage } from './useAppLanguage';
import { brandFontSansBold } from './brandFont';

import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { gm } from './geoMapI18n';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { accentForTheme } from './themeAccent';
import GeoMapExplorer from './GeoMapExplorer';
import { markEnd } from './performanceMetrics';
import RouteFinderPage from './RouteFinderPage';

/**
 * Вкладка «Карта» в HomeTabPager: реальна карта + пошук + маршрут між точками,
 * і класичний планувальник маршруту KRAÏNA.
 */
const MAP_TAB_CHROME_GAP = 8;
/** Додатковий зазор між перемикачем «Карта/Маршрут» і панеллю пошуку на карті */
const SEARCH_BELOW_TAB_GAP = 10;

export default function MapTabPage({ navigation, route, isTabActive = true }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const { appTheme } = useAppTheme(route?.params?.appTheme, route);
  const [mode, setMode] = useState('map');
  const mapReadyRef = useRef(false);
  const [segmentLayout, setSegmentLayout] = useState({ width: 0 });
  const [tabChromeHeight, setTabChromeHeight] = useState(52);
  const segmentPad = 3;
  const slide = useRef(new Animated.Value(mode === 'map' ? 0 : 1)).current;

  const innerWidth = Math.max(0, segmentLayout.width - segmentPad * 2);
  const pillW = innerWidth > 0 ? innerWidth / 2 : 0;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: mode === 'map' ? 0 : 1,
      useNativeDriver: true,
      friction: 7,
      tension: 80,
      restDisplacementThreshold: 0.5,
      restSpeedThreshold: 0.5,
    }).start();
  }, [mode, slide]);

  const pillTranslate = useMemo(
    () =>
      slide.interpolate({
        inputRange: [0, 1],
        outputRange: [0, Math.max(0, pillW)],
      }),
    [slide, pillW],
  );

  useEffect(() => {
    if (route?.params?.mapInitialRoutePoint) setMode('map');
  }, [route?.params?.mapInitialRoutePoint]);

  useEffect(() => {
    if (!mapReadyRef.current) {
      mapReadyRef.current = true;
      markEnd('map_interactive');
    }
  }, []);

  const isLight = appTheme === 'light';
  const bg = isLight ? '#F2F2EA' : '#0A0A0A';
  const accent = accentForTheme(isLight);
  const segmentTrackBg = isLight ? '#FFFFFF' : 'rgba(28,28,30,0.96)';
  const segmentPillBg = isLight ? '#ECECEC' : 'rgba(255,255,255,0.18)';
  const segmentTextActive = isLight ? '#0A0A0A' : '#F7F7F2';
  const segmentTextMuted = isLight ? '#6B6B6B' : '#B0B0B0';
  const segmentBorder = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.22)';
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const tabBarPad = lightTabBarExtraScrollPadding();

  const mapTopInset =
    insets.top +
    MAP_TAB_CHROME_GAP +
    Math.max(44, tabChromeHeight) +
    SEARCH_BELOW_TAB_GAP;
  const plannerHeroTop =
    insets.top +
    MAP_TAB_CHROME_GAP +
    Math.max(44, tabChromeHeight) +
    SEARCH_BELOW_TAB_GAP +
    4;

  return (
    <View style={[styles.screen, mode === 'planner' && { backgroundColor: bg }]}>
      <View style={[styles.body, Platform.OS === 'android' && styles.bodyAndroid]}>
        {mode === 'map' ? (
          <GeoMapExplorer
            navigation={navigation}
            route={route}
            bottomInset={tabBarPad}
            topContentInset={mapTopInset}
            isTabActive={isTabActive}
          />
        ) : (
          <RouteFinderPage
            navigation={navigation}
            route={route}
            embedHeroPaddingTop={plannerHeroTop}
          />
        )}
      </View>

      <View
        pointerEvents="box-none"
        style={[styles.tabChrome, { paddingTop: insets.top + MAP_TAB_CHROME_GAP }]}
      >
        <View
          onLayout={(e) => {
            setSegmentLayout({ width: e.nativeEvent.layout.width });
            setTabChromeHeight(e.nativeEvent.layout.height);
          }}
          style={styles.segmentWrap}
        >
          <View
            style={[
              styles.segmentOuter,
              isLight ? styles.segmentOuterLight : styles.segmentOuterDark,
            ]}
          >
            <View
              style={[
                styles.segment,
                {
                  borderColor: segmentBorder,
                  padding: segmentPad,
                  backgroundColor: segmentTrackBg,
                },
              ]}
            >
              {pillW > 0 ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.segmentPill,
                    {
                      width: pillW,
                      backgroundColor: segmentPillBg,
                      transform: [{ translateX: pillTranslate }],
                    },
                  ]}
                />
              ) : null}
              <View style={styles.segmentRow}>
                <Pressable
                  onPress={() => setMode('map')}
                  android_ripple={ripple}
                  style={({ pressed }) => [
                    styles.segBtn,
                    pressed && styles.segBtnPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.segTxt,
                      brandFontSansBold,
                      {
                        color: mode === 'map' ? (isLight ? segmentTextActive : accent) : segmentTextMuted,
                      },
                    ]}
                  >
                    {gm(language, 'mapTab')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setMode('planner')}
                  android_ripple={ripple}
                  style={({ pressed }) => [
                    styles.segBtn,
                    pressed && styles.segBtnPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.segTxt,
                      brandFontSansBold,
                      {
                        color:
                          mode === 'planner' ? (isLight ? segmentTextActive : accent) : segmentTextMuted,
                      },
                    ]}
                  >
                    {gm(language, 'plannerTab')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  tabChrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 20,
  },
  segmentWrap: { paddingHorizontal: 16, marginBottom: 0 },
  segmentOuter: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
  },
  segmentOuterLight: {
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  segmentOuterDark: {
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#1A1A1C',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
    }),
  },
  segment: {
    position: 'relative',
    borderRadius: 20,
    overflow: 'hidden',
  },
  segmentPill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 18,
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    zIndex: 2,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segBtnPressed: { opacity: 0.88 },
  segTxt: {
    fontSize: 15,
    letterSpacing: 0.3,
  },
  body: { flex: 1 },
  bodyAndroid: { overflow: 'hidden' },
});
