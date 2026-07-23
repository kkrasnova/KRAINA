import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  Animated,
  Easing,
  Modal,
  Platform,
  Vibration,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop, G } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { useAppTheme } from './useAppTheme';
import { useSyncedAppLanguage } from './useAppLanguage';
import { pf } from './profileI18n';
import { accentForTheme, onAccentButtonText, ACCENT_BLUE, ACCENT_LEMON } from './themeAccent';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import { useAuthStore } from './auth/authStore';
import { getVisitLog } from './visitStatsStorage';
import { computeGamificationFromVisits } from './visitGamification';
import {
  getLandmarkQuizBonusXpTotal,
  getLandmarkQuizPendingXpTotal,
  getLandmarkQuizCompletedCount,
  getQuizWheelSpentXp,
  addQuizWheelSpentXp,
} from './landmarkQuizRewards';
import {
  getPhysicalVisitBonusXpTotal,
  getPhysicalVisitClaimedCount,
} from './physicalVisitRewards';
import { getUserFeedPosts, resolveFeedLocalUser } from './feedLocalStorage';
import { evaluateHubAchievements } from './hubAchievements';
import LandmarkQuizBrushHero from './LandmarkQuizBrushHero';
import { HUB_PHOTO_SLOTS } from './hubPhotoSlots';
import {
  brandFontSans,
  brandFontSansSemibold,
  brandFontSansBold,
  brandFontHeadBold,
  brandFontHeadMedium,
  brandFontScript,
} from './brandFont';

const { width: SCREEN_W } = Dimensions.get('window');
const PAGE_PAD = 20;
const WHEEL = Math.min(320, SCREEN_W - 24);
const CX = WHEEL / 2;
const CY = WHEEL / 2;
const R = WHEEL / 2 - 8;
const SECTORS = 8;

const TIERS = [
  { cost: 200, labelKey: 'hubTierMini', descKey: 'hubTierMiniDesc', icon: 'cafe-outline' },
  { cost: 500, labelKey: 'hubTierMid', descKey: 'hubTierMidDesc', icon: 'ticket-outline' },
  { cost: 3000, labelKey: 'hubTierBig', descKey: 'hubTierBigDesc', icon: 'rocket-outline' },
  { cost: 10000, labelKey: 'hubTierEpic', descKey: 'hubTierEpicDesc', icon: 'diamond-outline' },
];

function degToRad(d) {
  return (d * Math.PI) / 180;
}

function wedgePath(cx, cy, r, a0, a1) {
  const x0 = cx + r * Math.cos(degToRad(a0));
  const y0 = cy + r * Math.sin(degToRad(a0));
  const x1 = cx + r * Math.cos(degToRad(a1));
  const y1 = cy + r * Math.sin(degToRad(a1));
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}

function clampDisplayLevel(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 1;
  return Math.min(10, Math.max(1, v));
}

function pickPrizeKey(tier, win) {
  if (!win) return 'hubPrizeEmpty';
  if (tier <= 200) {
    const keys = ['hubPrizeMiniCoffee', 'hubPrizeMiniSticker', 'hubPrizeMiniMap'];
    return keys[Math.floor(Math.random() * keys.length)];
  }
  if (tier <= 500) {
    const keys = ['hubPrizeMidCoffee', 'hubPrizeMidMuseum', 'hubPrizeMidSnack'];
    return keys[Math.floor(Math.random() * keys.length)];
  }
  const keys = ['hubPrizeBigTour', 'hubPrizeBigMerch', 'hubPrizeBigDinner'];
  return keys[Math.floor(Math.random() * keys.length)];
}

function softVibrate(pattern = 12) {
  try {
    if (Platform.OS === 'android') Vibration.vibrate(pattern);
    else Vibration.vibrate();
  } catch {
    /* */
  }
}

const AnimatedView = Animated.createAnimatedComponent(View);

/** Brand dual title: Head lead + Caveat accent word (quiz fonts, mockup order). */
function DualTitle({ lead, script, textColor, scriptColor }) {
  return (
    <View style={styles.dualTitleRow}>
      <Text style={[styles.dualLead, brandFontHeadBold, { color: textColor }]}>{lead}</Text>
      <Text style={[styles.dualScript, brandFontScript, { color: scriptColor }]}> {script}</Text>
    </View>
  );
}

function SoftCard({ children, style, isLight }) {
  return (
    <View
      style={[
        styles.softCard,
        isLight ? styles.softCardLight : styles.softCardDark,
        style,
      ]}
    >
      {children}
    </View>
  );
}

