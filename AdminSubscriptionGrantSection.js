import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { st } from './settingsI18n';
import { useAuthStore } from './auth/authStore';
import { getAdminUsersSearch, postAdminGrantSubscription } from './auth/endpoints';
import { ApiError } from './auth/types';

const PLAN_KEYS = ['free', 'explorer', 'pro', 'family'];

const DUR_PRESETS = [
  { key: '3', days: 3, lifetime: false },
  { key: '30', days: 30, lifetime: false },
  { key: '365', days: 365, lifetime: false },
  { key: 'life', days: 0, lifetime: true },
];

function formatPlanRow(language, row) {
  const plan = row.plan_type || '—';
  const exp = row.expires_at
    ? new Date(row.expires_at).toLocaleDateString()
    : row.plan_type && row.plan_type !== 'free'
      ? st(language, 'adminSubsExpiresNever')
      : '—';
  const pp = row.payment_provider || '—';
  return `${plan} · ${exp} · ${pp}`;
}

export default function AdminSubscriptionGrantSection({
  language,
  textMain,
  muted,
  border,
  cardBg,
  accent,
  ripple,
  onAccentText,
}) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [emailQuery, setEmailQuery] = useState('');
  const [emailGrant, setEmailGrant] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [plan, setPlan] = useState('pro');
  const [preset, setPreset] = useState('30');
  const [granting, setGranting] = useState(false);

  const selectedPreset = DUR_PRESETS.find((p) => p.key === preset) || DUR_PRESETS[1];

  const runSearch = useCallback(
    async (rawQ) => {
      const q = String(rawQ || '').trim();
      if (q.length < 2) {
        Alert.alert('', st(language, 'adminSubsQueryShort'));
        return;
      }
      if (!accessToken) {
        Alert.alert('', st(language, 'adminSubsNoToken'));
        return;
      }
      setSearching(true);
      try {
        const { users } = await getAdminUsersSearch(accessToken, q);
        setResults(users);
      } catch (e) {
        setResults([]);
        const msg = e instanceof ApiError ? String(e.message || '') : String(e?.message || '');
        Alert.alert('', st(language, 'adminSubsSearchFail') + (msg ? ` (${msg})` : ''));
      } finally {
        setSearching(false);
      }
    },
    [accessToken, language],
  );

  const onSearch = useCallback(() => runSearch(emailQuery), [emailQuery, runSearch]);

  const onGrant = useCallback(async () => {
    const email = emailGrant.trim();
    if (!email) {
      Alert.alert('', st(language, 'adminSubsEmailRequired'));
      return;
    }
    if (!accessToken) {
      Alert.alert('', st(language, 'adminSubsNoToken'));
      return;
    }
    const life = selectedPreset.lifetime;
    const duration_days = plan === 'free' ? 0 : life ? 0 : selectedPreset.days;
    setGranting(true);
    try {
      await postAdminGrantSubscription(accessToken, {
        email,
        plan_type: plan,
        duration_days,
        lifetime: plan !== 'free' && life,
      });
      Alert.alert('', st(language, 'adminSubsGranted'));
      await runSearch((emailGrant.trim() || emailQuery.trim()).slice(0, 200));
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? JSON.stringify(e.payload || {}) || e.message
          : String(e?.message || '');
      Alert.alert('', st(language, 'adminSubsGrantFailed') + (msg ? `\n${msg}` : ''));
    } finally {
      setGranting(false);
    }
  }, [accessToken, emailGrant, emailQuery, plan, selectedPreset, language, runSearch]);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.h2, { color: textMain }]}>{st(language, 'adminSubsTitle')}</Text>
      <Text style={[styles.hint, { color: muted }]}>{st(language, 'adminSubsHint')}</Text>

      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminSubsSearchLabel')}</Text>
      <View style={[styles.rowIn, { borderColor: border }]}>
        <TextInput
          value={emailQuery}
          onChangeText={setEmailQuery}
          placeholder={st(language, 'adminSubsSearchPh')}
          placeholderTextColor={muted}
          autoCapitalize="none"
          keyboardType="email-address"
          style={[styles.input, { color: textMain, borderColor: border, flex: 1 }]}
        />
        <Pressable
          onPress={onSearch}
          disabled={searching}
          style={({ pressed }) => [
            styles.searchBtn,
            { backgroundColor: accent, opacity: pressed ? 0.88 : searching ? 0.6 : 1 },
          ]}
          android_ripple={ripple}
        >
          {searching ? (
            <ActivityIndicator color={onAccentText} />
          ) : (
            <Text style={{ color: onAccentText, fontWeight: '700' }}>{st(language, 'adminSubsSearchBtn')}</Text>
          )}
        </Pressable>
      </View>

      {results.length > 0 ? (
        <View style={[styles.card, { borderColor: border, backgroundColor: cardBg }]}>
          <Text style={[styles.subLabel, { color: muted }]}>{st(language, 'adminSubsResults')}</Text>
          {results.map((row) => (
            <Pressable
              key={row.user_id}
              onPress={() => setEmailGrant(row.email)}
              style={({ pressed }) => [
                styles.resultRow,
                { borderBottomColor: border, opacity: pressed ? 0.85 : 1 },
              ]}
              android_ripple={ripple}
            >
              <Ionicons name="mail-outline" size={18} color={accent} style={{ marginRight: 8 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.emailLine, { color: textMain }]} numberOfLines={1}>
                  {row.email}
                </Text>
                <Text style={[styles.metaLine, { color: muted }]} numberOfLines={2}>
                  @{row.username || '—'} · {formatPlanRow(language, row)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={muted} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text style={[styles.label, { color: muted, marginTop: 16 }]}>{st(language, 'adminSubsGrantEmail')}</Text>
      <TextInput
        value={emailGrant}
        onChangeText={setEmailGrant}
        placeholder="user@example.com"
        placeholderTextColor={muted}
        autoCapitalize="none"
        keyboardType="email-address"
        style={[styles.inputFull, { color: textMain, borderColor: border }]}
      />

      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminSubsPlan')}</Text>
      <View style={styles.chips}>
        {PLAN_KEYS.map((p) => {
          const sel = plan === p;
          return (
            <Pressable
              key={p}
              onPress={() => setPlan(p)}
              style={[
                styles.chip,
                { borderColor: sel ? accent : border, backgroundColor: sel ? `${accent}22` : 'transparent' },
              ]}
              android_ripple={ripple}
            >
              <Text style={[styles.chipText, { color: sel ? accent : textMain }]}>{p}</Text>
            </Pressable>
          );
        })}
      </View>

      {plan !== 'free' ? (
        <>
          <Text style={[styles.label, { color: muted }]}>{st(language, 'adminSubsDuration')}</Text>
          <View style={styles.chips}>
            {DUR_PRESETS.map((pr) => {
              const sel = preset === pr.key;
              const label =
                pr.key === '3'
                  ? st(language, 'adminSubsDur3')
                  : pr.key === '30'
                    ? st(language, 'adminSubsDur30')
                    : pr.key === '365'
                      ? st(language, 'adminSubsDur365')
                      : st(language, 'adminSubsDurLife');
              return (
                <Pressable
                  key={pr.key}
                  onPress={() => setPreset(pr.key)}
                  style={[
                    styles.chip,
                    { borderColor: sel ? accent : border, backgroundColor: sel ? `${accent}22` : 'transparent' },
                  ]}
                  android_ripple={ripple}
                >
                  <Text style={[styles.chipText, { color: sel ? accent : textMain }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <Pressable
        onPress={onGrant}
        disabled={granting}
        style={({ pressed }) => [
          styles.grantBtn,
          { backgroundColor: accent, opacity: pressed ? 0.9 : granting ? 0.65 : 1, marginTop: 16 },
        ]}
        android_ripple={ripple}
      >
        {granting ? (
          <ActivityIndicator color={onAccentText} />
        ) : (
          <Text style={{ color: onAccentText, fontWeight: '700', fontSize: 16 }}>
            {st(language, 'adminSubsGrantBtn')}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 20 },
  h2: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  hint: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  subLabel: { fontSize: 12, marginBottom: 8 },
  rowIn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'android' ? 8 : 10,
    minHeight: 44,
  },
  inputFull: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'android' ? 8 : 10,
    minHeight: 44,
    marginBottom: 8,
  },
  searchBtn: {
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { borderRadius: 12, borderWidth: 1, overflow: 'hidden', marginTop: 8 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emailLine: { fontSize: 15, fontWeight: '600' },
  metaLine: { fontSize: 12, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipText: { fontWeight: '600', fontSize: 13, textTransform: 'capitalize' },
  grantBtn: {
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
