import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { View, Pressable, StyleSheet, Platform, DeviceEventEmitter } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navigationRef, subscribeNavState, getNavStateVersion } from './navigationRef';
import { getAppTheme, getAppThemeSync, THEME_CHANGED_EVENT } from './themeStorage';
import {
  tabBarActiveIconTint,
  tabBarFabBackground,
  tabBarFabIconTint,
  TAB_ICON_INACTIVE_DARK,
  ACCENT_BLUE,
  ACCENT_LEMON,
} from './themeAccent';
import { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { HOME_TAB, LANDMARK_SCANNER_CAPTURE_EVENT } from './homeTabPagerConstants';
import { switchHomeTab, isHomeTabActive } from './homeTabSwitch';

/** Світла панель: крем фону екрана (непрозора — інакше #000 кореня дає «брудно-сірий»). */
const BAR_FILL_LIGHT = LIGHT_BAR_BG;
/** Темна панель: непрозорий фон екрана. */
const BAR_FILL_DARK = APP_SCREEN_BG;
const ICON_INACTIVE_LIGHT = '#1E1E1E';
const FEED_TAB_ICON = require('./assets/feed-tab-icon.png');

/** Центральна кнопка сканера: трохи більша за бокові слоти (44). */
const FAB_SIZE = 62;
/** Тінь / візуальний виступ плаваючої панелі над контентом. */
const TAB_BAR_VISUAL_BLEED = 8;

const ROUTES_WITH_TAB = new Set([
  'HomeTabPager',
  'Chats',
  'StartChat',
  'RouteResults',
  'RouteNavigation',
  'ProfilePage',
  'ProfileGamificationHub',
  'ProfileAchievements',
  'ProfileEdit',
  'ProfileFriends',
  'ProfileInvites',
  'ProfilePostDetail',
  'ProfileComments',
  'ProfileLikes',
  'ProfileEditPublication',
]);

export const LIGHT_TAB_BAR_FLOAT_GAP = 10;
export const LIGHT_TAB_BAR_HEIGHT = 64;
/** paddingVertical: 8 з styles.bar — потрібен для реальної висоти рядка з FAB. */
const TAB_BAR_VERTICAL_PAD = 16;
/** Екрани з білим фоном — під плаваючою панеллю теж білий, без кремового проміжку. */
export const LIGHT_TAB_WHITE_UNDER_ROUTES = new Set([
  'Chats',
  'StartChat',
  'ChatThread',
  'DiscoverPeople',
]);

export function lightTabBarUnderlayColor(isLight, routeName) {
  if (!isLight) return APP_SCREEN_BG;
  if (routeName && LIGHT_TAB_WHITE_UNDER_ROUTES.has(routeName)) return '#FFFFFF';
  return LIGHT_BAR_BG;
}

/** Екрани з tab bar — контент прокручується під панель, без непрозорої смуги safe area. */
export function lightTabBarTransparentSafeUnderlay(routeName) {
  return !!(routeName && ROUTES_WITH_TAB.has(routeName));
}

/** Фактична висота плаваючої панелі (центральна кнопка 62px вища за minHeight 64). */
export function lightTabBarEffectiveHeight() {
  return Math.max(LIGHT_TAB_BAR_HEIGHT, FAB_SIZE + TAB_BAR_VERTICAL_PAD) + TAB_BAR_VISUAL_BLEED;
}

/** Відступ під плаваючу панель (світла й темна тема). */
export function lightTabBarExtraScrollPadding() {
  return LIGHT_TAB_BAR_FLOAT_GAP + lightTabBarEffectiveHeight();
}

/** Мінімальний зазор між останнім елементом списку і панеллю вкладок. */
export const LIGHT_TAB_BAR_SCROLL_CLEARANCE = 32;
/** Додатковий зазор для головної з високими картками локацій. */
export const HOME_TAB_SCROLL_CLEARANCE = 36;

/** paddingBottom для ScrollView / FlatList / FlashList на екранах з tab bar. */
export function lightTabBarScrollContentPadding(safeAreaBottom = 0, extraClearance = 0) {
  const extra = Math.max(LIGHT_TAB_BAR_SCROLL_CLEARANCE, extraClearance);
  return Math.max(0, Number(safeAreaBottom) || 0) + lightTabBarExtraScrollPadding() + extra;
}

/** Нижній відступ для абсолютних елементів над tab bar (з safe area). */
export function lightTabBarOverlayBottomInset(safeAreaBottom = 0, extraGap = 0) {
  return lightTabBarScrollContentPadding(safeAreaBottom, extraGap);
}

function currentRouteMeta() {
  const r = navigationRef.getCurrentRoute();
  if (!r?.name) return { name: null, pagerTab: null };
  const pagerTab =
    r.name === 'HomeTabPager'
      ? Math.min(4, Math.max(0, Number(r.params?.tabIndex) || 0))
      : null;
  return { name: r.name, pagerTab };
}

function LightBottomTabBar() {
  // Subscribe to navigation state changes locally so only the bar re-renders
  // (the root App previously re-rendered on every navigation event via navEpoch).
  const navVersion = useSyncExternalStore(subscribeNavState, getNavStateVersion, getNavStateVersion);
  const insets = useSafeAreaInsets();
  const [theme, setTheme] = useState(() => getAppThemeSync());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await getAppTheme();
      if (!cancelled) setTheme(t === 'dark' ? 'dark' : 'light');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, () => {
      setTheme(getAppThemeSync());
    });
    return () => sub.remove();
  }, []);

  const { name: routeName, pagerTab } = navigationRef.isReady() ? currentRouteMeta() : { name: null, pagerTab: null };
  void navVersion;

  const isLight = theme === 'light';
  // Панель завжди видима на табових екранах — без очікування готовності контенту головної.
  // Раніше на головній (MAIN) вона чекала mainPageShellReady і не з'являлася, поки не
  // завантажаться дані/підписка. Тепер показується миттєво.
  const visible = routeName && ROUTES_WITH_TAB.has(routeName);

  const iconActiveTint = tabBarActiveIconTint(isLight);
  const fabBg = tabBarFabBackground(isLight);
  const fabIconTint = tabBarFabIconTint(isLight);
  const iconInactive = isLight ? ICON_INACTIVE_LIGHT : TAB_ICON_INACTIVE_DARK;
  const barFill = isLight ? BAR_FILL_LIGHT : BAR_FILL_DARK;
  const screenUnderBar = lightTabBarUnderlayColor(isLight, routeName);
  const transparentSafeUnderlay = lightTabBarTransparentSafeUnderlay(routeName);
  /** Тонка обводка: світла — синя, темна — лимонна. */
  const barBorder = isLight ? ACCENT_BLUE : ACCENT_LEMON;

  const active = routeName;
  const routeTabActive =
    (active === 'HomeTabPager' && pagerTab === HOME_TAB.MAP) ||
    active === 'RouteResults' ||
    active === 'RouteNavigation';
  const profileTabActive =
    (active === 'HomeTabPager' && pagerTab === HOME_TAB.PROFILE) ||
    active === 'ProfilePage' ||
    active === 'ProfileGamificationHub' ||
    active === 'ProfileAchievements' ||
    active === 'ProfileEdit' ||
    active === 'ProfileFriends' ||
    active === 'ProfileInvites' ||
    active === 'ProfilePostDetail' ||
    active === 'ProfileComments' ||
    active === 'ProfileLikes' ||
    active === 'ProfileEditPublication';

  const baseNavigate = useCallback(
    (tabIndex, extra = {}) => switchHomeTab(tabIndex, extra, isLight ? 'light' : 'dark'),
    [isLight],
  );

  const onHome = useCallback(() => {
    if (isHomeTabActive(HOME_TAB.MAIN)) return;
    baseNavigate(HOME_TAB.MAIN);
  }, [baseNavigate]);
  const onStack = useCallback(() => {
    if (isHomeTabActive(HOME_TAB.FEED)) return;
    baseNavigate(HOME_TAB.FEED);
  }, [baseNavigate]);
  const onCenter = useCallback(() => {
    if (routeName === 'HomeTabPager' && pagerTab === HOME_TAB.SCANNER) {
      DeviceEventEmitter.emit(LANDMARK_SCANNER_CAPTURE_EVENT);
      return;
    }
    if (isHomeTabActive(HOME_TAB.SCANNER)) return;
    baseNavigate(HOME_TAB.SCANNER);
  }, [baseNavigate, routeName, pagerTab]);
  const onMap = useCallback(() => {
    if (
      routeTabActive &&
      (active === 'HomeTabPager' || active === 'RouteResults' || active === 'RouteNavigation')
    ) {
      return;
    }
    baseNavigate(HOME_TAB.MAP);
  }, [baseNavigate, routeTabActive, active]);
  const onProfile = useCallback(() => {
    if (profileTabActive && active === 'HomeTabPager' && pagerTab === HOME_TAB.PROFILE) return;
    baseNavigate(HOME_TAB.PROFILE, { initialTab: 'posts' });
  }, [baseNavigate, profileTabActive, active, pagerTab]);

  if (!visible) return null;

  return (
    <View
      style={[styles.wrap, { paddingBottom: insets.bottom + LIGHT_TAB_BAR_FLOAT_GAP }]}
      pointerEvents="box-none"
    >
      {insets.bottom > 0 && !transparentSafeUnderlay ? (
        <View
          pointerEvents="none"
          style={[styles.bottomSafeFill, { height: insets.bottom, backgroundColor: screenUnderBar }]}
        />
      ) : null}
      <View
        style={[
          styles.bar,
          { backgroundColor: barFill, borderColor: barBorder },
          isLight ? styles.barLightShadow : null,
        ]}
      >
        <Pressable
          onPress={onHome}
          style={({ pressed }) => [styles.sideSlot, pressed && styles.pressed]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Home"
        >
          <Ionicons
            name="home-outline"
            size={24}
            color={active === 'HomeTabPager' && pagerTab === HOME_TAB.MAIN ? iconActiveTint : iconInactive}
          />
        </Pressable>
        <Pressable
          onPress={onStack}
          style={({ pressed }) => [styles.sideSlot, pressed && styles.pressed]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Feed"
        >
          <ExpoImage
            source={FEED_TAB_ICON}
            style={[
              styles.feedTabIcon,
              {
                tintColor:
                  active === 'HomeTabPager' && pagerTab === HOME_TAB.FEED ? iconActiveTint : iconInactive,
              },
            ]}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={0}
          />
        </Pressable>
        <Pressable
          onPress={onCenter}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: fabBg },
            active === 'HomeTabPager' && pagerTab === HOME_TAB.SCANNER && styles.fabActiveRing,
            pressed && styles.fabPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            active === 'HomeTabPager' && pagerTab === HOME_TAB.SCANNER ? 'Take photo' : '3D Scanner'
          }
        >
          <Ionicons
            name={active === 'HomeTabPager' && pagerTab === HOME_TAB.SCANNER ? 'camera' : 'scan-outline'}
            size={30}
            color={fabIconTint}
          />
        </Pressable>
        <Pressable
          onPress={onMap}
          style={({ pressed }) => [styles.sideSlot, pressed && styles.pressed]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Map"
        >
          <Ionicons
            name="map-outline"
            size={24}
            color={routeTabActive ? iconActiveTint : iconInactive}
          />
        </Pressable>
        <Pressable
          onPress={onProfile}
          style={({ pressed }) => [styles.sideSlot, pressed && styles.pressed]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Profile"
        >
          <Ionicons
            name="person-circle-outline"
            size={26}
            color={profileTabActive ? iconActiveTint : iconInactive}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  bottomSafeFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 400,
    minHeight: LIGHT_TAB_BAR_HEIGHT,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  barLightShadow: Platform.select({
    android: {
      elevation: 2,
    },
    default: {},
  }),
  sideSlot: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedTabIcon: {
    width: 24,
    height: 22,
  },
  pressed: {
    opacity: 0.72,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  fabActiveRing: {
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.95)',
  },
  fabPressed: {
    opacity: 0.9,
  },
});

export default React.memo(LightBottomTabBar);
