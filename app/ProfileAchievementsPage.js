import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { useAppTheme } from './useAppTheme';
import { useSyncedAppLanguage } from './useAppLanguage';
import { pf } from './profileI18n';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import { useAuthStore } from './auth/authStore';
import { getVisitLog } from './visitStatsStorage';
import { computeGamificationFromVisits } from './visitGamification';
import {
  getLandmarkQuizBonusXpTotal,
  getLandmarkQuizPendingXpTotal,
  getLandmarkQuizCompletedCount,
  getQuizWheelSpentXp,
} from './landmarkQuizRewards';
import {
  getPhysicalVisitBonusXpTotal,
  getPhysicalVisitClaimedCount,
} from './physicalVisitRewards';
import { getUserFeedPosts, resolveFeedLocalUser } from './feedLocalStorage';
import { evaluateHubAchievements } from './hubAchievements';
import { switchHomeTab } from './homeTabSwitch';
import { HOME_TAB } from './homeTabPagerConstants';
import {
  brandFontSans,
  brandFontSansSemibold,
  brandFontSansBold,
  brandFontHeadBold,
  brandFontScript,
} from './brandFont';

function AchievementRow({ item, language, isLight, accent, onAccent, onPress }) {
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#727272' : '#A8A8A8';
  const locked = !item.unlocked;
  const wash = isLight ? 'rgba(2,18,235,0.10)' : 'rgba(225,255,0,0.14)';

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        isLight ? styles.rowLight : styles.rowDark,
        locked && styles.rowLocked,
        pressed && onPress ? { opacity: 0.9 } : null,
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: locked ? (isLight ? '#F2F2F2' : 'rgba(255,255,255,0.06)') : wash }]}>
        <Ionicons
          name={locked ? 'lock-closed-outline' : item.icon}
          size={22}
          color={locked ? textMuted : accent}
        />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, brandFontSansSemibold, { color: textMain }]} numberOfLines={1}>
          {pf(language, item.titleKey)}
        </Text>
        <Text style={[styles.rowHint, brandFontSans, { color: textMuted }]} numberOfLines={2}>
          {pf(language, item.hintKey)}
        </Text>
        {!item.unlocked ? (
          <View style={[styles.progTrack, { backgroundColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)' }]}>
            <View
              style={[
                styles.progFill,
                { width: `${Math.round(item.ratio * 100)}%`, backgroundColor: accent },
              ]}
            />
          </View>
        ) : null}
        {!item.unlocked ? (
          <Text style={[styles.progLabel, brandFontSans, { color: textMuted }]}>
            {pf(language, 'hubAchProgress')
              .replace('{c}', String(item.current))
              .replace('{t}', String(item.target))}
          </Text>
        ) : null}
      </View>
      <View style={[styles.xpPill, { backgroundColor: locked ? (isLight ? '#F2F2F2' : 'rgba(255,255,255,0.08)') : accent }]}>
        <Text style={[styles.xpPillText, brandFontSansSemibold, { color: locked ? textMuted : onAccent }]}>
          {pf(language, 'hubAchXpBadge').replace('{n}', String(item.xp))}
        </Text>
      </View>
    </Pressable>
  );
}

