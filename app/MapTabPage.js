import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  Text,
  Animated,
  DeviceEventEmitter,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAppTheme, THEME_CHANGED_EVENT } from './themeStorage';
import { useSyncedAppLanguage } from './useAppLanguage';

import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { gm } from './geoMapI18n';
import { rippleOnLightSurface } from './androidFeedback';
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

export default function MapTabPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
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
    let c = false;
    (async () => {
      const t = await getAppTheme();
      if (!c) {
        setAppTheme(t === 'light' ? 'light' : 'dark');
        if (!mapReadyRef.current) {
          mapReadyRef.current = true;
          markEnd('map_interactive');
        }
      }
    })();
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setAppTheme(v === 'light' ? 'light' : 'dark');
    });
    return () => {
      c = true;
      sub.remove();
    };
  }, []);

  const isLight = appTheme === 'light';
  const bg = isLight ? '#F2F2EA' : '#0A0A0A';
  /** Плаваючий сегмент: білий трек, чорний текст; активна «таблетка» — світло-сіра */
  const segmentTrackBg = '#FFFFFF';
  const segmentPillBg = '#ECECEC';
  const segmentTextActive = '#0A0A0A';
  const segmentTextMuted = '#6B6B6B';
  const segmentBorder = 'rgba(0,0,0,0.09)';
  const ripple = rippleOnLightSurface;
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
      <View style={styles.body}>
        {mode === 'map' ? (
          <GeoMapExplorer
            navigation={navigation}
            route={route}
            bottomInset={tabBarPad}
            topContentInset={mapTopInset}
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
                    {
                      color: mode === 'map' ? segmentTextActive : segmentTextMuted,
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
                    {
                      color: mode === 'planner' ? segmentTextActive : segmentTextMuted,
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
  segment: {
    position: 'relative',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
    }),
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
    zIndex: 1,
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
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  body: { flex: 1 },
});
