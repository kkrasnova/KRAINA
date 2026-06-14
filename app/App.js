import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, LogBox, Platform, DeviceEventEmitter } from 'react-native';
import { useFonts, loadAsync as loadFontsAsync } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { navigationRef, notifyNavStateChange } from './navigationRef';
import LightBottomTabBar from './LightBottomTabBar';

import FirstPage from './FirstPage';
import SecondPage from './SecondPage';
import HomeTabPagerPage from './HomeTabPagerPage';
import ThirdPage from './ThirdPage';
import SelectCountryPage from './SelectCountryPage';
import ChoosePlanPage from './ChoosePlanPage';
import ForceUpdateScreen from './ForceUpdateScreen';
import LazyScreen from './LazyScreen';
import { getAppTheme, THEME_CHANGED_EVENT } from './themeStorage';
import { fetchAppVersionGate } from './fetchAppVersionGate';
import { runAppBootstrap } from './appBootstrap';
import { setOnboardingSlidesSeenFlag } from './onboardingStorage';
import { PREVIEW_SELECT_COUNTRY_BEFORE_REGISTRATION } from './flowFlags';
import { useAppLanguage } from './useAppLanguage';
import {
  KRAINA_FONT_MAP_CRITICAL,
  KRAINA_FONT_MAP_DEFERRED,
} from './krainaFonts';

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

/** Банери онбордингу вимкнено — одразу перехід на вхід / вибір країни. */
function OnboardingIntroSkip({ navigation, route }) {
  const lang = useAppLanguage(route);
  useLayoutEffect(() => {
    void setOnboardingSlidesSeenFlag();
    navigation.reset({
      index: 0,
      routes: [
        PREVIEW_SELECT_COUNTRY_BEFORE_REGISTRATION
          ? {
              name: 'SelectCountry',
              params: { language: lang, previewBeforeAuth: true },
            }
          : { name: 'ThirdPage', params: { language: lang } },
      ],
    });
  }, [navigation, lang]);
  return null;
}

/* Ліниві обгортки (lazy) для всіх екранів, крім критичного шляху.
   Код модуля парситься/виконується лише при першому переході — економить ~50% CPU/Memory при старті.
   Винесені на рівень модуля, щоб не створювати нові функції-компоненти при кожному ре-рендері App. */
