import React, { useState, useCallback, useEffect, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
  DeviceEventEmitter,
  Keyboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSession } from './db';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { getSubscriptionState } from './subscriptionStorage';
import { syncSubscriptionFromBackend } from './syncSubscriptionFromBackend';
import { getAppTheme, THEME_CHANGED_EVENT } from './themeStorage';
import { getSavedCountryIdForUser, saveCountryForUser } from './countryStorage';
import { saveHomeCityRegionId } from './homeCityStorage';
import { buildLandmarkResultParamsFromHomeLandmark } from './homeLandmarkResultParams';
import { mt } from './mainPageI18n';
import { appLangBase } from './appLang';
import { KRAINA_APP_LANGUAGE_CHANGED } from './appLanguageEvents';
import LightHomeCountrySearch from './LightHomeCountrySearch';
import HomeExploreSection from './HomeExploreSection';
import HomeCountryCarousel from './HomeCountryCarousel';
import HomeCategoryChips from './HomeCategoryChips';
import { getHomeCountriesForCarousel, HOME_COUNTRY_ORDER } from './homeExploreData';
import { KRAINA_ADMIN_LOCATION_EVENT } from './adminLocationData';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { accentForTheme } from './themeAccent';
import { setMainPageContentReady } from './mainPageTabGate';
import { shellNavigate, shellPush } from './shellNavigate';
const BG = APP_SCREEN_BG;
/**
 * Пошук у скролі: трохи нижче від шапки, блок категорій трохи вище (менший зазор під пошуком).
 */
const HOME_GAP_AFTER_TOPBAR = 16;
const HOME_GAP_AFTER_SEARCH = 6;

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
}) {
  return (
    <View style={[styles.homeSearchInlineBlock, { marginBottom: HOME_GAP_AFTER_SEARCH }]}>
      <LightHomeCountrySearch
        variant={variant}
        placeholder={placeholder}
        editable
        language={language}
        selectedCountryId={selectedCountryId}
        onUnifiedPick={onUnifiedPick}
        onParentScrollLockChange={onParentScrollLockChange}
        resetToken={resetToken}
        presentedInOverlay={false}
        profileSearchEnabled={false}
        peopleOnlyMode={false}
      />
    </View>
  );
});

/** Секції під пошуком — memo, щоб тапи/скрол не чіпали поле вводу. */
const MainPageHomeSections = memo(function MainPageHomeSections({
  visible,
  language,
  appTheme,
  homeCategoryId,
  onSelectCategory,
  homeCountries,
  countryId,
  onHomePickCountry,
  onOpenAllCountries,
  user,
  homeLocationsEpoch,
}) {
  if (!visible) return null;
  const isLightMain = appTheme === 'light';
  return (
    <>
      <HomeCategoryChips
        language={language}
        appTheme={appTheme}
        selectedId={homeCategoryId}
        onSelect={onSelectCategory}
      />
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
        categoryId={homeCategoryId}
        homeLocationsEpoch={homeLocationsEpoch}
      />
    </>
  );
});

