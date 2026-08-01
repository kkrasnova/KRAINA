import React, { useEffect, useMemo, useRef, memo } from 'react';
import { View, Text, Image, Animated, StyleSheet, Platform, Easing } from 'react-native';
import Svg, {
  Defs,
  ClipPath,
  Path,
  Image as SvgImage,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
} from 'react-native-svg';

export const COUNTRY_FLAG_PNG = {
  ad: require('./assets/flags/ad.png'),
  al: require('./assets/flags/al.png'),
  am: require('./assets/flags/am.png'),
  at: require('./assets/flags/at.png'),
  ba: require('./assets/flags/ba.png'),
  be: require('./assets/flags/be.png'),
  bg: require('./assets/flags/bg.png'),
  ch: require('./assets/flags/ch.png'),
  cy: require('./assets/flags/cy.png'),
  cz: require('./assets/flags/cz.png'),
  de: require('./assets/flags/de.png'),
  dk: require('./assets/flags/dk.png'),
  ee: require('./assets/flags/ee.png'),
  es: require('./assets/flags/es.png'),
  fi: require('./assets/flags/fi.png'),
  fr: require('./assets/flags/fr.png'),
  gb: require('./assets/flags/gb.png'),
  gr: require('./assets/flags/gr.png'),
  hr: require('./assets/flags/hr.png'),
  hu: require('./assets/flags/hu.png'),
  ie: require('./assets/flags/ie.png'),
  is: require('./assets/flags/is.png'),
  it: require('./assets/flags/it.png'),
  li: require('./assets/flags/li.png'),
  lt: require('./assets/flags/lt.png'),
  lu: require('./assets/flags/lu.png'),
  lv: require('./assets/flags/lv.png'),
  mc: require('./assets/flags/mc.png'),
  md: require('./assets/flags/md.png'),
  me: require('./assets/flags/me.png'),
  mk: require('./assets/flags/mk.png'),
  mt: require('./assets/flags/mt.png'),
  nl: require('./assets/flags/nl.png'),
  no: require('./assets/flags/no.png'),
  pl: require('./assets/flags/pl.png'),
  pt: require('./assets/flags/pt.png'),
  ro: require('./assets/flags/ro.png'),
  rs: require('./assets/flags/rs.png'),
  se: require('./assets/flags/se.png'),
  si: require('./assets/flags/si.png'),
  sk: require('./assets/flags/sk.png'),
  sm: require('./assets/flags/sm.png'),
  ua: require('./assets/flags/ua.png'),
  va: require('./assets/flags/va.png'),
  xk: require('./assets/flags/xk.png'),
};

export function countryFlagSource(countryId) {
  const k = String(countryId || '')
    .trim()
    .toLowerCase();
  if (!/^[a-z]{2}$/.test(k)) return null;
  return COUNTRY_FLAG_PNG[k] ?? null;
}

/** Хвилястий контур прапора — верх і низ як одна плавна хвиля. */
function waveFlagPath(w, h, amp = 4, waves = 1, phase = 0) {
  const steps = 12;
  const stepW = w / steps;
  const topBase = amp + 1.5;
  const botBase = h - amp - 1.5;

  const topY = (i) => topBase + amp * Math.sin((i / steps) * Math.PI * 2 * waves + phase);
  const botY = (i) => botBase - amp * Math.sin((i / steps) * Math.PI * 2 * waves + phase + Math.PI * 0.35);

  let d = `M 0 ${topY(0).toFixed(2)}`;
  for (let i = 1; i <= steps; i += 1) {
    const x = i * stepW;
    const cx = (i - 0.5) * stepW;
    d += ` Q ${cx.toFixed(2)} ${topY(i - 0.5).toFixed(2)} ${x.toFixed(2)} ${topY(i).toFixed(2)}`;
  }
  d += ` L ${w.toFixed(2)} ${botY(steps).toFixed(2)}`;
  for (let i = steps - 1; i >= 0; i -= 1) {
    const x = i * stepW;
    const cx = (i + 0.5) * stepW;
    d += ` Q ${cx.toFixed(2)} ${botY(i + 0.5).toFixed(2)} ${x.toFixed(2)} ${botY(i).toFixed(2)}`;
  }
  d += ' Z';
  return d;
}

function WavingFlagSvg({ source, width, height, phase = 0, clipId }) {
  const href = useMemo(() => Image.resolveAssetSource(source), [source]);
  const pathD = useMemo(() => waveFlagPath(width, height, 3.2, 2.5, phase), [width, height, phase]);
  const pad = 2;

  return (
    <Svg width={width + pad * 2} height={height + pad * 2} viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`}>
      <Defs>
        <ClipPath id={clipId}>
          <Path d={pathD} />
        </ClipPath>
        <SvgLinearGradient id={`${clipId}-shine`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.62" />
          <Stop offset="0.38" stopColor="#FFFFFF" stopOpacity="0.12" />
          <Stop offset="0.72" stopColor="#000000" stopOpacity="0.06" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0.28" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${clipId}-fold`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.18" />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0.14" />
        </SvgLinearGradient>
      </Defs>
      <SvgImage
        x={0}
        y={0}
        width={width}
        height={height}
        preserveAspectRatio="xMidYMid slice"
        href={href}
        clipPath={`url(#${clipId})`}
      />
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${clipId}-shine)`} clipPath={`url(#${clipId})`} />
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${clipId}-fold)`} clipPath={`url(#${clipId})`} opacity={0.85} />
      <Path
        d={pathD}
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth={0.6}
      />
    </Svg>
  );
}

let flagInstanceCounter = 0;

function WavingCountryFlagInner({
  countryId,
  source,
  emoji = '🏳️',
  width = 52,
  height = 38,
  animate = true,
  style,
  accessibilityLabel,
}) {
  const flagSrc = source ?? countryFlagSource(countryId);
  const clipIdRef = useRef(`wave-flag-${++flagInstanceCounter}`);
  const sway = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, {
          toValue: 1,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(sway, {
          toValue: 0,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, sway]);

  const rotateZ = sway.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['-5deg', '-2deg', '-5deg'],
  });
  const translateY = sway.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -1.5, 0],
  });
  const scaleX = sway.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.96, 1],
  });

  if (!flagSrc) {
    return (
      <View style={[styles.emojiWrap, { width, height }, style]} accessibilityLabel={accessibilityLabel}>
        <Text style={styles.emoji} allowFontScaling={false}>
          {emoji}
        </Text>
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          width: width + 6,
          height: height + 6,
          transform: animate
            ? [{ translateY }, { rotateZ }, { scaleX }]
            : [{ rotateZ: '-3deg' }],
        },
        style,
      ]}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.shadow} pointerEvents="none" />
      <WavingFlagSvg
        source={flagSrc}
        width={width}
        height={height}
        phase={0}
        clipId={clipIdRef.current}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.35)',
    transform: [{ translateX: 2 }, { translateY: 3 }, { scaleX: 0.94 }, { scaleY: 0.88 }],
    opacity: 0.55,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.45,
          shadowRadius: 6,
        }
      : { elevation: 6 }),
  },
  emojiWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 28,
    lineHeight: 32,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
});

export default memo(WavingCountryFlagInner);