const OnboardingIntroPage = OnboardingIntroSkip;
const WalkReminderSetupPage = (p) => <LazyScreen loader={() => import('./WalkReminderSetupPage')} {...p} />;
const AllCountriesLocationsPage = (p) => <LazyScreen loader={() => import('./AllCountriesLocationsPage')} {...p} />;
const HomeCityPickerPage = (p) => <LazyScreen loader={() => import('./HomeCityPickerPage')} {...p} />;
const SettingsPage = (p) => <LazyScreen loader={() => import('./SettingsPage')} {...p} />;
const SettingsStepsPage = (p) => <LazyScreen loader={() => import('./SettingsStepsPage')} {...p} />;
const SettingsArchivePage = (p) => <LazyScreen loader={() => import('./SettingsArchivePage')} {...p} />;
const SettingsLanguagePage = (p) => <LazyScreen loader={() => import('./SettingsSubScreens').then((m) => ({ default: m.SettingsLanguagePage }))} {...p} />;
const SettingsGeoPage = (p) => <LazyScreen loader={() => import('./SettingsSubScreens').then((m) => ({ default: m.SettingsGeoPage }))} {...p} />;
const SettingsNotificationsPage = (p) => <LazyScreen loader={() => import('./SettingsSubScreens').then((m) => ({ default: m.SettingsNotificationsPage }))} {...p} />;
const SettingsPrivacyPage = (p) => <LazyScreen loader={() => import('./SettingsSubScreens').then((m) => ({ default: m.SettingsPrivacyPage }))} {...p} />;
const SettingsLegalDocPage = (p) => <LazyScreen loader={() => import('./SettingsSubScreens').then((m) => ({ default: m.SettingsLegalDocPage }))} {...p} />;
const SettingsHelpPage = (p) => <LazyScreen loader={() => import('./SettingsSubScreens').then((m) => ({ default: m.SettingsHelpPage }))} {...p} />;
const SettingsAboutPage = (p) => <LazyScreen loader={() => import('./SettingsSubScreens').then((m) => ({ default: m.SettingsAboutPage }))} {...p} />;
const ChatsPage = (p) => <LazyScreen loader={() => import('./ChatsPage')} {...p} />;
const ChatThreadPage = (p) => <LazyScreen loader={() => import('./ChatThreadPage')} {...p} />;
const FeedCameraPage = (p) => <LazyScreen loader={() => import('./FeedCameraPage')} {...p} />;
const FeedStorySharePage = (p) => <LazyScreen loader={() => import('./FeedStorySharePage')} {...p} />;
const FeedStoryViewerPage = (p) => <LazyScreen loader={() => import('./FeedStoryViewerPage')} {...p} />;
const FeedPostComposerPage = (p) => <LazyScreen loader={() => import('./FeedPostComposerPage')} {...p} />;
const FeedPostMediaPickerPage = (p) => <LazyScreen loader={() => import('./FeedPostMediaPickerPage')} {...p} />;
const PostMapPickerPage = (p) => <LazyScreen loader={() => import('./PostMapPickerPage')} {...p} />;
const ExploreMapPage = (p) => <LazyScreen loader={() => import('./ExploreMapPage')} {...p} />;
const RouteResultsPage = (p) => <LazyScreen loader={() => import('./RouteResultsPage')} {...p} />;
const RouteNavigationPage = (p) => <LazyScreen loader={() => import('./RouteNavigationPage')} {...p} />;
const LandmarkResultPage = (p) => <LazyScreen loader={() => import('./LandmarkResultPage')} {...p} />;
const LandmarkQuizPage = (p) => <LazyScreen loader={() => import('./LandmarkQuizPage')} {...p} />;
const LandmarkNotFoundPage = (p) => <LazyScreen loader={() => import('./LandmarkNotFoundPage')} {...p} />;
const ProfileEditPage = (p) => <LazyScreen loader={() => import('./ProfileEditPage')} {...p} />;
const ProfileFriendsPage = (p) => <LazyScreen loader={() => import('./ProfileFriendsPage')} {...p} />;
const StartChatPage = (p) => <LazyScreen loader={() => import('./StartChatPage')} {...p} />;
const ProfileInvitesPage = (p) => <LazyScreen loader={() => import('./ProfileInvitesPage')} {...p} />;
const ProfilePostDetailPage = (p) => <LazyScreen loader={() => import('./ProfilePostDetailPage')} {...p} />;
const ProfileCommentsPage = (p) => <LazyScreen loader={() => import('./ProfileCommentsPage')} {...p} />;
const ProfileLikesPage = (p) => <LazyScreen loader={() => import('./ProfileLikesPage')} {...p} />;
const ProfileEditPublicationPage = (p) => <LazyScreen loader={() => import('./ProfileEditPublicationPage')} {...p} />;
const DiscoverPeoplePage = (p) => <LazyScreen loader={() => import('./DiscoverPeoplePage')} {...p} />;
const SocialUserProfilePage = (p) => <LazyScreen loader={() => import('./SocialUserProfilePage')} {...p} />;
const SocialConnectionsPage = (p) => <LazyScreen loader={() => import('./SocialConnectionsPage')} {...p} />;
const ProfilePageComponent = (p) => <LazyScreen loader={() => import('./ProfilePage')} {...p} />;
const ProfileGamificationHubPageComponent = (p) => <LazyScreen loader={() => import('./ProfileGamificationHubPage')} {...p} />;
const DevDBComponent = (p) => <LazyScreen loader={() => import('./DevDB')} {...p} />;
const AdminPanelPage = (p) => <LazyScreen loader={() => import('./AdminPanelPage')} {...p} />;
const AdminSecurityPage = (p) => <LazyScreen loader={() => import('./AdminSecurityPage')} {...p} />;
const OfflineOutboxPage = (p) => <LazyScreen loader={() => import('./OfflineOutboxPage')} {...p} />;
const AuthStackComponent = (p) => <LazyScreen loader={() => import('./auth/AuthStack')} {...p} />;

LogBox.ignoreLogs([
  'Could not reach Cloud Firestore backend',
  /** Android emulator часто без Play Billing — react-native-iap логує помилку ініціалізації. */
  ...(typeof __DEV__ !== 'undefined' && __DEV__
    ? [/\[RN-IAP\].*Failed to initialize IAP connection/i, /Failed to initialize billing connection/i]
    : []),
]);

void SplashScreen.preventAutoHideAsync();

