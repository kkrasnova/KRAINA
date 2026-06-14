import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  ScrollView,
  Platform,
  DeviceEventEmitter,
} from 'react-native';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { pf } from './profileI18n';
import {
  getVisitLog,
  getPeriodWindow,
  filterVisitsByRange,
  buildLast30DaysSeries,
  aggregateCategoryPie,
  topCitiesBar,
  sumKmInVisits,
} from './visitStatsStorage';
import { computeGamificationFromVisits } from './visitGamification';
import ProfileGameLevelCard from './ProfileGameLevelCard';
import { getStepSyncEnabled, KRAINA_STEP_SYNC_CHANGED } from './stepSyncStorage';
import { fetchDailyStepsMapLastDays, buildStepsSeriesForChart, localDateKey, isStepsPlatformSupported } from './healthSteps';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { brandFontHeadMedium, brandFontSans, brandFontSansSemibold } from './brandFont';
import { HOME_TAB_ROUTE, HOME_TAB } from './homeTabPagerConstants';

const PERIODS = [
  { id: '3d', i18n: 'period3d' },
  { id: '7d', i18n: 'period7d' },
  { id: '30d', i18n: 'period30d' },
  { id: 'month', i18n: 'periodMonth' },
  { id: 'year', i18n: 'periodYear' },
  { id: 'all', i18n: 'periodAll' },
];

