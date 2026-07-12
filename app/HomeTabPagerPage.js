import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Platform, DeviceEventEmitter, InteractionManager } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useFocusEffect } from '@react-navigation/native';
import { useSyncedAppLanguage } from './useAppLanguage';
import MainPage from './MainPage';
import LazyScreen from './LazyScreen';
import { markReturningUserAfterSuccessfulAuth } from './onboardingStorage';
import { useAppTheme } from './useAppTheme';
import { RenderProfiler, markEnd } from './performanceMetrics';
import { HOME_TAB_SWITCH_EVENT } from './homeTabPagerConstants';
import {
  loadFeedPage,
  loadLandmarkScannerPage,
  loadMapTabPage,
  loadProfilePage,
  prefetchFeedBundle,
  prefetchHomeTabScreens,
  prefetchProfileBundle,
} from './screenLoaders';

const FeedPage = (props) => <LazyScreen loader={loadFeedPage} {...props} />;
const LandmarkScannerPage = (props) => <LazyScreen loader={loadLandmarkScannerPage} {...props} />;
const MapTabPage = (props) => <LazyScreen loader={loadMapTabPage} {...props} />;
const ProfilePage = (props) => <LazyScreen loader={loadProfilePage} {...props} />;

function clampTab(i) {
  const n = Number(i);
  if (!Number.isFinite(n)) return 0;
  return Math.min(4, Math.max(0, Math.floor(n)));
}

