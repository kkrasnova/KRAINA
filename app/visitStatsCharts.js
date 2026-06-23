import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line, Rect, Circle } from 'react-native-svg';
import { brandFontSans, brandFontSansSemibold } from './brandFont';

const MONTH_SHORT_UK = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];
const MONTH_SHORT_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeDonutSlice(cx, cy, outerR, innerR, startAngle, endAngle) {
  const oStart = polarToCartesian(cx, cy, outerR, endAngle);
  const oEnd = polarToCartesian(cx, cy, outerR, startAngle);
  const iStart = polarToCartesian(cx, cy, innerR, startAngle);
  const iEnd = polarToCartesian(cx, cy, innerR, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    `M ${oStart.x} ${oStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 0 ${oEnd.x} ${oEnd.y}`,
    `L ${iStart.x} ${iStart.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 1 ${iEnd.x} ${iEnd.y}`,
    'Z',
  ].join(' ');
}

function formatAxisDay(date, language) {
  const isUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const months = isUk ? MONTH_SHORT_UK : MONTH_SHORT_EN;
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

function buildActivityMeta(series, language) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);

  const dates = [];
  for (let i = 0; i < 30; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }

  const tickEvery = 5;
  const tickIndices = dates.map((_, i) => i).filter((i) => i % tickEvery === 0 || i === dates.length - 1);

  return {
    dates,
    todayIndex: 29,
    tickIndices,
    rangeLabel: `${formatAxisDay(start, language)} — ${formatAxisDay(end, language)}`,
    data: series.data?.length === 30 ? series.data : Array.from({ length: 30 }, () => 0),
  };
}

