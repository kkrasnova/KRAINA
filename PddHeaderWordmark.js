import React, { useId, useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { brandFontHeadLogo } from './brandFont';
import { ACCENT_BLUE, ACCENT_LEMON } from './themeAccent';

/** Окремий файл e-UkraineHead-LOGO.otf — не додавати fontWeight, інакше iOS/Android можуть підмінити гарнітуру. */
const FONT_LOGO = brandFontHeadLogo.fontFamily || 'e-UkraineHead-LOGO';

const WORDMARK = 'KRAÏNA';

/**
 * Слово KRAÏNA: брендовий **e-Ukraine Head LOGO** + лінійний градієнт (як у макеті).
 * Світла тема: майже чорний синій → navy → фірмовий синій; темна: крем → лимон.
 */
export default function PddHeaderWordmark({ isLight, fontSize = 20 }) {
  const reactId = useId();
  const gradId = useMemo(
    () => `krainaGrad_${String(reactId).replace(/[^a-zA-Z0-9_-]/g, '') || 'g'}`,
    [reactId],
  );
  const height = Math.round(fontSize * 1.4);
  const width = Math.round(fontSize * 6.85);

  const stops = isLight
    ? [
        { offset: '0%', color: '#050816' },
        { offset: '42%', color: '#0F2454' },
        { offset: '100%', color: ACCENT_BLUE },
      ]
    : [
        { offset: '0%', color: '#FAFAF4' },
        { offset: '45%', color: '#E8F090' },
        { offset: '100%', color: ACCENT_LEMON },
      ];

  return (
    <View
      style={[styles.wrap, { width, height }]}
      accessibilityRole="header"
      accessibilityLabel={WORDMARK}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            {stops.map((s) => (
              <Stop key={s.offset} offset={s.offset} stopColor={s.color} stopOpacity="1" />
            ))}
          </LinearGradient>
        </Defs>
        <SvgText
          x={width / 2}
          y={Platform.OS === 'android' ? height * 0.76 : height * 0.8}
          textAnchor="middle"
          fill={`url(#${gradId})`}
          fontSize={fontSize}
          fontFamily={FONT_LOGO}
          letterSpacing={isLight ? 0.58 : 0.82}
        >
          {WORDMARK}
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    /** Легкий зсув вниз відносно центру шапки (оптичне вирівнювання). */
    marginTop: 2,
  },
});
