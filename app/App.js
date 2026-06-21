import React, { useEffect, useRef, useState } from 'react';
import { View, LogBox, Platform, DeviceEventEmitter } from 'react-native';
import { useFonts, loadAsync as loadFontsAsync } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { navigationRef, notifyNavStateChange } from './navigationRef';
import LightBottomTabBar from './LightBottomTabBar';

import FirstPage from './FirstPage';
import SecondPage from './SecondPage';
import HomeTabPagerPage from './HomeTabPagerPage';
import ThirdPage from './ThirdPage';
import SelectCountryPage from './SelectCountryPage';
import ChoosePlanPage from './ChoosePlanPage';
import ForceUpdateScreen from './ForceUpdateScreen';
import LazyScreen, { makeLazyLoader } from './LazyScreen';
import { loadChatsPage, loadChatThreadPage, loadSettingsArchivePage } from './screenLoaders';
import { getAppTheme, THEME_CHANGED_EVENT } from './themeStorage';
import { fetchAppVersionGate } from './fetchAppVersionGate';
import { runAppBootstrap } from './appBootstrap';
import { waitForSplashLogoPainted, notifySplashHidden } from './splashLogoGate';
import { splashTitleVideoReady } from './splashTitleVideoAsset';
import {
  KRAINA_FONT_MAP_CRITICAL,
  KRAINA_FONT_MAP_DEFERRED,
} from './krainaFonts';
import { markEnd } from './performanceMetrics';
import { configureBackgroundMusicFriendlyAudio } from './audioSession';

function scheduleIdleWork(fn) {
  if (typeof globalThis.requestIdleCallback === 'function') {
    const id = globalThis.requestIdleCallback(() => {
      fn();
    }, { timeout: 2000 });
    return () => globalThis.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 1);
  return () => clearTimeout(id);
}

