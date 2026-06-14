import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Platform, DeviceEventEmitter } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useSyncedAppLanguage } from './useAppLanguage';
import MainPage from './MainPage';
import FeedPage from './FeedPage';
import LandmarkScannerPage from './LandmarkScannerPage';
import MapTabPage from './MapTabPage';
import ProfilePage from './ProfilePage';
import { markReturningUserAfterSuccessfulAuth } from './onboardingStorage';
import { getAppTheme, THEME_CHANGED_EVENT } from './themeStorage';

function clampTab(i) {
  const n = Number(i);
  if (!Number.isFinite(n)) return 0;
  return Math.min(4, Math.max(0, Math.floor(n)));
}

export default function HomeTabPagerPage({ navigation, route }) {
  const pagerRef = useRef(null);
  const skipPageSelectRef = useRef(false);
  const tabIndex = clampTab(route.params?.tabIndex);
  /* Тримаємо 4 «легкі» вкладки змонтованими від старту — щоб при першому тапі
     показувався готовий контент, а не пустий екран зі спінером. Сканер (індекс 2)
     лишається лінивим: не запускаємо камеру / не смикаємо дозволи, поки користувач
     реально туди не перейде. */
  const [mountedTabs, setMountedTabs] = useState(() => new Set([0, 1, 3, 4, tabIndex]));

  /* Користувач реально досяг головної сторінки — це єдиний момент, коли ми позначаємо пристрій
     як «знайомий». Після цього при виході з акаунту та повторному холодному старті без сесії
     ми показуємо лише FirstPage → BackendAuth, без вибору мови та банерів онбордингу. */
  useEffect(() => {
    markReturningUserAfterSuccessfulAuth();
  }, []);
  /** Актуальна мова зі сховища / події — підставляємо в усі вкладки, бо route.params часто не оновлюється. */
  const syncLang = useSyncedAppLanguage(route, 'uk');

  /* Розпаковуємо лише ті поля, які реально потрібні дочірнім вкладкам, щоб зміна
     tabIndex не ламала memo і не каскадно ре-рендерила всі 5 сторінок. */
  const shellUser = route.params?.user;
  const shellCountryId = route.params?.countryId;
  /** Тема для всіх вкладок: спочатку з route (якщо передали), потім підтягуємо зі сховища,
      далі живі зміни приходять через THEME_CHANGED_EVENT — щоб після повного перезапуску
      і при перемиканні в Налаштуваннях усі 5 вкладок одразу мали правильну тему. */
  const [shellAppTheme, setShellAppTheme] = useState(
    route.params?.appTheme === 'light' ? 'light' : route.params?.appTheme === 'dark' ? 'dark' : undefined,
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await getAppTheme();
      if (!cancelled) setShellAppTheme(t === 'light' ? 'light' : 'dark');
    })();
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setShellAppTheme(v === 'light' ? 'light' : 'dark');
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
  const shellParams = useMemo(() => {
    const out = { language: syncLang };
    if (shellUser !== undefined) out.user = shellUser;
    if (shellCountryId != null) out.countryId = shellCountryId;
    if (shellAppTheme !== undefined) out.appTheme = shellAppTheme;
    return out;
  }, [shellUser, shellCountryId, shellAppTheme, syncLang]);

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

  const profileRoute = useMemo(
    () => ({
      key: 'profile-in-pager',
      name: 'ProfilePage',
      params: {
        ...shellParams,
        initialTab: route.params?.initialTab || 'posts',
        /** Щоб профіль міг підтягнути з AsyncStorage збережені маршрути після повернення з карти (useFocusEffect тут не спрацьовує). */
        homePagerTabIndex: clampTab(route.params?.tabIndex),
      },
    }),
    [shellParams, route.params?.initialTab, route.params?.tabIndex],
  );

  useEffect(() => {
    const t = clampTab(route.params?.tabIndex);
    setMountedTabs((prev) => {
      if (prev.has(t)) return prev;
      const next = new Set(prev);
      next.add(t);
      return next;
    });
    const pager = pagerRef.current;
    if (!pager) return;
    skipPageSelectRef.current = true;
    try {
      // Тап по нижній панелі / навігація між вкладками — миттєво, без анімації гортання.
      // (Ручний свайп пальцем лишається плавним — це не зачіпає жест.)
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
  }, [route.params?.tabIndex]);

  const onPageSelected = useCallback(
    (e) => {
      if (skipPageSelectRef.current) {
        skipPageSelectRef.current = false;
        return;
      }
      const i = e.nativeEvent.position;
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
    <View style={styles.flex}>
      <PagerView
        ref={pagerRef}
        style={styles.flex}
        initialPage={tabIndex}
        onPageSelected={onPageSelected}
        overdrag
        offscreenPageLimit={1}
      >
        <View key="0" style={styles.page} collapsable={false} removeClippedSubviews={Platform.OS === 'android'}>
          {mountedTabs.has(0) ? <MainPage navigation={navigation} route={mainRoute} /> : null}
        </View>
        <View key="1" style={styles.page} collapsable={false} removeClippedSubviews={Platform.OS === 'android'}>
          {mountedTabs.has(1) ? <FeedPage navigation={navigation} route={feedRoute} /> : null}
        </View>
        <View key="2" style={styles.page} collapsable={false} removeClippedSubviews={Platform.OS === 'android'}>
          {mountedTabs.has(2) ? <LandmarkScannerPage navigation={navigation} route={scannerRoute} /> : null}
        </View>
        <View key="3" style={styles.page} collapsable={false} removeClippedSubviews={Platform.OS === 'android'}>
          {mountedTabs.has(3) ? <MapTabPage navigation={navigation} route={mapTabRoute} /> : null}
        </View>
        <View key="4" style={styles.page} collapsable={false} removeClippedSubviews={Platform.OS === 'android'}>
          {mountedTabs.has(4) ? <ProfilePage navigation={navigation} route={profileRoute} /> : null}
        </View>
      </PagerView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1 },
});