const Stack = createNativeStackNavigator();

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
  const [splashUiReady, setSplashUiReady] = useState(false);
  /** Навігація: FirstPage (сплеш) не використовує кастомні шрифти — показуємо її негайно після сплешу. */
  const contentReady = splashUiReady;
  /** Флаг готовності шрифтів для сторінок, які їх потребують. */
  const [fontsDeferredReady, setFontsDeferredReady] = useState(false);
  const deferredFontsStarted = useRef(false);
  /** Якщо задано — показуємо екран примусового оновлення замість навігації */
  const [forceUpdateGate, setForceUpdateGate] = useState(null);
  const splashHiddenRef = useRef(false);

  /**
   * 1) Тема из storage → appTheme для FirstPage.
   * 2) hideAsync — снимаем нативный splash (он уже без логотипа, #000000).
   * 3) Один кадр только тёмного root View — без логотипа.
   * 4) contentReady — монтируется NavigationContainer + первая страница сразу целиком.
   */
  useEffect(() => {
    if (splashHiddenRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const t = await getAppTheme();
        if (cancelled) return;
        setAppTheme(t === 'light' ? 'light' : 'dark');
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (cancelled) return;
        splashHiddenRef.current = true;
        await SplashScreen.hideAsync();
        if (cancelled) return;
        await new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
        if (cancelled) return;
        setSplashUiReady(true);
      } catch {
        if (!cancelled) {
          splashHiddenRef.current = true;
          await SplashScreen.hideAsync().catch(() => {});
          setSplashUiReady(true);
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
    const cancel = scheduleIdleWork(() => {
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
      cancel();
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
      {contentReady ? (
        <SafeAreaProvider style={{ flex: 1, backgroundColor: '#000000' }}>
          {forceUpdateGate ? (
            <ForceUpdateScreen gate={forceUpdateGate} onRecheckResult={onForceUpdateRecheck} />
          ) : (
          <NavigationContainer
            ref={navigationRef}
            onReady={notifyNavStateChange}
            onStateChange={notifyNavStateChange}
          >
            <View style={{ flex: 1 }}>
              <Stack.Navigator
                initialRouteName="FirstPage"
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: '#000000' },
                  animation: 'none',
                  ...(Platform.OS === 'ios'
                    ? {
                        gestureEnabled: true,
                        fullScreenGestureEnabled: true,
                      }
                    : {}),
                }}
              >
              <Stack.Screen name="FirstPage">
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
                  statusBarTranslucent: true,
                  statusBarStyle: 'light',
                  ...(Platform.OS === 'android'
                    ? { statusBarBackgroundColor: 'transparent' }
                    : {}),
                }}
              />
              <Stack.Screen name="SelectCountry" component={SelectCountryPage} />
              <Stack.Screen name="WalkReminderSetup" component={WalkReminderSetupPage} options={{ headerShown: false }} />
              <Stack.Screen name="ChoosePlan" component={ChoosePlanPage} options={{ headerShown: false }} />
              <Stack.Screen
                name="HomeTabPager"
                component={HomeTabPagerPage}
                initialParams={
                  mainPageInitialParams
                    ? { ...mainPageInitialParams, tabIndex: 0 }
                    : { tabIndex: 0 }
                }
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
                name="AllCountriesLocations"
                component={AllCountriesLocationsPage}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="HomeCityPicker"
                component={HomeCityPickerPage}
                options={{ headerShown: false }}
              />
              <Stack.Screen name="Settings" component={SettingsPage} />
              <Stack.Screen name="SettingsLanguage" component={SettingsLanguagePage} />
              <Stack.Screen name="SettingsGeo" component={SettingsGeoPage} />
              <Stack.Screen name="SettingsNotifications" component={SettingsNotificationsPage} />
              <Stack.Screen name="SettingsSteps" component={SettingsStepsPage} options={{ headerShown: false }} />
              <Stack.Screen name="SettingsPrivacy" component={SettingsPrivacyPage} />
              <Stack.Screen name="SettingsLegalDoc" component={SettingsLegalDocPage} />
              <Stack.Screen name="SettingsHelp" component={SettingsHelpPage} />
              <Stack.Screen name="SettingsAbout" component={SettingsAboutPage} />
              <Stack.Screen name="SettingsArchive" component={SettingsArchivePage} options={{ headerShown: false }} />
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
                  ...(Platform.OS === 'ios' ? { presentation: 'fullScreenModal' } : {}),
                }}
              />
              <Stack.Screen
                name="FeedPostMediaPicker"
                component={FeedPostMediaPickerPage}
                options={{ headerShown: false }}
              />
              <Stack.Screen name="FeedPostComposer" component={FeedPostComposerPage} options={{ headerShown: false }} />
              <Stack.Screen name="PostMapPicker" component={PostMapPickerPage} options={{ headerShown: false }} />
              <Stack.Screen name="ExploreMap" component={ExploreMapPage} />
              <Stack.Screen name="RouteResults" component={RouteResultsPage} />
              <Stack.Screen name="RouteNavigation" component={RouteNavigationPage} />
              <Stack.Screen name="LandmarkResult" component={LandmarkResultPage} />
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
          )}
        </SafeAreaProvider>
      ) : null}
      <StatusBar style={appTheme === 'light' ? 'dark' : 'light'} />
    </View>
  );
}
