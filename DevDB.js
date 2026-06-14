
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  Alert,
  Platform,
} from 'react-native';
import { noAndroidRipple, rippleOnDarkSurface } from './androidFeedback';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAllUsers, firebaseEnabled } from './db';

const BG = '#101010';
const CARD = '#1A1A1A';
const ACCENT = '#E1FF00';
const BORDER = '#2A2A2A';
const TEXT = '#FFFFFF';
const MUTED = '#888888';
const RED = '#FF4444';

const STORAGE_KEYS = [
  '@kraina_session_v2',
  '@kraina_users_v2',
  '@kraina_app_language',
];

export default function DevDB({ navigation }) {
  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = {};
    for (const key of STORAGE_KEYS) {
      try {
        const raw = await AsyncStorage.getItem(key);
        result[key] = raw ? JSON.parse(raw) : null;
      } catch {
        const raw = await AsyncStorage.getItem(key).catch(() => null);
        result[key] = raw;
      }
    }
    const allUsers = await getAllUsers();
    setData(result);
    setUsers(Array.isArray(allUsers) ? allUsers : []);
    setLoading(false);
  }, []);

  const clearAll = () => {
    Alert.alert(
      'Видалити локальні дані?',
      'Буде очищено сесію та локальний кеш на цьому пристрої. Користувачі у Firestore залишаться.',
      [
        { text: 'Ні', style: 'cancel' },
        {
          text: 'Так, видалити',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.multiRemove(STORAGE_KEYS);
            setData(null);
            setUsers([]);
            Alert.alert('', 'Локальні дані видалено');
          },
        },
      ],
    );
  };

  const session = data?.['@kraina_session_v2'];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} android_ripple={rippleOnDarkSurface}>
          <Text style={styles.backText}>← Назад</Text>
        </Pressable>
        <Text style={styles.title}>🗄 База даних</Text>
        <Pressable onPress={clearAll} style={styles.clearBtn} android_ripple={rippleOnDarkSurface}>
          <Text style={styles.clearText}>Очистити</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {}
        <Pressable
          onPress={load}
          style={({ pressed }) => [styles.loadBtn, pressed && styles.loadBtnPressed]}
          android_ripple={noAndroidRipple}
        >
          <Text style={styles.loadText}>{loading ? 'Завантаження…' : '🔄 Завантажити дані'}</Text>
        </Pressable>

        {data && (
          <>
            {}
            <Text style={styles.sectionTitle}>Активна сесія</Text>
            <View style={styles.card}>
              {session?.user ? (
                <>
                  <Row label="ID" value={session.user.id} />
                  <Row label="Email" value={session.user.email} />
                  <Row label="Ім'я" value={session.user.name} />
                  <Row label="Провайдер" value={session.user.provider} />
                  <Row label="Дата реєстрації" value={session.user.createdAt?.slice(0, 10)} />
                </>
              ) : (
                <Text style={styles.empty}>Немає активної сесії</Text>
              )}
            </View>

            {}
            <Text style={styles.sectionTitle}>
              Користувачі ({users.length}) {firebaseEnabled ? '(Firestore+локально)' : '(локально)'}
            </Text>
            {users.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.empty}>Немає зареєстрованих користувачів</Text>
              </View>
            ) : (
              users.map((u, i) => (
                <View key={u.id || i} style={styles.card}>
                  <Text style={styles.userIndex}>#{i + 1}</Text>
                  <Row label="ID" value={u.id} />
                  <Row label="Email" value={u.email} />
                  <Row label="Ім'я" value={u.name} />
                  <Row label="Провайдер" value={u.provider} />
                  <Row label="Google ID" value={u.googleId || '—'} />
                  <Row label="Пароль (хеш)" value={u.passwordHash ? u.passwordHash.slice(0, 20) + '…' : '—'} />
                  <Row label="Дата реєстрації" value={u.createdAt?.slice(0, 10)} />
                </View>
              ))
            )}

            {}
            <Text style={styles.sectionTitle}>Мова застосунку</Text>
            <View style={styles.card}>
              <Text style={styles.value}>{data['@kraina_app_language'] || 'uk (за замовчуванням)'}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: BORDER,
  },
  backBtn: { padding: 4, borderRadius: 8, overflow: 'hidden' },
  backText: { color: ACCENT, fontSize: 14 },
  title: { color: TEXT, fontSize: 16, fontWeight: '700' },
  clearBtn: { padding: 4, borderRadius: 8, overflow: 'hidden' },
  clearText: { color: RED, fontSize: 13 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  loadBtn: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    overflow: 'hidden',
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  loadBtnPressed: {
    backgroundColor: '#C4D800',
  },
  loadText: {
    color: BG,
    fontWeight: '700',
    fontSize: 15,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  sectionTitle: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 4,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  userIndex: { color: ACCENT, fontWeight: '700', fontSize: 13, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, gap: 8 },
  label: { color: MUTED, fontSize: 12, flex: 1 },
  value: { color: TEXT, fontSize: 12, flex: 2, textAlign: 'right' },
  empty: { color: MUTED, fontSize: 13, textAlign: 'center', paddingVertical: 8 },
});
