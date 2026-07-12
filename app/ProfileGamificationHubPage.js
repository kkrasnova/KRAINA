import React, { useCallback, useMemo, useRef, useState } from 'react';
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
} from 'react-native';
import PagerView from 'react-native-pager-view';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
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
import { getLandmarkQuizBonusXpTotal } from './landmarkQuizRewards';
import { getPhysicalVisitBonusXpTotal } from './physicalVisitRewards';
import ProfileGameLevelCard from './ProfileGameLevelCard';
import { brandFontSans, brandFontSansSemibold, brandFontHeadMedium } from './brandFont';

const { width: SCREEN_W } = Dimensions.get('window');
const WHEEL = Math.min(280, SCREEN_W - 48);
const CX = WHEEL / 2;
const CY = WHEEL / 2;
const R = WHEEL / 2 - 8;
const SECTORS = 8;

function degToRad(d) {
  return (d * Math.PI) / 180;
}

/** Сектор від центру: кут у градусах від осі X (0 — праворуч), за годинниковою — як у Math.cos/sin. */
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

const AnimatedView = Animated.createAnimatedComponent(View);

export default function ProfileGamificationHubPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const { appTheme, isLight } = useAppTheme(route?.params?.appTheme, route);
  const [gamify, setGamify] = useState(() => computeGamificationFromVisits([]));
  const [pagerPage, setPagerPage] = useState(0);
  const [selectedTier, setSelectedTier] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [sessionSpent, setSessionSpent] = useState(0);
  const [resultKey, setResultKey] = useState(null);
  const [resultWin, setResultWin] = useState(false);
  const [resultModal, setResultModal] = useState(false);

  const accessToken = useAuthStore((s) => s.accessToken);
  const profileMe = useAuthStore((s) => s.profileMe?.profile);

  const rotAnim = useRef(new Animated.Value(0)).current;
  const lastTotalDeg = useRef(0);

  const accent = accentForTheme(isLight);
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#5C5C5C' : '#9A9A9A';
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const cardBg = isLight ? 'rgba(2, 18, 235, 0.06)' : 'rgba(255,255,255,0.07)';
  const cardBorder = isLight ? 'rgba(2, 18, 235, 0.12)' : 'rgba(255,255,255,0.12)';

  const serverLevel =
    accessToken && profileMe?.level != null && Number.isFinite(Number(profileMe.level))
      ? clampDisplayLevel(profileMe.level)
      : null;
  const serverXpRaw =
    accessToken && profileMe?.xp_points != null && Number.isFinite(Number(profileMe.xp_points))
      ? Math.round(Number(profileMe.xp_points))
      : null;

  const baseXpWallet = useMemo(() => {
    if (serverXpRaw != null) return serverXpRaw;
    return Math.max(0, Math.round(Number(gamify?.xp) || 0));
  }, [serverXpRaw, gamify?.xp]);

  const balance = Math.max(0, baseXpWallet - sessionSpent);

  const ownServerGamify =
    serverLevel != null
      ? {
          level: serverLevel,
          xp: serverXpRaw != null ? serverXpRaw : undefined,
        }
      : null;

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
          const [visitLog, quizBonusXp, physicalBonusXp] = await Promise.all([
            getVisitLog({ physicalOnly: true }),
            getLandmarkQuizBonusXpTotal(),
            getPhysicalVisitBonusXpTotal(),
          ]);
          if (!cancelled) setGamify(computeGamificationFromVisits(visitLog, quizBonusXp + physicalBonusXp));
        } catch {
          if (!cancelled) setGamify(computeGamificationFromVisits([]));
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const spinRotate = rotAnim.interpolate({
    inputRange: [0, 1e6],
    outputRange: ['0deg', '1000000deg'],
  });

  const runSpin = useCallback(() => {
    if (spinning || selectedTier == null) return;
    const cost = selectedTier;
    if (balance < cost) return;

    const win = Math.random() < 0.5;
    const winPool = [0, 2, 4, 6];
    const losePool = [1, 3, 5, 7];
    const pool = win ? winPool : losePool;
    const target = pool[Math.floor(Math.random() * pool.length)];

    const spins = 5 + Math.floor(Math.random() * 2);
    const sector = 360 / SECTORS;
    const midT = -90 + target * sector + sector / 2;
    const align = -90 - midT;
    const newTotal = lastTotalDeg.current + spins * 360 + align;

    setSpinning(true);
    setResultKey(null);

    Animated.timing(rotAnim, {
      toValue: newTotal,
      duration: 4200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      lastTotalDeg.current = newTotal;
      setSessionSpent((s) => s + cost);
      const prizeKey = pickPrizeKey(cost, win);
      setResultWin(win);
      setResultKey(prizeKey);
      setResultModal(true);
      setSpinning(false);
    });
  }, [spinning, selectedTier, balance, rotAnim]);

  const bottomPad = lightTabBarScrollContentPadding(insets.bottom, 20);

  const loseFill = isLight ? 'rgba(100, 100, 100, 0.2)' : 'rgba(255,255,255,0.12)';

  const tierRow = (cost, labelKey, descKey) => {
    const on = selectedTier === cost;
    return (
      <Pressable
        key={cost}
        onPress={() => setSelectedTier(cost)}
        style={({ pressed }) => [
          styles.tierCard,
          {
            borderColor: on ? accent : cardBorder,
            backgroundColor: on ? (isLight ? 'rgba(2,18,235,0.1)' : 'rgba(225,255,0,0.08)') : cardBg,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <Text style={[styles.tierCost, { color: accent }, brandFontSansSemibold]}>{cost} XP</Text>
        <Text style={[styles.tierLabel, { color: textMain }, brandFontSansSemibold]}>{pf(language, labelKey)}</Text>
        <Text style={[styles.tierDesc, { color: textMuted }, brandFontSans]}>{pf(language, descKey)}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        replaceCenterTitle={pf(language, 'hubTitle')}
        hideSendButton
      />

      <View style={[styles.dotsWrap, { paddingTop: 10 }]}>
        <View style={styles.dotsRow}>
          {[0, 1].map((i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    pagerPage === i ? accent : isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)',
                },
              ]}
            />
          ))}
        </View>
        <Text style={[styles.swipeHint, { color: textMuted }, brandFontSans]}>{pf(language, 'hubSwipeHint')}</Text>
      </View>

      <PagerView
        style={styles.pager}
        initialPage={0}
        onPageSelected={(e) => setPagerPage(e.nativeEvent.position)}
      >
        <View key="0" style={styles.page}>
          <ScrollView
            contentContainerStyle={{
              paddingTop: 8,
              paddingHorizontal: 20,
              paddingBottom: bottomPad,
            }}
            showsVerticalScrollIndicator={false}
          >
            <LinearGradient
              colors={
                isLight
                  ? ['rgba(2,18,235,0.12)', 'rgba(2,18,235,0.02)', 'transparent']
                  : ['rgba(225,255,0,0.14)', 'rgba(255,255,255,0.04)', 'transparent']
              }
              style={styles.heroGrad}
            >
              <Text style={[styles.pageTitle, { color: textMain }, brandFontHeadMedium]}>
                {pf(language, 'hubPageLevel')}
              </Text>
              <Text style={[styles.pageSub, { color: textMuted }, brandFontSans]}>{pf(language, 'hubLevelIntro')}</Text>
            </LinearGradient>

            {ownServerGamify ? (
              <ProfileGameLevelCard
                serverMode={ownServerGamify}
                language={language}
                isLight={isLight}
                accent={accent}
              />
            ) : (
              <ProfileGameLevelCard
                snapshot={gamify}
                language={language}
                isLight={isLight}
                accent={accent}
              />
            )}

            <View style={[styles.factsCard, { borderColor: cardBorder, backgroundColor: cardBg }]}>
              <Text style={[styles.factsTitle, { color: textMain }, brandFontSansSemibold]}>
                {pf(language, 'hubVisitsFacts')}
              </Text>
              <Text style={[styles.factsLine, { color: textMuted }, brandFontSans]}>
                {pf(language, 'gamifySubtitle')
                  .replace('{u}', String(gamify.uniquePlaces))
                  .replace('{t}', String(gamify.totalVisits))
                  .replace('{xp}', String(gamify.xp))}
              </Text>
            </View>
          </ScrollView>
        </View>

        <View key="1" style={styles.page}>
          <ScrollView
            contentContainerStyle={{
              paddingTop: 8,
              paddingHorizontal: 20,
              paddingBottom: bottomPad,
            }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.pageTitle, { color: textMain }, brandFontHeadMedium]}>
              {pf(language, 'hubPageRewards')}
            </Text>
            <Text style={[styles.pageSub, { color: textMuted }, brandFontSans]}>{pf(language, 'hubRewardsIntro')}</Text>

            <View style={[styles.walletRow, { borderColor: cardBorder, backgroundColor: cardBg }]}>
              <Ionicons name="sparkles-outline" size={22} color={accent} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.walletLabel, { color: textMuted }, brandFontSans]}>{pf(language, 'hubWallet')}</Text>
                <Text style={[styles.walletVal, { color: textMain }, brandFontSansSemibold]}>{balance} XP</Text>
                <Text style={[styles.walletNote, { color: textMuted }, brandFontSans]}>{pf(language, 'hubWalletNote')}</Text>
              </View>
            </View>

            <Text style={[styles.sectionLabel, { color: textMuted }, brandFontSansSemibold]}>
              {pf(language, 'hubPickTier')}
            </Text>
            {tierRow(200, 'hubTierMini', 'hubTierMiniDesc')}
            {tierRow(500, 'hubTierMid', 'hubTierMidDesc')}
            {tierRow(3000, 'hubTierBig', 'hubTierBigDesc')}

            <Text style={[styles.sectionLabel, { color: textMuted, marginTop: 22 }, brandFontSansSemibold]}>
              {pf(language, 'hubWheelTitle')}
            </Text>
            <Text style={[styles.wheelHint, { color: textMuted }, brandFontSans]}>{pf(language, 'hubWheelHint')}</Text>

            <View style={styles.wheelWrap}>
              <View style={[styles.pointer, { borderBottomColor: accent }]} />
              <AnimatedView style={[styles.wheelDisk, { transform: [{ rotate: spinRotate }] }]}>
                <Svg width={WHEEL} height={WHEEL}>
                  <Defs>
                    <SvgLinearGradient id="hubWin" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor={isLight ? ACCENT_BLUE : ACCENT_LEMON} stopOpacity={isLight ? 0.95 : 0.5} />
                      <Stop offset="1" stopColor={isLight ? '#5A6CFF' : '#F5FF99'} stopOpacity={isLight ? 0.75 : 0.35} />
                    </SvgLinearGradient>
                  </Defs>
                  {Array.from({ length: SECTORS }, (_, i) => {
                    const a0 = -90 + i * (360 / SECTORS);
                    const a1 = -90 + (i + 1) * (360 / SECTORS);
                    const win = i % 2 === 0;
                    return (
                      <Path
                        key={i}
                        d={wedgePath(CX, CY, R, a0, a1)}
                        fill={win ? 'url(#hubWin)' : loseFill}
                        stroke={isLight ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.35)'}
                        strokeWidth={1}
                      />
                    );
                  })}
                  <Circle cx={CX} cy={CY} r={28} fill={isLight ? '#FFFFFF' : '#1E1E1E'} opacity={0.95} />
                  <Circle cx={CX} cy={CY} r={26} stroke={accent} strokeWidth={2} fill="none" />
                </Svg>
              </AnimatedView>
            </View>

            <Text style={[styles.fifty, { color: accent }, brandFontSansSemibold]}>{pf(language, 'hubFiftyFifty')}</Text>

            <Pressable
              onPress={runSpin}
              disabled={spinning || selectedTier == null || balance < (selectedTier || 0)}
              style={({ pressed }) => [
                styles.spinBtn,
                {
                  backgroundColor: accent,
                  opacity:
                    pressed || spinning || selectedTier == null || balance < (selectedTier || 0) ? 0.55 : 1,
                },
              ]}
            >
              <Text style={[styles.spinBtnText, { color: onAccentButtonText(isLight) }, brandFontSansSemibold]}>
                {spinning
                  ? pf(language, 'hubSpinning')
                  : selectedTier == null
                    ? pf(language, 'hubSpinPickTier')
                    : pf(language, 'hubSpinFor').replace('{n}', String(selectedTier))}
              </Text>
            </Pressable>

            <Text style={[styles.proto, { color: textMuted }, brandFontSans]}>{pf(language, 'hubPrototypeNote')}</Text>
          </ScrollView>
        </View>
      </PagerView>

      <Modal visible={resultModal} transparent animationType="fade" onRequestClose={() => setResultModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setResultModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: isLight ? '#FFFFFF' : '#1A1A1A' }]} onPress={() => {}}>
            <Text style={[styles.modalEmoji]} allowFontScaling={false}>
              {resultWin ? '✨' : '🎲'}
            </Text>
            <Text style={[styles.modalTitle, { color: textMain }, brandFontHeadMedium]}>
              {resultWin ? pf(language, 'hubResultWin') : pf(language, 'hubResultLose')}
            </Text>
            <Text style={[styles.modalBody, { color: textMuted }, brandFontSans]}>
              {resultKey ? pf(language, resultKey) : ''}
            </Text>
            <Pressable
              onPress={() => setResultModal(false)}
              style={[styles.modalBtn, { backgroundColor: accent }]}
            >
              <Text style={[styles.modalBtnText, { color: onAccentButtonText(isLight) }, brandFontSansSemibold]}>
                {pf(language, 'hubResultClose')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pager: { flex: 1 },
  page: { flex: 1 },
  dotsWrap: { alignItems: 'center', paddingHorizontal: 20 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  swipeHint: { fontSize: 12, marginTop: 8, textAlign: 'center' },
  heroGrad: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 8,
  },
  pageTitle: { fontSize: 22, marginBottom: 6 },
  pageSub: { fontSize: 14, lineHeight: 20, marginBottom: 4 },
  sectionLabel: { fontSize: 13, marginTop: 16, marginBottom: 10, letterSpacing: 0.3 },
  tierCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 10,
  },
  tierCost: { fontSize: 18, marginBottom: 4 },
  tierLabel: { fontSize: 16 },
  tierDesc: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginTop: 14,
    marginBottom: 6,
  },
  walletLabel: { fontSize: 12 },
  walletVal: { fontSize: 15, marginTop: 2 },
  walletNote: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  wheelHint: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  wheelWrap: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
    width: WHEEL,
    height: WHEEL + 24,
    alignItems: 'center',
  },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 14,
    borderRightWidth: 14,
    borderBottomWidth: 22,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginBottom: -2,
    zIndex: 2,
  },
  wheelDisk: {
    width: WHEEL,
    height: WHEEL,
    borderRadius: WHEEL / 2,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  fifty: { textAlign: 'center', fontSize: 13, marginTop: 4 },
  spinBtn: {
    marginTop: 18,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  spinBtnText: { fontSize: 16 },
  proto: { fontSize: 11, lineHeight: 16, marginTop: 16, textAlign: 'center', opacity: 0.85 },
  factsCard: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  factsTitle: { fontSize: 15, marginBottom: 8 },
  factsLine: { fontSize: 14, lineHeight: 20 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 22,
    padding: 24,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  modalEmoji: { fontSize: 40, textAlign: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 20, textAlign: 'center', marginBottom: 10 },
  modalBody: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 20 },
  modalBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  modalBtnText: { fontSize: 16 },
});
