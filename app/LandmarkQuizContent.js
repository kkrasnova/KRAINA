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
import { getAppTheme, resolveAppTheme } from './themeStorage';
import { ACCENT_BLUE, accentForTheme } from './themeAccent';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { brandFontHeadMedium, brandFontSans } from './brandFont';
import { pickI18n } from './i18nBundle';
import { lq } from './landmarkQuizI18n';
import { resolveCorrectOptionIndex, resolveLandmarkQuizXpWin, hasPlayableStoryQuiz } from './landmarkQuizUtils';
import { applyLandmarkQuizReward, getLandmarkQuizClaimedReward } from './landmarkQuizRewards';
import { loadLandmarkQuizAnswer, saveLandmarkQuizAnswer } from './landmarkQuizAnswers';
import LandmarkGlassHeaderBar, { landmarkGlassHeaderDockStyle } from './LandmarkGlassHeaderBar';

const FIGMA_CREAM = '#F2F2EA';
const IS_ANDROID = Platform.OS === 'android';
const ANDROID_TEXT = IS_ANDROID ? { includeFontPadding: false } : null;

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
      <Text
        style={[
          styles.continueBtnText,
          brandFontSans,
          ANDROID_TEXT,
          { color: isLight ? '#FFFFFF' : '#1A1A1A' },
        ]}
      >
        {label}
      </Text>
      <Ionicons name="arrow-forward" size={16} color={isLight ? '#FFFFFF' : '#1A1A1A'} />
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
  const [appTheme, setAppTheme] = useState(resolveAppTheme(route?.params?.appTheme));
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
    if (storyQuiz._questionI18n) {
      return String(pickI18n(language, storyQuiz._questionI18n) || '').trim();
    }
    const q = langUk ? storyQuiz.questionUk : storyQuiz.questionEn;
    return String(q || storyQuiz.questionUk || storyQuiz.questionEn || '').trim();
  }, [storyQuiz, langUk, language]);

  const options = useMemo(() => {
    if (!storyQuiz?.options) return [];
    if (Array.isArray(storyQuiz._optionsI18n) && storyQuiz._optionsI18n.length > 0) {
      return storyQuiz._optionsI18n.map((o) => String(pickI18n(language, o.text) || '').trim());
    }
    return storyQuiz.options.map((o) => {
      const t = langUk ? o?.textUk : o?.textEn;
      return String(t || o?.textUk || o?.textEn || '').trim();
    });
  }, [storyQuiz, langUk, language]);

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
      : isLight
        ? '#EB4335'
        : '#FF8A82'
    : isLight
      ? '#5A5A5A'
      : '#B6B6B6';

  const questionChipBg = revealed
    ? selectedIndex === correctIdx
      ? isLight
        ? 'rgba(2, 18, 235, 0.08)'
        : 'rgba(225, 255, 0, 0.14)'
      : isLight
        ? 'rgba(235, 67, 53, 0.10)'
        : 'rgba(235, 67, 53, 0.18)'
    : isLight
      ? 'rgba(2, 18, 235, 0.08)'
      : 'rgba(225, 255, 0, 0.14)';

  const cardBorderColor = isLight ? 'rgba(30,30,30,0.08)' : 'rgba(255,255,255,0.10)';
  const cardBg = isLight ? '#FFFFFF' : inlineMode ? 'rgba(255,255,255,0.04)' : '#151D2B';
  const optionSurface = isLight ? '#F4F5FA' : 'rgba(255,255,255,0.05)';
  const optionRevealedNeutralBg = isLight ? 'rgba(30,30,30,0.04)' : 'rgba(255,255,255,0.03)';
  const optionCorrectBg = isLight ? 'rgba(46, 160, 67, 0.12)' : 'rgba(72, 199, 116, 0.14)';
  const optionWrongBg = isLight ? 'rgba(235, 67, 53, 0.08)' : 'rgba(235, 67, 53, 0.14)';
  const successBg = isLight ? 'rgba(46, 160, 67, 0.12)' : 'rgba(72, 199, 116, 0.10)';
  const errorBg = isLight ? 'rgba(235, 67, 53, 0.11)' : 'rgba(235, 67, 53, 0.10)';
  const wonAnswer = revealed && selectedIndex === correctIdx;
  const resultCardBorderColor = wonAnswer
    ? isLight
      ? cardBorderColor
      : 'rgba(72, 199, 116, 0.28)'
    : isLight
      ? cardBorderColor
      : 'rgba(235, 67, 53, 0.28)';
  const resultCardAccentColor = wonAnswer
    ? isLight
      ? accent
      : '#48C774'
    : isLight
      ? '#EB4335'
      : '#FF8A82';
  const feedbackPanelBg = 'transparent';
  const feedbackPanelFg = isLight ? '#2A2A2A' : FIGMA_CREAM;
  const feedbackHintColor = isLight ? textMuted : 'rgba(196,196,188,0.88)';
  const feedbackPanelBorder = 'transparent';
  const optTailCoreBorder = isLight ? 'rgba(120,120,120,0.9)' : 'rgba(255,255,255,0.28)';
  const optionMutedText = isLight ? textMuted : 'rgba(242,242,234,0.42)';

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
        hint = storyQuiz?._multiHintI18n
          ? String(pickI18n(language, storyQuiz._multiHintI18n) || '').trim()
          : String((langUk ? storyQuiz?.multiHintUk : storyQuiz?.multiHintEn) || '').trim();
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
                backgroundColor: isLight ? 'rgba(255,255,255,0.82)' : 'rgba(21,29,43,0.94)',
                borderColor: isLight ? 'rgba(2,18,235,0.14)' : 'rgba(255,255,255,0.10)',
              },
        ]}
      >
      <View
        style={[
          styles.quizCard,
          inlineMode && !isLight ? styles.quizCardInlineDark : null,
          inlineMode && isLight ? styles.quizCardInlineLight : null,
          { backgroundColor: cardBg, borderColor: cardBorderColor },
        ]}
      >
        <View style={styles.questionHeadRow}>
          <Text
            style={[
              styles.questionChip,
              IS_ANDROID ? styles.questionChipAndroid : null,
              brandFontSans,
              ANDROID_TEXT,
              {
                color: questionChipColor,
                backgroundColor: questionChipBg,
              },
            ]}
          >
            {questionChipText}
          </Text>
          {!inlineMode ? (
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
          ) : null}
        </View>
        <Text
          style={[
            styles.question,
            inlineMode ? styles.questionInline : null,
            IS_ANDROID ? styles.questionAndroid : null,
            brandFontSans,
            ANDROID_TEXT,
            { color: textMain },
          ]}
        >
          {question}
        </Text>
        {!revealed ? (
          <Text style={[styles.hintLine, brandFontSans, ANDROID_TEXT, { color: textMuted }]}>
            {lq(language, 'chooseOptionHint')}
          </Text>
        ) : null}
      </View>

      {optionIndices.map((i) => {
        const isSel = selectedIndex === i;
        const isCor = revealed && i === correctIdx;
        const isWrongSel = revealed && isSel && i !== correctIdx;
        const isMuted = revealed && !isCor && !isWrongSel;
        const neutralBorder = isLight ? 'rgba(30,30,30,0.18)' : 'rgba(255,255,255,0.14)';
        const borderCol = revealed
          ? isCor
            ? isLight
              ? accent
              : '#48C774'
            : isWrongSel
              ? '#EB4335'
              : isLight
                ? neutralBorder
                : 'rgba(255,255,255,0.10)'
          : isSel
            ? accent
            : neutralBorder;
        const bgCol =
          revealed && isCor
            ? optionCorrectBg
            : revealed && isWrongSel
              ? optionWrongBg
              : revealed
                ? optionRevealedNeutralBg
                : optionSurface;
        const prefixBg =
          revealed && isCor
            ? isLight
              ? 'rgba(46, 160, 67, 0.12)'
              : 'rgba(72, 199, 116, 0.18)'
            : revealed && isWrongSel
              ? isLight
                ? 'rgba(235, 67, 53, 0.10)'
                : 'rgba(235, 67, 53, 0.18)'
              : isSel && !revealed
                ? isLight
                  ? 'rgba(2, 18, 235, 0.08)'
                  : 'rgba(225, 255, 0, 0.12)'
                : isLight
                  ? 'transparent'
                  : 'rgba(255,255,255,0.05)';
        const tailBg =
          revealed && isCor
            ? isLight
              ? 'rgba(46, 160, 67, 0.12)'
              : 'rgba(72, 199, 116, 0.22)'
            : revealed && isWrongSel
              ? isLight
                ? 'rgba(235, 67, 53, 0.10)'
                : 'rgba(235, 67, 53, 0.22)'
              : 'transparent';
        const optTextColor = isMuted ? optionMutedText : textMain;
        const prefixTextColor = isMuted ? optionMutedText : textMain;
        const optBorderWidth = isSel && !revealed ? 2 : 1.5;
        return (
          <Pressable
            key={i}
            disabled={revealed}
            onPress={() => void submitAnswer(i)}
            style={({ pressed }) => [
              styles.opt,
              inlineMode ? styles.optInline : null,
              IS_ANDROID ? styles.optAndroid : null,
              IS_ANDROID && isLight ? styles.optAndroidElevLight : null,
              IS_ANDROID && !isLight ? styles.optAndroidElevDark : null,
              IS_ANDROID && isSel && !revealed && isLight ? styles.optAndroidSelectedLight : null,
              IS_ANDROID && isSel && !revealed && !isLight ? styles.optAndroidSelectedDark : null,
              !IS_ANDROID && isLight ? styles.optLightShadow : null,
              !IS_ANDROID && !inlineMode ? styles.optDarkShadow : null,
              !IS_ANDROID && isSel && !revealed ? styles.optSelected : null,
              !IS_ANDROID && isSel && !revealed && !isLight ? styles.optSelectedDark : null,
              {
                borderColor: borderCol,
                borderWidth: IS_ANDROID ? optBorderWidth : 1.5,
                backgroundColor: IS_ANDROID ? bgCol : 'transparent',
                opacity: isMuted ? 0.72 : 1,
                transform: [{ scale: pressed ? 0.992 : 1 }],
              },
            ]}
            android_ripple={ripple}
          >
            <View
              style={[
                styles.optInner,
                inlineMode ? styles.optInnerInline : null,
                IS_ANDROID ? styles.optInnerAndroidFlat : null,
                !IS_ANDROID ? { backgroundColor: bgCol } : null,
              ]}
            >
              <View style={styles.optLeft}>
                <View
                  style={[
                    styles.optPrefixBadge,
                    isSel && !revealed ? styles.optPrefixBadgeSelected : null,
                    {
                      borderColor: borderCol,
                      backgroundColor: prefixBg,
                    },
                  ]}
                >
                  <Text
                    style={[styles.optPrefixText, brandFontSans, ANDROID_TEXT, { color: prefixTextColor }]}
                  >
                    {prefix(i)}
                  </Text>
                </View>
                <Text style={[styles.optText, brandFontSans, ANDROID_TEXT, { color: optTextColor }]}>
                  {options[i]}
                </Text>
              </View>
              <View
                style={[
                  styles.optTailBadge,
                  {
                    borderColor: revealed && (isCor || isWrongSel) ? 'transparent' : borderCol,
                    backgroundColor: tailBg,
                  },
                ]}
              >
                {revealed && isCor ? (
                  <Ionicons name="checkmark" size={14} color={isLight ? accent : '#48C774'} />
                ) : null}
                {revealed && isWrongSel ? <Ionicons name="close" size={14} color="#EB4335" /> : null}
                {!revealed ? (
                  <View
                    style={[
                      styles.optTailCore,
                      { borderColor: isSel ? accent : optTailCoreBorder },
                      isSel ? { backgroundColor: accent } : null,
                    ]}
                  />
                ) : null}
              </View>
            </View>
          </Pressable>
        );
      })}

      {revealed ? (
        <View
          style={[
            styles.resultCard,
            inlineMode && !isLight ? styles.resultCardInlineDark : null,
            IS_ANDROID ? styles.resultCardAndroid : null,
            {
              backgroundColor: wonAnswer ? successBg : errorBg,
              borderColor: resultCardBorderColor,
              borderLeftColor: resultCardAccentColor,
            },
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
              <View style={styles.feedbackTitleRow}>
                <View
                  style={[
                    styles.feedbackIconWrap,
                    {
                      backgroundColor: wonAnswer
                        ? isLight
                          ? 'rgba(46, 160, 67, 0.14)'
                          : 'rgba(72, 199, 116, 0.18)'
                        : isLight
                          ? 'rgba(235, 67, 53, 0.12)'
                          : 'rgba(235, 67, 53, 0.18)',
                    },
                  ]}
                >
                  <Ionicons
                    name={wonAnswer ? 'checkmark-circle' : 'close-circle'}
                    size={16}
                    color={resultCardAccentColor}
                  />
                </View>
                <Text style={[styles.feedbackLabel, brandFontHeadMedium, ANDROID_TEXT, { color: feedbackPanelFg }]}>
                  {wonAnswer ? lq(language, 'feedbackLike') : lq(language, 'feedbackDislike')}
                </Text>
              </View>
              {wonAnswer && rewardXp > 0 ? (
                <Text style={[styles.rewardLine, brandFontSans, ANDROID_TEXT, { color: accent, paddingLeft: 34 }]}>
                  {lq(language, 'pointsLine', { n: rewardXp })}
                </Text>
              ) : null}
              {wonAnswer && rewardAlready ? (
                <Text style={[styles.feedbackHint, brandFontSans, ANDROID_TEXT, { color: feedbackHintColor }]}>
                  {lq(language, 'pointsAlready')}
                </Text>
              ) : null}
              {wonAnswer && explanationText ? (
                <Text style={[styles.feedbackHint, brandFontSans, ANDROID_TEXT, { color: feedbackHintColor }]}>
                  {explanationText}
                </Text>
              ) : null}
              {!wonAnswer && answerHint ? (
                <Text style={[styles.feedbackHint, brandFontSans, ANDROID_TEXT, { color: feedbackHintColor }]}>
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
      android: { elevation: 3, overflow: 'hidden' },
    }),
  },
  quizCardInlineDark: {
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    shadowOpacity: 0,
    ...Platform.select({
      ios: { elevation: 0 },
      android: { elevation: 2, overflow: 'hidden' },
    }),
  },
  quizCardInlineLight: {
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    ...Platform.select({
      android: { elevation: 2, overflow: 'hidden' },
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
    marginBottom: 6,
  },
  questionChip: {
    alignSelf: 'flex-start',
    fontSize: 11,
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 0,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  questionChipAndroid: {
    fontSize: 12,
    lineHeight: 15,
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
    fontSize: 17,
    lineHeight: 23,
    marginBottom: 6,
  },
  questionAndroid: {
    lineHeight: 24,
    marginBottom: 8,
  },
  questionInline: {
    fontSize: 17,
    lineHeight: 23,
    letterSpacing: 0,
  },
  hintLine: {
    fontSize: 12,
    lineHeight: 16,
  },
  opt: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 0,
    paddingHorizontal: 0,
    marginBottom: 8,
    overflow: 'hidden',
  },
  optAndroid: {
    overflow: 'hidden',
  },
  optAndroidElevLight: {
    elevation: 2,
  },
  optAndroidElevDark: {
    elevation: 3,
  },
  optAndroidSelectedLight: {
    elevation: 4,
  },
  optAndroidSelectedDark: {
    elevation: 5,
  },
  optInline: {
    marginBottom: Platform.OS === 'android' ? 10 : 6,
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
  optDarkShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  optInner: {
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optInnerAndroidFlat: {
    backgroundColor: 'transparent',
  },
  optInnerInline: {
    minHeight: Platform.OS === 'android' ? 48 : 44,
    paddingVertical: Platform.OS === 'android' ? 8 : 6,
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
  optSelectedDark: {
    ...Platform.select({
      ios: {
        shadowColor: '#E1FF00',
        shadowOpacity: 0.24,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  optLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    columnGap: 8,
  },
  optPrefixBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optPrefixBadgeSelected: {
    borderWidth: 1.5,
  },
  optPrefixText: {
    fontSize: 13,
  },
  optText: { flex: 1, fontSize: 15, lineHeight: 20 },
  optTailBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  optTailCore: {
    width: 10,
    height: 10,
    borderRadius: 3,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
    transform: [{ rotate: '45deg' }],
  },
  resultCard: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 2,
    marginBottom: 8,
  },
  resultCardAndroid: {
    elevation: 1,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 10,
    paddingVertical: 12,
  },
  resultCardInlineDark: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  feedbackRow: {
    alignItems: 'stretch',
  },
  feedbackTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    marginBottom: 0,
  },
  feedbackIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackPanel: {
    width: '100%',
    flexDirection: 'column',
    alignItems: 'flex-start',
    rowGap: 4,
  },
  feedbackLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 19,
    textAlign: 'left',
  },
  rewardLine: {
    fontSize: 13,
    lineHeight: 18,
  },
  feedbackHint: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'left',
    marginTop: 2,
    paddingLeft: 34,
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
    marginTop: 6,
    marginBottom: 2,
    minHeight: Platform.OS === 'android' ? 48 : 44,
    borderRadius: 999,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.14,
        shadowRadius: 8,
      },
      android: { elevation: 4, overflow: 'hidden' },
    }),
  },
  continueBtnLight: {
    backgroundColor: ACCENT_BLUE,
  },
  continueBtnDark: {
    backgroundColor: '#E1FF00',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    ...Platform.select({
      ios: {
        shadowColor: '#E1FF00',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 12,
      },
      android: { elevation: 5 },
    }),
  },
  continueBtnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  continueBtnInline: {
    marginBottom: 8,
  },
  continueBtnText: {
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: 0.1,
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
