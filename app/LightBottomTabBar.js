import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { View, Pressable, StyleSheet, Platform, DeviceEventEmitter, PanResponder } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navigationRef, subscribeNavState, getNavStateVersion } from './navigationRef';
import { getAppTheme, THEME_CHANGED_EVENT } from './themeStorage';
import {
  tabBarActiveIconTint,
  tabBarFabBackground,
  tabBarFabIconTint,
  TAB_ICON_INACTIVE_DARK,
} from './themeAccent';
import { HOME_TAB_ROUTE, HOME_TAB } from './homeTabPagerConstants';
import { shellNavigate } from './shellNavigate';

/** Світла панель: Figma #DADADA 80%. Темна: #1E1E1E 80%. */
const BAR_FILL_LIGHT = 'rgba(218, 218, 218, 0.8)';
const BAR_FILL_DARK = 'rgba(30, 30, 30, 0.8)';
const ICON_INACTIVE_LIGHT = '#1E1E1E';

/** Центральна кнопка сканера: трохи більша за бокові слоти (44). */
const FAB_SIZE = 62;

const ROUTES_WITH_TAB = new Set([
  'HomeTabPager',
  'Chats',
  'StartChat',
  'RouteResults',
  'RouteNavigation',
  'ProfilePage',
  'ProfileGamificationHub',
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

/** Відступ під плаваючу панель (світла й темна тема). */
export function lightTabBarExtraScrollPadding() {
  return LIGHT_TAB_BAR_FLOAT_GAP + LIGHT_TAB_BAR_HEIGHT;
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
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await getAppTheme();
      if (!cancelled) setTheme(t === 'light' ? 'light' : 'dark');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setTheme(v === 'light' ? 'light' : 'dark');
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
  const barBorder = isLight ? 'rgba(242, 242, 234, 0.95)' : 'rgba(255, 255, 255, 0.1)';

  const baseNavigate = useCallback(
    (name, extra = {}) => shellNavigate(name, extra, isLight ? 'light' : 'dark'),
    [isLight],
  );

  const onHome = useCallback(
    () => baseNavigate(HOME_TAB_ROUTE, { tabIndex: HOME_TAB.MAIN, routeFinderExtras: {} }),
    [baseNavigate],
  );
  const onStack = useCallback(
    () => baseNavigate(HOME_TAB_ROUTE, { tabIndex: HOME_TAB.FEED, routeFinderExtras: {} }),
    [baseNavigate],
  );
  const onCenter = useCallback(
    () => baseNavigate(HOME_TAB_ROUTE, { tabIndex: HOME_TAB.SCANNER, routeFinderExtras: {} }),
    [baseNavigate],
  );
  const onMap = useCallback(
    () => baseNavigate(HOME_TAB_ROUTE, { tabIndex: HOME_TAB.MAP, routeFinderExtras: {} }),
    [baseNavigate],
  );
  const onProfile = useCallback(
    () =>
      baseNavigate(HOME_TAB_ROUTE, {
        tabIndex: HOME_TAB.PROFILE,
        initialTab: 'posts',
        routeFinderExtras: {},
      }),
    [baseNavigate],
  );
  const navigateToTabIndex = useCallback(
    (i) => {
      const t = Math.min(4, Math.max(0, Number(i) || 0));
      baseNavigate(HOME_TAB_ROUTE, { tabIndex: t, routeFinderExtras: {} });
    },
    [baseNavigate],
  );

  const active = routeName;
  const routeTabActive =
    (active === 'HomeTabPager' && pagerTab === HOME_TAB.MAP) ||
    active === 'RouteResults' ||
    active === 'RouteNavigation';
  const centerShowsCamera = active === 'HomeTabPager' && pagerTab === HOME_TAB.FEED;
  const profileTabActive =
    (active === 'HomeTabPager' && pagerTab === HOME_TAB.PROFILE) ||
    active === 'ProfilePage' ||
    active === 'ProfileGamificationHub' ||
    active === 'ProfileEdit' ||
    active === 'ProfileFriends' ||
    active === 'ProfileInvites' ||
    active === 'ProfilePostDetail' ||
    active === 'ProfileComments' ||
    active === 'ProfileLikes' ||
    active === 'ProfileEditPublication';
  const resolvedTabIndex =
    active === 'HomeTabPager'
      ? pagerTab
      : routeTabActive
        ? HOME_TAB.MAP
        : profileTabActive
          ? HOME_TAB.PROFILE
          : null;
  const barPanResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
        onPanResponderRelease: (_, g) => {
          if (!Number.isFinite(resolvedTabIndex)) return;
          if (Math.abs(g.dx) < 28 || Math.abs(g.dx) <= Math.abs(g.dy)) return;
          // Swipe left => next tab (screen moves right-to-left). Swipe right => previous tab.
          if (g.dx < 0) navigateToTabIndex(resolvedTabIndex + 1);
          else navigateToTabIndex(resolvedTabIndex - 1);
        },
      }),
    [navigateToTabIndex, resolvedTabIndex],
  );

  if (!visible) return null;

  return (
    <View
      style={[styles.wrap, { paddingBottom: insets.bottom + LIGHT_TAB_BAR_FLOAT_GAP }]}
      pointerEvents="box-none"
    >
      <View
        style={[styles.bar, { backgroundColor: barFill, borderColor: barBorder }]}
        {...barPanResponder.panHandlers}
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
          <Ionicons
            name="albums-outline"
            size={24}
            color={active === 'HomeTabPager' && pagerTab === HOME_TAB.FEED ? iconActiveTint : iconInactive}
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
          accessibilityLabel={centerShowsCamera ? 'Camera' : 'Scanner'}
        >
          <Ionicons name={centerShowsCamera ? 'camera-outline' : 'scan-outline'} size={30} color={fabIconTint} />
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
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  sideSlot: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
