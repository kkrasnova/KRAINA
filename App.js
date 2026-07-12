import React, { useEffect, useRef, useState } from 'react';
import { View, LogBox, Platform, DeviceEventEmitter } from 'react-native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { navigationRef } from './navigationRef';
import LightBottomTabBar from './LightBottomTabBar';

import FirstPage from './FirstPage'; // не дублюй ім’я: без другого `const FirstPage = React.lazy(...)`
import SecondPage from './SecondPage';
import OnboardingIntroPage from './OnboardingIntroPage';
import ThirdPage from './ThirdPage';
import SelectCountryPage from './SelectCountryPage';
import WalkReminderSetupPage from './WalkReminderSetupPage';
import ChoosePlanPage from './ChoosePlanPage';
import HomeTabPagerPage from './HomeTabPagerPage';
import AllCountriesLocationsPage from './AllCountriesLocationsPage';
import HomeCityPickerPage from './HomeCityPickerPage';
import SettingsPage from './SettingsPage';
import SettingsStepsPage from './SettingsStepsPage';
import SettingsArchivePage from './SettingsArchivePage';
import {
  SettingsLanguagePage,
  SettingsGeoPage,
  SettingsNotificationsPage,
  SettingsPrivacyPage,
  SettingsLegalDocPage,
  SettingsHelpPage,
  SettingsAboutPage,
} from './SettingsSubScreens';
import ChatsPage from './ChatsPage';
import ChatThreadPage from './ChatThreadPage';
import FeedCameraPage from './FeedCameraPage';
import FeedStoryViewerPage from './FeedStoryViewerPage';
import FeedPostComposerPage from './app/FeedPostComposerPage';
import FeedPostMediaPickerPage from './app/FeedPostMediaPickerPage';
import FeedStorySharePage from './app/FeedStorySharePage';
import PostMapPickerPage from './PostMapPickerPage';
import ExploreMapPage from './ExploreMapPage';
import RouteResultsPage from './RouteResultsPage';
import RouteNavigationPage from './RouteNavigationPage';
import LandmarkResultPage from './LandmarkResultPage';
import LandmarkQuizPage from './LandmarkQuizPage';
import LandmarkNotFoundPage from './LandmarkNotFoundPage';
import ProfileEditPage from './ProfileEditPage';
import ProfileFriendsPage from './ProfileFriendsPage';
import StartChatPage from './StartChatPage';
import ProfileInvitesPage from './ProfileInvitesPage';
import ProfilePostDetailPage from './ProfilePostDetailPage';
import ProfileCommentsPage from './ProfileCommentsPage';
import ProfileLikesPage from './ProfileLikesPage';
import ProfileEditPublicationPage from './ProfileEditPublicationPage';
import DiscoverPeoplePage from './DiscoverPeoplePage';
import SocialUserProfilePage from './SocialUserProfilePage';
import SocialConnectionsPage from './SocialConnectionsPage';
import ProfilePage from './ProfilePage';
import ProfileGamificationHubPage from './ProfileGamificationHubPage';
import DevDB from './DevDB';
import AdminPanelPage from './AdminPanelPage';
import AdminSecurityPage from './AdminSecurityPage';
import OfflineOutboxPage from './OfflineOutboxPage';
import AuthStack from './auth/AuthStack';
import { getAppTheme, THEME_CHANGED_EVENT } from './themeStorage';
import { fetchAppVersionGate } from './fetchAppVersionGate';
import { runAppBootstrap } from './appBootstrap';
import ForceUpdateScreen from './ForceUpdateScreen';
import { KRAINA_FONT_MAP } from './krainaFonts';
import ChatToast, { showChatToast } from './app/inAppChatAlerts';
import {
  WS_EVENT_NEW_MESSAGE,
  connectChatWebSocket,
  disconnectChatWebSocket,
} from './app/chatRealtime';
import { useAuthStore } from './app/auth/authStore';
import { isBackendJwt } from './app/backendAuthApi';

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
  const [fontsLoaded, fontError] = useFonts(KRAINA_FONT_MAP);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [mainPageInitialParams, setMainPageInitialParams] = useState(null);
  const [savedLanguage, setSavedLanguage] = useState(null);
  /** До завершення bootstrap — null, щоб FirstPage ніколи не робив replace на дефолтний SecondPage «з кешу». */
  const [firstPageNextRoute, setFirstPageNextRoute] = useState(null);
  /** Параметри для `navigation.replace` після FirstPage (напр. SelectCountry з user + language). */
  const [firstPageNextParams, setFirstPageNextParams] = useState(null);
  const [appTheme, setAppTheme] = useState('dark');
  const [navEpoch, setNavEpoch] = useState(0);
  /** Після нативного splash + кадру затемнення. */
  const [splashUiReady, setSplashUiReady] = useState(false);
  /** Навігація лише коли splash прибрано і шрифти завантажені (або помилка шрифтів). */
  const contentReady = splashUiReady && (fontsLoaded || fontError);
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

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setAppTheme(v === 'light' ? 'light' : 'dark');
    });
    return () => sub.remove();
  }, []);

  // ─── In-app chat notification toast ─────────────────────────────────────────────
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(WS_EVENT_NEW_MESSAGE, (data) => {
      if (!data?.threadId || !data?.message) return;
      const route = navigationRef.isReady() ? navigationRef.getCurrentRoute() : null;
      if (route?.name === 'ChatThread' && String(route?.params?.threadId) === String(data.threadId)) {
        return;
      }
      const meId = useAuthStore.getState().user?.id;
      if (meId && String(data.message.sender_id) === String(meId)) return;
      const rawContent = String(data.message.content || '');
      const preview = rawContent.length > 120 ? rawContent.slice(0, 120) + '…' : rawContent;
      const senderName = String(data.message.sender_name || '');
      showChatToast({
        threadId: data.threadId,
        senderName,
        preview,
        theme: appTheme,
      });
    });
    return () => sub.remove();
  }, [appTheme]);

  // ─── Global WebSocket lifecycle (persistent across all screens) ──────────────────
  useEffect(() => {
    if (!bootstrapReady) return;
    const state = useAuthStore.getState();
    if (isBackendJwt(state.accessToken) && state.user?.id) {
      connectChatWebSocket(String(state.user.id));
    }
    const unsub = useAuthStore.subscribe((nextState) => {
      if (isBackendJwt(nextState.accessToken) && nextState.user?.id) {
        connectChatWebSocket(String(nextState.user.id));
      } else {
        disconnectChatWebSocket();
      }
    });
    return () => {
      unsub();
      disconnectChatWebSocket();
    };
  }, [bootstrapReady]);


  useEffect(() => {
    void import('./walkReminderSync').then((m) => {
      m.installWalkReminderNotificationHandler();
      void m.resyncWalkReminderOnAppColdStart();
    });
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
      const gate = await fetchAppVersionGate();
      if (cancelled) return;
      if (gate.requireUpdate) {
        setForceUpdateGate(gate);
        setBootstrapReady(true);
        return;
      }
      try {
        await runAppBootstrap({ getCancelled }, bootstrapApi);
      } finally {
        if (!cancelled) setBootstrapReady(true);
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
            onReady={() => setNavEpoch((n) => n + 1)}
            onStateChange={() => setNavEpoch((n) => n + 1)}
          >
            <View style={{ flex: 1 }}>
              <ChatToast />
              <Stack.Navigator
                initialRouteName="FirstPage"
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: '#000000' },
                  ...(Platform.OS === 'ios'
                    ? {
                        /** Свайп зліва (iOS) назад, зокрема з підекранів Налаштувань і профілю з налаштувань. */
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
                  /** Лише кнопка «Пропустити» / «Продовжити» — без iOS swipe-back з онбордингу. */
                  gestureEnabled: false,
                  fullScreenGestureEnabled: false,
                  contentStyle: { flex: 1, overflow: 'hidden' },
                  ...(Platform.OS === 'ios'
                    ? {
                        /** Без системних «scroll edge» / смуги прокрутки біля копії (iOS 26+). */
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
                component={ProfilePage}
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
                component={ProfileGamificationHubPage}
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
              <Stack.Screen
                name="FeedStoryViewer"
                component={FeedStoryViewerPage}
                options={{
                  headerShown: false,
                  ...(Platform.OS === 'ios' ? { presentation: 'fullScreenModal' } : {}),
                }}
              />
              <Stack.Screen name="FeedPostComposer" component={FeedPostComposerPage} options={{ headerShown: false }} />
              <Stack.Screen name="FeedPostMediaPicker" component={FeedPostMediaPickerPage} options={{ headerShown: false }} />
              <Stack.Screen name="FeedStoryShare" component={FeedStorySharePage} options={{ headerShown: false }} />
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
              <Stack.Screen name="DevDB" component={DevDB} />
              <Stack.Screen
                name="BackendAuth"
                component={AuthStack}
                options={{ headerShown: false }}
              />
              </Stack.Navigator>
              <LightBottomTabBar navEpoch={navEpoch} />
            </View>
          </NavigationContainer>
          )}
        </SafeAreaProvider>
      ) : null}
      <StatusBar style={appTheme === 'light' ? 'dark' : 'light'} />
    </View>
  );
}