export default function ProfileVisitStats({ language, isLight, navigation, shell = {} }) {
  const { width: winW } = useWindowDimensions();
  const chartW = Math.min(winW - 32, 360);
  const [periodKey, setPeriodKey] = useState('30d');
  const [visits, setVisits] = useState([]);
  const [stepSyncOn, setStepSyncOn] = useState(false);
  const [stepsByDay, setStepsByDay] = useState({});
  const [stepsLoading, setStepsLoading] = useState(false);
  const [stepsLoadError, setStepsLoadError] = useState(false);

  const reload = useCallback(async () => {
    setVisits(await getVisitLog({ physicalOnly: true }));
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
  const barData = useMemo(() => topCitiesBar(inPeriod, 5), [inPeriod]);
  const kmSum = useMemo(() => sumKmInVisits(inPeriod), [inPeriod]);
  const gamify = useMemo(() => computeGamificationFromVisits(visits), [visits]);

  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#727272' : '#A8A8A8';
  const chipBorder = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)';
  const chipBg = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)';
  const chipOn = isLight ? '#1E6A9E' : '#E1FF00';
  const chipOnText = isLight ? '#FFFFFF' : '#1E1E1E';
  const accent = accentForTheme(isLight);

  const stepsSeries = useMemo(() => buildStepsSeriesForChart(stepsByDay, 7), [stepsByDay]);
  const todaySteps = stepsByDay[localDateKey(new Date())] ?? 0;

  const chartConfig = useMemo(
    () => ({
      backgroundColor: isLight ? '#FFFFFF' : '#1A1A1A',
      backgroundGradientFrom: isLight ? '#FFFFFF' : '#1A1A1A',
      backgroundGradientTo: isLight ? '#F4F7FD' : '#252525',
      decimalPlaces: 0,
      color: (opacity = 1) =>
        isLight ? `rgba(2, 18, 235, ${opacity})` : `rgba(225, 255, 0, ${opacity})`,
      labelColor: (opacity = 1) =>
        isLight ? `rgba(30, 30, 30, ${opacity})` : `rgba(255, 255, 255, ${opacity})`,
      propsForDots: {
        r: '4',
        strokeWidth: '2',
        stroke: isLight ? '#0212EB' : '#E1FF00',
      },
    }),
    [isLight],
  );

  const stepsChartConfig = useMemo(
    () => ({
      ...chartConfig,
      color: (opacity = 1) =>
        isLight ? `rgba(30, 130, 80, ${opacity})` : `rgba(120, 255, 160, ${opacity})`,
      propsForDots: {
        r: '4',
        strokeWidth: '2',
        stroke: isLight ? '#1E8A55' : '#90FFB0',
      },
    }),
    [chartConfig, isLight],
  );

  const renderStepsBlock = () => {
    if (!isStepsPlatformSupported()) return null;
    return (
    <View style={{ marginTop: 4, marginBottom: 8 }}>
      <Text style={[styles.sectionTitle, { color: textMuted, marginTop: 4 }]}>{pf(language, 'stepsSectionTitle')}</Text>
      {stepSyncOn ? (
        stepsLoading ? (
          <Text style={[styles.hint, { color: textMuted, paddingHorizontal: 4 }]}>{pf(language, 'stepsLoading')}</Text>
        ) : stepsLoadError ? (
          <Text style={[styles.hint, { color: textMuted, paddingHorizontal: 4, marginTop: 6 }]}>
            {pf(language, 'stepsErrGeneric')}
          </Text>
        ) : (
          <>
            <View style={[styles.summary, { backgroundColor: chipBg, borderColor: chipBorder, marginTop: 8 }]}>
              <Text style={[styles.summaryText, { color: textMain }]}>
                {pf(language, 'stepsTodayLabel')}: <Text style={styles.summaryNum}>{todaySteps}</Text>
              </Text>
            </View>
            <Text style={[styles.chartTitle, { color: textMain, marginTop: 10 }]}>{pf(language, 'stepsWeekChartTitle')}</Text>
            <BarChart
              data={{
                labels: stepsSeries.labels.length ? stepsSeries.labels : ['—'],
                datasets: [{ data: stepsSeries.data.length ? stepsSeries.data : [0] }],
              }}
              width={chartW}
              height={200}
              chartConfig={stepsChartConfig}
              style={styles.chart}
              fromZero
              showValuesOnTopOfBars
              yAxisLabel=""
              yAxisSuffix=""
            />
          </>
        )
      ) : (
        <Pressable
          onPress={() => navigation?.navigate?.('SettingsSteps', shell)}
          style={({ pressed }) => [
            styles.stepsCta,
            {
              borderColor: chipBorder,
              backgroundColor: chipBg,
              opacity: pressed ? 0.88 : 1,
            },
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

  const pieData = useMemo(() => {
    const defs = [
      { key: 'monument', color: isLight ? 'rgba(2,18,235,0.85)' : 'rgba(225,255,0,0.95)', i18n: 'statCatMonument' },
      { key: 'park', color: isLight ? 'rgba(98,134,228,0.9)' : 'rgba(180,220,80,0.95)', i18n: 'statCatPark' },
      { key: 'museum', color: isLight ? 'rgba(30,120,180,0.9)' : 'rgba(120,200,255,0.9)', i18n: 'statCatMuseum' },
      { key: 'other', color: isLight ? 'rgba(120,120,120,0.75)' : 'rgba(200,200,200,0.75)', i18n: 'statCatOther' },
    ];
    const out = [];
    for (const d of defs) {
      const n = pieAgg[d.key] || 0;
      if (n > 0) {
        out.push({
          name: pf(language, d.i18n),
          population: n,
          color: d.color,
          legendFontColor: textMain,
          legendFontSize: 12,
        });
      }
    }
    if (!out.length) {
      out.push({
        name: '—',
        population: 1,
        color: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)',
        legendFontColor: textMuted,
        legendFontSize: 12,
      });
    }
    return out;
  }, [pieAgg, language, isLight, textMain, textMuted]);

  const barHasData = barData.data.some((n) => n > 0);

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
      <Text style={[styles.sectionTitle, { color: textMuted, marginTop: 8 }]}>{pf(language, 'statsPeriod')}</Text>
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
                  borderColor: chipBorder,
                  backgroundColor: on ? chipOn : chipBg,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: on ? chipOnText : textMain }]}>
                {pf(language, p.i18n)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.summary, { backgroundColor: chipBg, borderColor: chipBorder }]}>
        <Text style={[styles.summaryText, { color: textMain }]}>
          {pf(language, 'statsVisitsInPeriod')}: <Text style={styles.summaryNum}>{inPeriod.length}</Text>
        </Text>
        <Text style={[styles.summaryText, { color: textMain, marginTop: 4 }]}>
          {pf(language, 'statsKmHint')}: <Text style={styles.summaryNum}>{kmSum}</Text>
        </Text>
        <Text style={[styles.summaryFootnote, { color: textMuted }, brandFontSans]}>
          {pf(language, 'statsPhysicalVisitsNote')}
        </Text>
      </View>

      <Text style={[styles.chartTitle, { color: textMain }]}>{pf(language, 'chartLineTitle')}</Text>
      <LineChart
        data={{
          labels: lineSeries.labels,
          datasets: [{ data: lineSeries.data.length ? lineSeries.data : [0] }],
        }}
        width={chartW}
        height={200}
        chartConfig={chartConfig}
        bezier
        style={styles.chart}
        withInnerLines={false}
        segments={4}
        fromZero
      />

      <Text style={[styles.chartTitle, { color: textMain, marginTop: 8 }]}>{pf(language, 'chartPieTitle')}</Text>
      <PieChart
        data={pieData}
        width={chartW}
        height={200}
        chartConfig={chartConfig}
        accessor="population"
        backgroundColor="transparent"
        paddingLeft={Platform.OS === 'ios' ? `${Math.round(chartW / 4)}` : '48'}
        absolute
        style={styles.chart}
      />

      <Text style={[styles.chartTitle, { color: textMain, marginTop: 8 }]}>{pf(language, 'chartBarTitle')}</Text>
      {barHasData ? (
        <BarChart
          data={{
            labels: barData.labels.length ? barData.labels : ['—'],
            datasets: [{ data: barData.data.length ? barData.data : [0] }],
          }}
          width={chartW}
          height={220}
          chartConfig={chartConfig}
          style={styles.chart}
          fromZero
          showValuesOnTopOfBars
          yAxisLabel=""
          yAxisSuffix=""
        />
      ) : (
        <Text style={[styles.hint, { color: textMuted }]}>{pf(language, 'statsEmptyHint')}</Text>
      )}
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
  wrap: { paddingHorizontal: 4, paddingTop: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  chipsRow: { flexDirection: 'row', gap: 8, paddingBottom: 12, paddingRight: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  summary: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 16,
  },
  summaryText: { fontSize: 14 },
  summaryNum: { fontWeight: '800' },
  summaryFootnote: { fontSize: 11, lineHeight: 15, marginTop: 10 },
  chartTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  chart: { marginVertical: 4, borderRadius: 12, alignSelf: 'center' },
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
