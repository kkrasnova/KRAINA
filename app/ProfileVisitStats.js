import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  ScrollView,
  DeviceEventEmitter,
} from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { pf } from './profileI18n';
import {
  getVisitLog,
  getPeriodWindow,
  filterVisitsByRange,
  buildLast30DaysSeries,
  aggregateCategoryPie,
  sumKmInVisits,
} from './visitStatsStorage';
import { computeGamificationFromVisits } from './visitGamification';
import { getLandmarkQuizBonusXpTotal } from './landmarkQuizRewards';
import ProfileGameLevelCard from './ProfileGameLevelCard';
import { getStepSyncEnabled, KRAINA_STEP_SYNC_CHANGED } from './stepSyncStorage';
import { fetchDailyStepsMapLastDays, buildStepsSeriesForChart, localDateKey, isStepsPlatformSupported } from './healthSteps';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { brandFontHeadMedium, brandFontSans, brandFontSansSemibold } from './brandFont';
import { HOME_TAB_ROUTE, HOME_TAB } from './homeTabPagerConstants';
import { VisitActivityChart, CategoryDonutChart } from './visitStatsCharts';

const PERIODS = [
  { id: '3d', i18n: 'period3d' },
  { id: '7d', i18n: 'period7d' },
  { id: '30d', i18n: 'period30d' },
  { id: 'month', i18n: 'periodMonth' },
  { id: 'year', i18n: 'periodYear' },
  { id: 'all', i18n: 'periodAll' },
];

const CATEGORY_COLORS = {
  light: {
    monument: '#0212EB',
    park: '#4A6FE8',
    museum: '#1E78B4',
    other: '#8A8A8A',
  },
  dark: {
    monument: '#E1FF00',
    park: '#B8D900',
    museum: '#78C8FF',
    other: '#B0B0B0',
  },
};

