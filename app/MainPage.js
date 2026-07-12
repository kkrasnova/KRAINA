import React, { useState, useCallback, useEffect, useMemo, memo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
  DeviceEventEmitter,
  Keyboard,
  Pressable,
  PanResponder,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSession } from './db';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { getSubscriptionState } from './subscriptionStorage';
import { syncSubscriptionFromBackend, syncSubscriptionFromBackendIfStale } from './syncSubscriptionFromBackend';
import { getSavedCountryIdForUser, saveCountryForUser } from './countryStorage';
import { saveHomeCityRegionId } from './homeCityStorage';
import { buildLandmarkResultParamsFromHomeLandmark } from './homeLandmarkResultParams';
import { prefetchLandmarkResultParams } from './landmarkImagePrefetch';
import { mt } from './mainPageI18n';
import { appLangBase } from './appLang';
import { KRAINA_APP_LANGUAGE_CHANGED } from './appLanguageEvents';
import LightHomeCountrySearch from './LightHomeCountrySearch';
import HomeExploreSection from './HomeExploreSection';
import HomeCountryCarousel from './HomeCountryCarousel';
import { getHomeCountriesForCarousel, HOME_COUNTRY_ORDER } from './homeExploreData';
import { KRAINA_ADMIN_LOCATION_EVENT } from './adminLocationData';
import { lightTabBarScrollContentPadding, HOME_TAB_SCROLL_CLEARANCE } from './LightBottomTabBar';
import { useAppTheme } from './useAppTheme';
import { setMainPageContentReady } from './mainPageTabGate';
import { shellNavigate, shellPush } from './shellNavigate';
import { prefetchArchiveBundle, prefetchChatsBundle, prefetchDiscoverBundle } from './screenLoaders';
import { prefetchChatsForUser } from './chatsDataPrefetch';
const BG = APP_SCREEN_BG;
/**
 * Пошук у скролі: трохи нижче від шапки, блок категорій трохи вище (менший зазор під пошуком).
 */
const HOME_GAP_AFTER_TOPBAR = 16;
const HOME_GAP_AFTER_SEARCH = 6;
const HOME_SCROLL_PAD_H = 24;

const MUTED = '#888888';

/** Сесія / route інколи дають лише firebaseUid без id — не скидаємо такого користувача на старт. */
function userHasIdentity(u) {
  if (!u || typeof u !== 'object') return false;
  return !!(u.id || u.firebaseUid);
}

/** Пошук ізоловано — введення не ре-рендерить карусель і список локацій. */
const MainPageSearchBlock = memo(function MainPageSearchBlock({
  variant,
  placeholder,
  language,
  selectedCountryId,
  onUnifiedPick,
  onParentScrollLockChange,
  resetToken,
  dismissSignal,
  onRequestDismiss,
  searchExpanded,
}) {
  return (
    <View
      style={[
        styles.homeSearchInlineBlock,
        searchExpanded && styles.homeSearchInlineBlockExpanded,
        { marginBottom: searchExpanded ? 0 : HOME_GAP_AFTER_SEARCH },
      ]}
    >
      <LightHomeCountrySearch
        variant={variant}
        placeholder={placeholder}
        editable
        language={language}
        selectedCountryId={selectedCountryId}
        onUnifiedPick={onUnifiedPick}
        onParentScrollLockChange={onParentScrollLockChange}
        resetToken={resetToken}
        dismissSignal={dismissSignal}
        onRequestDismiss={onRequestDismiss}
        presentedInOverlay={false}
        profileSearchEnabled={false}
        peopleOnlyMode={false}
      />
    </View>
  );
});

/** Повноекранний фон під пошуком: тап або свайп вгору закриває каталог. */
const SearchDismissLayer = memo(function SearchDismissLayer({ onDismiss, language }) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy < -10 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
      onPanResponderRelease: (_, gesture) => {
        // Свідомий свайп вгору (а не легкий доторк) закриває пошук. Тап лишається.
        if (gesture.dy < -32 || gesture.vy < -0.55) {
          onDismissRef.current();
        }
      },
    }),
  ).current;

  return (
    <View style={styles.searchDismissLayer} {...panResponder.panHandlers}>
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={() => onDismissRef.current()}
        accessibilityRole="button"
        accessibilityLabel={mt(language, 'homeCloseSearchA11y')}
      />
    </View>
  );
});