export default function MainPage({ navigation, route }) {
  const [sessionUser, setSessionUser] = useState(null);
  const [sessionLang, setSessionLang] = useState(null);
  const [appTheme, setAppTheme] = useState('dark');
  const [countrySearchLocksScroll, setCountrySearchLocksScroll] = useState(false);
  const [searchResetToken, setSearchResetToken] = useState(0);
  const [homeCategoryId, setHomeCategoryId] = useState('all');
  const [homeLocationsEpoch, setHomeLocationsEpoch] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await getAppTheme();
      if (!cancelled) setAppTheme(t === 'light' ? 'light' : 'dark');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setAppTheme(v === 'light' ? 'light' : 'dark');
    });
    return () => sub.remove();
  }, []);

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

  const [gateReady, setGateReady] = useState(false);
  const [sub, setSub] = useState(null);

  /** Нижня таб-панель одразу після готовності gate — без подвійного rAF. */
  useEffect(() => {
    const ok = gateReady && !!sub;
    setMainPageContentReady(ok);
    return () => setMainPageContentReady(false);
  }, [gateReady, sub]);

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
      setSub(cachedSub);
      setGateReady(true);

      try {
        await syncSubscriptionFromBackend(user);
        const nextSub = await getSubscriptionState(user);
        if (!cancelled) {
          if (nextSub.needsPlanChoice) {
            navigation.replace('ChoosePlan', {
              user,
              language,
              appTheme,
              ...(countryId ? { countryId } : {}),
            });
          } else {
            setSub((prev) => {
              if (
                prev &&
                prev.needsPlanChoice === nextSub.needsPlanChoice &&
                prev.tier === nextSub.tier &&
                prev.isPaidActive === nextSub.isPaidActive
              ) {
                return prev;
              }
              return nextSub;
            });
          }
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
      setCountrySearchLocksScroll(false);
    }, []),
  );

  const openSettings = useCallback(() => {
    shellNavigate('Settings', {}, appTheme);
  }, [appTheme]);

  const openTopRight = useCallback(() => {
    shellNavigate('Chats', {}, appTheme);
  }, [appTheme]);

  const openAllCountriesLocations = useCallback(() => {
    shellNavigate('AllCountriesLocations', {}, appTheme);
  }, [appTheme]);

  const bumpSearchReset = useCallback(() => {
    setSearchResetToken((n) => n + 1);
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
        shellNavigate(
          'LandmarkResult',
          buildLandmarkResultParamsFromHomeLandmark({
            lm: row.landmark,
            region: row.region,
            countryId: row.countryId,
            language,
            appTheme,
            user,
          }),
          appTheme,
        );
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

  const isLightMain = appTheme === 'light';
  const showHomeSections = !countrySearchLocksScroll;
  const dismissKeyboardOnScroll = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  const searchVariant = isLightMain ? 'light' : 'dark';
  const searchPlaceholder =
    language === 'uk'
      ? 'Пошук місць: країни, міста, локації'
      : 'Search places: countries, cities, locations';
  const contentReady = gateReady && !!sub;

  if (!contentReady) {
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
            <View style={[styles.center, styles.loadingBody, { paddingTop: HOME_GAP_AFTER_TOPBAR }]}>
              <ActivityIndicator size="large" color={accentForTheme(isLightMain)} />
            </View>
          </View>
        </View>
      </View>
    );
  }

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
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={[
                styles.scroll,
                {
                  paddingTop: HOME_GAP_AFTER_TOPBAR,
                  /** iOS: індикатор «дому» + плаваюча нижня панель — мінімальний запас. */
                  paddingBottom: lightTabBarExtraScrollPadding() + 16,
                },
              ]}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="on-drag"
              onScrollBeginDrag={dismissKeyboardOnScroll}
              scrollEnabled={!countrySearchLocksScroll}
              nestedScrollEnabled
              removeClippedSubviews={Platform.OS === 'android'}
              showsVerticalScrollIndicator
              {...(Platform.OS === 'ios'
                ? {
                    /** Уникаємо подвійного safe area з UIScrollView і обрізання нижнього контенту. */
                    contentInsetAdjustmentBehavior: 'never',
                  }
                : {})}
            >
                <MainPageSearchBlock
                  variant={searchVariant}
                  placeholder={searchPlaceholder}
                  language={language}
                  selectedCountryId={countryId}
                  onUnifiedPick={onHomeSearchPick}
                  onParentScrollLockChange={setCountrySearchLocksScroll}
                  resetToken={searchResetToken}
                />
                <MainPageHomeSections
                  visible={showHomeSections}
                  language={language}
                  appTheme={appTheme}
                  homeCategoryId={homeCategoryId}
                  onSelectCategory={setHomeCategoryId}
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
  countryOverlayHost: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  loadingBody: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingBottom: 32 },
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
