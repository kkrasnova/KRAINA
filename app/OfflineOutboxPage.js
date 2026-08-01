import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, SectionList, DeviceEventEmitter } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { getOutboxItems, getOutboxHistory, OFFLINE_OUTBOX_CHANGED, clearOutboxHistory } from './offline/outboxStore';
import { getAppTheme, getAppThemeSync, THEME_CHANGED_EVENT } from './themeStorage';
import { flushOutboxNow } from './offline/syncEngine';

export default function OfflineOutboxPage({ navigation }) {
  const insets = useSafeAreaInsets();
  const [appTheme, setAppTheme] = useState(() => getAppThemeSync());
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const isLight = appTheme === 'light';

  const refresh = useCallback(async () => {
    const [q, h] = await Promise.all([getOutboxItems(), getOutboxHistory()]);
    setPending(Array.isArray(q) ? q : []);
    setHistory(Array.isArray(h) ? h : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getAppTheme().then((t) => {
      if (!cancelled) setAppTheme(t === 'dark' ? 'dark' : 'light');
    });
    void refresh();
    const a = DeviceEventEmitter.addListener(OFFLINE_OUTBOX_CHANGED, () => {
      void refresh();
    });
    const b = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setAppTheme(v === 'dark' ? 'dark' : 'light');
    });
    return () => {
      cancelled = true;
      a.remove();
      b.remove();
    };
  }, [refresh]);

  const sections = [
    { title: `В черзі (${pending.length})`, data: pending },
    { title: `Історія (${history.length})`, data: history.slice(0, 80) },
  ];

  return (
    <View style={[styles.root, { backgroundColor: isLight ? LIGHT_BAR_BG : APP_SCREEN_BG }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        replaceCenterTitle="Offline Sync"
        hideSendButton
      />
      <View style={styles.actions}>
        <Pressable style={styles.btn} onPress={() => void flushOutboxNow({ reason: 'manual_page' })}>
          <Text style={[styles.btnText, { color: isLight ? '#0212EB' : '#E1FF00' }]}>Синк зараз</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => void clearOutboxHistory()}>
          <Text style={[styles.btnText, { color: '#EB4335' }]}>Очистити історію</Text>
        </Pressable>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(it) => String(it.id || `${it.type}-${it.createdAt}`)}
        contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 20 }}
        renderSectionHeader={({ section }) => <Text style={[styles.h, { color: isLight ? '#111' : '#FFF' }]}>{section.title}</Text>}
        renderItem={({ item }) => (
          <View style={[styles.row, { borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' }]}>
            <Text style={[styles.type, { color: isLight ? '#111' : '#FFF' }]}>{item.type}</Text>
            <Text style={[styles.meta, { color: isLight ? '#555' : '#AAA' }]} numberOfLines={2}>
              {item.status} · tries {item.attemptCount || 0}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 10 },
  btn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(128,128,128,0.35)' },
  btnText: { fontSize: 13, fontWeight: '700' },
  h: { fontSize: 15, fontWeight: '800', marginTop: 14, marginBottom: 8 },
  row: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 10, marginBottom: 8 },
  type: { fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 4 },
});