export default function ProfileAchievementsPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const { appTheme, isLight } = useAppTheme(route?.params?.appTheme, route);
  const accent = accentForTheme(isLight);
  const onAccent = onAccentButtonText(isLight);
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#727272' : '#A8A8A8';
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const [bundle, setBundle] = useState(() => evaluateHubAchievements({}));

  const authUser = useAuthStore((s) => s.user);
  const profileMe = useAuthStore((s) => s.profileMe?.profile);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const feedUser = resolveFeedLocalUser(authUser) || authUser;
          const [
            visitLog,
            quizBonusXp,
            quizPendingXp,
            physicalBonusXp,
            quizCompleted,
            physicalVisits,
            wheelSpent,
            posts,
          ] = await Promise.all([
            getVisitLog({ physicalOnly: true }),
            getLandmarkQuizBonusXpTotal(),
            getLandmarkQuizPendingXpTotal(),
            getPhysicalVisitBonusXpTotal(),
            getLandmarkQuizCompletedCount(),
            getPhysicalVisitClaimedCount(),
            getQuizWheelSpentXp(),
            getUserFeedPosts(feedUser),
          ]);
          if (cancelled) return;
          const gamify = computeGamificationFromVisits(
            visitLog,
            quizBonusXp + quizPendingXp + physicalBonusXp,
          );
          const serverLevel =
            profileMe?.level != null && Number.isFinite(Number(profileMe.level))
              ? Math.round(Number(profileMe.level))
              : gamify.level;
          const serverXp =
            profileMe?.xp_points != null && Number.isFinite(Number(profileMe.xp_points))
              ? Math.round(Number(profileMe.xp_points))
              : gamify.xp;
          setBundle(
            evaluateHubAchievements({
              uniquePlaces: gamify.uniquePlaces || 0,
              totalVisits: gamify.totalVisits || 0,
              quizCompleted,
              physicalVisits,
              postsCount: Array.isArray(posts) ? posts.length : 0,
              totalXp: Math.max(serverXp, gamify.xp || 0),
              level: serverLevel,
              wheelSpent,
            }),
          );
        } catch {
          if (!cancelled) setBundle(evaluateHubAchievements({}));
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [authUser, profileMe]),
  );

  const bottomPad = lightTabBarScrollContentPadding(insets.bottom, 24);

  const ctaFor = useCallback(
    (item) => {
      if (!item || item.unlocked) return null;
      if (item.category === 'social') {
        return {
          label: pf(language, 'hubAchGoPhoto'),
          run: () => navigation.navigate('FeedPostMediaPicker', { appTheme }),
        };
      }
      if (item.category === 'quiz') {
        return {
          label: pf(language, 'hubAchGoScan'),
          run: () => switchHomeTab(HOME_TAB.SCANNER, {}, appTheme),
        };
      }
      if (item.category === 'explore') {
        return {
          label: pf(language, 'hubAchGoMap'),
          run: () => switchHomeTab(HOME_TAB.MAP, {}, appTheme),
        };
      }
      if (item.category === 'rewards') {
        return {
          label: pf(language, 'hubAchGoWheel'),
          run: () => navigation.navigate('ProfileGamificationHub', { appTheme }),
        };
      }
      return null;
    },
    [language, navigation, appTheme],
  );

  const summary = useMemo(
    () => `${bundle.unlockedCount} / ${bundle.totalCount}`,
    [bundle.unlockedCount, bundle.totalCount],
  );

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        hideSendButton
      />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: bottomPad }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <Text style={[styles.titleLead, brandFontHeadBold, { color: textMain }]}>
            {pf(language, 'hubAchievementsLead')}
          </Text>
          <Text style={[styles.titleScript, brandFontScript, { color: accent }]}>
            {' '}
            {pf(language, 'hubAchievementsScript')}
          </Text>
        </View>
        <Text style={[styles.intro, brandFontSans, { color: textMuted }]}>
          {pf(language, 'hubAchievementsIntro')}
        </Text>

        <View style={[styles.summaryCard, isLight ? styles.cardLight : styles.cardDark]}>
          <View style={[styles.summaryIcon, { backgroundColor: isLight ? 'rgba(2,18,235,0.1)' : 'rgba(225,255,0,0.14)' }]}>
            <Ionicons name="trophy-outline" size={22} color={accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.summaryLabel, brandFontSans, { color: textMuted }]}>
              {pf(language, 'hubAchievementsTitle')}
            </Text>
            <Text style={[styles.summaryValue, brandFontSansBold, { color: textMain }]}>{summary}</Text>
          </View>
          <View style={[styles.summaryBarTrack, { backgroundColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)' }]}>
            <View
              style={[
                styles.summaryBarFill,
                {
                  width: `${Math.round((bundle.unlockedCount / Math.max(1, bundle.totalCount)) * 100)}%`,
                  backgroundColor: accent,
                },
              ]}
            />
          </View>
        </View>

        {bundle.unlocked.length ? (
          <>
            <Text style={[styles.section, brandFontSansSemibold, { color: textMain }]}>
              {pf(language, 'hubAchUnlockedSection')}
            </Text>
            {bundle.unlocked.map((item) => (
              <AchievementRow
                key={item.id}
                item={item}
                language={language}
                isLight={isLight}
                accent={accent}
                onAccent={onAccent}
              />
            ))}
          </>
        ) : null}

        <Text style={[styles.section, brandFontSansSemibold, { color: textMain, marginTop: bundle.unlocked.length ? 8 : 0 }]}>
          {pf(language, 'hubAchLockedSection')}
        </Text>
        {bundle.locked.map((item) => {
          const cta = ctaFor(item);
          return (
            <View key={item.id}>
              <AchievementRow
                item={item}
                language={language}
                isLight={isLight}
                accent={accent}
                onAccent={onAccent}
                onPress={cta ? cta.run : undefined}
              />
              {cta ? (
                <Pressable
                  onPress={cta.run}
                  style={[styles.ctaBtn, { borderColor: accent }]}
                >
                  <Text style={[styles.ctaText, brandFontSansSemibold, { color: accent }]}>{cta.label}</Text>
                  <Ionicons name="arrow-forward" size={14} color={accent} />
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  titleLead: { fontSize: 28, lineHeight: 34 },
  titleScript: {
    fontSize: 36,
    lineHeight: 40,
    transform: [{ rotate: '-1.5deg' }],
    marginBottom: -2,
  },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  summaryCard: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 12,
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0,0,0,0.09)',
  },
  cardDark: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  summaryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: { fontSize: 12 },
  summaryValue: { fontSize: 22, marginTop: 2 },
  summaryBarTrack: {
    width: '100%',
    height: 6,
    borderRadius: 99,
    overflow: 'hidden',
  },
  summaryBarFill: { height: '100%', borderRadius: 99 },
  section: { fontSize: 17, marginBottom: 10, marginTop: 6 },
  row: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 12,
    marginBottom: 10,
  },
  rowLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0,0,0,0.09)',
  },
  rowDark: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  rowLocked: { opacity: 0.92 },
  rowIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, marginBottom: 2 },
  rowHint: { fontSize: 12, lineHeight: 16 },
  progTrack: {
    height: 4,
    borderRadius: 99,
    overflow: 'hidden',
    marginTop: 8,
  },
  progFill: { height: '100%', borderRadius: 99 },
  progLabel: { fontSize: 11, marginTop: 4 },
  xpPill: {
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  xpPillText: { fontSize: 12 },
  ctaBtn: {
    alignSelf: 'flex-start',
    marginTop: -2,
    marginBottom: 12,
    marginLeft: 62,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  ctaText: { fontSize: 12 },
});