/** Карусель банерів перед входом / реєстрацією (усі мови, Android + iOS). */
const OnboardingIntroPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./OnboardingIntroPage'))} {...p} />
);
const WalkReminderSetupPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./WalkReminderSetupPage'))} {...p} />
);
const AllCountriesLocationsPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./AllCountriesLocationsPage'))} {...p} />
);
const HomeCityPickerPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./HomeCityPickerPage'))} {...p} />
);
const SettingsPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./SettingsPage'))} {...p} />
);
const SettingsStepsPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./SettingsStepsPage'))} {...p} />
);
const SettingsArchivePage = (p) => <LazyScreen loader={loadSettingsArchivePage} {...p} />;
const SettingsLanguagePage = (p) => (
  <LazyScreen
    loader={makeLazyLoader(
      () => require('./SettingsSubScreens'),
      (m) => ({ default: m.SettingsLanguagePage }),
    )}
    {...p}
  />
);
const SettingsGeoPage = (p) => (
  <LazyScreen
    loader={makeLazyLoader(
      () => require('./SettingsSubScreens'),
      (m) => ({ default: m.SettingsGeoPage }),
    )}
    {...p}
  />
);
const SettingsNotificationsPage = (p) => (
  <LazyScreen
    loader={makeLazyLoader(
      () => require('./SettingsSubScreens'),
      (m) => ({ default: m.SettingsNotificationsPage }),
    )}
    {...p}
  />
);
const SettingsNotificationMessagesPage = (p) => (
  <LazyScreen
    loader={makeLazyLoader(
      () => require('./SettingsSubScreens'),
      (m) => ({ default: m.SettingsNotificationMessagesPage }),
    )}
    {...p}
  />
);
const SettingsNotificationFeedPage = (p) => (
  <LazyScreen
    loader={makeLazyLoader(
      () => require('./SettingsSubScreens'),
      (m) => ({ default: m.SettingsNotificationFeedPage }),
    )}
    {...p}
  />
);
const SettingsNotificationRoutesPage = (p) => (
  <LazyScreen
    loader={makeLazyLoader(
      () => require('./SettingsSubScreens'),
      (m) => ({ default: m.SettingsNotificationRoutesPage }),
    )}
    {...p}
  />
);
const SettingsNotificationProductPage = (p) => (
  <LazyScreen
    loader={makeLazyLoader(
      () => require('./SettingsSubScreens'),
      (m) => ({ default: m.SettingsNotificationProductPage }),
    )}
    {...p}
  />
);
const SettingsPrivacyPage = (p) => (
  <LazyScreen
    loader={makeLazyLoader(
      () => require('./SettingsSubScreens'),
      (m) => ({ default: m.SettingsPrivacyPage }),
    )}
    {...p}
  />
);
const SettingsLegalDocPage = (p) => (
  <LazyScreen
    loader={makeLazyLoader(
      () => require('./SettingsSubScreens'),
      (m) => ({ default: m.SettingsLegalDocPage }),
    )}
    {...p}
  />
);
const SettingsHelpPage = (p) => (
  <LazyScreen
    loader={makeLazyLoader(
      () => require('./SettingsSubScreens'),
      (m) => ({ default: m.SettingsHelpPage }),
    )}
    {...p}
  />
);
const SettingsAboutPage = (p) => (
  <LazyScreen
    loader={makeLazyLoader(
      () => require('./SettingsSubScreens'),
      (m) => ({ default: m.SettingsAboutPage }),
    )}
    {...p}
  />
);
const CancelSubscriptionPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./CancelSubscriptionPage'))} {...p} />
);
const ChatsPage = (p) => <LazyScreen loader={loadChatsPage} {...p} />;
const ChatThreadPage = (p) => <LazyScreen loader={loadChatThreadPage} {...p} />;
const CallPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./CallPage'))} {...p} />
);
const FeedCameraPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./FeedCameraPage'))} {...p} />
);
const FeedStorySharePage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./FeedStorySharePage'))} {...p} />
);
const FeedStoryViewerPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./FeedStoryViewerPage'))} {...p} />
);
const FeedPostComposerPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./FeedPostComposerPage'))} {...p} />
);
const FeedPostMediaPickerPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./FeedPostMediaPickerPage'))} {...p} />
);
const PostMapPickerPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./PostMapPickerPage'))} {...p} />
);
const RouteFinderPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./RouteFinderPage'))} {...p} />
);
const ExploreMapPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./ExploreMapPage'))} {...p} />
);
const RouteResultsPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./RouteResultsPage'))} {...p} />
);
const RouteNavigationPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./RouteNavigationPage'))} {...p} />
);
const LandmarkResultPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./LandmarkResultPage'))} {...p} />
);
const LandmarkQuizPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./LandmarkQuizPage'))} {...p} />
);
const LandmarkNotFoundPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./LandmarkNotFoundPage'))} {...p} />
);
const ProfileEditPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./ProfileEditPage'))} {...p} />
);
const ProfileFriendsPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./ProfileFriendsPage'))} {...p} />
);
const StartChatPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./StartChatPage'))} {...p} />
);
const ProfileInvitesPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./ProfileInvitesPage'))} {...p} />
);
const ProfilePostDetailPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./ProfilePostDetailPage'))} {...p} />
);
const ProfileCommentsPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./ProfileCommentsPage'))} {...p} />
);
const ProfileLikesPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./ProfileLikesPage'))} {...p} />
);
const ProfileEditPublicationPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./ProfileEditPublicationPage'))} {...p} />
);
const DiscoverPeoplePage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./DiscoverPeoplePage'))} {...p} />
);
const SocialUserProfilePage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./SocialUserProfilePage'))} {...p} />
);
const SocialConnectionsPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./SocialConnectionsPage'))} {...p} />
);
const ProfilePageComponent = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./ProfilePage'))} {...p} />
);
const ProfileGamificationHubPageComponent = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./ProfileGamificationHubPage'))} {...p} />
);
const DevDBComponent = (p) => <LazyScreen loader={makeLazyLoader(() => require('./DevDB'))} {...p} />;
const AdminPanelPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./AdminPanelPage'))} {...p} />
);
const AdminSecurityPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./AdminSecurityPage'))} {...p} />
);
const OfflineOutboxPage = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./OfflineOutboxPage'))} {...p} />
);
const AuthStackComponent = (p) => (
  <LazyScreen loader={makeLazyLoader(() => require('./auth/AuthStack'))} {...p} />
);

