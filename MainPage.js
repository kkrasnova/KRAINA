import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  ActivityIndicator,
  DeviceEventEmitter,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

export default function MainPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [sessionUser, setSessionUser] = useState(null);
  const [sessionLang, setSessionLang] = useState(null);
  const [appTheme, setAppTheme] = useState('dark');
  const [homeSearchQuery, setHomeSearchQuery] = useState('');
  const [countrySearchLocksScroll, setCountrySearchLocksScroll] = useState(false);
  const [countryDismissSignal, setCountryDismissSignal] = useState(0);
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
        } catch (_) {}
      }
      if (!lang && u?.appLanguage) {
        lang = typeof u.appLanguage === 'string' ? u.appLanguage : null;
      }
      if (cancelled) return;
      if (!userHasIdentity(u)) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'FirstPage', params: { nextRoute: 'BackendAuth' } }],
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
        } catch (_) {}
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
    () => getHomeCountriesForCarousel(language),
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
        await saveCountryForUser(user, HOME_COUNTRY_ORDER[0]);
        setStoredCountryId(HOME_COUNTRY_ORDER[0]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [route?.params?.countryId, user?.id, user?.firebaseUid, user?.email]);

  const [gateReady, setGateReady] = useState(false);
  const [sub, setSub] = useState(null);

  /** Нижня таб-панель лише після готовності головного контенту (не поверх спінера / завантаження). */
  useEffect(() => {
    const ok = gateReady && !!sub;
    if (!ok) {
      setMainPageContentReady(false);
      return undefined;
    }
    let cancelled = false;
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => {
        if (!cancelled) setMainPageContentReady(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id1);
      if (id2) cancelAnimationFrame(id2);
      setMainPageContentReady(false);
    };
  }, [gateReady, sub]);

  const refreshSub = useCallback(async () => {
    await syncSubscriptionFromBackend(user);
    const s = await getSubscriptionState(user);
    setSub(s);
    return s;
  }, [user]);

  useEffect(() => {
    if (!userHasIdentity(user)) return;
    let cancelled = false;
    (async () => {
      await syncSubscriptionFromBackend(user);
      const s = await getSubscriptionState(user);
      if (cancelled) return;
      if (s.needsPlanChoice) {
        navigation.replace('ChoosePlan', {
          user,
          language,
          appTheme,
          ...(countryId ? { countryId } : {}),
        });
        return;
      }
      setSub(s);
      setGateReady(true);
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
      setCountryDismissSignal((n) => n + 1);
      let cancelled = false;
      (async () => {
        const t = await getAppTheme();
        if (!cancelled) setAppTheme(t === 'light' ? 'light' : 'dark');
        await refreshSub();
      })();
      return () => {
        cancelled = true;
      };
    }, [refreshSub]),
  );

  const openSettings = useCallback(() => {
    navigation.navigate('Settings', {
      user,
      language,
      ...(countryId ? { countryId } : {}),
      appTheme,
    });
  }, [navigation, user, language, countryId, appTheme]);

  const openTopRight = useCallback(() => {
    navigation.navigate('Chats', {
      user,
      language,
      ...(countryId ? { countryId } : {}),
      appTheme,
    });
  }, [navigation, user, language, countryId, appTheme]);

  const openAllCountriesLocations = useCallback(() => {
    navigation.navigate('AllCountriesLocations', { user, language, appTheme });
  }, [navigation, user, language, appTheme]);

  const onHomePickCountry = useCallback(
    async (nextId) => {
      if (!nextId) return;
      await saveCountryForUser(user, nextId);
      setStoredCountryId(nextId);
      setHomeSearchQuery('');
      try {
        navigation.setParams({ countryId: nextId });
      } catch (_) {}
    },
    [user, navigation],
  );

  const onHomeSearchPick = useCallback(
    async (row) => {
      if (!row || !userHasIdentity(user)) return;
      if (row.type === 'country') {
        await onHomePickCountry(row.countryId);
        return;
      }
      if (row.type === 'city') {
        await saveCountryForUser(user, row.countryId);
        setStoredCountryId(row.countryId);
        await saveHomeCityRegionId(user, row.countryId, row.regionId);
        setHomeSearchQuery('');
        try {
          navigation.setParams({ countryId: row.countryId });
        } catch (_) {}
        return;
      }
      if (row.type === 'landmark') {
        await saveCountryForUser(user, row.countryId);
        setStoredCountryId(row.countryId);
        await saveHomeCityRegionId(user, row.countryId, row.regionId);
        setHomeSearchQuery('');
        try {
          navigation.setParams({ countryId: row.countryId });
        } catch (_) {}
        navigation.navigate(
          'LandmarkResult',
          buildLandmarkResultParamsFromHomeLandmark({
            lm: row.landmark,
            region: row.region,
            countryId: row.countryId,
            language,
            appTheme,
            user,
          }),
        );
        return;
      }
      if (row.type === 'profile') {
        const u = String(row.username || '')
          .trim()
          .replace(/^@/, '');
        if (!u) return;
        setHomeSearchQuery('');
        navigation.push('SocialUserProfile', {
          user,
          language,
          appTheme,
          username: u,
          ...(countryId ? { countryId } : {}),
        });
      }
    },
    [user, navigation, language, appTheme, onHomePickCountry, countryId],
  );

  const isLightMain = appTheme === 'light';
  const showHomeSections = !countrySearchLocksScroll;
  const dismissKeyboardOnBackground = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  const commonSearchProps = useMemo(
    () => ({
      variant: isLightMain ? 'light' : 'dark',
      placeholder:
        language === 'uk'
          ? 'Пошук місць: країни, міста, локації'
          : 'Search places: countries, cities, locations',
      value: homeSearchQuery,
      onChangeText: setHomeSearchQuery,
      editable: true,
      language,
      selectedCountryId: countryId,
      onUnifiedPick: onHomeSearchPick,
      onParentScrollLockChange: setCountrySearchLocksScroll,
      dismissSignal: countryDismissSignal,
      // Home search is intentionally place-focused.
      profileSearchEnabled: false,
      peopleOnlyMode: false,
    }),
    [
      isLightMain,
      language,
      homeSearchQuery,
      countryId,
      onHomeSearchPick,
      countryDismissSignal,
      user,
    ],
  );

  if (!gateReady || !sub) {
    return (
      <TouchableWithoutFeedback onPress={dismissKeyboardOnBackground} accessible={false}>
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
                <View
                  style={[
                    styles.lightSearchOuter,
                    { paddingTop: HOME_GAP_AFTER_TOPBAR },
                  ]}
                >
                  <View style={[styles.homeSearchInlineBlock, { marginBottom: HOME_GAP_AFTER_SEARCH }]}>
                    <LightHomeCountrySearch {...commonSearchProps} presentedInOverlay={false} />
                  </View>
                  {showHomeSections ? (
                    <>
                      <HomeCategoryChips
                        language={language}
                        appTheme={appTheme}
                        selectedId={homeCategoryId}
                        onSelect={setHomeCategoryId}
                      />
                      <HomeCountryCarousel
                        language={language}
                        appTheme={appTheme}
                        countries={homeCountries}
                        selectedCountryId={countryId || HOME_COUNTRY_ORDER[0]}
                        onSelectCountry={onHomePickCountry}
                        onOpenAllCountries={openAllCountriesLocations}
                      />
                      {!countryId ? (
                        <Text
                          style={[
                            styles.homeHint,
                            { color: isLightMain ? '#3A3A3A' : MUTED },
                          ]}
                        >
                          {mt(language, 'homeSelectCountryHint')}
                        </Text>
                      ) : null}
                      <HomeExploreSection
                        user={user}
                        countryId={countryId}
                        language={language}
                        appTheme={appTheme}
                        navigation={navigation}
                        categoryId={homeCategoryId}
                        homeLocationsEpoch={homeLocationsEpoch}
                      />
                    </>
                  ) : null}
                </View>
                <View style={[styles.center, { flex: 1 }]}>
                  <ActivityIndicator size="large" color={accentForTheme(isLightMain)} />
                </View>
              </View>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={dismissKeyboardOnBackground} accessible={false}>
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
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                scrollEnabled={!countrySearchLocksScroll}
                nestedScrollEnabled
                removeClippedSubviews={false}
                showsVerticalScrollIndicator
                {...(Platform.OS === 'ios'
                  ? {
                      /** Уникаємо подвійного safe area з UIScrollView і обрізання нижнього контенту. */
                      contentInsetAdjustmentBehavior: 'never',
                    }
                  : {})}
              >
                <View style={[styles.homeSearchInlineBlock, { marginBottom: HOME_GAP_AFTER_SEARCH }]}>
                  <LightHomeCountrySearch {...commonSearchProps} presentedInOverlay={false} />
                </View>
                {showHomeSections ? (
                  <>
                    <HomeCategoryChips
                      language={language}
                      appTheme={appTheme}
                      selectedId={homeCategoryId}
                      onSelect={setHomeCategoryId}
                    />
                    <HomeCountryCarousel
                      language={language}
                      appTheme={appTheme}
                      countries={homeCountries}
                      selectedCountryId={countryId || HOME_COUNTRY_ORDER[0]}
                      onSelectCountry={onHomePickCountry}
                      onOpenAllCountries={openAllCountriesLocations}
                    />
                    {!countryId ? (
                      <Text
                        style={[
                          styles.homeHint,
                          { color: appTheme === 'light' ? '#3A3A3A' : MUTED },
                        ]}
                      >
                        {mt(language, 'homeSelectCountryHint')}
                      </Text>
                    ) : null}
                    <HomeExploreSection
                      user={user}
                      countryId={countryId}
                      language={language}
                      appTheme={appTheme}
                      navigation={navigation}
                      categoryId={homeCategoryId}
                      homeLocationsEpoch={homeLocationsEpoch}
                    />
                  </>
                ) : null}
              </ScrollView>
            </View>
          </View>
        </View>
      </View>
    </TouchableWithoutFeedback>
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