export function VisitActivityChart({ series, width, isLight, accent, textMain, textMuted, language }) {
  const meta = useMemo(() => buildActivityMeta(series, language), [series, language]);
  const chartHeight = 168;
  const padL = 28;
  const padR = 8;
  const padT = 12;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = chartHeight - padT - padB;
  const maxVal = Math.max(1, ...meta.data);
  const barGap = 2;
  const barW = Math.max(4, (innerW - barGap * 29) / 30);
  const gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
  const barMuted = isLight ? 'rgba(2, 18, 235, 0.35)' : 'rgba(225, 255, 0, 0.45)';
  const yTicks = Array.from(new Set([0, Math.ceil(maxVal / 2), maxVal])).sort((a, b) => a - b);

  return (
    <View style={styles.block}>
      <Text style={[styles.rangeCaption, brandFontSans, { color: textMuted }]}>{meta.rangeLabel}</Text>
      <View style={{ width, height: chartHeight }}>
        <Svg width={width} height={chartHeight} style={StyleSheet.absoluteFill}>
          {yTicks.map((tick) => {
            const y = padT + innerH - (tick / maxVal) * innerH;
            return (
              <Line key={`grid-${tick}`} x1={padL} y1={y} x2={width - padR} y2={y} stroke={gridColor} strokeWidth={1} />
            );
          })}

          {meta.data.map((value, i) => {
            const h = value > 0 ? Math.max(4, (value / maxVal) * innerH) : 0;
            const x = padL + i * (barW + barGap);
            const y = padT + innerH - h;
            const isToday = i === meta.todayIndex;
            if (h <= 0) return null;
            return (
              <Rect
                key={`bar-${i}`}
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={Math.min(4, barW / 2)}
                fill={isToday ? accent : barMuted}
              />
            );
          })}
        </Svg>

        {yTicks.map((tick) => {
          const y = padT + innerH - (tick / maxVal) * innerH;
          return (
            <Text
              key={`ylabel-${tick}`}
              style={[
                styles.yLabel,
                brandFontSans,
                {
                  position: 'absolute',
                  left: 0,
                  top: y - 7,
                  width: padL - 4,
                  color: textMuted,
                },
              ]}
            >
              {tick}
            </Text>
          );
        })}

        {meta.tickIndices.map((i) => {
          const x = padL + i * (barW + barGap) + barW / 2;
          return (
            <Text
              key={`xlabel-${i}`}
              style={[
                styles.xLabel,
                brandFontSans,
                {
                  position: 'absolute',
                  left: x - 18,
                  top: chartHeight - 20,
                  width: 36,
                  color: i === meta.todayIndex ? accent : textMuted,
                  fontWeight: i === meta.todayIndex ? '700' : '500',
                },
              ]}
            >
              {meta.dates[i].getDate()}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

export function CategoryDonutChart({ slices, total, width, isLight, accent, textMain, textMuted, centerLabel }) {
  const size = Math.min(width * 0.42, 120);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.38;
  const innerR = outerR * 0.62;
  const gapDeg = slices.length > 1 ? 2.5 : 0;
  const sum = Math.max(total, slices.reduce((s, sl) => s + sl.value, 0), 1);

  let cursor = 0;
  const arcs = slices.map((slice, index) => {
    const sweep = (slice.value / sum) * (360 - gapDeg * slices.length);
    const start = cursor + gapDeg / 2;
    const end = cursor + sweep;
    cursor += sweep + gapDeg;
    return {
      ...slice,
      d: describeDonutSlice(cx, cy, outerR, innerR, start, end),
      key: slice.key || String(index),
    };
  });

  const emptyRing = slices.length === 0;
  const singleSlice = slices.length === 1;
  const legendItems = slices.length
    ? slices
    : [{ key: 'empty', label: '—', value: 0, color: isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.25)' }];

  return (
    <View style={[styles.donutRow, { width }]}>
      <View style={[styles.donutWrap, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          {emptyRing ? (
            <Circle
              cx={cx}
              cy={cy}
              r={(outerR + innerR) / 2}
              stroke={isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)'}
              strokeWidth={outerR - innerR}
              fill="none"
            />
          ) : singleSlice ? (
            <Circle
              cx={cx}
              cy={cy}
              r={(outerR + innerR) / 2}
              stroke={slices[0].color}
              strokeWidth={outerR - innerR}
              fill="none"
            />
          ) : (
            arcs.map((arc) => <Path key={arc.key} d={arc.d} fill={arc.color} />)
          )}
        </Svg>
        <View style={styles.donutCenter} pointerEvents="none">
          <Text style={[styles.donutTotal, brandFontSansSemibold, { color: textMain }]}>{total}</Text>
          <Text style={[styles.donutCenterLabel, brandFontSans, { color: textMuted }]} numberOfLines={2}>
            {centerLabel}
          </Text>
        </View>
      </View>

      <View style={styles.legendCol}>
        {legendItems.map((slice) => {
          const pct = sum > 0 && slice.value > 0 ? Math.round((slice.value / sum) * 100) : 0;
          return (
            <View key={slice.key} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: slice.color }]} />
              <View style={styles.legendTextCol}>
                <Text style={[styles.legendLabel, brandFontSansSemibold, { color: textMain }]} numberOfLines={1}>
                  {slice.label}
                </Text>
                <Text style={[styles.legendMeta, brandFontSans, { color: textMuted }]}>
                  {slice.value > 0 ? `${slice.value} · ${pct}%` : '—'}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { width: '100%' },
  rangeCaption: { fontSize: 12, marginBottom: 6, marginLeft: 2 },
  yLabel: { fontSize: 10, textAlign: 'right' },
  xLabel: { fontSize: 10, textAlign: 'center' },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  donutWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  donutTotal: { fontSize: 22, lineHeight: 26 },
  donutCenterLabel: { fontSize: 10, lineHeight: 13, textAlign: 'center', marginTop: 1 },
  legendCol: { flex: 1, minWidth: 0, gap: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendTextCol: { flex: 1, minWidth: 0 },
  legendLabel: { fontSize: 14, lineHeight: 18 },
  legendMeta: { fontSize: 12, lineHeight: 16, marginTop: 1 },
});