LogBox.ignoreLogs([
  'Could not reach Cloud Firestore backend',
  /** Android emulator часто без Play Billing — react-native-iap логує помилку ініціалізації. */
  ...(typeof __DEV__ !== 'undefined' && __DEV__
    ? [/\[RN-IAP\].*Failed to initialize IAP connection/i, /Failed to initialize billing connection/i]
    : []),
]);

void SplashScreen.preventAutoHideAsync();

const Stack = createNativeStackNavigator();

/** Поверх HomeTabPager: не відʼєднуємо нижній екран і даємо slide — інакше iOS після goBack лишає чорний екран. */
const STACK_OVER_HOME_OPTIONS = {
  animation: Platform.OS === 'ios' ? 'slide_from_right' : 'default',
  freezeOnBlur: false,
  detachPreviousScreen: false,
};

const HOME_TAB_PAGER_OPTIONS = {
  freezeOnBlur: false,
  ...(Platform.OS === 'ios'
    ? {
        scrollEdgeEffects: {
          top: 'automatic',
          bottom: 'hidden',
          left: 'automatic',
          right: 'automatic',
        },
      }
    : {}),
};

export default function App() {
  /* Завантажуємо лише критичні шрифти (12 файлів) — інші 20+ підвантажаться в фоновому режимі після першого рендера.
     FirstPage (сплеш) не використовує кастомні шрифти — показуємо сплеш негайно. */
  const [fontsLoaded, fontError] = useFonts(KRAINA_FONT_MAP_CRITICAL);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [mainPageInitialParams, setMainPageInitialParams] = useState(null);
  const [savedLanguage, setSavedLanguage] = useState(null);
  /** До завершення bootstrap — null, щоб FirstPage ніколи не робив replace на дефолтний SecondPage «з кешу». */
  const [firstPageNextRoute, setFirstPageNextRoute] = useState(null);
  /** Параметри для `navigation.replace` після FirstPage (напр. SelectCountry з user + language). */
  const [firstPageNextParams, setFirstPageNextParams] = useState(null);
  const [appTheme, setAppTheme] = useState('dark');
  /** Після нативного splash + кадру затемнення. */
  /** FirstPage монтується одразу за нативним сплешем — без гейту, щоб не було чорного кадру. */
  const contentReady = true;
  /** Флаг готовності шрифтів для сторінок, які їх потребують. */
  const [fontsDeferredReady, setFontsDeferredReady] = useState(false);
  const deferredFontsStarted = useRef(false);
  /** Якщо задано — показуємо екран примусового оновлення замість навігації */
  const [forceUpdateGate, setForceUpdateGate] = useState(null);
  /**
   * 1) FirstPage вже змонтована (contentReady = true).
   * 2) Чекаємо, поки FirstPage відрендерить лого (або таймаут 3с).
   * 3) Ховаємо нативний сплеш — лого FirstPage вже на екрані, без чорного кадру.
   */
  useEffect(() => {
    void configureBackgroundMusicFriendlyAudio().catch(() => {});
    void splashTitleVideoReady.catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const storedTheme = await getAppTheme();
        if (cancelled) return;
        setAppTheme(storedTheme === 'light' ? 'light' : 'dark');
        if (cancelled) return;
        // Чекаємо, доки FirstPage намалює лого (він уже змонтований)
        await waitForSplashLogoPainted(3000);
        if (cancelled) return;
        await SplashScreen.hideAsync();
        notifySplashHidden();
        markEnd('first_screen');
      } catch {
        if (!cancelled) {
          await SplashScreen.hideAsync().catch(() => {});
          markEnd('first_screen');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Завантаження відкладених шрифтів (deferred) після перших двох кадрів.
     Гарантовано завантажаться навіть якщо критичні шрифти вже в кеші (використовуємо ref). */
  useEffect(() => {
    if (deferredFontsStarted.current) return;
    deferredFontsStarted.current = true;
    const cancel = scheduleIdleWork(() => {
      void (async () => {
        try {
          await loadFontsAsync(KRAINA_FONT_MAP_DEFERRED);
        } catch {
          /* deferred fonts are non-critical */
        }
        setFontsDeferredReady(true);
      })();
    });
    return cancel;
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setAppTheme(v === 'light' ? 'light' : 'dark');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cancelIdle = scheduleIdleWork(() => {
      if (cancelled) return;
      try {
        const m = require('./walkReminderSync');
        m.installWalkReminderNotificationHandler();
        void m.resyncWalkReminderOnAppColdStart();
      } catch {
        /* walk reminder sync is non-critical at startup */
      }
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const getCancelled = () => cancelled;
    const bootstrapApi = {
      setMainPageInitialParams,
      setFirstPageNextRoute,
      setFirstPageNextParams,
      setSavedLanguage,
    };
    (async () => {
      const bootstrapPromise = runAppBootstrap({ getCancelled }, bootstrapApi);
      const versionGatePromise = fetchAppVersionGate().catch(() => ({ requireUpdate: false }));

      try {
        await bootstrapPromise;
        if (cancelled) return;
        setBootstrapReady(true);

        const gate = await versionGatePromise;
        if (cancelled) return;
        if (gate.requireUpdate) {
          setForceUpdateGate(gate);
        }
      } catch {
        if (!cancelled) {
          setMainPageInitialParams(null);
          setFirstPageNextRoute('SecondPage');
          setFirstPageNextParams({ firstLaunchOnboarding: true });
          setBootstrapReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onForceUpdateRecheck = React.useCallback((nextGate) => {
    void (async () => {
      if (!nextGate?.requireUpdate) {
        const getCancelled = () => false;
        await runAppBootstrap(
          { getCancelled },
          {
            setMainPageInitialParams,
            setFirstPageNextRoute,
            setFirstPageNextParams,
            setSavedLanguage,
          },
        );
        setForceUpdateGate(null);
      } else {
        setForceUpdateGate(nextGate);
      }
    })();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <SafeAreaProvider
        initialMetrics={initialWindowMetrics}
        style={{ flex: 1, backgroundColor: '#000000' }}
      >
      {contentReady ? (
        forceUpdateGate ? (
            <ForceUpdateScreen gate={forceUpdateGate} onRecheckResult={onForceUpdateRecheck} />
          ) : (
          <NavigationContainer
            ref={navigationRef}
            onReady={() => {
              notifyNavStateChange();
              markEnd('navigation_container_ready');
            }}
            onStateChange={notifyNavStateChange}
          >
            <View style={{ flex: 1 }}>
              <Stack.Navigator
                initialRouteName="FirstPage"
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: '#000000' },
                  animation: 'none',
                  freezeOnBlur: false,
                  ...(Platform.OS === 'ios'
                    ? {
                        gestureEnabled: true,
                        fullScreenGestureEnabled: true,
                        statusBarStyle: appTheme === 'light' ? 'dark' : 'light',
                      }
                    : {}),
                }}
              >
              <Stack.Screen
                name="FirstPage"
                options={{
                  animation: 'none',
                  contentStyle: { backgroundColor: '#000000' },
                }}
              >
                {(props) => (
                  <FirstPage
                    {...props}
                    route={{
                      ...props.route,
                      params: {
                        ...(props.route?.params || {}),
                        nextRoute: props.route?.params?.nextRoute ?? firstPageNextRoute,
                        nextRouteParams:
                          props.route?.params?.nextRouteParams ?? firstPageNextParams,
                        bootstrapReady:
                          props.route?.params?.bootstrapReady ?? bootstrapReady,
                        appTheme: props.route?.params?.appTheme ?? appTheme,
                      },
                    }}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="SecondPage" component={SecondPage} />
              <Stack.Screen
                name="OnboardingIntro"
                component={OnboardingIntroPage}
                options={{
                  gestureEnabled: false,
                  fullScreenGestureEnabled: false,
                  contentStyle: { flex: 1, overflow: 'hidden' },
                  ...(Platform.OS === 'ios'
                    ? {
                        scrollEdgeEffects: {
                          top: 'hidden',
                          bottom: 'hidden',
                          left: 'hidden',
                          right: 'hidden',
                        },
                      }
                    : {}),
                }}
              />
              <Stack.Screen
                name="ThirdPage"
                component={ThirdPage}
                initialParams={savedLanguage ? { language: savedLanguage } : undefined}
                options={{
                  ...(Platform.OS === 'android'
                    ? {
                        statusBarTranslucent: true,
                        statusBarStyle: 'light',
                        statusBarBackgroundColor: 'transparent',
                      }
                    : {}),
                }}
              />
              <Stack.Screen
                name="SelectCountry"
                component={SelectCountryPage}
                options={{ contentStyle: { backgroundColor: 'transparent' } }}
              />
              <Stack.Screen
                name="WalkReminderSetup"
                component={WalkReminderSetupPage}
                options={{ headerShown: false, ...STACK_OVER_HOME_OPTIONS }}
              />
              <Stack.Screen
                name="ChoosePlan"
                component={ChoosePlanPage}
                options={{ headerShown: false, ...STACK_OVER_HOME_OPTIONS }}
              />
              <Stack.Screen
                name="CancelSubscription"
                component={CancelSubscriptionPage}
                options={{ headerShown: false, ...STACK_OVER_HOME_OPTIONS }}
              />
              <Stack.Screen
                name="HomeTabPager"
                component={HomeTabPagerPage}
                initialParams={
                  mainPageInitialParams
                    ? { ...mainPageInitialParams, tabIndex: 0 }
                    : { tabIndex: 0 }
                }
                options={HOME_TAB_PAGER_OPTIONS}
              />
              <Stack.Screen
                name="AllCountriesLocations"
                component={AllCountriesLocationsPage}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="HomeCityPicker"
                component={HomeCityPickerPage}
                options={{ headerShown: false }}
              />
              <Stack.Screen name="Settings" component={SettingsPage} options={STACK_OVER_HOME_OPTIONS} />
              <Stack.Screen name="SettingsLanguage" component={SettingsLanguagePage} options={STACK_OVER_HOME_OPTIONS} />
              <Stack.Screen name="SettingsGeo" component={SettingsGeoPage} options={STACK_OVER_HOME_OPTIONS} />
              <Stack.Screen
                name="SettingsNotifications"
                component={SettingsNotificationsPage}
                options={STACK_OVER_HOME_OPTIONS}
              />
              <Stack.Screen
                name="SettingsNotificationMessages"
                component={SettingsNotificationMessagesPage}
                options={STACK_OVER_HOME_OPTIONS}
              />
              <Stack.Screen
                name="SettingsNotificationFeed"
                component={SettingsNotificationFeedPage}
                options={STACK_OVER_HOME_OPTIONS}
              />
              <Stack.Screen
                name="SettingsNotificationRoutes"
                component={SettingsNotificationRoutesPage}
                options={STACK_OVER_HOME_OPTIONS}
              />
              <Stack.Screen
                name="SettingsNotificationProduct"
                component={SettingsNotificationProductPage}
                options={STACK_OVER_HOME_OPTIONS}
              />
              <Stack.Screen
                name="SettingsSteps"
                component={SettingsStepsPage}
                options={{ headerShown: false, ...STACK_OVER_HOME_OPTIONS }}
              />
              <Stack.Screen name="SettingsPrivacy" component={SettingsPrivacyPage} options={STACK_OVER_HOME_OPTIONS} />
              <Stack.Screen
                name="SettingsCancelSubscription"
                component={CancelSubscriptionPage}
                options={STACK_OVER_HOME_OPTIONS}
              />
              <Stack.Screen name="SettingsLegalDoc" component={SettingsLegalDocPage} options={STACK_OVER_HOME_OPTIONS} />
              <Stack.Screen name="SettingsHelp" component={SettingsHelpPage} options={STACK_OVER_HOME_OPTIONS} />
              <Stack.Screen name="SettingsAbout" component={SettingsAboutPage} options={STACK_OVER_HOME_OPTIONS} />
              <Stack.Screen
                name="SettingsArchive"
                component={SettingsArchivePage}
                options={{ headerShown: false, ...STACK_OVER_HOME_OPTIONS }}
              />
              <Stack.Screen
                name="ProfilePage"
                component={ProfilePageComponent}
                options={
                  Platform.OS === 'ios'
                    ? {
                        scrollEdgeEffects: {
                          top: 'automatic',
                          bottom: 'hidden',
                          left: 'automatic',
                          right: 'automatic',
                        },
                      }
                    : undefined
                }
              />
              <Stack.Screen
                name="ProfileGamificationHub"
                component={ProfileGamificationHubPageComponent}
                options={{ headerShown: false }}
              />
              <Stack.Screen name="AdminPanel" component={AdminPanelPage} options={{ headerShown: false }} />
              <Stack.Screen name="AdminSecurity" component={AdminSecurityPage} options={{ headerShown: false }} />
              <Stack.Screen name="OfflineOutbox" component={OfflineOutboxPage} options={{ headerShown: false }} />
              <Stack.Screen name="Chats" component={ChatsPage} />
              <Stack.Screen name="StartChat" component={StartChatPage} options={{ headerShown: false }} />
              <Stack.Screen name="ChatThread" component={ChatThreadPage} options={{ headerShown: false }} />
              <Stack.Screen name="Call" component={CallPage} options={{ headerShown: false }} />
              <Stack.Screen
                name="FeedCamera"
                component={FeedCameraPage}
                options={{
                  headerShown: false,
                  ...(Platform.OS === 'ios' ? { presentation: 'fullScreenModal' } : {}),
                }}
              />
              <Stack.Screen name="FeedStoryShare" component={FeedStorySharePage} options={{ headerShown: false }} />
              <Stack.Screen
                name="FeedStoryViewer"
                component={FeedStoryViewerPage}
                options={{
                  headerShown: false,
                  ...(Platform.OS === 'ios'
                    ? { presentation: 'fullScreenModal' }
                    : {}),
                }}
              />
              <Stack.Screen
                name="FeedPostMediaPicker"
                component={FeedPostMediaPickerPage}
                options={{ headerShown: false }}
              />
              <Stack.Screen name="FeedPostComposer" component={FeedPostComposerPage} options={{ headerShown: false }} />
              <Stack.Screen name="RouteFinder" component={RouteFinderPage} options={{ headerShown: false }} />
              <Stack.Screen name="PostMapPicker" component={PostMapPickerPage} options={{ headerShown: false }} />
              <Stack.Screen name="ExploreMap" component={ExploreMapPage} />
              <Stack.Screen name="RouteResults" component={RouteResultsPage} />
              <Stack.Screen name="RouteNavigation" component={RouteNavigationPage} />
              <Stack.Screen
                name="LandmarkResult"
                component={LandmarkResultPage}
                options={
                  Platform.OS === 'ios'
                    ? { gestureEnabled: false, fullScreenGestureEnabled: false }
                    : undefined
                }
              />
              <Stack.Screen name="LandmarkQuiz" component={LandmarkQuizPage} options={{ headerShown: false }} />
              <Stack.Screen name="LandmarkNotFound" component={LandmarkNotFoundPage} options={{ headerShown: false }} />
              <Stack.Screen name="DiscoverPeople" component={DiscoverPeoplePage} options={{ headerShown: false }} />
              <Stack.Screen name="SocialUserProfile" component={SocialUserProfilePage} options={{ headerShown: false }} />
              <Stack.Screen name="SocialConnections" component={SocialConnectionsPage} options={{ headerShown: false }} />
              <Stack.Screen name="ProfileEdit" component={ProfileEditPage} />
              <Stack.Screen name="ProfileFriends" component={ProfileFriendsPage} />
              <Stack.Screen name="ProfileInvites" component={ProfileInvitesPage} />
              <Stack.Screen name="ProfilePostDetail" component={ProfilePostDetailPage} />
              <Stack.Screen name="ProfileComments" component={ProfileCommentsPage} />
              <Stack.Screen name="ProfileLikes" component={ProfileLikesPage} />
              <Stack.Screen name="ProfileEditPublication" component={ProfileEditPublicationPage} />
              <Stack.Screen name="DevDB" component={DevDBComponent} />
              <Stack.Screen
                name="BackendAuth"
                component={AuthStackComponent}
                options={{ headerShown: false }}
              />
              </Stack.Navigator>
              <LightBottomTabBar />
            </View>
          </NavigationContainer>
          )
      ) : null}
      </SafeAreaProvider>
      {Platform.OS === 'android' ? (
        <StatusBar style={appTheme === 'light' ? 'dark' : 'light'} />
      ) : null}
    </View>
  );
}
