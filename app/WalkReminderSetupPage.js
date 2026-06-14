import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { useSyncedAppLanguage } from './useAppLanguage';
import { st } from './settingsI18n';
import { getAppTheme, THEME_CHANGED_EVENT } from './themeStorage';
import { getSubscriptionState } from './subscriptionStorage';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { brandFontHeadMedium, brandFontSans, brandFontSansSemibold } from './brandFont';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { getWalkReminderPrefs, setWalkReminderPrefs, WALK_REMINDER_CHANGED } from './walkReminderStorage';
import {
  cancelScheduledWalkReminderOnly,
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
  const language = useSyncedAppLanguage(route, 'uk');
  const user = route?.params?.user || {};
  const countryId = route?.params?.countryId;
  const fromOnboarding = route?.params?.fromOnboarding === true;

  const [appTheme, setAppTheme] = useState(() =>
    route?.params?.appTheme === 'light' ? 'light' : 'dark',
  );
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(18);
  const [minute, setMinute] = useState(30);
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const [androidPick, setAndroidPick] = useState({ hour: 18, minute: 30 });

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#6B6B6B' : 'rgba(255,255,255,0.68)';
  const cardBg = isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)';
  const cardBorder = isLight ? 'rgba(2, 18, 235, 0.12)' : 'rgba(255,255,255,0.1)';
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;

  const shell = useMemo(
    () => ({
      user,
      language,
      ...(countryId != null ? { countryId } : {}),
      appTheme,
    }),
    [user, language, countryId, appTheme],
  );

  const loadPrefs = useCallback(async () => {
    const p = await getWalkReminderPrefs();
    setEnabled(!!p.enabled);
    setHour(p.hour);
    setMinute(p.minute);
    const t = await getAppTheme();
    setAppTheme(t === 'light' ? 'light' : 'dark');
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadPrefs();
    }, [loadPrefs]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setAppTheme(v === 'light' ? 'light' : 'dark');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(WALK_REMINDER_CHANGED, () => {
      void loadPrefs();
    });
    return () => sub.remove();
  }, [loadPrefs]);

  const timeValue = useMemo(() => new Date(2000, 0, 1, hour, minute, 0, 0), [hour, minute]);

  const notifCopy = useMemo(
    () => ({
      title: st(language, 'walkReminderNotifTitle'),
      body: st(language, 'walkReminderNotifBody'),
    }),
    [language],
  );

  const finishToApp = useCallback(async () => {
    const sub = await getSubscriptionState(user);
    const t = await getAppTheme();
    const payload = { user, language, countryId, appTheme: t };
    if (sub.needsPlanChoice) {
      navigation.replace('ChoosePlan', payload);
    } else {
      navigation.replace('HomeTabPager', { ...payload, tabIndex: 0, routeFinderExtras: {} });
    }
  }, [navigation, user, language, countryId]);

  const permissionDeniedAlert = useCallback(() => {
    Alert.alert('', st(language, 'walkReminderPermissionDenied'), [
      {
        text: st(language, 'notifSystemButton'),
        onPress: () => {
          Linking.openSettings().catch(() => {});
        },
      },
      { text: 'OK', style: 'cancel' },
    ]);
  }, [language]);

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
    [language, notifCopy, permissionDeniedAlert],
  );

  const onContinue = useCallback(async () => {
    await applyAndSync(enabled, hour, minute);
    if (fromOnboarding) {
      await finishToApp();
    } else {
      navigation.goBack();
    }
  }, [applyAndSync, enabled, hour, minute, fromOnboarding, finishToApp, navigation]);

  /** Увімкнення / вимкнення одразу зберігає prefs і оновлює системний розклад (не лише після «Зберегти»). */
  const onEnabledChange = useCallback(
    async (next) => {
      if (!next) {
        setEnabled(false);
        await applyAndSync(false, hour, minute);
        return;
      }
      const r = await applyAndSync(true, hour, minute);
      setEnabled(r === 'ok');
    },
    [applyAndSync, hour, minute],
  );

  const closeIosPickerAndSync = useCallback(async () => {
    setShowIosPicker(false);
    await applyAndSync(enabled, hour, minute);
  }, [applyAndSync, enabled, hour, minute]);

  const onSkip = useCallback(async () => {
    await setWalkReminderPrefs({ enabled: false });
    await cancelScheduledWalkReminderOnly();
    setEnabled(false);
    if (fromOnboarding) await finishToApp();
    else navigation.goBack();
  }, [fromOnboarding, finishToApp, navigation]);

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

  const applyAndroidTimeModal = useCallback(() => {
    setHour(androidPick.hour);
    setMinute(androidPick.minute);
    setShowAndroidPicker(false);
  }, [androidPick.hour, androidPick.minute]);

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
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
          paddingBottom: insets.bottom + 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={
            isLight
              ? ['rgba(2,18,235,0.12)', 'rgba(2,18,235,0.02)']
              : ['rgba(225,255,0,0.18)', 'rgba(225,255,0,0.04)']
          }
          style={[styles.hero, { borderColor: cardBorder }]}>
          <View style={[styles.heroIcon, { borderColor: accent }]}>
            <Ionicons name="footsteps" size={32} color={accent} />
          </View>
          <Text style={[styles.heroTitle, brandFontHeadMedium, { color: textMain }]}>
            {st(language, 'walkReminderHeroTitle')}
          </Text>
          <Text style={[styles.heroBody, brandFontSans, { color: textMuted }]}>{st(language, 'walkReminderHeroBody')}</Text>
        </LinearGradient>

        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.rowLabel, brandFontSansSemibold, { color: textMain }]}>
              {st(language, 'walkReminderToggle')}
            </Text>
            <Switch
              value={enabled}
              onValueChange={(v) => {
                void onEnabledChange(v);
              }}
              trackColor={{ false: isLight ? '#D4D4D4' : '#3A3A3E', true: isLight ? 'rgba(2,18,235,0.45)' : 'rgba(225,255,0,0.45)' }}
              thumbColor={enabled ? accent : isLight ? '#F0F0F0' : '#888'}
            />
          </View>
          {enabled ? (
            <>
              <View style={[styles.divider, { backgroundColor: cardBorder }]} />
              <Text style={[styles.timeLabel, brandFontSansSemibold, { color: textMuted }]}>
                {st(language, 'walkReminderTimeLabel')}
              </Text>
              <Pressable
                onPress={() => (Platform.OS === 'ios' ? setShowIosPicker(true) : openAndroidTimeModal())}
                android_ripple={ripple}
                style={({ pressed }) => [
                  styles.timeBtn,
                  { borderColor: accent, backgroundColor: isLight ? 'rgba(2,18,235,0.06)' : 'rgba(225,255,0,0.08)' },
                  pressed && { opacity: 0.9 },
                ]}>
                <Ionicons name="time-outline" size={22} color={accent} style={{ marginRight: 10 }} />
                <Text style={[styles.timeTxt, brandFontHeadMedium, { color: textMain }]}>
                  {pad2(hour)}:{pad2(minute)}
                </Text>
                <Ionicons name="chevron-down" size={20} color={accent} style={{ marginLeft: 8 }} />
              </Pressable>
              <Text style={[styles.timeHint, brandFontSans, { color: textMuted }]}>{st(language, 'walkReminderTimeHint')}</Text>
            </>
          ) : null}
        </View>

        <Pressable
          onPress={onContinue}
          android_ripple={ripple}
          style={({ pressed }) => [
            styles.primaryCta,
            { backgroundColor: accent, opacity: pressed ? 0.9 : 1 },
          ]}>
          <Text style={[styles.primaryCtaTxt, brandFontSansSemibold, { color: onAccentButtonText(isLight) }]}>
            {fromOnboarding ? st(language, 'walkReminderContinue') : st(language, 'walkReminderSave')}
          </Text>
          <Ionicons name="arrow-forward" size={20} color={onAccentButtonText(isLight)} style={{ marginLeft: 8 }} />
        </Pressable>

        {fromOnboarding ? (
          <Pressable
            onPress={onSkip}
            hitSlop={14}
            style={({ pressed }) => [styles.textSkip, pressed && { opacity: 0.75 }]}
          >
            <Text style={[styles.textSkipTxt, brandFontSans, { color: textMuted }]}>{st(language, 'walkReminderSkip')}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {Platform.OS === 'ios' && DateTimePickerIos ? (
        <Modal transparent animationType="fade" visible={showIosPicker} onRequestClose={() => setShowIosPicker(false)}>
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={() => void closeIosPickerAndSync()} />
            <View style={[styles.modalSheet, { backgroundColor: cardBg, borderColor: cardBorder }]}>
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
            <View style={[styles.modalSheet, { backgroundColor: cardBg, borderColor: cardBorder }]}>
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
  hero: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 22,
    marginBottom: 20,
    alignItems: 'center',
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
    marginBottom: 10,
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 340,
  },
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    marginBottom: 22,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowLabel: { fontSize: 16, flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 16 },
  timeLabel: { fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 10 },
  timeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  timeTxt: { fontSize: 28, letterSpacing: 1 },
  timeHint: { fontSize: 13, lineHeight: 18, marginTop: 10 },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 18,
    marginBottom: 12,
  },
  primaryCtaTxt: { fontSize: 17 },
  textSkip: { alignSelf: 'center', paddingVertical: 10 },
  textSkipTxt: { fontSize: 15, textDecorationLine: 'underline' },
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
