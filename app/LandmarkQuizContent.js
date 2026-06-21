import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  PanResponder,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSyncedAppLanguage } from './useAppLanguage';
import { getAppTheme } from './themeStorage';
import { ACCENT_BLUE, accentForTheme } from './themeAccent';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { brandFontHeadMedium, brandFontSans } from './brandFont';
import { lq } from './landmarkQuizI18n';
import { resolveCorrectOptionIndex, resolveLandmarkQuizXpWin, hasPlayableStoryQuiz } from './landmarkQuizUtils';
import { applyLandmarkQuizReward, getLandmarkQuizClaimedReward } from './landmarkQuizRewards';
import { loadLandmarkQuizAnswer, saveLandmarkQuizAnswer } from './landmarkQuizAnswers';
import LandmarkGlassHeaderBar, { landmarkGlassHeaderDockStyle } from './LandmarkGlassHeaderBar';

const FIGMA_CREAM = '#F2F2EA';

function QuizContinueButton({ onPress, label, isLight, ripple, inline }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.continueBtn,
        inline ? styles.continueBtnInline : null,
        isLight ? styles.continueBtnLight : styles.continueBtnDark,
        pressed ? styles.continueBtnPressed : null,
      ]}
      android_ripple={ripple}
      accessibilityRole="button"
    >
      <Text style={[styles.continueBtnText, brandFontSans, { color: isLight ? '#FFFFFF' : '#1A1A1A' }]}>
        {label}
      </Text>
      <Ionicons name="arrow-forward" size={18} color={isLight ? '#FFFFFF' : '#1A1A1A'} />
    </Pressable>
  );
}

/**
 * Тіло вікторини: окремий екран (`LandmarkQuizPage`) або друга сторінка пейджера в `LandmarkResultPage`.
 */