export default function HomeTabPagerPage({ navigation, route }) {
  const pagerRef = useRef(null);
  const skipPageSelectRef = useRef(false);
  const tabIndex = clampTab(route.params?.tabIndex);
  /* Лише активна вкладка + головна змонтовані одразу — решта підвантажуються після першого кадру
     або при першому відкритті, щоб не тримати 4 важкі екрани в памʼяті одночасно. */
  const [mountedTabs, setMountedTabs] = useState(() => {
    const initial = new Set([0]);
    if (tabIndex !== 0) initial.add(tabIndex);
    return initial;
  });

  /* Користувач реально досяг головної сторінки — це єдиний момент, коли ми позначаємо пристрій
     як «знайомий». Після цього при виході з акаунту та повторному холодному старті без сесії
     ми показуємо лише FirstPage → BackendAuth, без вибору мови та банерів онбордингу. */
  useEffect(() => {
    markReturningUserAfterSuccessfulAuth();
    markEnd('home_tabs_mounted');
    const bootUser = route.params?.user;
    const task = InteractionManager.runAfterInteractions(() => {
      prefetchHomeTabScreens();
      setMountedTabs((prev) => {
        if (prev.has(3)) return prev;
        const next = new Set(prev);
        next.add(3);
        return next;
      });
      if (bootUser) {
        prefetchFeedBundle(bootUser);
        prefetchProfileBundle(bootUser);
      }
    });
    return () => task.cancel();
  }, [route.params?.user]);
  /** Актуальна мова зі сховища / події — підставляємо в усі вкладки, бо route.params часто не оновлюється. */
  const syncLang = useSyncedAppLanguage(route, 'uk');

  /* Розпаковуємо лише ті поля, які реально потрібні дочірнім вкладкам, щоб зміна
     tabIndex не ламала memo і не каскадно ре-рендерила всі 5 сторінок. */
  const shellUser = route.params?.user;
  const shellCountryId = route.params?.countryId;
  const { savedAppTheme } = useAppTheme(route?.params?.appTheme, route);
  const shellParams = useMemo(() => {
    const out = { language: syncLang };
    if (shellUser !== undefined) out.user = shellUser;
    if (shellCountryId != null) out.countryId = shellCountryId;
    out.appTheme = savedAppTheme;
    return out;
  }, [shellUser, shellCountryId, savedAppTheme, syncLang]);

  const mainRoute = useMemo(
    () => ({
      key: 'main-in-pager',
      name: 'MainPage',
      params: shellParams,
    }),
    [shellParams],
  );

  const feedRoute = useMemo(
    () => ({
      key: 'feed-in-pager',
      name: 'Feed',
      params: shellParams,
    }),
    [shellParams],
  );

  const scannerRoute = useMemo(
    () => ({
      key: 'scanner-in-pager',
      name: 'LandmarkScanner',
      params: shellParams,
    }),
    [shellParams],
  );

  const mapTabRoute = useMemo(
    () => ({
      key: 'map-tab-in-pager',
      name: 'MapTab',
      params: { ...shellParams, ...(route.params?.routeFinderExtras || {}) },
    }),
    [shellParams, route.params?.routeFinderExtras],
  );

  const [activeTabIndex, setActiveTabIndex] = useState(() => clampTab(route.params?.tabIndex));

  useEffect(() => {
    setActiveTabIndex(clampTab(route.params?.tabIndex));
  }, [route.params?.tabIndex]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(HOME_TAB_SWITCH_EVENT, (rawIndex) => {
      setActiveTabIndex(clampTab(rawIndex));
    });
    return () => sub.remove();
  }, []);

  const profileRoute = useMemo(
    () => ({
      key: 'profile-in-pager',
      name: 'ProfilePage',
      params: {
        ...shellParams,
        initialTab: route.params?.initialTab || 'posts',
      },
    }),
    [shellParams, route.params?.initialTab],
  );

  const applyPagerTab = useCallback((t) => {
    const pager = pagerRef.current;
    if (!pager) return;
    skipPageSelectRef.current = true;
    try {
      if (typeof pager.setPageWithoutAnimation === 'function') {
        pager.setPageWithoutAnimation(t);
      } else if (typeof pager.setPage === 'function') {
        pager.setPage(t);
      } else {
        skipPageSelectRef.current = false;
      }
    } catch {
      skipPageSelectRef.current = false;
    }
    setMountedTabs((prev) => {
      if (prev.has(t)) return prev;
      const next = new Set(prev);
      next.add(t);
      return next;
    });
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(HOME_TAB_SWITCH_EVENT, (rawIndex) => {
      applyPagerTab(clampTab(rawIndex));
    });
    return () => sub.remove();
  }, [applyPagerTab]);

  useEffect(() => {
    applyPagerTab(clampTab(route.params?.tabIndex));
  }, [route.params?.tabIndex, applyPagerTab]);

  useFocusEffect(
    useCallback(() => {
      applyPagerTab(clampTab(route.params?.tabIndex));
    }, [route.params?.tabIndex, applyPagerTab]),
  );

  const onPageSelected = useCallback(
    (e) => {
      const i = e.nativeEvent.position;
      setActiveTabIndex(clampTab(i));
      if (skipPageSelectRef.current) {
        skipPageSelectRef.current = false;
        return;
      }
      const cur = clampTab(route.params?.tabIndex);
      if (i !== cur) {
        navigation.setParams({ tabIndex: i });
      }
      setMountedTabs((prev) => {
        if (prev.has(i)) return prev;
        const next = new Set(prev);
        next.add(i);
        return next;
      });
    },
    [navigation, route.params?.tabIndex],
  );

  return (
    <RenderProfiler id="HomeTabPagerPage">
    <View style={styles.flex}>
      <PagerView
        ref={pagerRef}
        style={styles.flex}
        initialPage={tabIndex}
        onPageSelected={onPageSelected}
        overdrag={false}
        offscreenPageLimit={1}
        {...(Platform.OS === 'android' ? { overScrollMode: 'never' } : {})}
      >
        <View
          key="0"
          style={styles.page}
          collapsable={false}
          removeClippedSubviews={false}
          pointerEvents={activeTabIndex === 0 ? 'auto' : 'none'}
        >
          {mountedTabs.has(0) ? (
            <MainPage navigation={navigation} route={mainRoute} isTabActive={activeTabIndex === 0} />
          ) : null}
        </View>
        <View
          key="1"
          style={styles.page}
          collapsable={false}
          removeClippedSubviews={Platform.OS === 'android'}
          pointerEvents={activeTabIndex === 1 ? 'auto' : 'none'}
        >
          {mountedTabs.has(1) ? (
            <FeedPage navigation={navigation} route={feedRoute} isTabActive={activeTabIndex === 1} />
          ) : null}
        </View>
        <View
          key="2"
          style={styles.page}
          collapsable={false}
          removeClippedSubviews={Platform.OS === 'android'}
          pointerEvents={activeTabIndex === 2 ? 'auto' : 'none'}
        >
          {mountedTabs.has(2) ? (
            <LandmarkScannerPage
              navigation={navigation}
              route={scannerRoute}
              isTabActive={activeTabIndex === 2}
            />
          ) : null}
        </View>
        <View
          key="3"
          style={styles.page}
          collapsable={false}
          removeClippedSubviews={false}
          pointerEvents={activeTabIndex === 3 ? 'auto' : 'none'}
        >
          {mountedTabs.has(3) ? (
            <MapTabPage
              navigation={navigation}
              route={mapTabRoute}
              isTabActive={activeTabIndex === 3}
            />
          ) : null}
        </View>
        <View
          key="4"
          style={styles.page}
          collapsable={false}
          removeClippedSubviews={Platform.OS === 'android'}
          pointerEvents={activeTabIndex === 4 ? 'auto' : 'none'}
        >
          {mountedTabs.has(4) ? (
            <ProfilePage navigation={navigation} route={profileRoute} isTabActive={activeTabIndex === 4} />
          ) : null}
        </View>
      </PagerView>
    </View>
    </RenderProfiler>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1 },
});