function StatPill({ icon, label, value, isLight, accent, textMain, textMuted, chipBorder, chipBg }) {
  return (
    <View style={[styles.statPill, { backgroundColor: chipBg, borderColor: chipBorder }]}>
      <View style={[styles.statPillIcon, { backgroundColor: isLight ? 'rgba(2,18,235,0.1)' : 'rgba(225,255,0,0.14)' }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <View style={styles.statPillText}>
        <Text style={[styles.statPillValue, brandFontSansSemibold, { color: textMain }]}>{value}</Text>
        <Text style={[styles.statPillLabel, brandFontSans, { color: textMuted }]} numberOfLines={2}>
          {label}
        </Text>
      </View>
    </View>
  );
}

function ChartPanel({ title, subtitle, icon, children, isLight, textMain, textMuted, chipBorder }) {
  const panelBg = isLight ? 'rgba(2, 18, 235, 0.03)' : 'rgba(255, 255, 255, 0.04)';
  return (
    <View style={[styles.chartPanel, { backgroundColor: panelBg, borderColor: chipBorder }]}>
      <View style={styles.chartPanelHeader}>
        <Ionicons name={icon} size={18} color={textMuted} style={{ marginRight: 8 }} />
        <View style={styles.chartPanelHeaderText}>
          <Text style={[styles.chartPanelTitle, brandFontSansSemibold, { color: textMain }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.chartPanelSubtitle, brandFontSans, { color: textMuted }]}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
}

export default function ProfileVisitStats({ language, isLight, navigation, shell = {} }) {
  const { width: winW } = useWindowDimensions();
  const chartW = Math.min(winW - 48, 360);
  const [periodKey, setPeriodKey] = useState('30d');
  const [visits, setVisits] = useState([]);
  const [quizBonusXp, setQuizBonusXp] = useState(0);
  const [stepSyncOn, setStepSyncOn] = useState(false);
  const [stepsByDay, setStepsByDay] = useState({});
  const [stepsLoading, setStepsLoading] = useState(false);
  const [stepsLoadError, setStepsLoadError] = useState(false);

  const reload = useCallback(async () => {
    const [visitLog, bonusXp] = await Promise.all([
      getVisitLog({ physicalOnly: true }),
      getLandmarkQuizBonusXpTotal(),
    ]);
    setVisits(visitLog);
    setQuizBonusXp(bonusXp);
  }, []);

  const loadSteps = useCallback(async () => {
    const on = await getStepSyncEnabled();
    setStepSyncOn(on);
    if (!on || !isStepsPlatformSupported()) {
      setStepsByDay({});
      setStepsLoadError(false);
      return;
    }
    setStepsLoading(true);
    setStepsLoadError(false);
    try {
      const map = await fetchDailyStepsMapLastDays(7);
      setStepsByDay(map);
    } catch {
      setStepsByDay({});
      setStepsLoadError(true);
    } finally {
      setStepsLoading(false);
    }
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_STEP_SYNC_CHANGED, () => {
      void loadSteps();
    });
    return () => sub.remove();
  }, [loadSteps]);

  useFocusEffect(
    useCallback(() => {
      reload();
      loadSteps();
    }, [reload, loadSteps]),
  );

  const { start, end } = useMemo(() => getPeriodWindow(periodKey), [periodKey]);
  const inPeriod = useMemo(() => filterVisitsByRange(visits, start, end), [visits, start, end]);
  const lineSeries = useMemo(() => buildLast30DaysSeries(visits), [visits]);
  const pieAgg = useMemo(() => aggregateCategoryPie(inPeriod), [inPeriod]);
  const kmSum = useMemo(() => sumKmInVisits(inPeriod), [inPeriod]);
  const gamify = useMemo(() => computeGamificationFromVisits(visits, quizBonusXp), [visits, quizBonusXp]);

  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#727272' : '#A8A8A8';
  const chipBorder = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.16)';
  const chipBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.07)';
  const chipOn = isLight ? '#0212EB' : '#E1FF00';
  const chipOnText = isLight ? '#FFFFFF' : '#1E1E1E';
  const accent = accentForTheme(isLight);
  const catColors = isLight ? CATEGORY_COLORS.light : CATEGORY_COLORS.dark;

  const stepsSeries = useMemo(() => buildStepsSeriesForChart(stepsByDay, 7), [stepsByDay]);
  const todaySteps = stepsByDay[localDateKey(new Date())] ?? 0;

  const chartConfig = useMemo(
    () => ({
      backgroundColor: 'transparent',
      backgroundGradientFrom: isLight ? '#F4F7FD' : '#1E1E1E',
      backgroundGradientTo: isLight ? '#EEF2FC' : '#252525',
      decimalPlaces: 0,
      color: (opacity = 1) =>
        isLight ? `rgba(30, 130, 80, ${opacity})` : `rgba(120, 255, 160, ${opacity})`,
      labelColor: (opacity = 1) =>
        isLight ? `rgba(30, 30, 30, ${opacity})` : `rgba(255, 255, 255, ${opacity})`,
      propsForBackgroundLines: { strokeDasharray: '', stroke: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)' },
    }),
    [isLight],
  );

  const categorySlices = useMemo(() => {
    const defs = [
      { key: 'monument', i18n: 'statCatMonument' },
      { key: 'park', i18n: 'statCatPark' },
      { key: 'museum', i18n: 'statCatMuseum' },
      { key: 'other', i18n: 'statCatOther' },
    ];
    return defs
      .map((d) => ({
        key: d.key,
        label: pf(language, d.i18n),
        value: pieAgg[d.key] || 0,
        color: catColors[d.key],
      }))
      .filter((s) => s.value > 0);
  }, [pieAgg, language, catColors]);

  const categoryTotal = useMemo(
    () => categorySlices.reduce((sum, s) => sum + s.value, 0),
    [categorySlices],
  );

  const renderStepsBlock = () => {
    if (!isStepsPlatformSupported()) return null;
    return (
      <View style={styles.stepsBlock}>
        <Text style={[styles.sectionTitle, { color: textMuted }]}>{pf(language, 'stepsSectionTitle')}</Text>
        {stepSyncOn ? (
          stepsLoading ? (
            <Text style={[styles.hint, { color: textMuted }]}>{pf(language, 'stepsLoading')}</Text>
          ) : stepsLoadError ? (
            <Text style={[styles.hint, { color: textMuted }]}>{pf(language, 'stepsErrGeneric')}</Text>
          ) : (
            <>
              <View style={styles.statRow}>
                <StatPill
                  icon="footsteps-outline"
                  label={pf(language, 'stepsTodayLabel')}
                  value={todaySteps}
                  isLight={isLight}
                  accent={isLight ? '#1E8A55' : '#90FFB0'}
                  textMain={textMain}
                  textMuted={textMuted}
                  chipBorder={chipBorder}
                  chipBg={chipBg}
                />
              </View>
              <ChartPanel
                title={pf(language, 'stepsWeekChartTitle')}
                icon="bar-chart-outline"
                isLight={isLight}
                textMain={textMain}
                textMuted={textMuted}
                chipBorder={chipBorder}
              >
                <BarChart
                  data={{
                    labels: stepsSeries.labels.length ? stepsSeries.labels : ['—'],
                    datasets: [{ data: stepsSeries.data.length ? stepsSeries.data : [0] }],
                  }}
                  width={chartW}
                  height={180}
                  chartConfig={chartConfig}
                  style={styles.stepsChart}
                  fromZero
                  showValuesOnTopOfBars
                  yAxisLabel=""
                  yAxisSuffix=""
                  withInnerLines={false}
                />
              </ChartPanel>
            </>
          )
        ) : (
          <Pressable
            onPress={() => navigation?.navigate?.('WalkReminderSetup', { ...shell, fromOnboarding: false })}
            style={({ pressed }) => [
              styles.stepsCta,
              { borderColor: chipBorder, backgroundColor: chipBg, opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <Text style={[styles.stepsCtaText, { color: accent }, brandFontSansSemibold]}>
              {pf(language, 'stepsSetupCta')}
            </Text>
          </Pressable>
        )}
      </View>
    );
  };

  const openHomeFromEmpty = useCallback(() => {
    if (!navigation?.navigate) return;
    navigation.navigate(HOME_TAB_ROUTE, {
      ...shell,
      tabIndex: HOME_TAB.MAIN,
      routeFinderExtras: {},
    });
  }, [navigation, shell]);

  if (visits.length === 0) {
    return (
      <View style={styles.wrapEmpty}>
        <Text style={[styles.sectionTitle, { color: textMuted, paddingHorizontal: 12 }]}>
          {pf(language, 'gamifyStatsSectionTitle')}
        </Text>
        <ProfileGameLevelCard
          snapshot={gamify}
          language={language}
          isLight={isLight}
          accent={accent}
          embedInTab
        />
        {renderStepsBlock()}
        <View style={[styles.hero, isLight ? styles.heroLight : styles.heroDark]}>
          <View style={styles.stickerRow}>
            <View
              style={[
                styles.sticker,
                { borderColor: accent, backgroundColor: isLight ? '#FFFEF8' : 'rgba(255,255,255,0.08)' },
              ]}
            >
              <Text style={[styles.stickerGlyph, { color: accent }]}>✦</Text>
              <Text
                style={[
                  styles.stickerLabel,
                  brandFontSansSemibold,
                  { color: isLight ? '#1E1E1E' : '#F2F2EA' },
                ]}
              >
                {pf(language, 'profileStatsEmptySticker')}
              </Text>
            </View>
            <Text style={styles.stickerEmoji} allowFontScaling={false}>
              📊
            </Text>
          </View>
          <Text style={[styles.heroTitle, brandFontHeadMedium, { color: textMain }]}>
            {pf(language, 'profileStatsEmptyTitle')}
          </Text>
          <Text style={[styles.heroBody, brandFontSans, { color: textMuted }]}>
            {pf(language, 'profileStatsEmptySubtitle')}
          </Text>
          <Pressable
            onPress={openHomeFromEmpty}
            style={({ pressed }) => [
              styles.heroCta,
              { backgroundColor: isLight ? '#1E1E1E' : accent },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Ionicons
              name="home-outline"
              size={22}
              color={isLight ? '#FFFFFF' : onAccentButtonText(false)}
              style={{ marginRight: 8 }}
            />
            <Text
              style={[
                styles.heroCtaText,
                brandFontSansSemibold,
                { color: isLight ? '#FFFFFF' : onAccentButtonText(false) },
              ]}
            >
              {pf(language, 'profileStatsEmptyCta')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.sectionTitle, { color: textMuted }]}>{pf(language, 'gamifyStatsSectionTitle')}</Text>
      <ProfileGameLevelCard
        snapshot={gamify}
        language={language}
        isLight={isLight}
        accent={accent}
        embedInTab
      />
      {renderStepsBlock()}

      <View
        style={[
          styles.statsChartsCard,
          {
            backgroundColor: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
            borderColor: chipBorder,
          },
        ]}
      >
        <Text style={[styles.statsChartsSectionTitle, brandFontSansSemibold, { color: textMain }]}>
          {pf(language, 'statsChartsSectionTitle')}
        </Text>

        <Text style={[styles.sectionTitle, { color: textMuted, marginTop: 12, marginBottom: 10 }]}>
          {pf(language, 'statsPeriod')}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {PERIODS.map((p) => {
            const on = periodKey === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setPeriodKey(p.id)}
                style={[
                  styles.chip,
                  {
                    borderColor: on ? chipOn : chipBorder,
                    backgroundColor: on ? chipOn : chipBg,
                  },
                ]}
              >
                <Text style={[styles.chipText, brandFontSansSemibold, { color: on ? chipOnText : textMain }]}>
                  {pf(language, p.i18n)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.statRow}>
          <StatPill
            icon="location-outline"
            label={pf(language, 'statsVisitsInPeriod')}
            value={inPeriod.length}
            isLight={isLight}
            accent={accent}
            textMain={textMain}
            textMuted={textMuted}
            chipBorder={chipBorder}
            chipBg={chipBg}
          />
          <StatPill
            icon="walk-outline"
            label={pf(language, 'statsKmHint')}
            value={kmSum}
            isLight={isLight}
            accent={accent}
            textMain={textMain}
            textMuted={textMuted}
            chipBorder={chipBorder}
            chipBg={chipBg}
          />
        </View>

        <Text style={[styles.summaryFootnote, { color: textMuted }, brandFontSans]}>
          {pf(language, 'statsPhysicalVisitsNote')}
        </Text>

        <ChartPanel
          title={pf(language, 'chartLineTitle')}
          icon="pulse-outline"
          isLight={isLight}
          textMain={textMain}
          textMuted={textMuted}
          chipBorder={chipBorder}
        >
          <VisitActivityChart
            series={lineSeries}
            width={chartW}
            isLight={isLight}
            accent={accent}
            textMain={textMain}
            textMuted={textMuted}
            language={language}
          />
        </ChartPanel>

        <ChartPanel
          title={pf(language, 'chartPieTitle')}
          icon="pie-chart-outline"
          isLight={isLight}
          textMain={textMain}
          textMuted={textMuted}
          chipBorder={chipBorder}
        >
          <CategoryDonutChart
            slices={categorySlices}
            total={categoryTotal}
            width={chartW}
            isLight={isLight}
            accent={accent}
            textMain={textMain}
            textMuted={textMuted}
            centerLabel={pf(language, 'statsDonutCenter')}
          />
        </ChartPanel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapEmpty: { paddingHorizontal: 16, paddingTop: 8 },
  hero: {
    width: '100%',
    marginTop: 8,
    borderRadius: 28,
    paddingVertical: 28,
    paddingHorizontal: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroLight: {
    backgroundColor: 'rgba(2, 18, 235, 0.06)',
    borderColor: 'rgba(2, 18, 235, 0.14)',
  },
  heroDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  stickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  sticker: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 2,
    transform: [{ rotate: '-4deg' }],
    flexDirection: 'row',
    alignItems: 'center',
  },
  stickerGlyph: { fontSize: 20, marginRight: 8 },
  stickerLabel: { fontSize: 13, letterSpacing: 0.5 },
  stickerEmoji: { fontSize: 44, marginRight: 4 },
  heroTitle: { fontSize: 20, lineHeight: 26, marginBottom: 10 },
  heroBody: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  heroCtaText: { fontSize: 16 },
  wrap: { paddingHorizontal: 4, paddingTop: 8, paddingBottom: 108 },
  stepsBlock: { marginTop: 4, marginBottom: 8 },
  statsChartsCard: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 16,
    marginTop: 4,
    marginBottom: 20,
  },
  statsChartsSectionTitle: {
    fontSize: 18,
    lineHeight: 24,
  },
  sectionTitle: { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  chipsRow: { flexDirection: 'row', gap: 8, paddingBottom: 14, paddingRight: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 13 },
  statRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  statPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 10,
    minWidth: 0,
  },
  statPillIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statPillText: { flex: 1, minWidth: 0 },
  statPillValue: { fontSize: 22, lineHeight: 26 },
  statPillLabel: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  summaryFootnote: { fontSize: 11, lineHeight: 15, marginBottom: 16 },
  chartPanel: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 12,
  },
  chartPanelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  chartPanelHeaderText: { flex: 1, minWidth: 0 },
  chartPanelTitle: { fontSize: 14, lineHeight: 19 },
  chartPanelSubtitle: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  stepsChart: { marginLeft: -8, borderRadius: 12 },
  stepsCta: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    alignItems: 'center',
  },
  stepsCtaText: { fontSize: 15 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
});
