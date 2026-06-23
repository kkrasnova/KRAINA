import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  Switch,
  Modal,
  DeviceEventEmitter,
  AppState,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { useSyncedAppLanguage } from './useAppLanguage';
import { brandFontHeadBold, brandFontHeadMedium, brandFontSans, brandFontSansSemibold } from './brandFont';
import { useResponsive } from './useResponsive';
import { st } from './settingsI18n';
import { useAppTheme } from './useAppTheme';
import { getSubscriptionState } from './subscriptionStorage';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import Lemon3DButton from './Lemon3DButton';
import * as WebBrowser from 'expo-web-browser';
import { getPrivacyPolicyUrl, getTermsOfServiceUrl } from './privacyLinks';
import {
  settingsCleanPalette,
  SettingsCleanHero,
  SettingsCleanSwitchRow,
  SettingsCleanPressRow,
  SettingsCleanFootnote,
  SettingsCleanLegalNote,
} from './settingsCleanUi';
import { getWalkReminderPrefs, setWalkReminderPrefs, WALK_REMINDER_CHANGED } from './walkReminderStorage';
import { getStepSyncEnabled, setStepSyncEnabled, KRAINA_STEP_SYNC_CHANGED } from './stepSyncStorage';
import {
  requestStepsAccessOutcome,
  isStepsPlatformSupported,
  resetIosHealthSession,
} from './healthSteps';
import {
  cancelScheduledWalkReminderOnly,
  getWalkReminderNotificationPermissionStatus,
  isWalkReminderNotificationsAvailable,
  openWalkReminderNotificationSettings,
  requestWalkReminderNotificationPermission,
  syncWalkReminderScheduleFromStorage,
} from './walkReminderSync';

/** Лише iOS: на Android імпорт пакета одразу викликає TurboModule RNCDatePicker і падає, якщо натив не злінкований. */
const DateTimePickerIos =
  Platform.OS === 'ios' ? require('@react-native-community/datetimepicker').default : null;

const HOURS_LIST = Array.from({ length: 24 }, (_, i) => i);
const MINUTES_LIST = Array.from({ length: 60 }, (_, i) => i);

function pad2(n) {
  return String(n).padStart(2, '0');
}