export default function LandmarkQuizContent({
  navigation,
  route,
  /** У пейджері: без PanResponder, щоб не конфліктувати з горизонтальним свайпом */
  pagerMode = false,
  /** Спільний glass header у батька */
  hideHeader = false,
  /** Вбудований режим у ScrollView сторінки опису (без власного fullscreen-скролу). */
  inlineMode = false,
  /** Після відповіді — перейти до наступної сторінки пейджера. */
  onContinue,
  /** Після відповіді — прокрутити батьківський ScrollView. */
  onAfterReveal,
}) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  const storyQuiz = route?.params?.storyQuiz;
  const headerTitle = typeof route?.params?.headerTitle === 'string' ? route.params.headerTitle.trim() : '';
  const quizLandmarkKey = typeof route?.params?.quizLandmarkKey === 'string' ? route.params.quizLandmarkKey.trim() : '';
  const rewardEnabled = route?.params?.rewardEnabled === true;

  const [selectedIndex, setSelectedIndex] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [rewardXp, setRewardXp] = useState(0);
  const [rewardAlready, setRewardAlready] = useState(false);
  const [rewardBurstVisible, setRewardBurstVisible] = useState(false);
  const [answerHint, setAnswerHint] = useState('');

  const selectedRef = useRef(null);
  const revealedRef = useRef(false);
  const rewardBurst = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    selectedRef.current = selectedIndex;
  }, [selectedIndex]);
  useEffect(() => {
    revealedRef.current = revealed;
  }, [revealed]);

  useEffect(() => {
    let c = false;
    (async () => {
      const t = await getAppTheme();
      if (!c) setAppTheme(t === 'light' ? 'light' : 'dark');
    })();
    return () => {
      c = true;
    };
  }, []);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const bg = isLight ? '#F2F2F2' : '#000000';
  const textMain = isLight ? '#1E1E1E' : FIGMA_CREAM;
  const textMuted = isLight ? '#5C5C5C' : '#A8A8A8';

  const quizXpWin = useMemo(() => resolveLandmarkQuizXpWin(storyQuiz), [storyQuiz]);

  const correctIdx = useMemo(() => resolveCorrectOptionIndex(storyQuiz), [storyQuiz]);

  const question = useMemo(() => {
    if (!storyQuiz) return '';
    const q = langUk ? storyQuiz.questionUk : storyQuiz.questionEn;
    return String(q || storyQuiz.questionUk || storyQuiz.questionEn || '').trim();
  }, [storyQuiz, langUk]);

  const options = useMemo(() => {
    if (!storyQuiz?.options) return [];
    return storyQuiz.options.map((o) => {
      const t = langUk ? o?.textUk : o?.textEn;
      return String(t || o?.textUk || o?.textEn || '').trim();
    });
  }, [storyQuiz, langUk]);

  const optionIndices = useMemo(() => options.map((_, i) => i), [options]);

  const onResetRound = useCallback(() => {
    setSelectedIndex(null);
    setRevealed(false);
    setRewardXp(0);
    setRewardAlready(false);
    setAnswerHint('');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!quizLandmarkKey) {
        onResetRound();
        return;
      }
      const saved = await loadLandmarkQuizAnswer(quizLandmarkKey);
      if (cancelled) return;
      if (saved?.revealed && Number.isInteger(saved.selectedIndex)) {
        setSelectedIndex(saved.selectedIndex);
        selectedRef.current = saved.selectedIndex;
        setRevealed(true);
        revealedRef.current = true;
        setRewardXp(saved.rewardXp || 0);
        setRewardAlready(!!saved.rewardAlready);
        setAnswerHint(saved.answerHint || '');
        onAfterReveal?.();
        return;
      }
      onResetRound();
    })();
    return () => {
      cancelled = true;
    };
  }, [quizLandmarkKey, onResetRound, onAfterReveal]);

  const playRewardBurst = useCallback(
    (xp) => {
      if (!(xp > 0)) return;
      setRewardBurstVisible(true);
      rewardBurst.setValue(0);
      Animated.sequence([
        Animated.spring(rewardBurst, {
          toValue: 1,
          friction: 6,
          tension: 130,
          useNativeDriver: true,
        }),
        Animated.delay(1500),
        Animated.timing(rewardBurst, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setRewardBurstVisible(false);
      });
    },
    [rewardBurst],
  );

  const prefix = (i) => {
    if (langUk) {
      const alphabet = ['А', 'Б', 'В', 'Г', 'Д', 'Е'];
      return alphabet[i] || String(i + 1);
    }
    return String.fromCharCode(65 + i);
  };

  const correctOptionText = useMemo(() => {
    if (!Number.isInteger(correctIdx)) return '';
    return String(options[correctIdx] || '').trim();
  }, [correctIdx, options]);

  const questionChipText = revealed
    ? selectedIndex === correctIdx
      ? lq(language, 'correct')
      : lq(language, 'wrong')
    : lq(language, 'guessTitle');

  const questionChipColor = revealed
    ? selectedIndex === correctIdx
      ? accent
      : '#EB4335'
    : isLight
      ? '#5A5A5A'
      : '#B6B6B6';

  const cardBorderColor = isLight ? 'rgba(30,30,30,0.08)' : 'rgba(255,255,255,0.12)';
  const cardBg = isLight ? '#FFFFFF' : '#101010';
  const optionSurface = isLight ? '#F4F5FA' : '#F4F5FA';
  const successBg = isLight ? 'rgba(46, 160, 67, 0.12)' : 'rgba(100, 255, 138, 0.16)';
  const errorBg = isLight ? 'rgba(235, 67, 53, 0.11)' : 'rgba(235, 67, 53, 0.16)';
  const wonAnswer = revealed && selectedIndex === correctIdx;
  const feedbackPanelBg = 'transparent';
  const feedbackPanelFg = isLight ? '#2A2A2A' : '#E2E2DB';
  const feedbackPanelBorder = 'transparent';

  const explanationText = useMemo(() => {
    if (!storyQuiz) return '';
    const t = langUk ? storyQuiz.explanationUk : storyQuiz.explanationEn;
    return String(t || storyQuiz.explanationUk || storyQuiz.explanationEn || '').trim();
  }, [storyQuiz, langUk]);

  const submitAnswer = useCallback(
    async (index) => {
      if (revealedRef.current) return;
      setSelectedIndex(index);
      selectedRef.current = index;
      setRevealed(true);
      revealedRef.current = true;
      const won = index === correctIdx;
      let xpShown = 0;
      let already = false;
      let hint = '';
      if (rewardEnabled && won) {
        const { already: wasClaimed, xp } = await applyLandmarkQuizReward(quizLandmarkKey, won, quizXpWin);
        already = !!wasClaimed;
        if (!already && xp > 0) {
          xpShown = xp;
          playRewardBurst(xp);
        } else if (already) {
          const claimed = await getLandmarkQuizClaimedReward(quizLandmarkKey);
          if (claimed?.xp) xpShown = claimed.xp;
        }
        setRewardAlready(already);
        setRewardXp(xpShown);
      } else {
        setRewardAlready(false);
        setRewardXp(0);
      }
      if (won) {
        hint = '';
        setAnswerHint('');
      } else {
        hint = String((langUk ? storyQuiz?.multiHintUk : storyQuiz?.multiHintEn) || '').trim();
        setAnswerHint(hint);
      }
      if (quizLandmarkKey) {
        await saveLandmarkQuizAnswer(quizLandmarkKey, {
          selectedIndex: index,
          revealed: true,
          won,
          rewardXp: xpShown,
          rewardAlready: already,
          answerHint: hint,
        });
      }
      onAfterReveal?.();
    },
    [correctIdx, quizLandmarkKey, storyQuiz, langUk, rewardEnabled, quizXpWin, playRewardBurst, onAfterReveal],
  );

  const tryReveal = useCallback(async () => {
    const sel = selectedRef.current;
    if (sel == null || revealedRef.current) return;
    await submitAnswer(sel);
  }, [submitAnswer]);

  const panResponder = useMemo(() => {
    if (pagerMode || inlineMode) return null;
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 || Math.abs(g.dy) > 14,
      onPanResponderRelease: (_, g) => {
        const { dx, dy, vx, vy } = g;
        const back = vx < -0.32 || dx < -56 || vy < -0.32 || dy < -56;
        const forward = vx > 0.32 || dx > 56 || vy > 0.32 || dy > 56;
        if (back) {
          navigation?.goBack?.();
          return;
        }
        if (forward) void tryReveal();
      },
    });
  }, [pagerMode, navigation, tryReveal]);

  const panHandlers = panResponder?.panHandlers ?? {};

  if (!hasPlayableStoryQuiz(storyQuiz)) {
    return <View style={[styles.screen, { backgroundColor: bg, paddingTop: insets.top }]} />;
  }

  const swipeHintText = pagerMode ? lq(language, 'swipeHintPager') : lq(language, 'swipeHint');

  const quizBody = (
    <>
      <View
        style={[
          styles.quizStage,
          inlineMode
            ? styles.quizStageInlineFlat
            : {
                backgroundColor: isLight ? 'rgba(255,255,255,0.82)' : 'rgba(14,14,14,0.92)',
                borderColor: isLight ? 'rgba(2,18,235,0.14)' : 'rgba(225,255,0,0.18)',
              },
        ]}
      >
      <View style={[styles.quizCard, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>
        <View style={styles.questionHeadRow}>
          <Text
            style={[
              styles.questionChip,
              brandFontSans,
              {
                color: questionChipColor,
                backgroundColor: isLight ? 'rgba(2, 18, 235, 0.08)' : 'rgba(225, 255, 0, 0.14)',
              },
            ]}
          >
            {questionChipText}
          </Text>
          <View style={styles.questionHeadAccentQuotes}>
            <Text
              style={[
                styles.questionHeadAccentQuote,
                { color: isLight ? 'rgba(2, 18, 235, 0.34)' : 'rgba(225, 255, 0, 0.4)' },
              ]}
            >
              ’
            </Text>
            <Text
              style={[
                styles.questionHeadAccentQuote,
                styles.questionHeadAccentQuoteSecond,
                { color: isLight ? 'rgba(2, 18, 235, 0.24)' : 'rgba(225, 255, 0, 0.3)' },
              ]}
            >
              ’
            </Text>
          </View>
        </View>
        <Text style={[styles.question, brandFontSans, { color: textMain }]}>{question}</Text>
        {!revealed ? (
          <Text style={[styles.hintLine, brandFontSans, { color: textMuted }]}>{lq(language, 'chooseOptionHint')}</Text>
        ) : null}
      </View>

      {optionIndices.map((i) => {
        const isSel = selectedIndex === i;
        const isCor = revealed && i === correctIdx;
        const isWrongSel = revealed && isSel && i !== correctIdx;
        const neutralBorder = isLight ? 'rgba(30,30,30,0.18)' : 'rgba(255,255,255,0.28)';
        const borderCol = revealed
          ? isCor
            ? accent
            : isWrongSel
              ? '#EB4335'
              : neutralBorder
          : isSel
            ? accent
            : neutralBorder;
        const bgCol =
          revealed && isCor
            ? isLight
              ? 'rgba(46, 160, 67, 0.12)'
              : 'rgba(100, 255, 138, 0.14)'
            : revealed && isWrongSel
              ? isLight
                ? 'rgba(235, 67, 53, 0.08)'
                : 'rgba(235, 67, 53, 0.12)'
              : optionSurface;
        return (
          <Pressable
            key={i}
            disabled={revealed}
            onPress={() => void submitAnswer(i)}
            style={({ pressed }) => [
              styles.opt,
              inlineMode ? styles.optInline : null,
              isLight ? styles.optLightShadow : null,
              isSel && !revealed ? styles.optSelected : null,
              { borderColor: borderCol, backgroundColor: 'transparent', transform: [{ scale: pressed ? 0.992 : 1 }] },
            ]}
            android_ripple={ripple}
          >
            <View style={[styles.optInner, inlineMode ? styles.optInnerInline : null, { backgroundColor: bgCol }]}>
              <View style={styles.optLeft}>
                <View
                  style={[
                    styles.optPrefixBadge,
                    isSel && !revealed ? styles.optPrefixBadgeSelected : null,
                    {
                      borderColor: borderCol,
                      backgroundColor: 'transparent',
                    },
                  ]}
                >
                  <Text style={[styles.optPrefixText, brandFontSans, { color: textMain }]}>{prefix(i)}</Text>
                </View>
                <Text style={[styles.optText, brandFontSans, { color: textMain }]}>{options[i]}</Text>
              </View>
              <View
                style={[
                  styles.optTailBadge,
                  {
                    borderColor: borderCol,
                    backgroundColor: 'transparent',
                  },
                ]}
              >
                {revealed && isCor ? (
                  <Ionicons name="checkmark" size={16} color={accent} />
                ) : null}
                {revealed && isWrongSel ? <Ionicons name="close" size={16} color="#EB4335" /> : null}
                {!revealed ? <View style={[styles.optTailCore, isSel ? styles.optTailCoreSelected : null]} /> : null}
              </View>
            </View>
          </Pressable>
        );
      })}

      {revealed ? (
        <View
          style={[
            styles.resultCard,
            { backgroundColor: wonAnswer ? successBg : errorBg, borderColor: cardBorderColor },
          ]}
        >
          <View style={styles.feedbackRow}>
            <View
              style={[
                styles.feedbackPanel,
                {
                  backgroundColor: feedbackPanelBg,
                  borderColor: feedbackPanelBorder,
                },
              ]}
            >
              <Text style={[styles.feedbackLabel, brandFontHeadMedium, { color: feedbackPanelFg }]}>
                {wonAnswer ? lq(language, 'feedbackLike') : lq(language, 'feedbackDislike')}
              </Text>
              {wonAnswer && rewardXp > 0 ? (
                <Text style={[styles.rewardLine, brandFontSans, { color: accent }]}>
                  {lq(language, 'pointsLine', { n: rewardXp })}
                </Text>
              ) : null}
              {wonAnswer && rewardAlready ? (
                <Text style={[styles.feedbackHint, brandFontSans, { color: textMuted }]}>
                  {lq(language, 'pointsAlready')}
                </Text>
              ) : null}
              {wonAnswer && explanationText ? (
                <Text style={[styles.feedbackHint, brandFontSans, { color: textMuted }]}>
                  {explanationText}
                </Text>
              ) : null}
              {!wonAnswer && answerHint ? (
                <Text style={[styles.feedbackHint, brandFontSans, { color: textMuted }]}>
                  {answerHint}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {revealed && typeof onContinue === 'function' ? (
        <QuizContinueButton
          onPress={onContinue}
          label={lq(language, 'continueNext')}
          isLight={isLight}
          ripple={ripple}
          inline={inlineMode}
        />
      ) : null}

      {!inlineMode ? (
        <Text style={[styles.swipeHint, brandFontSans, { color: textMuted }]}>{swipeHintText}</Text>
      ) : null}
      </View>
    </>
  );

  if (inlineMode) {
    return (
      <View style={styles.inlineWrap}>
        {rewardBurstVisible ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.rewardBurst,
              {
                opacity: rewardBurst,
                transform: [
                  {
                    scale: rewardBurst.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.7, 1],
                    }),
                  },
                  {
                    translateY: rewardBurst.interpolate({
                      inputRange: [0, 1],
                      outputRange: [18, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={[styles.rewardBurstInner, { borderColor: accent, backgroundColor: cardBg }]}>
              <Ionicons name="trophy" size={24} color={accent} />
              <Text style={[styles.rewardBurstText, brandFontHeadMedium, { color: accent }]}>
                {lq(language, 'pointsBurst', { n: rewardXp })}
              </Text>
            </View>
          </Animated.View>
        ) : null}
        <View style={styles.inlineInner}>{quizBody}</View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: bg }]} {...panHandlers}>
      {!hideHeader ? (
        <View
          pointerEvents="box-none"
          style={[landmarkGlassHeaderDockStyle, { paddingTop: insets.top + 10, paddingBottom: 8 }]}
        >
          <LandmarkGlassHeaderBar
            isLight={isLight}
            accent={accent}
            headerTitle={headerTitle || '—'}
            onBack={() => navigation?.goBack?.()}
            showMore={false}
          />
        </View>
      ) : null}
      <View style={styles.dotsRow}>
        {optionIndices.map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor:
                  selectedIndex === i ? accent : revealed && i === correctIdx ? accent : isLight ? '#ccc' : '#444',
                opacity: selectedIndex === i || (revealed && i === correctIdx) ? 1 : 0.45,
              },
            ]}
          />
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollInner, { paddingBottom: Math.max(insets.bottom, 28) }]}
        keyboardShouldPersistTaps="handled"
      >
        {quizBody}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inlineWrap: {
    marginTop: 0,
    position: 'relative',
  },
  inlineInner: {
    paddingHorizontal: 0,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 18,
  },
  dot: {
    width: 9,
    height: 8,
    borderRadius: 4,
  },
  scroll: { flex: 1 },
  scrollInner: { paddingHorizontal: 20 },
  quizCard: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 13,
      },
      android: { elevation: 3 },
    }),
  },
  quizStage: {
    borderWidth: 1,
    borderRadius: 26,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    marginBottom: 6,
  },
  quizStageInlineFlat: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    marginBottom: 0,
  },
  questionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  questionChip: {
    alignSelf: 'flex-start',
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 10,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  questionHeadAccentQuotes: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 38,
    minHeight: 24,
    justifyContent: 'flex-end',
    paddingRight: 0,
    paddingTop: 0,
  },
  questionHeadAccentQuote: {
    fontSize: 30,
    lineHeight: 22,
    letterSpacing: -0.2,
    marginLeft: 0,
    transform: [{ rotate: '-6deg' }],
    fontWeight: '500',
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0,0,0,0.06)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 1,
      },
      android: {
        includeFontPadding: false,
      },
    }),
  },
  questionHeadAccentQuoteSecond: {
    transform: [{ rotate: '-10deg' }],
    marginTop: -2,
    marginLeft: -1,
    opacity: 0.9,
  },
  question: {
    fontSize: 18,
    lineHeight: 25,
    marginBottom: 8,
  },
  hintLine: {
    fontSize: 13,
    lineHeight: 18,
  },
  opt: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 0,
    paddingHorizontal: 0,
    marginBottom: 10,
    overflow: 'hidden',
  },
  optInline: {
    marginBottom: 8,
  },
  optLightShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
      },
      android: { elevation: 1 },
    }),
  },
  optInner: {
    borderRadius: 14,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optInnerInline: {
    minHeight: 52,
    paddingVertical: 8,
  },
  optSelected: {
    borderWidth: 2,
    ...Platform.select({
      ios: {
        shadowColor: ACCENT_BLUE,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 9,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  optLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
    columnGap: 10,
  },
  optPrefixBadge: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optPrefixBadgeSelected: {
    borderWidth: 1.5,
  },
  optPrefixText: {
    fontSize: 14,
  },
  optText: { flex: 1, fontSize: 16, lineHeight: 22 },
  optTailBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  optTailCore: {
    width: 10,
    height: 10,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: 'rgba(120,120,120,0.9)',
    backgroundColor: 'transparent',
    transform: [{ rotate: '45deg' }],
  },
  optTailCoreSelected: {
    borderColor: ACCENT_BLUE,
    backgroundColor: ACCENT_BLUE,
  },
  resultCard: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 2,
    marginBottom: 8,
  },
  feedbackRow: {
    alignItems: 'stretch',
  },
  feedbackPanel: {
    width: '100%',
    flexDirection: 'column',
    alignItems: 'flex-start',
    rowGap: 8,
  },
  feedbackLabel: {
    fontSize: 17,
    lineHeight: 22,
    textAlign: 'left',
  },
  rewardLine: {
    fontSize: 14,
    lineHeight: 20,
  },
  feedbackHint: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'left',
  },
  explanationText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  xpLine: {
    textAlign: 'center',
    fontSize: 16,
    marginBottom: 14,
  },
  swipeHint: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 8,
  },
  continueBtn: {
    marginTop: 8,
    marginBottom: 2,
    minHeight: 52,
    borderRadius: 999,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.14,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  continueBtnLight: {
    backgroundColor: ACCENT_BLUE,
  },
  continueBtnDark: {
    backgroundColor: '#E1FF00',
  },
  continueBtnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  continueBtnInline: {
    marginBottom: 12,
  },
  continueBtnText: {
    fontSize: 16,
    lineHeight: 20,
  },
  rewardBurst: {
    position: 'absolute',
    top: '28%',
    left: 0,
    right: 0,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardBurstInner: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  rewardBurstText: {
    fontSize: 22,
    lineHeight: 26,
  },
});