function PhotoSlot({ source, style, label, isLight }) {
  if (source) {
    return (
      <ExpoImage
        source={source}
        style={style}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={140}
        allowDownscaling
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View style={[style, styles.photoPlaceholder, isLight ? styles.photoPlaceholderLight : styles.photoPlaceholderDark]}>
      <Ionicons name="image-outline" size={22} color={isLight ? '#727272' : '#9A9A9A'} />
      {label ? (
        <Text style={[styles.photoPlaceholderLabel, brandFontSans, { color: isLight ? '#727272' : '#9A9A9A' }]}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

function ConfettiBurst({ visible, isLight }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        left: 8 + ((i * 17) % 84),
        delay: (i % 5) * 40,
        color: i % 2 === 0 ? (isLight ? ACCENT_BLUE : ACCENT_LEMON) : isLight ? ACCENT_LEMON : '#F2F2EA',
        rot: -40 + (i % 7) * 12,
      })),
    [isLight],
  );
  const anims = useRef(pieces.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!visible) {
      anims.forEach((v) => v.setValue(0));
      return undefined;
    }
    const runs = anims.map((v, i) =>
      Animated.sequence([
        Animated.delay(pieces[i].delay),
        Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    );
    Animated.parallel(runs).start();
    return undefined;
  }, [visible, anims, pieces]);

  if (!visible) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <AnimatedView
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: '28%',
            width: 8,
            height: 14,
            borderRadius: 3,
            backgroundColor: p.color,
            opacity: anims[i].interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
            transform: [
              {
                translateY: anims[i].interpolate({ inputRange: [0, 1], outputRange: [0, 120 + (i % 4) * 18] }),
              },
              { rotate: `${p.rot}deg` },
              {
                scale: anims[i].interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1.1, 0.7] }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}

export default function ProfileGamificationHubPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const { appTheme, isLight } = useAppTheme(route?.params?.appTheme, route);
  const [gamify, setGamify] = useState(() => computeGamificationFromVisits([]));
  const [achievements, setAchievements] = useState(() => evaluateHubAchievements({}));
  const [pagerPage, setPagerPage] = useState(0);
  const [selectedTier, setSelectedTier] = useState(200);
  const [spinning, setSpinning] = useState(false);
  const [wheelSpent, setWheelSpent] = useState(0);
  const [resultKey, setResultKey] = useState(null);
  const [resultWin, setResultWin] = useState(false);
  const [resultModal, setResultModal] = useState(false);

  const accessToken = useAuthStore((s) => s.accessToken);
  const profileMe = useAuthStore((s) => s.profileMe?.profile);
  const authUser = useAuthStore((s) => s.user);

  const pagerRef = useRef(null);
  const rotAnim = useRef(new Animated.Value(0)).current;
  const lastTotalDeg = useRef(0);
  const glowPulse = useRef(new Animated.Value(0)).current;
  const spinBtnScale = useRef(new Animated.Value(1)).current;
  const modalPop = useRef(new Animated.Value(0)).current;

  const accent = accentForTheme(isLight);
  const onAccent = onAccentButtonText(isLight);
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#727272' : '#A8A8A8';
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const accentWash = isLight ? 'rgba(2,18,235,0.10)' : 'rgba(225,255,0,0.14)';
  const accentWashStrong = isLight ? 'rgba(2,18,235,0.16)' : 'rgba(225,255,0,0.22)';
  const cardBorder = isLight ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.12)';

  const displayName =
    String(profileMe?.display_name || profileMe?.username || '').trim() ||
    (language === 'uk' ? 'Мандрівник' : 'Explorer');
  const avatarUrl = profileMe?.avatar_url ? String(profileMe.avatar_url) : null;

  const serverLevel =
    accessToken && profileMe?.level != null && Number.isFinite(Number(profileMe.level))
      ? clampDisplayLevel(profileMe.level)
      : null;
  const serverXpRaw =
    accessToken && profileMe?.xp_points != null && Number.isFinite(Number(profileMe.xp_points))
      ? Math.round(Number(profileMe.xp_points))
      : null;

  const level = serverLevel != null ? serverLevel : clampDisplayLevel(gamify.level);
  const totalXp = useMemo(() => {
    const local = Math.max(0, Math.round(Number(gamify?.xp) || 0));
    if (serverXpRaw != null) return Math.max(serverXpRaw, local);
    return local;
  }, [serverXpRaw, gamify?.xp]);

  const balance = Math.max(0, totalXp - wheelSpent);
  const rankTitle = pf(language, `gamifyRank${level}`);
  const levelMinXp = Number(gamify.levelMinXp) || 0;
  const nextLevelXp = gamify.nextLevelXp;
  const progressInLevel =
    nextLevelXp != null && nextLevelXp > levelMinXp
      ? Math.min(1, Math.max(0, (totalXp - levelMinXp) / (nextLevelXp - levelMinXp)))
      : 1;
  const xpInLevel = Math.max(0, totalXp - levelMinXp);
  const xpSpan = nextLevelXp != null ? Math.max(1, nextLevelXp - levelMinXp) : xpInLevel || 1;
  const remainXp = nextLevelXp != null ? Math.max(0, nextLevelXp - totalXp) : 0;
  const achievementsCount = achievements.unlockedCount || 0;

  const popularRewards = useMemo(
    () => [
      {
        id: 'coffee',
        partnerKey: 'hubRewardCoffeePartner',
        titleKey: 'hubRewardCoffeeTitle',
        cost: 200,
        photo: HUB_PHOTO_SLOTS.rewardCoffee,
        icon: 'cafe-outline',
      },
      {
        id: 'museum',
        partnerKey: 'hubRewardMuseumPartner',
        titleKey: 'hubRewardMuseumTitle',
        cost: 500,
        photo: HUB_PHOTO_SLOTS.rewardMuseum,
        icon: 'business-outline',
      },
    ],
    [],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (useAuthStore.getState().accessToken) {
          try {
            await useAuthStore.getState().loadProfileMeIfStale();
          } catch {
            /* */
          }
        }
        try {
          const feedUser = resolveFeedLocalUser(authUser) || authUser;
          const [
            visitLog,
            quizBonusXp,
            quizPendingXp,
            physicalBonusXp,
            spent,
            quizCompleted,
            physicalVisits,
            posts,
          ] = await Promise.all([
            getVisitLog({ physicalOnly: true }),
            getLandmarkQuizBonusXpTotal(),
            getLandmarkQuizPendingXpTotal(),
            getPhysicalVisitBonusXpTotal(),
            getQuizWheelSpentXp(),
            getLandmarkQuizCompletedCount(),
            getPhysicalVisitClaimedCount(),
            getUserFeedPosts(feedUser),
          ]);
          if (!cancelled) {
            const nextGamify = computeGamificationFromVisits(
              visitLog,
              quizBonusXp + quizPendingXp + physicalBonusXp,
            );
            setGamify(nextGamify);
            setWheelSpent(spent);
            const lvl =
              profileMe?.level != null && Number.isFinite(Number(profileMe.level))
                ? Math.round(Number(profileMe.level))
                : nextGamify.level;
            const xpRaw =
              profileMe?.xp_points != null && Number.isFinite(Number(profileMe.xp_points))
                ? Math.round(Number(profileMe.xp_points))
                : nextGamify.xp;
            setAchievements(
              evaluateHubAchievements({
                uniquePlaces: nextGamify.uniquePlaces || 0,
                totalVisits: nextGamify.totalVisits || 0,
                quizCompleted,
                physicalVisits,
                postsCount: Array.isArray(posts) ? posts.length : 0,
                totalXp: Math.max(xpRaw, nextGamify.xp || 0),
                level: lvl,
                wheelSpent: spent,
              }),
            );
          }
        } catch {
          if (!cancelled) setGamify(computeGamificationFromVisits([]));
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [authUser, profileMe]),
  );

  useEffect(() => {
    if (!spinning) {
      glowPulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [spinning, glowPulse]);

  useEffect(() => {
    if (!resultModal) {
      modalPop.setValue(0);
      return undefined;
    }
    Animated.spring(modalPop, {
      toValue: 1,
      friction: 6,
      tension: 120,
      useNativeDriver: true,
    }).start();
    return undefined;
  }, [resultModal, modalPop]);

  const spinRotate = rotAnim.interpolate({
    inputRange: [0, 1e6],
    outputRange: ['0deg', '1000000deg'],
  });

  const goPage = useCallback((i) => {
    setPagerPage(i);
    pagerRef.current?.setPage(i);
    softVibrate(8);
  }, []);

  const selectTier = useCallback((cost) => {
    setSelectedTier(cost);
    softVibrate(10);
  }, []);

  const runSpin = useCallback(() => {
    if (spinning || selectedTier == null) return;
    const cost = selectedTier;
    if (balance < cost) return;

    softVibrate([0, 20, 40, 20]);
    Animated.sequence([
      Animated.timing(spinBtnScale, { toValue: 0.94, duration: 90, useNativeDriver: true }),
      Animated.spring(spinBtnScale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
    ]).start();

    const win = Math.random() < 0.5;
    const winPool = [0, 2, 4, 6];
    const losePool = [1, 3, 5, 7];
    const pool = win ? winPool : losePool;
    const target = pool[Math.floor(Math.random() * pool.length)];

    const spins = 6 + Math.floor(Math.random() * 2);
    const sector = 360 / SECTORS;
    const midT = -90 + target * sector + sector / 2;
    const align = -90 - midT;
    const newTotal = lastTotalDeg.current + spins * 360 + align;

    setSpinning(true);
    setResultKey(null);

    Animated.timing(rotAnim, {
      toValue: newTotal,
      duration: 4600,
      easing: Easing.bezier(0.15, 0.75, 0.15, 1),
      useNativeDriver: true,
    }).start(() => {
      lastTotalDeg.current = newTotal;
      softVibrate(win ? [0, 30, 50, 30, 50, 40] : 25);
      void (async () => {
        const nextSpent = await addQuizWheelSpentXp(cost);
        setWheelSpent(nextSpent);
      })();
      setResultWin(win);
      setResultKey(pickPrizeKey(cost, win));
      setResultModal(true);
      setSpinning(false);
    });
  }, [spinning, selectedTier, balance, rotAnim, spinBtnScale]);

  const bottomPad = lightTabBarScrollContentPadding(insets.bottom, 28);
  const loseFill = isLight ? 'rgba(30,30,30,0.08)' : 'rgba(255,255,255,0.1)';
  const canSpin = !spinning && selectedTier != null && balance >= selectedTier;
  const brushW = Math.round(SCREEN_W * 0.46);
  const brushH = 148;
  const soonLabel = pf(language, 'hubPhotoSoon');

  const stats = [
    {
      icon: 'location',
      value: String(gamify.uniquePlaces || 0),
      label: pf(language, 'hubChipPlaces'),
    },
    {
      icon: 'star',
      value: String(balance),
      label: pf(language, 'hubChipXp'),
    },
    {
      icon: 'heart',
      value: String(achievementsCount),
      label: pf(language, 'hubChipAchievements'),
    },
  ];

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        hideSendButton
      />

      <View style={styles.pageDots}>
        {[0, 1].map((i) => (
          <Pressable
            key={i}
            onPress={() => goPage(i)}
            hitSlop={10}
            style={[
              styles.pageDot,
              {
                backgroundColor: pagerPage === i ? accent : isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.2)',
                width: pagerPage === i ? 22 : 8,
              },
            ]}
          />
        ))}
      </View>

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={(e) => setPagerPage(e.nativeEvent.position)}
      >
        {/* —— PAGE 1: LEVEL —— */}
        <View key="level" style={styles.page}>
          <ScrollView
            contentContainerStyle={{ paddingTop: 4, paddingHorizontal: PAGE_PAD, paddingBottom: bottomPad }}
            showsVerticalScrollIndicator={false}
          >
            <DualTitle
              lead={pf(language, 'hubLevelLead')}
              script={pf(language, 'hubLevelScript')}
              textColor={textMain}
              scriptColor={accent}
            />
            <Text style={[styles.pageSub, brandFontSans, { color: textMuted }]}>
              {pf(language, 'hubLevelIntro')}
            </Text>

            <SoftCard isLight={isLight} style={styles.userCard}>
              <View style={styles.userRow}>
                <View style={styles.avatarWrap}>
                  <View style={[styles.avatarRing, { borderColor: accent }]}>
                    {avatarUrl ? (
                      <ExpoImage
                        source={{ uri: avatarUrl }}
                        style={styles.avatarImg}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={120}
                      />
                    ) : (
                      <View style={[styles.avatarImg, styles.avatarFallback, { backgroundColor: accentWash }]}>
                        <Text style={[styles.avatarInitial, brandFontSansBold, { color: accent }]}>
                          {displayName.slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={[styles.crownBadge, { backgroundColor: accent, borderColor: isLight ? '#FFFFFF' : '#000000' }]}>
                    <Ionicons name="ribbon" size={12} color={onAccent} />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.userName, brandFontSansSemibold, { color: textMain }]} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <Text style={[styles.userRank, brandFontSans, { color: textMuted }]} numberOfLines={1}>
                    {pf(language, 'hubRankLevelLine')
                      .replace('{rank}', rankTitle)
                      .replace('{n}', String(level))}
                  </Text>
                  <View style={[styles.progressTrack, { backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)' }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.round(progressInLevel * 100)}%`, backgroundColor: accent },
                      ]}
                    />
                  </View>
                  <Text style={[styles.progressLabel, brandFontSans, { color: textMuted }]}>
                    {xpInLevel} / {xpSpan} XP
                  </Text>
                </View>
              </View>
            </SoftCard>

            <View style={styles.statRow}>
              {stats.map((s) => (
                <SoftCard key={s.label} isLight={isLight} style={styles.statCard}>
                  <View style={[styles.statIcon, { backgroundColor: accentWash }]}>
                    <Ionicons name={s.icon} size={16} color={accent} />
                  </View>
                  <Text style={[styles.statValue, brandFontSansBold, { color: textMain }]}>{s.value}</Text>
                  <Text style={[styles.statLabel, brandFontSans, { color: textMuted }]} numberOfLines={1}>
                    {s.label}
                  </Text>
                </SoftCard>
              ))}
            </View>

            <Pressable onPress={() => goPage(1)} style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}>
              <LinearGradient
                colors={
                  isLight
                    ? ['rgba(2,18,235,0.92)', 'rgba(2,18,235,0.55)']
                    : ['rgba(225,255,0,0.95)', 'rgba(225,255,0,0.55)']
                }
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.promoCard}
              >
                <View style={styles.promoLeft}>
                  <Text style={[styles.promoTitle, brandFontSansSemibold, { color: onAccent }]}>
                    {nextLevelXp != null
                      ? pf(language, 'hubXpToNext').replace('{n}', String(remainXp))
                      : pf(language, 'hubXpMaxLevel')}
                  </Text>
                  <View style={[styles.promoArrow, { backgroundColor: isLight ? '#FFFFFF' : '#121212' }]}>
                    <Ionicons name="arrow-forward" size={18} color={accent} />
                  </View>
                </View>
                <View style={styles.promoBrushWrap} pointerEvents="none">
                  <LandmarkQuizBrushHero
                    source={HUB_PHOTO_SLOTS.levelUpLandmark}
                    width={brushW}
                    height={brushH}
                    isLight={isLight}
                  />
                </View>
              </LinearGradient>
            </Pressable>

            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, brandFontSansSemibold, { color: textMain }]}>
                {pf(language, 'hubRecentAchievements')}
              </Text>
              <Pressable
                hitSlop={8}
                style={styles.seeAllBtn}
                onPress={() => navigation.navigate('ProfileAchievements', { appTheme })}
              >
                <Text style={[styles.seeAll, brandFontSansSemibold, { color: textMuted }]}>
                  {pf(language, 'hubSeeAll')}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={textMuted} />
              </Pressable>
            </View>
            {achievements.unlocked.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.achRow}>
                {achievements.unlocked.slice(-3).reverse().map((a) => (
                  <SoftCard key={a.id} isLight={isLight} style={styles.achCard}>
                    <View style={[styles.achIcon, { backgroundColor: accentWash }]}>
                      <Ionicons name={a.icon} size={22} color={accent} />
                    </View>
                    <Text style={[styles.achLabel, brandFontSans, { color: textMuted }]} numberOfLines={1}>
                      {pf(language, a.titleKey)}
                    </Text>
                    <Text style={[styles.achXp, brandFontSansSemibold, { color: accent }]}>
                      {pf(language, 'hubAchXpBadge').replace('{n}', String(a.xp))}
                    </Text>
                  </SoftCard>
                ))}
              </ScrollView>
            ) : (
              <SoftCard isLight={isLight} style={styles.achEmpty}>
                <Text style={[styles.achEmptyText, brandFontSans, { color: textMuted }]}>
                  {pf(language, 'hubAchEmptyUnlocked')}
                </Text>
              </SoftCard>
            )}

            {achievements.locked.length ? (
              <>
                <View style={[styles.sectionHead, { marginTop: 8 }]}>
                  <Text style={[styles.sectionTitle, brandFontSansSemibold, { color: textMain }]}>
                    {pf(language, 'hubCanStillAchieve')}
                  </Text>
                  <Pressable
                    hitSlop={8}
                    style={styles.seeAllBtn}
                    onPress={() => navigation.navigate('ProfileAchievements', { appTheme })}
                  >
                    <Text style={[styles.seeAll, brandFontSansSemibold, { color: textMuted }]}>
                      {pf(language, 'hubSeeAll')}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={textMuted} />
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.achRow}>
                  {achievements.locked.slice(0, 4).map((a) => (
                    <Pressable
                      key={a.id}
                      onPress={() => navigation.navigate('ProfileAchievements', { appTheme })}
                    >
                      <SoftCard isLight={isLight} style={[styles.achCard, styles.achCardLocked]}>
                        <View
                          style={[
                            styles.achIcon,
                            { backgroundColor: isLight ? '#F2F2F2' : 'rgba(255,255,255,0.06)' },
                          ]}
                        >
                          <Ionicons name="lock-closed-outline" size={20} color={textMuted} />
                        </View>
                        <Text style={[styles.achLabel, brandFontSans, { color: textMain }]} numberOfLines={1}>
                          {pf(language, a.titleKey)}
                        </Text>
                        <Text style={[styles.achHintMini, brandFontSans, { color: textMuted }]} numberOfLines={2}>
                          {pf(language, a.hintKey)}
                        </Text>
                        <Text style={[styles.achXp, brandFontSansSemibold, { color: accent }]}>
                          {pf(language, 'hubAchXpBadge').replace('{n}', String(a.xp))}
                        </Text>
                        <View
                          style={[
                            styles.achProgTrack,
                            { backgroundColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)' },
                          ]}
                        >
                          <View
                            style={[
                              styles.achProgFill,
                              { width: `${Math.round(a.ratio * 100)}%`, backgroundColor: accent },
                            ]}
                          />
                        </View>
                      </SoftCard>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}

            <Text style={[styles.sectionTitle, brandFontSansSemibold, { color: textMain, marginTop: 22 }]}>
              {pf(language, 'hubWheelTitle')}
            </Text>

            <View style={styles.wheelStage}>
              <AnimatedView
                pointerEvents="none"
                style={[
                  styles.wheelGlow,
                  {
                    backgroundColor: accent,
                    opacity: glowPulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [spinning ? 0.22 : 0.1, spinning ? 0.45 : 0.18],
                    }),
                  },
                ]}
              />
              <View style={styles.wheelClip}>
                <AnimatedView style={{ transform: [{ rotate: spinRotate }] }}>
                  <Svg width={WHEEL} height={WHEEL}>
                    <Defs>
                      <SvgLinearGradient id="hubWinA" x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0" stopColor={accent} stopOpacity="0.95" />
                        <Stop offset="1" stopColor={isLight ? '#6B7CFF' : '#F8FFB0'} stopOpacity="0.7" />
                      </SvgLinearGradient>
                      <SvgLinearGradient id="hubWinB" x1="1" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={isLight ? ACCENT_BLUE : ACCENT_LEMON} stopOpacity="0.85" />
                        <Stop offset="1" stopColor={isLight ? '#3D4FFF' : '#D4F200'} stopOpacity="0.55" />
                      </SvgLinearGradient>
                    </Defs>
                    <G>
                      {Array.from({ length: SECTORS }, (_, i) => {
                        const a0 = -90 + i * (360 / SECTORS);
                        const a1 = -90 + (i + 1) * (360 / SECTORS);
                        const win = i % 2 === 0;
                        return (
                          <Path
                            key={i}
                            d={wedgePath(CX, CY, R, a0, a1)}
                            fill={win ? (i % 4 === 0 ? 'url(#hubWinA)' : 'url(#hubWinB)') : loseFill}
                            stroke={isLight ? '#F2F2EA' : 'rgba(0,0,0,0.35)'}
                            strokeWidth={1.5}
                          />
                        );
                      })}
                    </G>
                    {Array.from({ length: SECTORS }, (_, i) => {
                      const mid = -90 + i * (360 / SECTORS) + 360 / SECTORS / 2;
                      const ir = R * 0.62;
                      const x = CX + ir * Math.cos(degToRad(mid));
                      const y = CY + ir * Math.sin(degToRad(mid));
                      return (
                        <Circle
                          key={`ic-${i}`}
                          cx={x}
                          cy={y}
                          r={11}
                          fill={isLight ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.25)'}
                        />
                      );
                    })}
                    <Circle cx={CX} cy={CY} r={46} fill={isLight ? '#FFFFFF' : '#141418'} />
                    <Circle cx={CX} cy={CY} r={44} stroke={accent} strokeWidth={2} fill="none" />
                  </Svg>
                </AnimatedView>
              </View>

              <AnimatedView style={[styles.spinFabWrap, { transform: [{ scale: spinBtnScale }] }]}>
                <Pressable
                  onPress={runSpin}
                  disabled={!canSpin}
                  style={({ pressed }) => [
                    styles.spinFab,
                    {
                      backgroundColor: accent,
                      opacity: !canSpin || pressed ? 0.55 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={pf(language, 'hubSpinCta')}
                >
                  <Ionicons name="sparkles" size={14} color={onAccent} style={{ marginRight: 6 }} />
                  <Text style={[styles.spinFabText, brandFontSansBold, { color: onAccent }]}>
                    {spinning
                      ? pf(language, 'hubSpinning')
                      : balance < (selectedTier || 0)
                        ? pf(language, 'hubSpinFor').replace('{n}', String(selectedTier))
                        : pf(language, 'hubSpinCta')}
                  </Text>
                </Pressable>
              </AnimatedView>
            </View>

            <Text style={[styles.tierMiniHint, brandFontSans, { color: textMuted }]}>
              {pf(language, 'hubSpinFor').replace('{n}', String(selectedTier || 200))} · {pf(language, 'hubFiftyFifty')}
            </Text>
          </ScrollView>
        </View>

        {/* —— PAGE 2: PARTNER REWARDS —— */}
        <View key="rewards" style={styles.page}>
          <ScrollView
            contentContainerStyle={{ paddingTop: 4, paddingHorizontal: PAGE_PAD, paddingBottom: bottomPad }}
            showsVerticalScrollIndicator={false}
          >
            <DualTitle
              lead={pf(language, 'hubRewardsLead')}
              script={pf(language, 'hubRewardsScript')}
              textColor={textMain}
              scriptColor={accent}
            />
            <Text style={[styles.pageSub, brandFontSans, { color: textMuted }]}>
              {pf(language, 'hubRewardsIntro')}
            </Text>

            <SoftCard isLight={isLight} style={styles.balanceCard}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.balanceLabel, brandFontSans, { color: textMuted }]}>
                  {pf(language, 'hubWallet')}
                </Text>
                <Text style={[styles.balanceXp, brandFontSansBold, { color: accent }]}>{balance} XP</Text>
              </View>
              <View style={styles.giftSlot}>
                {HUB_PHOTO_SLOTS.giftBox ? (
                  <ExpoImage
                    source={HUB_PHOTO_SLOTS.giftBox}
                    style={styles.giftImg}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <View style={[styles.giftPlaceholder, { backgroundColor: accentWash }]}>
                    <Ionicons name="gift" size={48} color={accent} />
                    <Text style={[styles.photoPlaceholderLabel, brandFontSans, { color: textMuted }]}>
                      {soonLabel}
                    </Text>
                  </View>
                )}
              </View>
            </SoftCard>

            <Text style={[styles.sectionTitle, brandFontSansSemibold, { color: textMain, marginTop: 22 }]}>
              {pf(language, 'hubPickTier')}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tierScroll}>
              {TIERS.map((t) => {
                const on = selectedTier === t.cost;
                const canAfford = balance >= t.cost;
                return (
                  <Pressable
                    key={t.cost}
                    onPress={() => selectTier(t.cost)}
                    style={[
                      styles.tierCard,
                      isLight ? styles.softCardLight : styles.softCardDark,
                      on && { borderColor: accent, backgroundColor: accentWashStrong },
                      !canAfford && styles.tierCardLocked,
                    ]}
                  >
                    {canAfford ? (
                      <View style={[styles.tierAvailPill, { backgroundColor: accent }]}>
                        <Text style={[styles.tierAvailText, brandFontSansSemibold, { color: onAccent }]}>
                          {pf(language, 'hubTierAvailable')}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.tierLock}>
                        <Ionicons name="lock-closed" size={14} color={textMuted} />
                      </View>
                    )}
                    <Ionicons name={t.icon} size={22} color={on ? accent : textMuted} />
                    <Text style={[styles.tierName, brandFontSansSemibold, { color: textMain }]}>
                      {pf(language, t.labelKey)}
                    </Text>
                    <Text style={[styles.tierCost, brandFontSansBold, { color: on ? accent : textMuted }]}>
                      {t.cost} XP
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.sectionTitle, brandFontSansSemibold, { color: textMain, marginTop: 22 }]}>
              {pf(language, 'hubPopularRewards')}
            </Text>
            {popularRewards.map((r) => {
              const locked = balance < r.cost;
              return (
                <SoftCard key={r.id} isLight={isLight} style={styles.rewardRow}>
                  <View style={styles.rewardThumb}>
                    <PhotoSlot
                      source={r.photo}
                      style={styles.rewardThumbImg}
                      label={soonLabel}
                      isLight={isLight}
                    />
                    {!r.photo ? (
                      <View style={styles.rewardThumbIcon}>
                        <Ionicons name={r.icon} size={20} color={accent} />
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rewardPartner, brandFontSansSemibold, { color: textMain }]} numberOfLines={1}>
                      {pf(language, r.partnerKey)}
                    </Text>
                    <Text style={[styles.rewardTitle, brandFontSans, { color: textMuted }]} numberOfLines={1}>
                      {pf(language, r.titleKey)}
                    </Text>
                    <Text style={[styles.rewardCost, brandFontSansSemibold, { color: accent }]}>
                      {r.cost} XP
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      selectTier(r.cost);
                      if (!locked) {
                        goPage(0);
                        softVibrate(12);
                      }
                    }}
                    style={[styles.rewardCta, { backgroundColor: accent, opacity: locked ? 0.4 : 1 }]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="chevron-forward" size={20} color={onAccent} />
                  </Pressable>
                </SoftCard>
              );
            })}

            <Text style={[styles.sectionTitle, brandFontSansSemibold, { color: textMain, marginTop: 22 }]}>
              {pf(language, 'hubHowTitle')}
            </Text>
            <SoftCard isLight={isLight} style={styles.howCard}>
              <View style={styles.howRow}>
                {[
                  { icon: 'compass-outline', key: 'hubHowExplore' },
                  { icon: 'star-outline', key: 'hubHowEarn' },
                  { icon: 'gift-outline', key: 'hubHowSpend' },
                ].map((step, idx) => (
                  <React.Fragment key={step.key}>
                    <View style={styles.howStep}>
                      <View style={[styles.howIcon, { backgroundColor: accentWash }]}>
                        <Ionicons name={step.icon} size={20} color={accent} />
                      </View>
                      <Text style={[styles.howLabel, brandFontSans, { color: textMuted }]}>
                        {pf(language, step.key)}
                      </Text>
                    </View>
                    {idx < 2 ? <View style={[styles.howDots, { borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)' }]} /> : null}
                  </React.Fragment>
                ))}
              </View>
            </SoftCard>

            <Text style={[styles.proto, brandFontSans, { color: textMuted }]}>
              {pf(language, 'hubPrototypeNote')}
            </Text>
          </ScrollView>
        </View>
      </PagerView>

      <Modal visible={resultModal} transparent animationType="fade" onRequestClose={() => setResultModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setResultModal(false)}>
          <ConfettiBurst visible={resultModal && resultWin} isLight={isLight} />
          <AnimatedView
            style={[
              styles.modalCard,
              {
                backgroundColor: isLight ? '#FFFFFF' : '#1A1A1A',
                borderColor: resultWin ? accent : cardBorder,
                opacity: modalPop,
                transform: [
                  {
                    scale: modalPop.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }),
                  },
                ],
              },
            ]}
          >
            <View
              style={[
                styles.modalHalo,
                {
                  backgroundColor: resultWin
                    ? accentWashStrong
                    : isLight
                      ? 'rgba(0,0,0,0.05)'
                      : 'rgba(255,255,255,0.06)',
                },
              ]}
            >
              <Ionicons name={resultWin ? 'trophy' : 'refresh'} size={34} color={resultWin ? accent : textMuted} />
            </View>
            <Text style={[styles.modalTitle, { color: textMain }, brandFontHeadMedium]}>
              {resultWin ? pf(language, 'hubResultWin') : pf(language, 'hubResultLose')}
            </Text>
            <Text style={[styles.modalBody, { color: textMuted }, brandFontSans]}>
              {resultKey ? pf(language, resultKey) : ''}
            </Text>
            <Pressable onPress={() => setResultModal(false)} style={[styles.modalBtn, { backgroundColor: accent }]}>
              <Text style={[styles.modalBtnText, { color: onAccent }, brandFontSansSemibold]}>
                {pf(language, 'hubResultClose')}
              </Text>
            </Pressable>
          </AnimatedView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pager: { flex: 1 },
  page: { flex: 1 },
  pageDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: 6,
    paddingBottom: 6,
  },
  pageDot: {
    height: 8,
    borderRadius: 4,
  },
  dualTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  dualLead: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.3,
  },
  dualScript: {
    fontSize: 36,
    lineHeight: 40,
    marginBottom: -2,
    transform: [{ rotate: '-1.5deg' }],
  },
  pageSub: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  softCard: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  softCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0,0,0,0.09)',
  },
  softCardDark: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  userCard: {
    padding: 16,
    marginBottom: 12,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 14,
  },
  avatarWrap: {
    width: 72,
    height: 72,
  },
  avatarRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    overflow: 'hidden',
    backgroundColor: '#EEE',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 28,
  },
  crownBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  userName: {
    fontSize: 18,
    marginBottom: 2,
  },
  userRank: {
    fontSize: 13,
    marginBottom: 10,
  },
  progressTrack: {
    height: 6,
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 99,
  },
  progressLabel: {
    fontSize: 12,
    marginTop: 6,
  },
  statRow: {
    flexDirection: 'row',
    columnGap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 18,
    lineHeight: 22,
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  promoCard: {
    borderRadius: 26,
    minHeight: 148,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  promoLeft: {
    flex: 1,
    paddingLeft: 18,
    paddingVertical: 18,
    paddingRight: 8,
    zIndex: 2,
  },
  promoTitle: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 14,
    maxWidth: 160,
  },
  promoArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoBrushWrap: {
    position: 'absolute',
    right: -8,
    top: 0,
    bottom: 0,
    width: '52%',
    justifyContent: 'center',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    marginBottom: 12,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  seeAll: {
    fontSize: 13,
  },
  achRow: {
    columnGap: 10,
    paddingRight: 8,
  },
  achCard: {
    width: 124,
    padding: 14,
    alignItems: 'flex-start',
  },
  achCardLocked: {
    opacity: 0.95,
  },
  achEmpty: {
    padding: 16,
    marginBottom: 4,
  },
  achEmptyText: {
    fontSize: 13,
    lineHeight: 18,
  },
  achIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  achLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  achHintMini: {
    fontSize: 11,
    lineHeight: 14,
    marginBottom: 6,
    minHeight: 28,
  },
  achXp: {
    fontSize: 13,
  },
  achProgTrack: {
    width: '100%',
    height: 3,
    borderRadius: 99,
    overflow: 'hidden',
    marginTop: 8,
  },
  achProgFill: {
    height: '100%',
    borderRadius: 99,
  },
  wheelStage: {
    alignItems: 'center',
    marginTop: 4,
    height: WHEEL * 0.58 + 36,
    overflow: 'visible',
  },
  wheelGlow: {
    position: 'absolute',
    width: WHEEL * 0.7,
    height: WHEEL * 0.35,
    borderRadius: WHEEL,
    top: 24,
  },
  wheelClip: {
    width: WHEEL,
    height: WHEEL * 0.55,
    overflow: 'hidden',
    alignItems: 'center',
  },
  spinFabWrap: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
    zIndex: 4,
  },
  spinFab: {
    minWidth: 148,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#0212EB',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  spinFabText: {
    fontSize: 16,
  },
  tierMiniHint: {
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 10,
    opacity: 0.85,
  },
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingVertical: 8,
    minHeight: 132,
  },
  balanceLabel: {
    fontSize: 14,
    marginBottom: 6,
  },
  balanceXp: {
    fontSize: 40,
    lineHeight: 46,
    textShadowColor: 'rgba(0,0,0,0.08)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  giftSlot: {
    width: 140,
    height: 124,
    marginRight: 8,
  },
  giftImg: {
    width: '100%',
    height: '100%',
  },
  giftPlaceholder: {
    flex: 1,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierScroll: {
    columnGap: 10,
    paddingRight: 8,
    paddingBottom: 4,
  },
  tierCard: {
    width: 108,
    minHeight: 128,
    borderRadius: 22,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  tierCardLocked: {
    opacity: 0.55,
  },
  tierAvailPill: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tierAvailText: {
    fontSize: 9,
  },
  tierLock: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  tierName: {
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  tierCost: {
    fontSize: 12,
    marginTop: 4,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    columnGap: 12,
    marginBottom: 10,
  },
  rewardThumb: {
    width: 56,
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F2F2F2',
  },
  rewardThumbImg: {
    width: '100%',
    height: '100%',
  },
  rewardThumbIcon: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardPartner: {
    fontSize: 15,
    marginBottom: 2,
  },
  rewardTitle: {
    fontSize: 13,
    marginBottom: 4,
  },
  rewardCost: {
    fontSize: 13,
  },
  rewardCta: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howCard: {
    paddingVertical: 18,
    paddingHorizontal: 10,
  },
  howRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  howStep: {
    flex: 1,
    alignItems: 'center',
  },
  howIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  howLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  howDots: {
    width: 28,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    marginBottom: 22,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderLight: {
    backgroundColor: '#F2F2F2',
  },
  photoPlaceholderDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  photoPlaceholderLabel: {
    fontSize: 10,
    marginTop: 4,
  },
  proto: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 18,
    textAlign: 'center',
    opacity: 0.85,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.58)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 26,
    padding: 24,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
    borderWidth: 1.5,
    alignItems: 'center',
    overflow: 'hidden',
  },
  modalHalo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 22, textAlign: 'center', marginBottom: 10 },
  modalBody: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 18 },
  modalBtn: {
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minWidth: 140,
    alignItems: 'center',
  },
  modalBtnText: { fontSize: 15 },
});