/** Секції під пошуком — memo, щоб тапи/скрол не чіпали поле вводу. */
const MainPageHomeSections = memo(function MainPageHomeSections({
  visible,
  language,
  appTheme,
  homeCountries,
  countryId,
  onHomePickCountry,
  onOpenAllCountries,
  user,
  homeLocationsEpoch,
}) {
  const isLightMain = appTheme === 'light';
  return (
    <View
      style={!visible ? styles.homeSectionsHidden : null}
      pointerEvents={visible ? 'auto' : 'none'}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      <HomeCountryCarousel
        language={language}
        appTheme={appTheme}
        countries={homeCountries}
        selectedCountryId={countryId || HOME_COUNTRY_ORDER[0]}
        onSelectCountry={onHomePickCountry}
        onOpenAllCountries={onOpenAllCountries}
      />
      {!countryId ? (
        <Text style={[styles.homeHint, { color: isLightMain ? '#3A3A3A' : MUTED }]}>
          {mt(language, 'homeSelectCountryHint')}
        </Text>
      ) : null}
      <HomeExploreSection
        user={user}
        countryId={countryId}
        language={language}
        appTheme={appTheme}
        categoryId="all"
        homeLocationsEpoch={homeLocationsEpoch}
      />
    </View>
  );
});

export default function MainPage({ navigation, route, isTabActive = true }) {
  const insets = useSafeAreaInsets();
  const [sessionUser, setSessionUser] = useState(null);
  const [sessionLang, setSessionLang] = useState(null);
  const { appTheme, isLight, screenBg, savedAppTheme } = useAppTheme(route?.params?.appTheme, route);
  const [countrySearchLocksScroll, setCountrySearchLocksScroll] = useState(false);
  const [searchResetToken, setSearchResetToken] = useState(0);
  const [searchDismissSignal, setSearchDismissSignal] = useState(0);
  const [homeLocationsEpoch, setHomeLocationsEpoch] = useState(0);
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_ADMIN_LOCATION_EVENT, () => {
      setHomeLocationsEpoch((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let u = route?.params?.user;
      let lang = route?.params?.language;
      if (!userHasIdentity(u)) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const s = await getSession();
          if (s?.user && userHasIdentity(s.user)) {
            u = s.user;
            break;
          }
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 150));
          }
        }
      }
      if (!lang) {
        try {
          const raw = await AsyncStorage.getItem('@kraina_app_language');
          if (raw && typeof raw === 'string') {
            lang = appLangBase(raw);
          }
        } catch (e) { if (__DEV__) console.warn('[MainPage] swallowed:', e?.message); }
      }
      if (!lang && u?.appLanguage) {
        lang = typeof u.appLanguage === 'string' ? u.appLanguage : null;
      }
      if (cancelled) return;
      if (!userHasIdentity(u)) {
        navigation.reset({
          index: 0,
          routes: [{
            name: 'FirstPage',
            params: { nextRoute: 'SecondPage', nextRouteParams: { firstLaunchOnboarding: true } },
          }],
        });
        return;
      }
      setSessionUser(u);
      if (lang) setSessionLang(lang);
    })();
    return () => {
      cancelled = true;
    };
  }, [route?.params?.user, route?.params?.language, navigation]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_APP_LANGUAGE_CHANGED, (code) => {
      if (code != null && typeof code === 'string') {
        setSessionLang(appLangBase(code));
      }
    });
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const raw = await AsyncStorage.getItem('@kraina_app_language');
          if (!cancelled && raw != null && typeof raw === 'string') {
            setSessionLang(appLangBase(raw));
          }
          const s = await getSession();
          if (!cancelled && s?.user && userHasIdentity(s.user)) {
            setSessionUser(s.user);
          }
        } catch (e) { if (__DEV__) console.warn('[MainPage] swallowed:', e?.message); }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const user = useMemo(
    () => sessionUser || route?.params?.user || {},
    [sessionUser, route?.params?.user],
  );
  const language = appLangBase(sessionLang || route?.params?.language || 'en');
  const [storedCountryId, setStoredCountryId] = useState(null);
  const countryId = route?.params?.countryId || storedCountryId || undefined;

  const homeCountries = useMemo(
    () => getHomeCountriesForCarousel(language, homeLocationsEpoch),
    [language, homeLocationsEpoch],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (route?.params?.countryId) {
        if (!cancelled) setStoredCountryId(null);
        return;
      }
      const saved = await getSavedCountryIdForUser(user);
      if (cancelled) return;
      if (saved) {
        setStoredCountryId(saved);
      } else if (HOME_COUNTRY_ORDER[0]) {
        setStoredCountryId(HOME_COUNTRY_ORDER[0]);
        void saveCountryForUser(user, HOME_COUNTRY_ORDER[0]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [route?.params?.countryId, user?.id, user?.firebaseUid, user?.email]);

  useEffect(() => {
    if (!isTabActive) return;
    prefetchChatsBundle();
    prefetchArchiveBundle();
    prefetchDiscoverBundle();
  }, [user?.id, user?.firebaseUid, user?.email, language, isTabActive]);

  const [gateReady, setGateReady] = useState(() => userHasIdentity(route?.params?.user));

  /** Показуємо головну одразу після ідентифікації користувача — не чекаємо AsyncStorage/бекенд. */
  useEffect(() => {
    if (userHasIdentity(user)) {
      setGateReady(true);
    }
  }, [user?.id, user?.firebaseUid]);

  /** Нижня таб-панель одразу після готовності gate — без подвійного rAF. */
  useEffect(() => {
    const ok = gateReady && userHasIdentity(user);
    setMainPageContentReady(ok);
    return () => setMainPageContentReady(false);
  }, [gateReady, user?.id, user?.firebaseUid]);

  useEffect(() => {
    if (!userHasIdentity(user)) return;
    let cancelled = false;
    (async () => {
      const cachedSub = await getSubscriptionState(user);
      if (cancelled) return;
      if (cachedSub.needsPlanChoice) {
        navigation.replace('ChoosePlan', {
          user,
          language,
          appTheme,
          ...(countryId ? { countryId } : {}),
        });
        return;
      }

      try {
        await syncSubscriptionFromBackend(user);
        const nextSub = await getSubscriptionState(user);
        if (!cancelled && nextSub.needsPlanChoice) {
          navigation.replace('ChoosePlan', {
            user,
            language,
            appTheme,
            ...(countryId ? { countryId } : {}),
          });
        }
      } catch {
        /* ignore background sync errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    user?.id,
    user?.firebaseUid,
    user?.email,
    navigation,
    language,
    countryId,
    appTheme,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (!userHasIdentity(user)) return undefined;
      let cancelled = false;
      (async () => {
        try {
          await syncSubscriptionFromBackendIfStale(user);
          if (cancelled) return;
          const nextSub = await getSubscriptionState(user);
          if (nextSub.needsPlanChoice) {
            navigation.replace('ChoosePlan', {
              user,
              language,
              appTheme,
              ...(countryId ? { countryId } : {}),
            });
          }
        } catch {
          /* ignore background sync errors */
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [user?.id, user?.firebaseUid, user?.email, navigation, language, countryId, appTheme]),
  );

  useFocusEffect(
    useCallback(() => {
      setCountrySearchLocksScroll(false);
    }, []),
  );

  const openSettings = useCallback(() => {
    shellNavigate('Settings', {}, appTheme);
  }, [appTheme]);

  const openTopRight = useCallback(() => {
    prefetchChatsForUser(user, language.split(/[-_]/)[0].toLowerCase() === 'uk');
    navigation.navigate('Chats', {
      user,
      language,
      ...(countryId ? { countryId } : {}),
      appTheme,
    });
  }, [navigation, user, language, countryId, appTheme]);

  const openAllCountriesLocations = useCallback(() => {
    shellNavigate('AllCountriesLocations', {}, appTheme);
  }, [appTheme]);

  const bumpSearchReset = useCallback(() => {
    setSearchResetToken((n) => n + 1);
  }, []);

  const dismissHomeSearch = useCallback(() => {
    setSearchDismissSignal((n) => n + 1);
  }, []);

  const onHomePickCountry = useCallback(
    (nextId) => {
      if (!nextId) return;
      setStoredCountryId(nextId);
      bumpSearchReset();
      try {
        navigation.setParams({ countryId: nextId });
      } catch (e) {
        if (__DEV__) console.warn('[MainPage] swallowed:', e?.message);
      }
      void saveCountryForUser(user, nextId);
    },
    [user, navigation, bumpSearchReset],
  );

  const onHomeSearchPick = useCallback(
    (row) => {
      if (!row || !userHasIdentity(user)) return;
      if (row.type === 'country') {
        onHomePickCountry(row.countryId);
        return;
      }
      if (row.type === 'city') {
        setStoredCountryId(row.countryId);
        bumpSearchReset();
        try {
          navigation.setParams({ countryId: row.countryId });
        } catch (e) {
          if (__DEV__) console.warn('[MainPage] swallowed:', e?.message);
        }
        void saveCountryForUser(user, row.countryId);
        void saveHomeCityRegionId(user, row.countryId, row.regionId);
        return;
      }
      if (row.type === 'landmark') {
        setStoredCountryId(row.countryId);
        bumpSearchReset();
        try {
          navigation.setParams({ countryId: row.countryId });
        } catch (e) {
          if (__DEV__) console.warn('[MainPage] swallowed:', e?.message);
        }
        void saveCountryForUser(user, row.countryId);
        void saveHomeCityRegionId(user, row.countryId, row.regionId);
        const landmarkParams = buildLandmarkResultParamsFromHomeLandmark({
          lm: row.landmark,
          region: row.region,
          countryId: row.countryId,
          language,
          appTheme,
          user,
        });
        void prefetchLandmarkResultParams(landmarkParams);
        shellNavigate('LandmarkResult', landmarkParams, appTheme);
        return;
      }
      if (row.type === 'profile') {
        const u = String(row.username || '')
          .trim()
          .replace(/^@/, '');
        if (!u) return;
        bumpSearchReset();
        shellPush(
          'SocialUserProfile',
          {
            username: u,
            ...(countryId ? { countryId } : {}),
          },
          appTheme,
        );
      }
    },
    [user, language, appTheme, onHomePickCountry, countryId, bumpSearchReset],
  );

  const isLightMain = isLight;
  const showHomeSections = !countrySearchLocksScroll;
  const dismissKeyboardOnScroll = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  const homeScrollRef = useRef(null);

  const searchVariant = isLightMain ? 'light' : 'dark';
  const searchPlaceholder = mt(language, 'homeSearchPlaceholder');
  const { height: windowHeight } = useWindowDimensions();
  const searchContentMinHeight = Math.max(360, windowHeight - 168);
  const tabBottomPad = lightTabBarScrollContentPadding(insets.bottom, HOME_TAB_SCROLL_CLEARANCE);

  return (
    <View style={[styles.safe, { backgroundColor: isLightMain ? LIGHT_BAR_BG : BG }]}>
      <View style={styles.mainShell}>
        <View style={styles.mainBelowDim}>
          <AppTopBar
            appTheme={appTheme}
            lightMenuButton="hamburger"
            showBrandLogo
            onMenuPress={openSettings}
            onSendPress={openTopRight}
          />
          <View style={styles.countryOverlayHost} collapsable={false}>
            {countrySearchLocksScroll ? (
              <SearchDismissLayer onDismiss={dismissHomeSearch} language={language} />
            ) : null}
            <View
              style={[
                styles.homeScrollShell,
                countrySearchLocksScroll && styles.homeScrollShellSearchOpen,
              ]}
              pointerEvents={countrySearchLocksScroll ? 'box-none' : 'auto'}
            >
              <ScrollView
                ref={homeScrollRef}
                style={styles.homeScroll}
                contentContainerStyle={[
                  styles.scroll,
                  countrySearchLocksScroll && styles.scrollSearchOpen,
                  countrySearchLocksScroll && { minHeight: searchContentMinHeight },
                  {
                    paddingTop: HOME_GAP_AFTER_TOPBAR,
                    paddingBottom: tabBottomPad,
                  },
                ]}
                pointerEvents={countrySearchLocksScroll ? 'box-none' : 'auto'}
                keyboardShouldPersistTaps="always"
                keyboardDismissMode="on-drag"
                onScrollBeginDrag={dismissKeyboardOnScroll}
                scrollEnabled={!countrySearchLocksScroll}
                scrollEventThrottle={16}
                nestedScrollEnabled
                removeClippedSubviews={false}
                showsVerticalScrollIndicator={!countrySearchLocksScroll}
                {...(Platform.OS === 'ios'
                  ? {
                      /** Уникаємо подвійного safe area з UIScrollView і обрізання нижнього контенту. */
                      contentInsetAdjustmentBehavior: 'never',
                      automaticallyAdjustKeyboardInsets: false,
                      directionalLockEnabled: !countrySearchLocksScroll,
                    }
                  : {})}
              >
                <View
                  pointerEvents="box-none"
                  style={countrySearchLocksScroll ? styles.homeSearchScrollSlot : null}
                >
                  <MainPageSearchBlock
                    variant={searchVariant}
                    placeholder={searchPlaceholder}
                    language={language}
                    selectedCountryId={countryId}
                    onUnifiedPick={onHomeSearchPick}
                    onParentScrollLockChange={setCountrySearchLocksScroll}
                    resetToken={searchResetToken}
                    dismissSignal={searchDismissSignal}
                    onRequestDismiss={dismissHomeSearch}
                    searchExpanded={countrySearchLocksScroll}
                  />
                </View>
                <MainPageHomeSections
                  visible={showHomeSections}
                  language={language}
                  appTheme={appTheme}
                  homeCountries={homeCountries}
                  countryId={countryId}
                  onHomePickCountry={onHomePickCountry}
                  onOpenAllCountries={openAllCountriesLocations}
                  user={user}
                  homeLocationsEpoch={homeLocationsEpoch}
                />
              </ScrollView>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  mainShell: {
    flex: 1,
    position: 'relative',
  },
  mainBelowDim: {
    flex: 1,
    zIndex: 1,
  },
  /** Пошук у потоці скролу — тапи й фокус без «шару» над ScrollView. */
  homeSearchInlineBlock: {
    alignSelf: 'stretch',
  },
  homeSearchInlineBlockExpanded: {
    flex: 1,
  },
  homeSearchScrollSlot: {
    flex: 1,
    alignSelf: 'stretch',
  },
  countryOverlayHost: {
    flex: 1,
    position: 'relative',
  },
  homeScrollShell: {
    flex: 1,
  },
  homeScrollShellSearchOpen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  homeScroll: {
    flex: 1,
  },
  searchDismissLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  center: { justifyContent: 'center', alignItems: 'center' },
  loadingBody: { flex: 1 },
  scroll: { paddingHorizontal: HOME_SCROLL_PAD_H },
  scrollSearchOpen: {
    flexGrow: 1,
  },
  /** Згортаємо секції під час пошуку без unmount — зберігаємо позицію скролу. */
  homeSectionsHidden: {
    height: 0,
    overflow: 'hidden',
    opacity: 0,
  },
  homeHint: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    marginBottom: 6,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  lightSearchOuter: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 0,
    alignSelf: 'stretch',
    width: '100%',
  },
});
