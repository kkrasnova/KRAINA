import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  Image,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { getAppTheme } from './themeStorage';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { pf } from './profileI18n';
import { accentForTheme } from './themeAccent';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { socialSearchProfiles } from './socialApi';

const QUICK_SUGGESTIONS = ['anna', 'travel', 'kyiv', 'mountains', 'coffee'];

export default function DiscoverPeoplePage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const user = route?.params?.user || {};
  const countryId = route?.params?.countryId;
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState([]);
  const debRef = useRef(null);
  const langUk = String(language || 'uk').split(/[-_]/)[0].toLowerCase() === 'uk';

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const muted = isLight ? '#5C5C5C' : '#9A9A9A';
  const cardBg = isLight ? '#FFFFFF' : '#17171A';
  const border = isLight ? 'rgba(30,30,30,0.1)' : 'rgba(255,255,255,0.12)';
  const searchBg = isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)';
  const searchBorder = isLight ? 'rgba(2,18,235,0.12)' : 'rgba(255,255,255,0.16)';
  const badgeBg = isLight ? 'rgba(2,18,235,0.1)' : 'rgba(225,255,0,0.14)';
  const subtleCard = isLight ? 'rgba(2,18,235,0.05)' : 'rgba(255,255,255,0.06)';
  const heroBg = isLight ? 'rgba(2,18,235,0.06)' : 'rgba(255,255,255,0.06)';
  const heroBorder = isLight ? 'rgba(2,18,235,0.14)' : 'rgba(255,255,255,0.14)';
  const heroGlow = isLight ? 'rgba(2,18,235,0.12)' : 'rgba(225,255,0,0.18)';
  const searchShadow = isLight ? 'rgba(2,18,235,0.12)' : 'rgba(0,0,0,0.35)';
  const tagBg = isLight ? 'rgba(2,18,235,0.08)' : 'rgba(255,255,255,0.08)';
  const tagBorder = isLight ? 'rgba(2,18,235,0.2)' : 'rgba(255,255,255,0.15)';
  const chipText = isLight ? '#1B2AFE' : '#E1FF00';
  const sectionTitle = isLight ? '#1F1F26' : '#F4F4F6';
  const cardHighlight = isLight ? 'rgba(2,18,235,0.05)' : 'rgba(255,255,255,0.04)';
  const cardShadow = isLight ? 'rgba(17,28,99,0.12)' : 'rgba(0,0,0,0.45)';
  const onlineDot = isLight ? '#0FA958' : '#3BE27B';
  const warmText = isLight ? '#3D3D46' : '#D1D1D9';

  React.useEffect(() => {
    (async () => {
      const t = await getAppTheme();
      setAppTheme(t === 'light' ? 'light' : 'dark');
    })();
  }, []);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    const raw = q.trim().replace(/^@/, '');
    if (raw.length < 1) {
      setResults([]);
      return;
    }
    debRef.current = setTimeout(async () => {
      setBusy(true);
      try {
        const rows = await socialSearchProfiles(raw, 24);
        setResults(Array.isArray(rows) ? rows : []);
      } catch (e) {
        setResults([]);
        if (__DEV__) console.warn('[DiscoverPeople]', e?.message);
      } finally {
        setBusy(false);
      }
    }, 380);
    return () => {
      if (debRef.current) clearTimeout(debRef.current);
    };
  }, [q]);

  const shell = {
    user,
    language,
    ...(countryId != null ? { countryId } : {}),
    appTheme,
  };

  const openUser = useCallback(
    (username) => {
      navigation.push('SocialUserProfile', {
        ...shell,
        username: String(username || '').replace(/^@/, ''),
      });
    },
    [navigation, shell],
  );

  const onPickSuggestion = useCallback((value) => {
    setQ(value);
  }, []);

  const showIntro = q.trim().length < 2 && !busy && results.length === 0;

  const renderItem = useCallback(
    ({ item }) => {
      const dn = item.display_name != null ? String(item.display_name).trim() : '';
      const bio = item.bio != null ? String(item.bio).trim() : '';
      return (
        <Pressable
          onPress={() => openUser(item.username)}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: cardBg,
              borderColor: border,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.99 : 1 }],
              shadowColor: cardShadow,
              shadowOpacity: isLight ? 0.2 : 0.45,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 8 },
              elevation: isLight ? 3 : 2,
            },
          ]}
          android_ripple={ripple}
        >
          <View>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: isLight ? '#E8E8E4' : '#333' }]} />
            )}
            <View style={[styles.onlineDot, { backgroundColor: onlineDot, borderColor: cardBg }]} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.uname, { color: textMain }]} numberOfLines={1}>
              {dn || `@${item.username}`}
            </Text>
            {dn ? (
              <Text style={[styles.subName, { color: muted }]} numberOfLines={1}>
                @{item.username}
              </Text>
            ) : null}
            {bio ? (
              <Text style={[styles.bio, { color: muted }]} numberOfLines={2}>
                {bio}
              </Text>
            ) : (
              <Text style={[styles.bio, { color: warmText }]} numberOfLines={1}>
                {langUk ? 'Відкрий профіль, щоб дізнатися більше' : 'Open profile to learn more'}
              </Text>
            )}
            <View style={styles.metaRow}>
              <View style={[styles.metaPill, { backgroundColor: cardHighlight }]}>
                <Ionicons name="person-outline" size={12} color={muted} />
                <Text style={[styles.metaText, { color: muted }]}>@{item.username}</Text>
              </View>
            </View>
          </View>
          {item.is_following ? (
            <View style={[styles.followBadge, { backgroundColor: badgeBg }]}>
              <Ionicons name="checkmark" size={13} color={isLight ? '#0212EB' : '#E1FF00'} />
            </View>
          ) : null}
        </Pressable>
      );
    },
    [badgeBg, border, cardBg, cardHighlight, cardShadow, isLight, langUk, muted, onlineDot, openUser, ripple, textMain, warmText],
  );

  return (
    <View style={[styles.root, { backgroundColor: isLight ? LIGHT_BAR_BG : APP_SCREEN_BG }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        replaceCenterTitle={pf(language, 'discoverTitle')}
        hideSendButton
        lightBarBackgroundColor={isLight ? '#FFFFFF' : undefined}
      />
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View
          style={[
            styles.hero,
            {
              backgroundColor: heroBg,
              borderColor: heroBorder,
            },
          ]}
        >
          <View style={[styles.heroGlow, { backgroundColor: heroGlow }]} />
          <View style={[styles.heroIcon, { backgroundColor: badgeBg }]}>
            <Ionicons name="people-outline" size={18} color={isLight ? '#0212EB' : '#E1FF00'} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: textMain }]}>{pf(language, 'discoverTitle')}</Text>
            <Text style={[styles.heroText, { color: muted }]}>
              {langUk ? 'Шукайте за ім’ям або @нікнеймом' : 'Find by name or @username'}
            </Text>
            <Text style={[styles.heroSubtle, { color: warmText }]}>
              {langUk ? 'Знайомтесь, підписуйтесь, починайте діалоги' : 'Find people, follow, and start conversations'}
            </Text>
          </View>
        </View>
        <Text style={[styles.sectionLabel, { color: sectionTitle }]}>
          {langUk ? 'Пошук людей' : 'People search'}
        </Text>
        <View
          style={[
            styles.searchShell,
            {
              backgroundColor: searchBg,
              borderColor: searchBorder,
              shadowColor: searchShadow,
            },
          ]}
        >
          <Ionicons name="search-outline" size={20} color={muted} style={{ marginRight: 8 }} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={pf(language, 'searchPeoplePlaceholder')}
            placeholderTextColor={muted}
            autoCapitalize="words"
            autoCorrect
            style={[
              styles.input,
              {
                color: textMain,
              },
            ]}
          />
        </View>
        <View style={styles.suggestionRow}>
          {QUICK_SUGGESTIONS.map((tag) => (
            <Pressable
              key={tag}
              onPress={() => onPickSuggestion(tag)}
              style={({ pressed }) => [
                styles.suggestionChip,
                {
                  backgroundColor: tagBg,
                  borderColor: tagBorder,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              android_ripple={ripple}
            >
              <Text style={[styles.suggestionText, { color: chipText }]}>@{tag}</Text>
            </Pressable>
          ))}
        </View>
        {busy ? (
          <ActivityIndicator style={{ marginTop: 16 }} color={accent} />
        ) : (
          <Text style={[styles.hint, { color: muted }]}>
            {q.trim().length >= 2
              ? `${results.length} ${langUk ? 'результатів' : 'results'}`
              : '≥2 ' + pf(language, 'searchPeoplePlaceholder').toLowerCase()}
          </Text>
        )}
      </View>
      <FlatList
        data={results}
        keyExtractor={(it) => it.user_id}
        renderItem={renderItem}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: insets.bottom + lightTabBarExtraScrollPadding() + 20,
        }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          results.length > 0 ? (
            <Text style={[styles.sectionLabel, { color: sectionTitle, marginBottom: 10 }]}>
              {langUk ? 'Результати' : 'Results'}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          !busy && q.trim().length >= 2 ? (
            <View style={[styles.emptyCard, { backgroundColor: subtleCard, borderColor: border }]}>
              <Ionicons name="people-outline" size={24} color={muted} />
              <Text style={[styles.emptyTitle, { color: textMain }]}>
                {langUk ? 'Нічого не знайдено' : 'No people found'}
              </Text>
              <Text style={[styles.emptyHint, { color: muted }]}>
                {langUk ? 'Спробуйте інше ім’я або @нікнейм' : 'Try another name or @username'}
              </Text>
            </View>
          ) : showIntro ? (
            <View style={[styles.emptyCard, { backgroundColor: subtleCard, borderColor: border }]}>
              <Ionicons name="sparkles-outline" size={24} color={muted} />
              <Text style={[styles.emptyTitle, { color: textMain }]}>
                {langUk ? 'Почніть знайомство' : 'Start discovering people'}
              </Text>
              <Text style={[styles.emptyHint, { color: muted }]}>
                {langUk
                  ? 'Введіть ім’я чи @нік, щоб знайти профілі'
                  : 'Type a name or @username to discover profiles'}
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  heroGlow: {
    position: 'absolute',
    right: -28,
    top: -28,
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  heroIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 15, fontWeight: '800' },
  heroText: { fontSize: 12, marginTop: 2 },
  heroSubtle: { fontSize: 12, marginTop: 6, fontWeight: '500' },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  searchShell: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  input: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  suggestionChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  suggestionText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  hint: { marginTop: 8, fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    gap: 12,
  },
  onlineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    position: 'absolute',
    right: 1,
    bottom: 1,
    borderWidth: 2,
  },
  followBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  uname: { fontSize: 16, fontWeight: '700' },
  subName: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  bio: { fontSize: 13, marginTop: 4 },
  metaRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: { fontSize: 11.5, fontWeight: '600' },
  emptyCard: {
    marginTop: 24,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: { textAlign: 'center', fontSize: 15, fontWeight: '700' },
  emptyHint: { textAlign: 'center', fontSize: 13.5, maxWidth: 260, lineHeight: 18 },
});
