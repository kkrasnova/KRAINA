import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { st } from './settingsI18n';
import { useAuthStore } from './auth/authStore';
import { getAdminSubscriptionCancelFeedback } from './auth/endpoints';
import { ApiError } from './auth/types';

function formatRow(language, row) {
  const when = row.created_at ? new Date(row.created_at).toLocaleString() : '—';
  const who = row.user_email || row.user_id || '—';
  const reasons = Array.isArray(row.reason_codes) ? row.reason_codes.join(', ') : '—';
  const comment = row.comment && String(row.comment).trim() ? String(row.comment).trim() : '—';
  const appLang = row.app_language || '—';
  return { when, who, reasons, comment, appLang, plan: row.previous_plan || '—' };
}

export default function AdminSubscriptionCancelFeedbackSection({
  language,
  textMain,
  muted,
  border,
  cardBg,
  accent,
  ripple,
}) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) {
      Alert.alert('', st(language, 'adminSubsNoToken'));
      return;
    }
    setLoading(true);
    try {
      const { items: rows } = await getAdminSubscriptionCancelFeedback(accessToken, 100);
      setItems(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setItems([]);
      const msg = e instanceof ApiError ? String(e.message || '') : String(e?.message || '');
      Alert.alert('', st(language, 'adminCancelFeedbackFail') + (msg ? ` (${msg})` : ''));
    } finally {
      setLoading(false);
    }
  }, [accessToken, language]);

  return (
    <View style={[styles.card, { borderColor: border, backgroundColor: cardBg }]}>
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: textMain }]}>{st(language, 'adminCancelFeedbackTitle')}</Text>
        <Pressable
          onPress={load}
          disabled={loading}
          style={({ pressed }) => [
            styles.refreshBtn,
            { borderColor: accent, opacity: pressed ? 0.85 : loading ? 0.6 : 1 },
          ]}
          android_ripple={ripple}
        >
          {loading ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <Text style={[styles.refreshLabel, { color: accent }]}>{st(language, 'adminCancelFeedbackRefresh')}</Text>
          )}
        </Pressable>
      </View>
      <Text style={[styles.hint, { color: muted }]}>{st(language, 'adminCancelFeedbackHint')}</Text>

      {loading && items.length === 0 ? (
        <Text style={[styles.mutedLine, { color: muted }]}>{st(language, 'adminCancelFeedbackLoading')}</Text>
      ) : null}

      {!loading && items.length === 0 ? (
        <Text style={[styles.mutedLine, { color: muted }]}>{st(language, 'adminCancelFeedbackEmpty')}</Text>
      ) : null}

      <ScrollView style={styles.list} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        {items.map((row, idx) => {
          const f = formatRow(language, row);
          return (
            <View
              key={row.id}
              style={[
                styles.row,
                idx > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: border } : null,
              ]}
            >
              <Text style={[styles.when, { color: muted }]}>{f.when}</Text>
              <View style={styles.rowLine}>
                <Ionicons name="person-outline" size={16} color={accent} style={styles.rowIcon} />
                <Text style={[styles.rowMain, { color: textMain }]}>
                  <Text style={{ fontWeight: '600' }}>{st(language, 'adminCancelFeedbackUser')}: </Text>
                  {f.who}
                </Text>
              </View>
              <View style={styles.rowLine}>
                <Ionicons name="layers-outline" size={16} color={accent} style={styles.rowIcon} />
                <Text style={[styles.rowText, { color: textMain }]}>
                  <Text style={{ fontWeight: '600' }}>{st(language, 'adminCancelFeedbackPlan')}: </Text>
                  {f.plan}
                </Text>
              </View>
              <View style={styles.rowLine}>
                <Ionicons name="list-outline" size={16} color={accent} style={styles.rowIcon} />
                <Text style={[styles.rowText, { color: textMain }]}>
                  <Text style={{ fontWeight: '600' }}>{st(language, 'adminCancelFeedbackReasons')}: </Text>
                  {f.reasons}
                </Text>
              </View>
              <View style={styles.rowLine}>
                <Ionicons name="chatbox-ellipses-outline" size={16} color={accent} style={styles.rowIcon} />
                <Text style={[styles.rowText, { color: textMain }]}>
                  <Text style={{ fontWeight: '600' }}>{st(language, 'adminCancelFeedbackComment')}: </Text>
                  {f.comment}
                </Text>
              </View>
              <View style={styles.rowLine}>
                <Ionicons name="language-outline" size={16} color={accent} style={styles.rowIcon} />
                <Text style={[styles.rowText, { color: textMain }]}>
                  <Text style={{ fontWeight: '600' }}>{st(language, 'adminCancelFeedbackLang')}: </Text>
                  {f.appLang}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginTop: 14,
    maxHeight: 420,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  refreshBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  mutedLine: {
    fontSize: 14,
    marginTop: 4,
  },
  list: {
    maxHeight: 300,
    marginTop: 4,
  },
  row: {
    paddingTop: 12,
    paddingBottom: 4,
  },
  when: {
    fontSize: 12,
    marginBottom: 6,
  },
  rowLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  rowIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  rowMain: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  rowText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
});
