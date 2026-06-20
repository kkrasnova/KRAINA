import React, { useEffect, useCallback, memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { LIGHT_BAR_BG } from './AppTopBar';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { accentForTheme } from './themeAccent';
import { resetToLanguageSelect } from './authNavigation';
import { setAppTheme as persistAppTheme } from './themeStorage';
import { useAppTheme } from './useAppTheme';
import { useSyncedAppLanguage } from './useAppLanguage';
import { mt } from './mainPageI18n';
import { st } from './settingsI18n';
import { prefetchGeoStatus, prefetchNotificationPrefs } from './SettingsSubScreens';
import { prefetchArchiveBundle } from './screenLoaders';

const FAST_PRESS = { delayPressIn: 0, delayPressOut: 0 };

const ACCENT = '#E1FF00';
const ROW_ICON_DARK = '#F2F2EA';
const BORDER_DARK = 'rgba(255, 255, 255, 0.08)';
const BRAND_BLUE = '#6286E4';
/** Figma: list + icons */
const FIGMA_TEXT = '#1E1E1E';
const FIGMA_ICON_MUTED = '#727272';
const FIGMA_LOGOUT_RED = '#EB4335';
/** PP Pangram Sans у макеті ≈ −1% від 14px */
const FIGMA_LSP = -0.14;
const SettingsRow = memo(function SettingsRow({ icon, label, onPress, right, isLight }) {
  const accent = accentForTheme(isLight);
  const iconColor = isLight ? accent : ACCENT;
  const labelColor = isLight ? FIGMA_TEXT : '#FFFFFF';
  const chevronColor = isLight ? FIGMA_ICON_MUTED : 'rgba(255, 255, 255, 0.72)';
  const borderColor = isLight ? 'rgba(30, 30, 30, 0.1)' : BORDER_DARK;
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const pressedBg = isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)';
  return (
    <Pressable
      {...FAST_PRESS}
      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: borderColor },
        pressed && { backgroundColor: pressedBg },
      ]}
      onPress={onPress}
      android_ripple={ripple}
    >
      <Ionicons name={icon} size={22} color={iconColor} style={styles.rowIcon} />
      <Text
        style={[
          styles.rowLabel,
          { color: labelColor },
        ]}
      >
        {label}
      </Text>
      {right != null ? (
        <View style={styles.rowRight}>{right}</View>
      ) : (
        <Ionicons name="chevron-forward" size={20} color={chevronColor} />
      )}
    </Pressable>
  );
});