export default function WalkReminderSetupPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const language = useSyncedAppLanguage(route, 'uk');
  const user = route?.params?.user || {};
  const countryId = route?.params?.countryId;
  const fromOnboarding = route?.params?.fromOnboarding === true;

  const { savedAppTheme, isLight, screenBg } = useAppTheme(route?.params?.appTheme, route);
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(18);
  const [minute, setMinute] = useState(30);
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const [androidPick, setAndroidPick] = useState({ hour: 18, minute: 30 });
  const [finishing, setFinishing] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [stepsEnabled, setStepsEnabled] = useState(false);
  const [stepsToggleBusy, setStepsToggleBusy] = useState(false);
  const pendingEnableRef = useRef(false);
  const pendingStepsEnableRef = useRef(false);
  const enabledRef = useRef(enabled);
  const stepsEnabledRef = useRef(stepsEnabled);
  const hourRef = useRef(hour);
  const minuteRef = useRef(minute);
  enabledRef.current = enabled;
  stepsEnabledRef.current = stepsEnabled;
  hourRef.current = hour;
  minuteRef.current = minute;

  const palette = settingsCleanPalette(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const accent = palette.accent;
  const textMain = palette.textMain;
  const textMuted = palette.textMuted;
  const modalBg = isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)';
  const modalBorder = isLight ? 'rgba(2, 18, 235, 0.12)' : 'rgba(255,255,255,0.1)';
  const shell = useMemo(
    () => ({
      user,
      language,
      ...(countryId != null ? { countryId } : {}),
      appTheme: savedAppTheme,
    }),
    [user, language, countryId, savedAppTheme],
  );

  const loadPrefs = useCallback(async () => {
    const p = await getWalkReminderPrefs();
    setEnabled(!!p.enabled);
    setHour(p.hour);
    setMinute(p.minute);
    setStepsEnabled(await getStepSyncEnabled());
  }, []);

  const openIosHealth = useCallback(async () => {
    const healthUrl = 'x-apple-health://';
    try {
      if (await Linking.canOpenURL(healthUrl)) {
        await Linking.openURL(healthUrl);
        return;
      }
    } catch {
      /* */
    }
    Linking.openSettings();
  }, []);

  const showStepsDeniedAlert = useCallback(() => {
    pendingStepsEnableRef.current = true;
    const sys = st(language, 'notifSystemButton');
    if (Platform.OS === 'android') {
      void (async () => {
        try {
          const hc = require('react-native-health-connect');
          hc.openHealthConnectSettings();
        } catch {
          Linking.openSettings().catch(() => {});
        }
      })();
      Alert.alert('', st(language, 'stepsSyncDenied'), [
        {
          text: st(language, 'stepsSyncOpenHc'),
          onPress: () => {
            try {
              const hc = require('react-native-health-connect');
              hc.openHealthConnectSettings();
            } catch {
              /* */
            }
          },
        },
        { text: sys, onPress: () => void Linking.openSettings().catch(() => {}) },
        { text: 'OK', style: 'cancel' },
      ]);
      return;
    }
    void openIosHealth();
    Alert.alert('', st(language, 'stepsSyncDenied'), [
      { text: st(language, 'stepsSyncOpenHealth'), onPress: () => void openIosHealth() },
      { text: sys, onPress: () => void Linking.openSettings().catch(() => {}) },
      { text: 'OK', style: 'cancel' },
    ]);
  }, [language, openIosHealth]);

  const permissionDeniedAlert = useCallback(() => {
    pendingEnableRef.current = true;
    void openWalkReminderNotificationSettings();
    Alert.alert('', st(language, 'walkReminderPermissionDenied'), [
      {
        text: st(language, 'notifSystemButton'),
        onPress: () => {
          void openWalkReminderNotificationSettings();
        },
      },
      { text: 'OK', style: 'cancel' },
    ]);
  }, [language]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(WALK_REMINDER_CHANGED, () => {
      void loadPrefs();
    });
    return () => sub.remove();
  }, [loadPrefs]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_STEP_SYNC_CHANGED, () => {
      void getStepSyncEnabled().then(setStepsEnabled);
    });
    return () => sub.remove();
  }, []);

  const timeValue = useMemo(() => new Date(2000, 0, 1, hour, minute, 0, 0), [hour, minute]);

  const notifCopy = useMemo(
    () => ({
      title: st(language, 'walkReminderNotifTitle'),
      body: st(language, 'walkReminderNotifBody'),
    }),
    [language],
  );

  const buttonMinHeight = Math.max(48, Math.round(48 * r.scale));
  const footerBottomPad = Math.max(insets.bottom, 12) + 10;
  const scrollBottomPad = fromOnboarding
    ? buttonMinHeight + footerBottomPad + 24 + 88
    : footerBottomPad + 28;

  const openHttp = useCallback(async (url) => {
    if (!url) {
      Alert.alert(st(language, 'privacyUrlMissingTitle'), st(language, 'privacyUrlMissingBody'));
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      try {
        await Linking.openURL(url);
      } catch {
        Alert.alert(st(language, 'privacyUrlMissingTitle'), st(language, 'privacyUrlMissingBody'));
      }
    }
  }, [language]);

  const openPrivacyPolicy = useCallback(() => {
    const url = getPrivacyPolicyUrl();
    if (url) void openHttp(url);
    else navigation.navigate('SettingsLegalDoc', { ...shell, legalDoc: 'privacy' });
  }, [navigation, openHttp, shell]);

  const openTermsOfUse = useCallback(() => {
    const url = getTermsOfServiceUrl();
    if (url) void openHttp(url);
    else navigation.navigate('SettingsLegalDoc', { ...shell, legalDoc: 'terms' });
  }, [navigation, openHttp, shell]);

  const openHc = useCallback(() => {
    if (Platform.OS !== 'android') return;
    try {
      const hc = require('react-native-health-connect');
      hc.openHealthConnectSettings();
    } catch {
      Linking.openSettings().catch(() => {});
    }
  }, []);

  const finishToApp = useCallback(async () => {
    const sub = await getSubscriptionState(user);
    const payload = { user, language, countryId, appTheme: savedAppTheme };
    if (sub.needsPlanChoice) {
      navigation.replace('ChoosePlan', {
        ...payload,
        ...(fromOnboarding ? { fromOnboarding: true } : {}),
      });
    } else {
      navigation.replace('HomeTabPager', { ...payload, tabIndex: 0, routeFinderExtras: {} });
    }
  }, [navigation, user, language, countryId, savedAppTheme, fromOnboarding]);

  const applyAndSync = useCallback(
    async (nextEnabled, nextHour, nextMinute) => {
      if (nextEnabled) {
        const permitted = await requestWalkReminderNotificationPermission();
        if (!permitted) {
          permissionDeniedAlert();
          await setWalkReminderPrefs({ enabled: false, hour: nextHour, minute: nextMinute });
          await cancelScheduledWalkReminderOnly();
          return 'permission_denied';
        }
      }
      await setWalkReminderPrefs({ enabled: nextEnabled, hour: nextHour, minute: nextMinute });
      if (!nextEnabled) {
        await cancelScheduledWalkReminderOnly();
        return 'ok';
      }
      const r = await syncWalkReminderScheduleFromStorage(notifCopy);
      if (r === 'permission_denied') {
        permissionDeniedAlert();
        await setWalkReminderPrefs({ enabled: false, hour: nextHour, minute: nextMinute });
        await cancelScheduledWalkReminderOnly();
        return 'permission_denied';
      }
      if (r === 'schedule_failed') {
        permissionDeniedAlert();
        return 'failed';
      }
      return 'ok';
    },
    [notifCopy, permissionDeniedAlert],
  );

  const tryCompletePendingEnable = useCallback(async () => {
    if (!pendingEnableRef.current) return false;
    const status = await getWalkReminderNotificationPermissionStatus();
    if (!status.granted) return false;
    pendingEnableRef.current = false;
    const h = hourRef.current;
    const m = minuteRef.current;
    await setWalkReminderPrefs({ enabled: true, hour: h, minute: m });
    const r = await syncWalkReminderScheduleFromStorage(notifCopy);
    if (r === 'ok') {
      setEnabled(true);
      return true;
    }
    await setWalkReminderPrefs({ enabled: false, hour: h, minute: m });
    await cancelScheduledWalkReminderOnly();
    setEnabled(false);
    return false;
  }, [notifCopy]);

  const tryCompletePendingStepsEnable = useCallback(async () => {
    if (!pendingStepsEnableRef.current || stepsToggleBusy) return false;
    setStepsToggleBusy(true);
    try {
      const outcome = await requestStepsAccessOutcome();
      if (outcome !== 'ok') return false;
      pendingStepsEnableRef.current = false;
      await setStepSyncEnabled(true);
      setStepsEnabled(true);
      return true;
    } finally {
      setStepsToggleBusy(false);
    }
  }, [stepsToggleBusy]);

  useFocusEffect(
    useCallback(() => {
      void loadPrefs();
      void tryCompletePendingEnable();
      void tryCompletePendingStepsEnable();
    }, [loadPrefs, tryCompletePendingEnable, tryCompletePendingStepsEnable]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void tryCompletePendingEnable();
        void tryCompletePendingStepsEnable();
      }
    });
    return () => sub.remove();
  }, [tryCompletePendingEnable, tryCompletePendingStepsEnable]);

  const onContinue = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await applyAndSync(enabledRef.current, hourRef.current, minuteRef.current);
    } catch (e) {
      if (__DEV__) console.warn('[WalkReminder] continue sync', e?.message);
    } finally {
      try {
        if (fromOnboarding) {
          await finishToApp();
        } else {
          navigation.goBack();
        }
      } catch (e) {
        if (__DEV__) console.warn('[WalkReminder] continue navigate', e?.message);
      } finally {
        setFinishing(false);
      }
    }
  }, [applyAndSync, fromOnboarding, finishToApp, navigation, finishing]);

  const onSkip = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await finishToApp();
    } finally {
      setFinishing(false);
    }
  }, [finishToApp, finishing]);

  /** Увімкнення / вимкнення одразу зберігає prefs і оновлює системний розклад (не лише після «Далі»). */
  const onEnabledChange = useCallback(
    async (next) => {
      if (toggleBusy) return;
      if (!next) {
        pendingEnableRef.current = false;
        setEnabled(false);
        setToggleBusy(true);
        try {
          await applyAndSync(false, hourRef.current, minuteRef.current);
        } finally {
          setToggleBusy(false);
        }
        return;
      }
      if (!isWalkReminderNotificationsAvailable()) {
        Alert.alert('', st(language, 'walkReminderUnavailable'));
        setEnabled(false);
        return;
      }
      setEnabled(true);
      setToggleBusy(true);
      try {
        const r = await applyAndSync(true, hourRef.current, minuteRef.current);
        setEnabled(r === 'ok');
      } finally {
        setToggleBusy(false);
      }
    },
    [applyAndSync, language, toggleBusy],
  );

  const onStepsEnabledChange = useCallback(
    async (next) => {
      if (stepsToggleBusy) return;
      if (!isStepsPlatformSupported()) return;
      if (!next) {
        pendingStepsEnableRef.current = false;
        setStepsEnabled(false);
        await setStepSyncEnabled(false);
        resetIosHealthSession();
        return;
      }
      setStepsEnabled(true);
      setStepsToggleBusy(true);
      try {
        const outcome = await requestStepsAccessOutcome();
        if (outcome === 'ok') {
          await setStepSyncEnabled(true);
          setStepsEnabled(true);
          return;
        }
        await setStepSyncEnabled(false);
        setStepsEnabled(false);
        if (outcome === 'hc_unavailable') {
          Alert.alert('', st(language, 'stepsSyncHcUnavailable'));
        } else {
          showStepsDeniedAlert();
        }
      } catch (e) {
        const msg = String(e?.message || '');
        if (msg.includes('health_connect') || msg.includes('SDK')) {
          Alert.alert('', st(language, 'stepsSyncHcUnavailable'));
        } else {
          showStepsDeniedAlert();
        }
        await setStepSyncEnabled(false);
        setStepsEnabled(false);
      } finally {
        setStepsToggleBusy(false);
      }
    },
    [language, showStepsDeniedAlert, stepsToggleBusy],
  );

  const closeIosPickerAndSync = useCallback(async () => {
    setShowIosPicker(false);
    if (enabledRef.current) {
      await applyAndSync(true, hourRef.current, minuteRef.current);
    } else {
      await setWalkReminderPrefs({ hour: hourRef.current, minute: minuteRef.current });
    }
  }, [applyAndSync]);

  const onTimeChange = (event, date) => {
    if (event?.type === 'dismissed') return;
    if (date) {
      setHour(date.getHours());
      setMinute(date.getMinutes());
    }
  };

  const openAndroidTimeModal = useCallback(() => {
    setAndroidPick({ hour, minute });
    setShowAndroidPicker(true);
  }, [hour, minute]);

  const closeAndroidTimeModal = useCallback(() => {
    setShowAndroidPicker(false);
  }, []);

  const applyAndroidTimeModal = useCallback(async () => {
    const nextHour = androidPick.hour;
    const nextMinute = androidPick.minute;
    setHour(nextHour);
    setMinute(nextMinute);
    setShowAndroidPicker(false);
    if (enabledRef.current) {
      await applyAndSync(true, nextHour, nextMinute);
    } else {
      await setWalkReminderPrefs({ hour: nextHour, minute: nextMinute });
    }
  }, [androidPick.hour, androidPick.minute, applyAndSync]);

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={savedAppTheme}
        leftMode={fromOnboarding ? 'menu' : 'back'}
        leftSlot={
          fromOnboarding ? (
            <View style={{ width: 44 }} />
          ) : undefined
        }
        onBackPress={fromOnboarding ? undefined : () => navigation.goBack()}
        replaceCenterTitle={st(language, 'walkReminderScreenTitle')}
        hideSendButton
        lightBarBackgroundColor={isLight ? LIGHT_BAR_BG : undefined}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: scrollBottomPad,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
      >
        <SettingsCleanHero
          palette={palette}
          icon={null}
          title={st(language, 'walkReminderHeroTitle')}
          titleStyle={brandFontHeadBold}
          subtitle={st(language, 'walkReminderHeroBody')}
          subtitleStyle={brandFontSans}
        />

        <SettingsCleanSwitchRow
          palette={palette}
          icon="alarm-outline"
          title={st(language, 'walkReminderToggle')}
          titleStyle={brandFontSansSemibold}
          value={enabled}
          disabled={toggleBusy || finishing}
          onValueChange={(v) => {
            void onEnabledChange(v);
          }}
          isLast={!enabled}
        />

        {enabled ? (
          <>
            <SettingsCleanPressRow
              palette={palette}
              icon="time-outline"
              title={`${pad2(hour)}:${pad2(minute)}`}
              titleStyle={[styles.timeRowTitle, brandFontHeadMedium]}
              subtitle={st(language, 'walkReminderTimeLabel')}
              subtitleStyle={brandFontSans}
              onPress={() => (Platform.OS === 'ios' ? setShowIosPicker(true) : openAndroidTimeModal())}
              ripple={ripple}
              isLast
            />
            <SettingsCleanFootnote palette={palette} style={brandFontSans}>
              {st(language, 'walkReminderTimeHint')}
            </SettingsCleanFootnote>
          </>
        ) : null}

        {isStepsPlatformSupported() ? (
          <>
            <SettingsCleanSwitchRow
              palette={palette}
              icon="pulse-outline"
              title={st(language, 'stepsSyncToggle')}
              titleStyle={brandFontSansSemibold}
              value={stepsEnabled}
              disabled={stepsToggleBusy || finishing}
              onValueChange={(v) => {
                void onStepsEnabledChange(v);
              }}
              isLast={Platform.OS !== 'android' && Platform.OS !== 'ios'}
              spaced
            />
            {Platform.OS === 'android' ? (
              <SettingsCleanPressRow
                palette={palette}
                icon="open-outline"
                title={st(language, 'stepsSyncOpenHc')}
                titleStyle={brandFontSansSemibold}
                onPress={openHc}
                disabled={stepsToggleBusy || finishing}
                ripple={ripple}
                isLast={Platform.OS !== 'ios'}
                spaced
              />
            ) : Platform.OS === 'ios' ? (
              <SettingsCleanPressRow
                palette={palette}
                icon="heart-outline"
                title={st(language, 'stepsSyncOpenHealth')}
                titleStyle={brandFontSansSemibold}
                onPress={() => void openIosHealth()}
                disabled={stepsToggleBusy || finishing}
                ripple={ripple}
                isLast
                spaced
              />
            ) : null}
            <SettingsCleanFootnote palette={palette} style={brandFontSans}>
              {st(language, 'walkReminderStepsHint')}
            </SettingsCleanFootnote>
          </>
        ) : null}

        <SettingsCleanLegalNote
          palette={palette}
          style={brandFontSans}
          prefix={st(language, 'walkReminderLegalPrefix')}
          privacyLabel={st(language, 'walkReminderLegalPrivacyLink')}
          join={st(language, 'walkReminderLegalJoin')}
          termsLabel={st(language, 'walkReminderLegalTermsLink')}
          onPrivacyPress={openPrivacyPolicy}
          onTermsPress={openTermsOfUse}
        />
      </ScrollView>
      {fromOnboarding ? (
        <View
          pointerEvents="box-none"
          style={[styles.footerOverlay, { paddingBottom: footerBottomPad, paddingHorizontal: 20 }]}
        >
          <View style={styles.footerInner}>
            <Lemon3DButton
              label={st(language, 'walkReminderContinue')}
              onPress={onContinue}
              disabled={finishing}
              loading={finishing}
              minHeight={buttonMinHeight}
              textStyle={{
                fontSize: Math.max(16, r.buttonFontSize),
                fontWeight: '600',
                letterSpacing: 0.3,
              }}
              accessibilityLabel={st(language, 'walkReminderContinue')}
            />
            <Pressable
              onPress={() => void onSkip()}
              hitSlop={14}
              disabled={finishing}
              style={({ pressed }) => [styles.textSkip, pressed && { opacity: 0.75 }]}
            >
              <Text style={[styles.textSkipTxt, brandFontSans, { color: textMuted }]}>
                {st(language, 'walkReminderSkip')}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {Platform.OS === 'ios' && DateTimePickerIos ? (
        <Modal transparent animationType="fade" visible={showIosPicker} onRequestClose={() => setShowIosPicker(false)}>
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={() => void closeIosPickerAndSync()} />
            <View style={[styles.modalSheet, { backgroundColor: modalBg, borderColor: modalBorder }]}>
              <View style={styles.modalBar}>
                <Pressable onPress={() => void closeIosPickerAndSync()} hitSlop={12}>
                  <Text style={[styles.modalDone, { color: accent }]}>{st(language, 'walkReminderPickerDone')}</Text>
                </Pressable>
              </View>
              <DateTimePickerIos
                value={timeValue}
                mode="time"
                is24Hour
                display="spinner"
                onChange={onTimeChange}
                themeVariant={isLight ? 'light' : 'dark'}
                style={{ alignSelf: 'center' }}
              />
            </View>
          </View>
        </Modal>
      ) : null}

      {Platform.OS === 'android' ? (
        <Modal transparent animationType="fade" visible={showAndroidPicker} onRequestClose={closeAndroidTimeModal}>
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={closeAndroidTimeModal} />
            <View style={[styles.modalSheet, { backgroundColor: modalBg, borderColor: modalBorder }]}>
              <View style={[styles.modalBar, styles.modalBarBetween]}>
                <Pressable onPress={closeAndroidTimeModal} hitSlop={12}>
                  <Text style={[styles.modalDone, { color: textMuted }]}>{st(language, 'walkReminderPickerCancel')}</Text>
                </Pressable>
                <Pressable onPress={applyAndroidTimeModal} hitSlop={12}>
                  <Text style={[styles.modalDone, { color: accent }]}>{st(language, 'walkReminderPickerDone')}</Text>
                </Pressable>
              </View>
              <View style={styles.androidTimeRow}>
                <ScrollView style={styles.androidTimeCol} showsVerticalScrollIndicator={false}>
                  {HOURS_LIST.map((h) => {
                    const sel = androidPick.hour === h;
                    return (
                      <Pressable
                        key={h}
                        onPress={() => setAndroidPick((p) => ({ ...p, hour: h }))}
                        android_ripple={ripple}
                        style={[
                          styles.androidTimeCell,
                          sel && {
                            backgroundColor: isLight ? 'rgba(2,18,235,0.12)' : 'rgba(225,255,0,0.14)',
                            borderColor: accent,
                          },
                        ]}>
                        <Text style={[styles.androidTimeCellTxt, brandFontHeadMedium, { color: textMain }]}>{pad2(h)}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Text style={[styles.androidTimeSep, brandFontHeadMedium, { color: textMain }]}>:</Text>
                <ScrollView style={styles.androidTimeCol} showsVerticalScrollIndicator={false}>
                  {MINUTES_LIST.map((m) => {
                    const sel = androidPick.minute === m;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => setAndroidPick((p) => ({ ...p, minute: m }))}
                        android_ripple={ripple}
                        style={[
                          styles.androidTimeCell,
                          sel && {
                            backgroundColor: isLight ? 'rgba(2,18,235,0.12)' : 'rgba(225,255,0,0.14)',
                            borderColor: accent,
                          },
                        ]}>
                        <Text style={[styles.androidTimeCellTxt, brandFontHeadMedium, { color: textMain }]}>{pad2(m)}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  timeRowTitle: {
    fontSize: 24,
    letterSpacing: 0.5,
  },
  footerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  footerInner: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: 22,
  },
  textSkip: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 8,
  },
  textSkipTxt: {
    fontSize: 15,
    textAlign: 'center',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalSheet: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingBottom: 12,
  },
  modalBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  modalBarBetween: {
    justifyContent: 'space-between',
  },
  modalDone: { fontSize: 16, fontWeight: '700' },
  androidTimeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
    maxHeight: 280,
  },
  androidTimeCol: {
    flex: 1,
    maxHeight: 260,
  },
  androidTimeSep: {
    alignSelf: 'center',
    fontSize: 28,
    paddingHorizontal: 6,
    marginTop: 8,
  },
  androidTimeCell: {
    marginVertical: 3,
    marginHorizontal: 4,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  androidTimeCellTxt: {
    fontSize: 22,
  },
});
