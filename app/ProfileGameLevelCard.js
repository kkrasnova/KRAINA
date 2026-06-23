import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { pf } from './profileI18n';
import { brandFontSans, brandFontSansSemibold } from './brandFont';

function clampDisplayLevel(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 1;
  return Math.min(10, Math.max(1, v));
}

/**
 * Картка рівня: локальний прогрес за журналом відвідувань (`snapshot`) або серверний рівень (`serverMode`).
 * `embedInTab` — без бокових полів (вкладка статистики).
 */
export default function ProfileGameLevelCard({
  snapshot,
  serverMode,
  language,
  isLight,
  accent,
  onPress,
  embedInTab,
  /** Головний профіль: лише значок рівня без детальної статистики (деталі — у вкладці «Статистика»). */
  compact,
}) {
  if (!snapshot && !serverMode) return null;

  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#5C5C5C' : '#A8A8A8';
  const cardBg = isLight ? 'rgba(2, 18, 235, 0.07)' : 'rgba(255, 255, 255, 0.08)';
  const cardBorder = isLight ? 'rgba(2, 18, 235, 0.14)' : 'rgba(255, 255, 255, 0.12)';
  const barTrack = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)';
  const outerMargins = embedInTab
    ? { marginHorizontal: 0, marginTop: 0, marginBottom: 12 }
    : { marginHorizontal: 20, marginTop: 14 };

  if (serverMode) {
    const lvl = clampDisplayLevel(serverMode.level);
    const titleKey = `gamifyRank${lvl}`;
    const title = pf(language, titleKey);
    const xpNum = Number(serverMode.xp);
    const hasXp = serverMode.xp != null && Number.isFinite(xpNum);
    const sub = hasXp
      ? pf(language, 'gamifyServerXpLine').replace('{xp}', String(Math.round(xpNum)))
      : pf(language, 'gamifyPublicLevelSubtitle');
    const nextHint = pf(language, 'gamifyPublicLevelHint');
    const fillW = '100%';

    const inner = (
      <>
        <View style={styles.topRow}>
          <View
            style={[
              styles.badge,
              { borderColor: accent, backgroundColor: isLight ? '#FFFFFF' : 'rgba(0,0,0,0.35)' },
            ]}
          >
            <Text style={[styles.badgeNum, { color: accent }, brandFontSansSemibold]}>{lvl}</Text>
          </View>
          <View style={styles.topText}>
            <Text style={[styles.rankTitle, { color: textMain }, brandFontSansSemibold]} numberOfLines={1}>
              {title}
            </Text>
            {!compact ? (
              <Text style={[styles.sub, { color: textMuted }, brandFontSans]} numberOfLines={2}>
                {sub}
              </Text>
            ) : null}
          </View>
          <Ionicons name="ribbon-outline" size={26} color={accent} style={styles.ribbon} />
        </View>

        <View style={[styles.barTrack, { backgroundColor: barTrack }]}>
          <View style={[styles.barFill, { width: fillW, backgroundColor: accent }]} />
        </View>
        {!compact ? (
          <Text style={[styles.hint, { color: textMuted }, brandFontSans]} numberOfLines={2}>
            {nextHint}
          </Text>
        ) : null}
      </>
    );

    if (onPress) {
      return (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.card,
            outerMargins,
            { backgroundColor: cardBg, borderColor: cardBorder },
            pressed && { opacity: Platform.OS === 'ios' ? 0.88 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={pf(language, 'gamifyOpenStatsA11y')}
        >
          {inner}
          {!compact ? (
            <Text style={[styles.tapHint, { color: accent }, brandFontSansSemibold]}>
              {pf(language, 'gamifyTapStats')}
            </Text>
          ) : null}
        </Pressable>
      );
    }

    return (
      <View style={[styles.card, outerMargins, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        {inner}
      </View>
    );
  }

  const fillW = `${Math.round(snapshot.progressInLevel * 100)}%`;

  const title = pf(language, snapshot.titleKey);
  const remainXp =
    snapshot.nextLevelXp != null ? Math.max(0, snapshot.nextLevelXp - snapshot.xp) : 0;
  const approxNewPlaces = Math.max(1, Math.ceil(remainXp / 100));
  const nextHint =
    snapshot.nextLevelXp == null
      ? pf(language, 'gamifyMaxLevelHint')
      : remainXp < 100
        ? pf(language, 'gamifyXpToNext').replace('{remain}', String(remainXp))
        : pf(language, 'gamifyNextLevelPlacesHint').replace('{n}', String(approxNewPlaces));

  const inner = (
    <>
      <View style={styles.topRow}>
        <View
          style={[
            styles.badge,
            { borderColor: accent, backgroundColor: isLight ? '#FFFFFF' : 'rgba(0,0,0,0.35)' },
          ]}
        >
          <Text style={[styles.badgeNum, { color: accent }, brandFontSansSemibold]}>{snapshot.level}</Text>
        </View>
        <View style={styles.topText}>
          <Text style={[styles.rankTitle, { color: textMain }, brandFontSansSemibold]} numberOfLines={1}>
            {title}
          </Text>
          {!compact ? (
            <Text style={[styles.sub, { color: textMuted }, brandFontSans]} numberOfLines={2}>
              {pf(language, 'gamifySubtitle')
                .replace('{u}', String(snapshot.uniquePlaces))
                .replace('{t}', String(snapshot.totalVisits))
                .replace('{xp}', String(snapshot.xp))}
            </Text>
          ) : null}
        </View>
        <Ionicons name="ribbon-outline" size={26} color={accent} style={styles.ribbon} />
      </View>

      <View style={[styles.barTrack, { backgroundColor: barTrack }]}>
        <View
          style={[
            styles.barFill,
            {
              width: fillW,
              backgroundColor: accent,
            },
          ]}
        />
      </View>
      {!compact ? (
        <Text style={[styles.hint, { color: textMuted }, brandFontSans]} numberOfLines={2}>
          {nextHint}
        </Text>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          outerMargins,
          { backgroundColor: cardBg, borderColor: cardBorder },
          pressed && { opacity: Platform.OS === 'ios' ? 0.88 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={pf(language, 'gamifyOpenStatsA11y')}
      >
        {inner}
        {!compact ? (
          <Text style={[styles.tapHint, { color: accent }, brandFontSansSemibold]}>
            {pf(language, 'gamifyTapStats')}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, outerMargins, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  badgeNum: {
    fontSize: 20,
    fontWeight: '800',
  },
  topText: {
    flex: 1,
    minWidth: 0,
  },
  rankTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sub: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  ribbon: { marginLeft: 4 },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    minWidth: 4,
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
  },
  tapHint: {
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
    fontWeight: '600',
  },
});