export default function SettingsPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const user = route?.params?.user || {};
  const countryId = route?.params?.countryId;
  const language = useSyncedAppLanguage(route, 'uk');
  const { appTheme, isLight: light, screenBg } = useAppTheme(route?.params?.appTheme);

  const shellParams = useMemo(
    () => ({
      user,
      language,
      appTheme,
      ...(countryId != null ? { countryId } : {}),
    }),
    [user, language, appTheme, countryId],
  );

  const pushScreen = useCallback(
    (name, extra = {}) => {
      navigation.push(name, { ...shellParams, ...extra });
    },
    [navigation, shellParams],
  );

  useEffect(() => {
    void prefetchGeoStatus();
    void prefetchNotificationPrefs();
    void prefetchArchiveBundle();
  }, []);

  const onThemeSwitch = async (nextLight) => {
    const next = nextLight ? 'light' : 'dark';
    await persistAppTheme(next);
  };

  const goLanguage = useCallback(() => {
    pushScreen('SettingsLanguage');
  }, [pushScreen]);

  const goGeo = useCallback(() => {
    void prefetchGeoStatus();
    pushScreen('SettingsGeo');
  }, [pushScreen]);

  const goNotifications = useCallback(() => {
    void prefetchNotificationPrefs();
    pushScreen('SettingsNotifications');
  }, [pushScreen]);

  const goWalkReminder = useCallback(() => {
    pushScreen('WalkReminderSetup', { fromOnboarding: false });
  }, [pushScreen]);

  const goPrivacy = useCallback(() => {
    pushScreen('SettingsPrivacy');
  }, [pushScreen]);

  const goHelp = useCallback(() => {
    pushScreen('SettingsHelp');
  }, [pushScreen]);

  const goAbout = useCallback(() => {
    pushScreen('SettingsAbout');
  }, [pushScreen]);

  const goAdminPanel = useCallback(() => {
    pushScreen('AdminPanel');
  }, [pushScreen]);

  const goSubscription = useCallback(() => {
    pushScreen('ChoosePlan', { fromSettings: true });
  }, [pushScreen]);

  const goCancelSubscription = useCallback(() => {
    pushScreen('CancelSubscription');
  }, [pushScreen]);

  const signOut = useCallback(() => {
    Alert.alert('', mt(language, 'signOutPrompt'), [
      { text: mt(language, 'no'), style: 'cancel' },
      {
        text: mt(language, 'yes'),
        style: 'destructive',
        onPress: () => resetToLanguageSelect(navigation),
      },
    ]);
  }, [navigation, language]);

  const goArchive = useCallback(() => {
    void prefetchArchiveBundle();
    pushScreen('SettingsArchive');
  }, [pushScreen]);

  const isAdminUser = user?.role === 'admin' || user?.isAdmin === true;

  const rows = (
    <>
      {isAdminUser ? (
        <SettingsRow
          icon="construct-outline"
          label={st(language, 'adminPanel')}
          onPress={goAdminPanel}
          isLight={light}
        />
      ) : null}
      <SettingsRow
        icon="globe-outline"
        label={st(language, 'language')}
        onPress={goLanguage}
        isLight={light}
      />
      <SettingsRow
        icon="location-outline"
        label={st(language, 'geoSettings')}
        onPress={goGeo}
        isLight={light}
      />
      <SettingsRow
        icon="archive-outline"
        label={st(language, 'archive')}
        onPress={goArchive}
        isLight={light}
      />
      <SettingsRow
        icon="notifications-outline"
        label={st(language, 'notifications')}
        onPress={goNotifications}
        isLight={light}
      />
      <SettingsRow
        icon="alarm-outline"
        label={st(language, 'walkReminderRow')}
        onPress={goWalkReminder}
        isLight={light}
      />
      <SettingsRow
        icon="flash-outline"
        label={st(language, 'subscription')}
        onPress={goSubscription}
        isLight={light}
      />
      <SettingsRow
        icon="close-circle-outline"
        label={st(language, 'cancelSubscriptionRow')}
        onPress={goCancelSubscription}
        isLight={light}
      />
      <SettingsRow
        icon="lock-closed-outline"
        label={st(language, 'privacy')}
        onPress={goPrivacy}
        isLight={light}
      />
      <SettingsRow
        icon="headset-outline"
        label={st(language, 'help')}
        onPress={goHelp}
        isLight={light}
      />
      <SettingsRow
        icon="information-circle-outline"
        label={st(language, 'info')}
        onPress={goAbout}
        isLight={light}
      />
      <View
        style={[
          styles.row,
          styles.themeRow,
          {
            borderBottomWidth: light ? 0 : StyleSheet.hairlineWidth,
            borderBottomColor: light ? 'transparent' : BORDER_DARK,
          },
        ]}
      >
        <Ionicons
          name="sunny-outline"
          size={22}
          color={light ? accentForTheme(true) : ACCENT}
          style={styles.rowIcon}
        />
        <Text
          style={[
            styles.rowLabel,
            { color: light ? FIGMA_TEXT : '#FFFFFF' },
          ]}
        >
          {mt(language, 'lightTheme')}
        </Text>
        <Switch
          value={appTheme === 'light'}
          onValueChange={onThemeSwitch}
          trackColor={
            light
              ? { false: '#D8D8D4', true: '#B4C4F0' }
              : { false: '#2A2A2A', true: '#5a6a00' }
          }
          thumbColor={
            light
              ? appTheme === 'light'
                ? BRAND_BLUE
                : '#AEAEAA'
              : appTheme === 'light'
                ? ACCENT
                : '#888888'
          }
          ios_backgroundColor={light ? '#D8D8D4' : '#2A2A2A'}
        />
      </View>
    </>
  );

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        centerSubtitle={st(language, 'title')}
        hideSendButton
        lightBarBackgroundColor={light ? LIGHT_BAR_BG : undefined}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: Math.max(28, insets.bottom + 24),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {light ? (
          <View style={styles.lightList}>{rows}</View>
        ) : (
          <View style={styles.darkListWrap}>{rows}</View>
        )}

        <Pressable
          {...FAST_PRESS}
          style={styles.logoutRow}
          onPress={signOut}
          /** Без хвилі / зміни фону — лише діалог Так / Ні. */
          android_ripple={null}
        >
          <Text style={styles.logoutText}>{st(language, 'logout')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 0,
    paddingTop: 4,
  },
  lightList: {
    alignSelf: 'stretch',
    backgroundColor: LIGHT_BAR_BG,
  },
  darkListWrap: {
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  themeRow: {
    paddingRight: 16,
  },
  rowIcon: { marginRight: 12 },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: FIGMA_LSP,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  rowRight: { marginLeft: 8 },
  logoutRow: {
    marginTop: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  logoutText: {
    color: FIGMA_LOGOUT_RED,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: FIGMA_LSP,
  },
});
