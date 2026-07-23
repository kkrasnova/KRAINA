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
import { useAppTheme } from './useAppTheme';
import { ACCENT_BLUE, accentForTheme } from './themeAccent';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { brandFontHeadMedium, brandFontSans } from './brandFont';
import { pickI18n } from './i18nBundle';
import { lq } from './landmarkQuizI18n';
import { resolveCorrectOptionIndex, resolveLandmarkQuizXpPerCorrect, getQuizQuestions, hasPlayableStoryQuiz } from './landmarkQuizUtils';
import { applyLandmarkQuizQuestionReward, getLandmarkQuizPendingXp } from './landmarkQuizRewards';
import { loadLandmarkQuizAnswer, saveLandmarkQuizAnswer } from './landmarkQuizAnswers';
import { formatQuizXpAsMoney } from './quizPointsCurrency';
import { LinearGradient } from 'expo-linear-gradient';
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
        pressed ? styles.continueBtnPressed : null,
      ]}
      android_ripple={ripple}
      accessibilityRole="button"
    >
      <LinearGradient
        colors={
          isLight
            ? ['rgba(2,18,235,0.92)', 'rgba(45,70,255,0.95)']
            : ['rgba(245,255,102,0.95)', 'rgba(225,255,0,0.92)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.continueBtnGrad}
      >
        <Text
          style={[
            styles.continueBtnText,
            brandFontSans,
            ANDROID_TEXT,
            { color: isLight ? '#FFFFFF' : '#121212' },
          ]}
        >
          {label}
        </Text>
        <Ionicons name="arrow-forward" size={15} color={isLight ? '#FFFFFF' : '#121212'} />
      </LinearGradient>
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
  const { isLight } = useAppTheme(route?.params?.appTheme, route);
  const storyQuiz = route?.params?.storyQuiz;
  const headerTitle = typeof route?.params?.headerTitle === 'string' ? route.params.headerTitle.trim() : '';
  const quizLandmarkKey = typeof route?.params?.quizLandmarkKey === 'string' ? route.params.quizLandmarkKey.trim() : '';
  const rewardEnabled = route?.params?.rewardEnabled !== false;

  const [selectedIndex, setSelectedIndex] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [rewardXp, setRewardXp] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [lastGainXp, setLastGainXp] = useState(0);
  const [qIndex, setQIndex] = useState(0);
  const [answersLog, setAnswersLog] = useState([]);
  const [rewardAlready, setRewardAlready] = useState(false);
  const [rewardBurstVisible, setRewardBurstVisible] = useState(false);
  const [answerHint, setAnswerHint] = useState('');

  const selectedRef = useRef(null);
  const revealedRef = useRef(false);
  const qIndexRef = useRef(0);
  const answersLogRef = useRef([]);
  const sessionXpRef = useRef(0);
  const rewardBurst = useRef(new Animated.Value(0)).current;
  const optionAnims = useRef(
    [0, 1, 2, 3, 4, 5].map(() => new Animated.Value(0)),
  ).current;
  const revealPulse = useRef(new Animated.Value(0)).current;
  const shakeX = useRef(new Animated.Value(0)).current;
  const orbPulse = useRef(new Animated.Value(0)).current;
  const cardEnter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    selectedRef.current = selectedIndex;
  }, [selectedIndex]);
  useEffect(() => {
    revealedRef.current = revealed;
  }, [revealed]);
  useEffect(() => {
    qIndexRef.current = qIndex;
  }, [qIndex]);
  useEffect(() => {
    answersLogRef.current = answersLog;
  }, [answersLog]);
  useEffect(() => {
    sessionXpRef.current = sessionXp;
  }, [sessionXp]);

  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const bg = isLight ? '#F2F2F2' : '#000000';
  const textMain = isLight ? '#1E1E1E' : FIGMA_CREAM;
  const textMuted = isLight ? '#5C5C5C' : '#A8A8A8';

  const quizQuestions = useMemo(() => getQuizQuestions(storyQuiz), [storyQuiz]);
  const quizXpPerCorrect = useMemo(() => resolveLandmarkQuizXpPerCorrect(storyQuiz), [storyQuiz]);
  const activeQuestion = quizQuestions[qIndex] || null;
  const totalQuestions = quizQuestions.length;
  const isLastQuestion = qIndex >= Math.max(0, totalQuestions - 1);

  const correctIdx = useMemo(() => resolveCorrectOptionIndex(activeQuestion), [activeQuestion]);

  const question = useMemo(() => {
    if (!activeQuestion) return '';
    if (activeQuestion._questionI18n) {
      return String(pickI18n(language, activeQuestion._questionI18n) || '').trim();
    }
    const q = langUk ? activeQuestion.questionUk : activeQuestion.questionEn;
    return String(q || activeQuestion.questionUk || activeQuestion.questionEn || '').trim();
  }, [activeQuestion, langUk, language]);

  const options = useMemo(() => {
    if (!activeQuestion?.options) return [];
    if (Array.isArray(activeQuestion._optionsI18n) && activeQuestion._optionsI18n.length > 0) {
      return activeQuestion._optionsI18n.map((o) => String(pickI18n(language, o.text) || '').trim());
    }
    return activeQuestion.options.map((o) => {
      const t = langUk ? o?.textUk : o?.textEn;
      return String(t || o?.textUk || o?.textEn || '').trim();
    });
  }, [activeQuestion, langUk, language]);

  const optionIndices = useMemo(() => options.map((_, i) => i), [options]);

  useEffect(() => {
    optionAnims.forEach((v) => v.setValue(0));
    revealPulse.setValue(0);
    shakeX.setValue(0);
    cardEnter.setValue(0);
    Animated.spring(cardEnter, {
      toValue: 1,
      friction: 8,
      tension: 70,
      useNativeDriver: true,
    }).start();
    if (!optionIndices.length) return undefined;
    Animated.stagger(
      55,
      optionIndices.map((i) =>
        Animated.spring(optionAnims[i] || optionAnims[0], {
          toValue: 1,
          friction: 7,
          tension: 90,
          useNativeDriver: true,
        }),
      ),
    ).start();
    return undefined;
  }, [question, qIndex, options.length, optionIndices, optionAnims, revealPulse, shakeX, cardEnter]);

  useEffect(() => {
    orbPulse.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(orbPulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(orbPulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [orbPulse, question, qIndex]);

  const onResetRound = useCallback(() => {
    setSelectedIndex(null);
    setRevealed(false);
    setRewardXp(0);
    setLastGainXp(0);
    setRewardAlready(false);
    setAnswerHint('');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!quizLandmarkKey) {
        setQIndex(0);
        setAnswersLog([]);
        setSessionXp(0);
        onResetRound();
        return;
      }
      const saved = await loadLandmarkQuizAnswer(quizLandmarkKey);
      const pending = await getLandmarkQuizPendingXp(quizLandmarkKey);
      if (cancelled) return;
      if (saved?.finished && Array.isArray(saved.answers) && saved.answers.length > 0) {
        const last = saved.answers.length - 1;
        setQIndex(last);
        setAnswersLog(saved.answers);
        setSessionXp(saved.rewardXp || pending || 0);
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
      if (saved && Array.isArray(saved.answers) && saved.answers.length > 0 && !saved.finished) {
        const nextQ = Math.min(saved.answers.length, Math.max(0, totalQuestions - 1));
        setQIndex(nextQ);
        setAnswersLog(saved.answers);
        setSessionXp(saved.rewardXp || pending || 0);
        onResetRound();
        return;
      }
      setQIndex(0);
      setAnswersLog([]);
      setSessionXp(pending || 0);
      onResetRound();
    })();
    return () => {
      cancelled = true;
    };
  }, [quizLandmarkKey, onResetRound, onAfterReveal, totalQuestions]);

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
    if (!activeQuestion) return '';
    const t = langUk ? activeQuestion.explanationUk : activeQuestion.explanationEn;
    return String(t || activeQuestion.explanationUk || activeQuestion.explanationEn || '').trim();
  }, [activeQuestion, langUk]);

  const moneyPreview = useMemo(
    () => formatQuizXpAsMoney(sessionXp || quizXpPerCorrect, language),
    [sessionXp, quizXpPerCorrect, language],
  );

  const submitAnswer = useCallback(
    async (index) => {
      if (revealedRef.current) return;
      const currentQ = qIndexRef.current;
      setSelectedIndex(index);
      selectedRef.current = index;
      setRevealed(true);
      revealedRef.current = true;
      const won = index === correctIdx;
      revealPulse.setValue(0);
      shakeX.setValue(0);
      if (won) {
        Animated.spring(revealPulse, {
          toValue: 1,
          friction: 5,
          tension: 120,
          useNativeDriver: true,
        }).start();
      } else {
        Animated.sequence([
          Animated.timing(shakeX, { toValue: 10, duration: 45, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: -10, duration: 45, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: 7, duration: 40, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: -7, duration: 40, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: 0, duration: 40, useNativeDriver: true }),
        ]).start();
      }
      let xpShown = 0;
      let already = false;
      let hint = '';
      let nextSessionXp = sessionXpRef.current;
      setLastGainXp(0);
      if (won) {
        if (rewardEnabled && quizLandmarkKey) {
          const { already: wasClaimed, xp, pendingTotal } = await applyLandmarkQuizQuestionReward(
            quizLandmarkKey,
            currentQ,
            quizXpPerCorrect,
          );
          already = !!wasClaimed;
          if (!already && xp > 0) {
            xpShown = xp;
            nextSessionXp = pendingTotal;
            setSessionXp(pendingTotal);
            setLastGainXp(xp);
            playRewardBurst(xp);
          } else {
            nextSessionXp = pendingTotal || sessionXpRef.current;
            setSessionXp(nextSessionXp);
            if (already) {
              xpShown = 0;
              setLastGainXp(0);
            }
          }
          setRewardAlready(already);
          setRewardXp(nextSessionXp);
        } else if (rewardEnabled) {
          // Немає ключа локації — все одно показуємо +5 за правильну відповідь у сесії.
          xpShown = quizXpPerCorrect;
          nextSessionXp = sessionXpRef.current + quizXpPerCorrect;
          setSessionXp(nextSessionXp);
          setLastGainXp(quizXpPerCorrect);
          setRewardAlready(false);
          setRewardXp(nextSessionXp);
          playRewardBurst(quizXpPerCorrect);
        }
      } else {
        setRewardAlready(false);
        setRewardXp(nextSessionXp);
      }
      if (won) {
        hint = '';
        setAnswerHint('');
      } else {
        hint = activeQuestion?._multiHintI18n
          ? String(pickI18n(language, activeQuestion._multiHintI18n) || '').trim()
          : String(
              (langUk ? activeQuestion?.multiHintUk : activeQuestion?.multiHintEn) || '',
            ).trim();
        setAnswerHint(hint);
      }
      const nextAnswers = [
        ...answersLogRef.current.slice(0, currentQ),
        { selectedIndex: index, won, rewardXp: xpShown },
      ];
      setAnswersLog(nextAnswers);
      if (quizLandmarkKey) {
        await saveLandmarkQuizAnswer(quizLandmarkKey, {
          qIndex: currentQ,
          answers: nextAnswers,
          selectedIndex: index,
          revealed: true,
          won,
          rewardXp: nextSessionXp,
          rewardAlready: already,
          answerHint: hint,
          finished: false,
        });
      }
      onAfterReveal?.();
    },
    [
      correctIdx,
      quizLandmarkKey,
      activeQuestion,
      langUk,
      language,
      rewardEnabled,
      quizXpPerCorrect,
      playRewardBurst,
      onAfterReveal,
      revealPulse,
      shakeX,
    ],
  );

  const goNextQuestionOrContinue = useCallback(async () => {
    if (!revealedRef.current) return;
    if (!isLastQuestion) {
      const next = qIndexRef.current + 1;
      setQIndex(next);
      onResetRound();
      if (quizLandmarkKey) {
        await saveLandmarkQuizAnswer(quizLandmarkKey, {
          qIndex: next,
          answers: answersLogRef.current,
          selectedIndex: 0,
          revealed: false,
          won: false,
          rewardXp: sessionXpRef.current,
          rewardAlready: false,
          answerHint: '',
          finished: false,
        });
      }
      return;
    }
    if (quizLandmarkKey) {
      await saveLandmarkQuizAnswer(quizLandmarkKey, {
        qIndex: qIndexRef.current,
        answers: answersLogRef.current,
        selectedIndex: selectedRef.current ?? 0,
        revealed: true,
        won: !!answersLogRef.current[qIndexRef.current]?.won,
        rewardXp: sessionXpRef.current,
        rewardAlready: false,
        answerHint: answerHint,
        finished: true,
      });
    }
    if (typeof onContinue === 'function') onContinue();
  }, [isLastQuestion, quizLandmarkKey, onResetRound, onContinue, answerHint]);

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
  const statusTone = !revealed
    ? accent
    : wonAnswer
      ? isLight
        ? accent
        : '#E1FF00'
      : '#FF5A5A';

  const quizBody = (
    <Animated.View
      style={{
        opacity: cardEnter,
        transform: [
          { translateX: shakeX },
          {
            translateY: cardEnter.interpolate({
              inputRange: [0, 1],
              outputRange: [18, 0],
            }),
          },
          {
            scale: cardEnter.interpolate({
              inputRange: [0, 1],
              outputRange: [0.97, 1],
            }),
          },
        ],
      }}
    >
      <View
        style={[
          styles.arena,
          isLight ? styles.arenaLight : styles.arenaDark,
        ]}
      >
        <View style={styles.arenaHero}>
          <View style={styles.arenaHeroTop}>
            <View style={styles.arenaQLabelRow}>
              <View style={styles.arenaQWrap}>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.arenaQHalo,
                    {
                      borderColor: isLight ? 'rgba(2,18,235,0.18)' : 'rgba(225,255,0,0.22)',
                      opacity: orbPulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.25, 0.7],
                      }),
                      transform: [
                        {
                          scale: orbPulse.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.22],
                          }),
                        },
                      ],
                    },
                  ]}
                />
                <View
                  style={[
                    styles.arenaQOrb,
                    {
                      backgroundColor: accent,
                      borderColor: accent,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.arenaQOrbText,
                      brandFontHeadMedium,
                      { color: isLight ? '#FFFFFF' : '#121212' },
                    ]}
                  >
                    {String(qIndex + 1).padStart(2, '0')}
                  </Text>
                </View>
              </View>
              <Text
                style={[
                  styles.arenaQuestionWord,
                  brandFontSans,
                  ANDROID_TEXT,
                  { color: accent },
                ]}
              >
                {lq(language, 'questionWord')}
                {totalQuestions > 1 ? `  ${qIndex + 1}/${totalQuestions}` : ''}
              </Text>
            </View>

            {revealed ? (
              <View
                style={[
                  styles.arenaStatusPill,
                  {
                    borderColor: wonAnswer
                      ? isLight
                        ? 'rgba(2,18,235,0.22)'
                        : 'rgba(225,255,0,0.3)'
                      : 'rgba(255,90,90,0.35)',
                    backgroundColor: wonAnswer
                      ? isLight
                        ? 'rgba(2,18,235,0.08)'
                        : 'rgba(225,255,0,0.12)'
                      : isLight
                        ? 'rgba(255,90,90,0.08)'
                        : 'rgba(255,90,90,0.12)',
                  },
                ]}
              >
                <Ionicons
                  name={wonAnswer ? 'checkmark-circle' : 'close-circle'}
                  size={12}
                  color={wonAnswer ? accent : isLight ? '#D64545' : '#FF8A82'}
                />
                <Text
                  style={[
                    styles.arenaStatusText,
                    brandFontSans,
                    ANDROID_TEXT,
                    {
                      color: wonAnswer ? accent : isLight ? '#D64545' : '#FF8A82',
                    },
                  ]}
                >
                  {questionChipText}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.arenaQuestionRow}>
            <Text
              style={[
                styles.arenaQuestion,
                brandFontHeadMedium,
                ANDROID_TEXT,
                { color: textMain, flex: 1 },
              ]}
            >
              {question}
            </Text>
          </View>
        </View>

        <View style={styles.arenaBody}>
          {optionIndices.map((i) => {
            const isSel = selectedIndex === i;
            const isCor = revealed && i === correctIdx;
            const isWrongSel = revealed && isSel && i !== correctIdx;
            const isMuted = revealed && !isCor && !isWrongSel;
            const enter = optionAnims[i] || optionAnims[0];
            const highlighted = (isSel && !revealed) || isCor;
            return (
              <Animated.View
                key={i}
                style={{
                  opacity: enter,
                  transform: [
                    {
                      translateY: enter.interpolate({
                        inputRange: [0, 1],
                        outputRange: [14, 0],
                      }),
                    },
                    {
                      scale: enter.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.96, 1],
                      }),
                    },
                  ],
                }}
              >
                <Animated.View
                  style={
                    isCor
                      ? {
                          transform: [
                            {
                              scale: revealPulse.interpolate({
                                inputRange: [0, 1],
                                outputRange: [1, 1.025],
                              }),
                            },
                          ],
                        }
                      : undefined
                  }
                >
                  <Pressable
                    disabled={revealed}
                    onPress={() => void submitAnswer(i)}
                    style={({ pressed }) => [
                      styles.arenaOpt,
                      {
                        borderWidth: highlighted || isWrongSel ? 1.5 : 1,
                        borderColor: isCor
                          ? statusTone
                          : isWrongSel
                            ? 'rgba(255,90,90,0.55)'
                            : isSel
                              ? accent
                              : isLight
                                ? 'rgba(2,18,235,0.10)'
                                : 'rgba(255,255,255,0.10)',
                        backgroundColor: highlighted
                          ? isLight
                            ? 'rgba(2,18,235,0.09)'
                            : 'rgba(225,255,0,0.12)'
                          : isWrongSel
                            ? isLight
                              ? 'rgba(255,90,90,0.08)'
                              : 'rgba(255,90,90,0.12)'
                            : isLight
                              ? 'rgba(255,255,255,0.96)'
                              : 'rgba(255,255,255,0.045)',
                        opacity: isMuted ? 0.38 : 1,
                        transform: [{ scale: pressed && !revealed ? 0.975 : 1 }],
                      },
                    ]}
                    android_ripple={ripple}
                  >
                    <View
                      style={[
                        styles.arenaLetter,
                        {
                          borderWidth: 1,
                          borderColor: highlighted
                            ? isLight
                              ? 'rgba(2,18,235,0.28)'
                              : 'rgba(225,255,0,0.35)'
                            : isWrongSel
                              ? 'rgba(255,90,90,0.35)'
                              : 'transparent',
                          backgroundColor: highlighted
                            ? isLight
                              ? 'rgba(2,18,235,0.14)'
                              : 'rgba(225,255,0,0.18)'
                            : isWrongSel
                              ? 'rgba(255,90,90,0.16)'
                              : isLight
                                ? 'rgba(2,18,235,0.06)'
                                : 'rgba(255,255,255,0.06)',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.arenaLetterText,
                          brandFontHeadMedium,
                          ANDROID_TEXT,
                          {
                            color: isWrongSel
                              ? isLight
                                ? '#D64545'
                                : '#FF8A82'
                              : highlighted
                                ? accent
                                : textMuted,
                          },
                        ]}
                      >
                        {prefix(i)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.arenaOptText,
                        brandFontSans,
                        ANDROID_TEXT,
                        {
                          color: isMuted
                            ? optionMutedText
                            : isWrongSel
                              ? isLight
                                ? '#B83A3A'
                                : '#FF8A82'
                              : textMain,
                        },
                      ]}
                      numberOfLines={2}
                    >
                      {options[i]}
                    </Text>
                    {isCor ? <Ionicons name="checkmark-circle" size={18} color={accent} /> : null}
                    {isWrongSel ? (
                      <Ionicons name="close-circle" size={18} color="#FF5A5A" />
                    ) : null}
                  </Pressable>
                </Animated.View>
              </Animated.View>
            );
          })}

          {revealed ? (
            <View
              style={[
                styles.arenaFeedback,
                {
                  backgroundColor: wonAnswer
                    ? isLight
                      ? 'rgba(2,18,235,0.06)'
                      : 'rgba(225,255,0,0.07)'
                    : isLight
                      ? 'rgba(255,90,90,0.06)'
                      : 'rgba(255,90,90,0.08)',
                  borderColor: wonAnswer
                    ? isLight
                      ? 'rgba(2,18,235,0.16)'
                      : 'rgba(225,255,0,0.2)'
                    : isLight
                      ? 'rgba(255,90,90,0.2)'
                      : 'rgba(255,90,90,0.24)',
                },
              ]}
            >
              <Ionicons
                name={wonAnswer ? 'sparkles' : 'alert-circle'}
                size={15}
                color={statusTone}
              />
              <View style={styles.arenaFeedbackCopy}>
                <Text
                  style={[
                    styles.arenaFeedbackTitle,
                    brandFontHeadMedium,
                    ANDROID_TEXT,
                    { color: textMain },
                  ]}
                >
                  {wonAnswer ? lq(language, 'feedbackLike') : lq(language, 'feedbackDislike')}
                </Text>
                {wonAnswer && lastGainXp > 0 ? (
                  <Text style={[styles.arenaFeedbackHint, brandFontSans, { color: accent }]}>
                    {lq(language, 'quizQuestionPoints', { n: lastGainXp })}
                  </Text>
                ) : null}
                {wonAnswer && sessionXp > 0 ? (
                  <Text style={[styles.arenaFeedbackHint, brandFontSans, { color: accent }]}>
                    {lq(language, 'quizSessionPoints', { n: sessionXp })}
                    {` · ${formatQuizXpAsMoney(sessionXp, language).amountLabel}`}
                  </Text>
                ) : null}
                {wonAnswer && rewardAlready ? (
                  <Text style={[styles.arenaFeedbackHint, brandFontSans, { color: textMuted }]}>
                    {lq(language, 'pointsAlready')}
                  </Text>
                ) : null}
                {wonAnswer && isLastQuestion && sessionXp > 0 ? (
                  <Text style={[styles.arenaFeedbackHint, brandFontSans, { color: textMuted }]}>
                    {lq(language, 'quizMoneyHint', {
                      money: formatQuizXpAsMoney(sessionXp, language).amountLabel,
                    })}
                  </Text>
                ) : null}
                {wonAnswer && explanationText ? (
                  <Text style={[styles.arenaFeedbackHint, brandFontSans, { color: textMuted }]}>
                    {explanationText}
                  </Text>
                ) : null}
                {!wonAnswer && answerHint ? (
                  <Text style={[styles.arenaFeedbackHint, brandFontSans, { color: textMuted }]}>
                    {answerHint}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {revealed && (!isLastQuestion || typeof onContinue === 'function') ? (
            <QuizContinueButton
              onPress={() => void goNextQuestionOrContinue()}
              label={
                isLastQuestion
                  ? lq(language, 'continueNext')
                  : lq(language, 'continueNextQuestion')
              }
              isLight={isLight}
              ripple={ripple}
              inline={inlineMode}
            />
          ) : null}

          {!inlineMode ? (
            <Text style={[styles.swipeHint, brandFontSans, { color: textMuted }]}>
              {swipeHintText}
            </Text>
          ) : null}
        </View>
      </View>
    </Animated.View>
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
          style={[landmarkGlassHeaderDockStyle, { marginTop: insets.top + 10, paddingBottom: 8 }]}
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
  quizCardCompact: {
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
  },
  questionCompact: {
    fontSize: 16,
    lineHeight: 21,
    marginBottom: 4,
  },
  optCompact: {
    marginBottom: 7,
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0212EB',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
    }),
  },
  optInnerCompact: {
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  optPrefixBadgeCompact: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 0,
  },
  optTextCompact: {
    fontSize: 15,
    lineHeight: 20,
  },
  optSelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 6,
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
  arena: {
    borderWidth: 0,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 2,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
      },
      android: { elevation: 0 },
    }),
  },
  arenaLight: {
    backgroundColor: 'transparent',
  },
  arenaDark: {
    backgroundColor: 'transparent',
  },
  arenaTopGlow: {
    display: 'none',
    height: 0,
  },
  arenaHero: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 6,
  },
  arenaHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    minHeight: 40,
  },
  arenaQLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
  },
  arenaQWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arenaQHalo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: 1.5,
  },
  arenaQOrb: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arenaQOrbText: {
    fontSize: 14,
    lineHeight: 16,
    letterSpacing: 0.4,
  },
  arenaQuestionWord: {
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  arenaStatusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 5,
  },
  arenaStatusText: {
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.55,
    textTransform: 'uppercase',
  },
  arenaQuestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  arenaQuestion: {
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.15,
  },
  arenaAccentBar: {
    marginTop: 10,
    width: 36,
    height: 3,
    borderRadius: 999,
  },
  arenaHint: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 16,
  },
  arenaBody: {
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 8,
    rowGap: 7,
  },
  arenaOpt: {
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
  },
  arenaLetter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arenaLetterText: {
    fontSize: 13,
    lineHeight: 15,
  },
  arenaOptText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  arenaFeedback: {
    marginTop: 2,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    columnGap: 8,
  },
  arenaFeedbackCopy: {
    flex: 1,
    rowGap: 2,
  },
  arenaFeedbackTitle: {
    fontSize: 14,
    lineHeight: 18,
  },
  arenaFeedbackHint: {
    fontSize: 12,
    lineHeight: 17,
  },
  continueBtn: {
    marginTop: 6,
    marginBottom: 2,
    borderRadius: 999,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.14,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  continueBtnGrad: {
    minHeight: Platform.OS === 'android' ? 46 : 44,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 7,
  },
  continueBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  continueBtnInline: {
    marginBottom: 2,
  },
  continueBtnText: {
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: 0.2,
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
