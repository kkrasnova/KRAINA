import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { st } from './settingsI18n';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import {
  getAdminGateSecurityLog,
  getAdminGateBlockInfo,
  getOrCreateInstallUid,
  clearAdminGateDeviceBlock,
  clearAdminGateSecurityLog,
} from './adminSecurityStorage';

export default function AdminSecurityPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const appTheme = route?.params?.appTheme === 'light' ? 'light' : 'dark';
  const isLight = appTheme === 'light';
  const [log, setLog] = useState([]);
  const [block, setBlock] = useState(null);
  const [installId, setInstallId] = useState('');

  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const muted = isLight ? '#5C5C5C' : '#9A9A9A';
  const cardBg = isLight ? '#FFFFFF' : '#141414';
  const border = isLight ? 'rgba(30,30,30,0.1)' : '#2A2A2A';

  const reload = useCallback(async () => {
    const [rows, b, uid] = await Promise.all([
      getAdminGateSecurityLog(),
      getAdminGateBlockInfo(),
      getOrCreateInstallUid(),
    ]);
    setLog(rows);
    setBlock(b);
    setInstallId(uid);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const onClearBlock = () => {
    Alert.alert(st(language, 'adminSecurityUnblockTitle'), st(language, 'adminSecurityUnblockBody'), [
      { text: st(language, 'adminCancel'), style: 'cancel' },
      {
        text: st(language, 'adminSecurityUnblockConfirm'),
        onPress: async () => {
          await clearAdminGateDeviceBlock();
          await reload();
        },
      },
    ]);
  };

  const onClearLog = () => {
    Alert.alert(st(language, 'adminSecurityClearLogTitle'), st(language, 'adminSecurityClearLogBody'), [
      { text: st(language, 'adminCancel'), style: 'cancel' },
      {
        text: st(language, 'adminSecurityClearLogConfirm'),
        style: 'destructive',
        onPress: async () => {
          await clearAdminGateSecurityLog();
          await reload();
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { backgroundColor: isLight ? LIGHT_BAR_BG : APP_SCREEN_BG }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        replaceCenterTitle={st(language, 'adminSecurityTitle')}
        hideSendButton
      />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: lightTabBarScrollContentPadding(insets.bottom, 24),
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.muted, { color: muted }]}>{st(language, 'adminSecurityThisDevice')}</Text>
        <Text style={[styles.mono, { color: textMain }]} selectable>
          {installId}
        </Text>
        <Text style={[styles.muted, { color: muted, marginTop: 14 }]}>{st(language, 'adminSecurityChannel')}</Text>
        <Text style={[styles.row, { color: textMain }]}>mobile / {Platform.OS}</Text>

        <View style={[styles.banner, { borderColor: block ? '#EB4335' : border, backgroundColor: cardBg }]}>
          <Text style={[styles.bannerTitle, { color: textMain }]}>
            {block ? st(language, 'adminSecurityBlockedYes') : st(language, 'adminSecurityBlockedNo')}
          </Text>
          {block?.blockedAt ? (
            <Text style={{ color: muted, marginTop: 6 }}>{block.blockedAt}</Text>
          ) : null}
          <Pressable
            onPress={onClearBlock}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: accent, marginTop: 12, opacity: pressed ? 0.9 : 1 },
            ]}
            android_ripple={ripple}
          >
            <Text style={[styles.btnTxt, { color: onAccentButtonText(isLight) }]}>
              {st(language, 'adminSecurityUnblockThisDevice')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.rowBetween}>
          <Text style={[styles.h2, { color: textMain }]}>{st(language, 'adminSecurityLogTitle')}</Text>
          <Pressable onPress={onClearLog} hitSlop={8}>
            <Text style={{ color: '#EB4335', fontWeight: '600' }}>{st(language, 'adminSecurityClearLog')}</Text>
          </Pressable>
        </View>
        <Text style={[styles.hint, { color: muted }]}>{st(language, 'adminSecurityLogHint')}</Text>

        {log.length === 0 ? (
          <Text style={{ color: muted, marginTop: 12 }}>{st(language, 'adminSecurityLogEmpty')}</Text>
        ) : (
          log.map((row) => (
            <View key={row.id} style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
              <Text style={[styles.cardTitle, { color: textMain }]}>{row.outcome || 'event'}</Text>
              <Text style={[styles.cardLine, { color: muted }]}>{row.at}</Text>
              <Text style={[styles.cardLine, { color: textMain }]}>email: {row.email || '—'}</Text>
              <Text style={[styles.cardLine, { color: muted }]} selectable>
                install: {row.installId}
              </Text>
              <Text style={[styles.cardLine, { color: muted }]}>
                {row.platform} {row.osVersion} · v{row.appVersion}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  muted: { fontSize: 13, marginBottom: 4 },
  mono: { fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  row: { fontSize: 15, marginBottom: 4 },
  banner: {
    marginTop: 16,
    marginBottom: 20,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bannerTitle: { fontSize: 16, fontWeight: '700' },
  btn: { paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnTxt: { fontWeight: '700', fontSize: 15 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  h2: { fontSize: 17, fontWeight: '700' },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  cardLine: { fontSize: 13, marginBottom: 4 },
});
