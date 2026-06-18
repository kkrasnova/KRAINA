import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

const LEMON = '#E1FF00';
const LEMON_SOFT = 'rgba(225, 255, 0, 0.72)';
const LEMON_FAINT = 'rgba(225, 255, 0, 0.22)';
const LEMON_ROUTE = 'rgba(225, 255, 0, 0.32)';

const LANDMARKS = [
  { id: 'kyiv', x: 0.58, y: 0.34, r: 3.8, tier: 1 },
  { id: 'warsaw', x: 0.54, y: 0.31, r: 2.9, tier: 2 },
  { id: 'prague', x: 0.51, y: 0.38, r: 2.6, tier: 2 },
  { id: 'berlin', x: 0.52, y: 0.33, r: 2.7, tier: 2 },
  { id: 'vienna', x: 0.53, y: 0.41, r: 2.5, tier: 2 },
  { id: 'rome', x: 0.49, y: 0.52, r: 4, tier: 1 },
  { id: 'paris', x: 0.45, y: 0.4, r: 3.4, tier: 1 },
  { id: 'london', x: 0.43, y: 0.3, r: 3.3, tier: 1 },
  { id: 'barcelona', x: 0.44, y: 0.5, r: 2.8, tier: 2 },
  { id: 'istanbul', x: 0.64, y: 0.46, r: 3.6, tier: 1 },
  { id: 'athens', x: 0.57, y: 0.56, r: 2.9, tier: 2 },
  { id: 'cairo', x: 0.62, y: 0.62, r: 3.1, tier: 2 },
  { id: 'lisbon', x: 0.38, y: 0.48, r: 2.6, tier: 2 },
  { id: 'lviv', x: 0.56, y: 0.37, r: 2.4, tier: 3 },
  { id: 'florence', x: 0.5, y: 0.47, r: 2.5, tier: 3 },
  { id: 'edinburgh', x: 0.42, y: 0.26, r: 2.3, tier: 3 },
];

const ROUTES = [
  ['kyiv', 'warsaw'],
  ['kyiv', 'istanbul'],
  ['kyiv', 'lviv'],
  ['warsaw', 'prague'],
  ['warsaw', 'berlin'],
  ['prague', 'vienna'],
  ['berlin', 'paris'],
  ['vienna', 'rome'],
  ['paris', 'london'],
  ['paris', 'barcelona'],
  ['london', 'edinburgh'],
  ['rome', 'athens'],
  ['rome', 'florence'],
  ['istanbul', 'athens'],
  ['istanbul', 'cairo'],
  ['barcelona', 'lisbon'],
  ['athens', 'cairo'],
  ['florence', 'rome'],
];

/** Маршрути, по яких «бігає» імпульс енергії. */
const PULSE_ROUTES = [
  ['kyiv', 'istanbul'],
  ['paris', 'rome'],
  ['london', 'athens'],
  ['warsaw', 'cairo'],
  ['lisbon', 'kyiv'],
  ['edinburgh', 'istanbul'],
  ['florence', 'cairo'],
];

/** Созвездие в верхней части неба. */
const CONSTELLATION = [
  { x: 0.18, y: 0.1 },
  { x: 0.26, y: 0.06 },
  { x: 0.34, y: 0.09 },
  { x: 0.42, y: 0.05 },
  { x: 0.5, y: 0.11 },
  { x: 0.38, y: 0.16 },
  { x: 0.3, y: 0.14 },
];

const CONSTELLATION_EDGES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [2, 5],
  [5, 6],
  [6, 1],
];

function seededRand(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function makeStars(count, w, h, seed = 731, yScale = 0.82) {
  const rand = seededRand(seed);
  return Array.from({ length: count }, (_, i) => ({
    key: `star-${seed}-${i}`,
    x: rand() * w,
    y: rand() * h * yScale,
    r: rand() * 1.5 + 0.3,
    opacity: 0.12 + rand() * 0.75,
    twinkle: rand() > 0.68,
    delayMs: Math.round(rand() * 5000),
  }));
}

function makeParticles(count, w, h, seed = 991) {
  const rand = seededRand(seed);
  return Array.from({ length: count }, (_, i) => ({
    key: `dust-${i}`,
    x: rand() * w,
    y: rand() * h,
    size: rand() * 2.2 + 1,
    delayMs: Math.round(rand() * 3000),
    driftX: (rand() - 0.5) * 40,
    driftY: -(rand() * 60 + 30),
    duration: Math.round(rand() * 2000 + 4500),
  }));
}

function landmarkById(id) {
  return LANDMARKS.find((l) => l.id === id);
}

function buildRoutePath(w, h, fromId, toId) {
  const a = landmarkById(fromId);
  const b = landmarkById(toId);
  if (!a || !b) return '';
  const x1 = a.x * w;
  const y1 = a.y * h;
  const x2 = b.x * w;
  const y2 = b.y * h;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - Math.abs(x2 - x1) * 0.22 - 26;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

function dotColorForTier(tier) {
  if (tier === 1) return LEMON;
  if (tier === 2) return LEMON_SOFT;
  return 'rgba(225, 255, 0, 0.45)';
}

function AnimatedDot({ x, y, size, delayMs, color = LEMON_SOFT, strong = false }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(pulse, {
          toValue: 1,
          duration: strong ? 1500 : 2100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: strong ? 1500 : 2100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delayMs, pulse, strong]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, strong ? 2.1 : 1.75],
  });
  const opacity = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: strong ? [0.5, 1, 0.5] : [0.3, 0.95, 0.3],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.dot,
        strong && styles.dotStrong,
        {
          left: x - size,
          top: y - size,
          width: size * 2,
          height: size * 2,
          borderRadius: size,
          backgroundColor: color,
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
}

function CityHalo({ x, y, size, delayMs }) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 12000 + delayMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    spinLoop.start();
    pulseLoop.start();
    return () => {
      spinLoop.stop();
      pulseLoop.stop();
    };
  }, [delayMs, pulse, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1.25],
  });
  const opacity = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.25, 0.65, 0.25],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - size,
        top: y - size,
        width: size * 2,
        height: size * 2,
        opacity,
        transform: [{ scale }, { rotate }],
      }}
    >
      <View style={[styles.cityHaloRing, { width: size * 2, height: size * 2, borderRadius: size }]} />
      <View
        style={[
          styles.cityHaloArc,
          {
            width: size * 1.6,
            height: size * 1.6,
            borderRadius: size * 0.8,
            top: size * 0.2,
            left: size * 0.2,
          },
        ]}
      />
    </Animated.View>
  );
}

function TwinklingStar({ x, y, size, delayMs }) {
  const tw = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(tw, {
          toValue: 1,
          duration: 1200 + (delayMs % 800),
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(tw, {
          toValue: 0,
          duration: 1200 + (delayMs % 800),
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delayMs, tw]);

  const opacity = tw.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.08, 1, 0.08],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - size,
        top: y - size,
        width: size * 2,
        height: size * 2,
        borderRadius: size,
        backgroundColor: '#FFFFFF',
        opacity,
      }}
    />
  );
}

function BeaconRipple({ delayMs, maxScale = 2.8, size = 80 }) {
  const ripple = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(ripple, {
          toValue: 1,
          duration: 2800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(ripple, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delayMs, ripple]);

  const scale = ripple.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, maxScale],
  });
  const opacity = ripple.interpolate({
    inputRange: [0, 0.12, 0.5, 1],
    outputRange: [0, 0.7, 0.28, 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.beaconRipple,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
}

function ShootingStar({ width, height, startXRatio, startYRatio, angleDeg, delayBase, travelXRatio, travelYRatio }) {
  const travel = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const run = () => {
      travel.setValue(0);
      opacity.setValue(0);
      Animated.sequence([
        Animated.delay(delayBase + Math.random() * 3200),
        Animated.parallel([
          Animated.timing(travel, {
            toValue: 1,
            duration: 750 + Math.random() * 350,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(opacity, {
              toValue: 1,
              duration: 80,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 700,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]).start(({ finished }) => {
        if (finished) run();
      });
    };
    run();
    return () => {
      travel.stopAnimation();
      opacity.stopAnimation();
    };
  }, [delayBase, opacity, travel]);

  const translateX = travel.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -width * travelXRatio],
  });
  const translateY = travel.interpolate({
    inputRange: [0, 1],
    outputRange: [0, height * travelYRatio],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: width * startXRatio,
        top: height * startYRatio,
        opacity,
        transform: [{ translateX }, { translateY }, { rotate: `${angleDeg}deg` }],
      }}
    >
      <View style={styles.shootingStarHead} />
      <View style={[styles.shootingStarTail, { width: 64 + Math.random() * 28 }]} />
    </Animated.View>
  );
}

function FloatingParticle({ x, y, size, driftX, driftY, delayMs, duration }) {
  const drift = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.parallel([
          Animated.timing(drift, {
            toValue: 1,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(fade, {
              toValue: 1,
              duration: duration * 0.25,
              useNativeDriver: true,
            }),
            Animated.timing(fade, {
              toValue: 0,
              duration: duration * 0.75,
              useNativeDriver: true,
            }),
          ]),
        ]),
        Animated.timing(drift, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delayMs, drift, duration, fade]);

  const translateX = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, driftX],
  });
  const translateY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, driftY],
  });
  const opacity = fade.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, 0.85, 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: LEMON,
        opacity,
        transform: [{ translateX }, { translateY }],
      }}
    />
  );
}

function RoutePulse({ fromId, toId, width, height, delayMs, duration = 3200 }) {
  const from = landmarkById(fromId);
  const to = landmarkById(toId);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!from || !to) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(progress, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delayMs, duration, from, progress, to]);

  if (!from || !to) return null;

  const dx = (to.x - from.x) * width;
  const dy = (to.y - from.y) * height;
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, dx],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, dy],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.08, 0.5, 0.92, 1],
    outputRange: [0, 1, 1, 1, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.6, 1.4, 0.6],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: from.x * width - 5,
        top: from.y * height - 5,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: LEMON,
        shadowColor: LEMON,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 12,
        opacity,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    />
  );
}

function RadarSweep({ cx, cy, radius }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 4200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: cx,
        top: cy,
        width: 0,
        height: 0,
        transform: [{ rotate }],
      }}
    >
      <LinearGradient
        colors={['rgba(225, 255, 0, 0.38)', 'rgba(225, 255, 0, 0.08)', 'rgba(225, 255, 0, 0)']}
        locations={[0, 0.35, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{
          position: 'absolute',
          left: 0,
          top: -radius * 0.55,
          width: radius,
          height: radius * 1.1,
          borderTopRightRadius: radius,
          borderBottomRightRadius: radius,
          opacity: 0.55,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: -1,
          width: radius,
          height: 2,
          backgroundColor: 'rgba(225, 255, 0, 0.85)',
          shadowColor: LEMON,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 1,
          shadowRadius: 8,
        }}
      />
    </Animated.View>
  );
}

function buildCompassTicks(ringSize, count = 36) {
  const cx = ringSize / 2;
  const cy = ringSize / 2;
  const outerR = ringSize * 0.46;
  const innerR = ringSize * 0.435;
  const ticks = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const major = i % 3 === 0;
    const r0 = major ? innerR - ringSize * 0.012 : innerR;
    const x1 = cx + Math.cos(angle) * r0;
    const y1 = cy + Math.sin(angle) * r0;
    const x2 = cx + Math.cos(angle) * outerR;
    const y2 = cy + Math.sin(angle) * outerR;
    ticks.push({
      key: `tick-${i}`,
      x1,
      y1,
      x2,
      y2,
      major,
    });
  }
  return ticks;
}

export default function OnboardingFinalAtlasHero({ width, height, style }) {
  const ringSpin = useRef(new Animated.Value(0)).current;
  const ringSpinRev = useRef(new Animated.Value(0)).current;
  const beaconPulse = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const driftSlow = useRef(new Animated.Value(0)).current;
  const aurora = useRef(new Animated.Value(0)).current;
  const nebula = useRef(new Animated.Value(0)).current;
  const vortex = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loops = [
      Animated.loop(
        Animated.timing(ringSpin, {
          toValue: 1,
          duration: 48000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
      Animated.loop(
        Animated.timing(ringSpinRev, {
          toValue: 1,
          duration: 30000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(beaconPulse, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(beaconPulse, {
            toValue: 0,
            duration: 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(drift, {
            toValue: 1,
            duration: 9000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(drift, {
            toValue: 0,
            duration: 9000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(driftSlow, {
            toValue: 1,
            duration: 14000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(driftSlow, {
            toValue: 0,
            duration: 14000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(aurora, {
            toValue: 1,
            duration: 5500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(aurora, {
            toValue: 0,
            duration: 5500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(nebula, {
            toValue: 1,
            duration: 8000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(nebula, {
            toValue: 0,
            duration: 8000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(vortex, {
            toValue: 1,
            duration: 3500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(vortex, {
            toValue: 0,
            duration: 3500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [aurora, beaconPulse, drift, driftSlow, nebula, ringSpin, ringSpinRev, vortex]);

  const cx = width * 0.5;
  const cy = height * 0.46;
  const ringSize = height * 0.88;
  const ringLeft = cx - ringSize / 2;
  const ringTop = cy - ringSize / 2;
  const sweepRadius = ringSize * 0.44;

  const ringRotate = ringSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const ringRotateRev = ringSpinRev.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });
  const beaconScale = beaconPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.5],
  });
  const beaconOpacity = beaconPulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.65, 1, 0.65],
  });
  const driftY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [-10, 12],
  });
  const driftSlowY = driftSlow.interpolate({
    inputRange: [0, 1],
    outputRange: [6, -8],
  });
  const auroraOpacity = aurora.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.4, 0.95, 0.4],
  });
  const nebulaScale = nebula.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });
  const nebulaOpacity = nebula.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.5, 0.9, 0.5],
  });
  const vortexScale = vortex.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.08],
  });
  const vortexOpacity = vortex.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.35, 0.75, 0.35],
  });

  const starsNear = useMemo(() => makeStars(48, width, height, 731, 0.55), [width, height]);
  const starsFar = useMemo(() => makeStars(90, width, height, 1203, 0.85), [width, height]);
  const twinkleStars = useMemo(
    () => [...starsNear, ...starsFar].filter((s) => s.twinkle),
    [starsFar, starsNear],
  );
  const particles = useMemo(() => makeParticles(18, width, height), [width, height]);
  const compassTicks = useMemo(() => buildCompassTicks(ringSize), [ringSize]);

  const routePaths = useMemo(
    () =>
      ROUTES.map(([a, b]) => ({
        key: `${a}-${b}`,
        d: buildRoutePath(width, height, a, b),
      })),
    [width, height],
  );

  const latLines = useMemo(() => {
    const lines = [];
    for (let i = 0; i <= 6; i += 1) {
      lines.push({ key: `lat-${i}`, y: height * (0.14 + i * 0.1) });
    }
    return lines;
  }, [height]);

  const meridians = useMemo(() => {
    const paths = [];
    for (let i = 0; i < 6; i += 1) {
      const x = width * (0.14 + i * 0.14);
      paths.push({
        key: `mer-${i}`,
        d: `M ${x.toFixed(1)} ${height * 0.1} Q ${(x + width * 0.05).toFixed(1)} ${height * 0.5} ${x.toFixed(1)} ${height * 0.9}`,
      });
    }
    return paths;
  }, [width, height]);

  const historySpiral = useMemo(() => {
    const sx = cx;
    const sy = cy;
    const turns = 1.2;
    const maxR = sweepRadius * 0.85;
    let d = '';
    const steps = 48;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const angle = t * turns * Math.PI * 2 - Math.PI * 0.5;
      const r = maxR * t;
      const px = sx + Math.cos(angle) * r;
      const py = sy + Math.sin(angle) * r;
      d += i === 0 ? `M ${px.toFixed(1)} ${py.toFixed(1)}` : ` L ${px.toFixed(1)} ${py.toFixed(1)}`;
    }
    return d;
  }, [cx, cy, sweepRadius]);

  const tierOneLandmarks = LANDMARKS.filter((lm) => lm.tier === 1);

  return (
    <View style={[styles.shell, { width, height }, style]} pointerEvents="none">
      <LinearGradient
        colors={['#070a18', '#03040c', '#000000']}
        locations={[0, 0.5, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          {
            opacity: nebulaOpacity,
            transform: [{ scale: nebulaScale }],
          },
        ]}
      >
        <Svg width={width} height={height} style={StyleSheet.absoluteFillObject}>
          <Defs>
            <RadialGradient id="nebulaA" cx="38%" cy="12%" r="70%">
              <Stop offset="0%" stopColor="#2a1860" stopOpacity="0.55" />
              <Stop offset="50%" stopColor="#101028" stopOpacity="0.25" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="nebulaB" cx="72%" cy="18%" r="55%">
              <Stop offset="0%" stopColor="#1a3050" stopOpacity="0.45" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={width * 0.38} cy={height * 0.1} r={width * 0.55} fill="url(#nebulaA)" />
          <Circle cx={width * 0.72} cy={height * 0.14} r={width * 0.38} fill="url(#nebulaB)" />
        </Svg>
      </Animated.View>

      <Animated.View
        style={{
          ...StyleSheet.absoluteFillObject,
          transform: [{ translateY: driftSlowY }],
        }}
      >
        <Svg width={width} height={height} style={StyleSheet.absoluteFillObject}>
          {starsFar.map(({ key, x, y, r, opacity }) => (
            <Circle
              key={key}
              cx={x}
              cy={y}
              r={r * 0.85}
              fill={`rgba(255,255,255,${(opacity * 0.7).toFixed(2)})`}
            />
          ))}
        </Svg>
      </Animated.View>

      <Svg width={width} height={height} style={StyleSheet.absoluteFillObject}>
        {starsNear.map(({ key, x, y, r, opacity }) => (
          <Circle
            key={key}
            cx={x}
            cy={y}
            r={r}
            fill={`rgba(255,255,255,${opacity.toFixed(2)})`}
          />
        ))}
        <G opacity={0.55}>
          {CONSTELLATION_EDGES.map(([a, b]) => (
            <Line
              key={`c-${a}-${b}`}
              x1={CONSTELLATION[a].x * width}
              y1={CONSTELLATION[a].y * height}
              x2={CONSTELLATION[b].x * width}
              y2={CONSTELLATION[b].y * height}
              stroke="rgba(225, 255, 0, 0.22)"
              strokeWidth={0.8}
            />
          ))}
          {CONSTELLATION.map((pt, i) => (
            <Circle
              key={`cpt-${i}`}
              cx={pt.x * width}
              cy={pt.y * height}
              r={i === 3 ? 2.8 : 2}
              fill={i === 3 ? LEMON : '#FFFFFF'}
            />
          ))}
        </G>
      </Svg>

      {twinkleStars.map(({ key, x, y, r, delayMs }) => (
        <TwinklingStar key={`tw-${key}`} x={x} y={y} size={r + 0.8} delayMs={delayMs} />
      ))}

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { opacity: auroraOpacity }]}
      >
        <LinearGradient
          colors={[
            'rgba(225, 255, 0, 0.2)',
            'rgba(90, 160, 255, 0.1)',
            'rgba(180, 80, 255, 0.05)',
            'rgba(0,0,0,0)',
          ]}
          locations={[0, 0.28, 0.52, 0.8]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.95, y: 0.7 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      <LinearGradient
        colors={['rgba(225, 255, 0, 0.12)', 'rgba(225, 255, 0, 0.02)', 'rgba(0,0,0,0)']}
        locations={[0, 0.28, 0.65]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.68)', '#000000']}
        locations={[0.35, 0.76, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ShootingStar width={width} height={height} startXRatio={0.78} startYRatio={0.06} angleDeg={-32} delayBase={800} travelXRatio={0.58} travelYRatio={0.3} />
      <ShootingStar width={width} height={height} startXRatio={0.92} startYRatio={0.14} angleDeg={-38} delayBase={2800} travelXRatio={0.45} travelYRatio={0.22} />
      <ShootingStar width={width} height={height} startXRatio={0.65} startYRatio={0.03} angleDeg={-28} delayBase={4500} travelXRatio={0.5} travelYRatio={0.18} />

      {particles.map(({ key, ...particle }) => (
        <FloatingParticle key={key} {...particle} />
      ))}

      <Animated.View
        style={[
          styles.ringLayer,
          {
            width,
            height,
            transform: [{ translateY: driftY }],
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: cx - sweepRadius * 1.05,
            top: cy - sweepRadius * 1.05,
            width: sweepRadius * 2.1,
            height: sweepRadius * 2.1,
            opacity: vortexOpacity,
            transform: [{ scale: vortexScale }],
          }}
        >
          <LinearGradient
            colors={['rgba(225, 255, 0, 0.14)', 'rgba(225, 255, 0, 0.04)', 'rgba(0,0,0,0)']}
            locations={[0, 0.45, 1]}
            start={{ x: 0.5, y: 0.5 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: '100%',
              height: '100%',
              borderRadius: sweepRadius * 1.05,
            }}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.ringSpinWrap,
            {
              left: ringLeft,
              top: ringTop,
              width: ringSize,
              height: ringSize,
              transform: [{ rotate: ringRotate }],
            },
          ]}
        >
          <Svg width={ringSize} height={ringSize}>
            <Defs>
              <RadialGradient id="atlasGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={LEMON} stopOpacity="0.16" />
                <Stop offset="50%" stopColor={LEMON} stopOpacity="0.05" />
                <Stop offset="100%" stopColor={LEMON} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Circle cx={ringSize / 2} cy={ringSize / 2} r={ringSize * 0.46} fill="url(#atlasGlow)" />
            <Circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={ringSize * 0.46}
              stroke={LEMON_FAINT}
              strokeWidth={1.4}
              fill="none"
            />
            <Circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={ringSize * 0.46}
              stroke="rgba(225, 255, 0, 0.08)"
              strokeWidth={6}
              strokeDasharray="3 16"
              fill="none"
            />
            {compassTicks.map(({ key, x1, y1, x2, y2, major }) => (
              <Line
                key={key}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={major ? 'rgba(225, 255, 0, 0.35)' : 'rgba(225, 255, 0, 0.14)'}
                strokeWidth={major ? 1.2 : 0.7}
              />
            ))}
          </Svg>
        </Animated.View>

        <Animated.View
          style={[
            styles.ringSpinWrap,
            {
              left: ringLeft + ringSize * 0.1,
              top: ringTop + ringSize * 0.1,
              width: ringSize * 0.8,
              height: ringSize * 0.8,
              transform: [{ rotate: ringRotateRev }],
            },
          ]}
        >
          <Svg width={ringSize * 0.8} height={ringSize * 0.8}>
            <Circle
              cx={(ringSize * 0.8) / 2}
              cy={(ringSize * 0.8) / 2}
              r={(ringSize * 0.8) * 0.44}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={0.9}
              strokeDasharray="2 10"
              fill="none"
            />
          </Svg>
        </Animated.View>

        <RadarSweep cx={cx} cy={cy} radius={sweepRadius} />

        <Svg width={width} height={height} style={StyleSheet.absoluteFillObject}>
          <G opacity={0.32}>
            {latLines.map(({ key, y }) => (
              <Line
                key={key}
                x1={width * 0.04}
                y1={y}
                x2={width * 0.96}
                y2={y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={0.7}
              />
            ))}
            {meridians.map(({ key, d }) => (
              <Path
                key={key}
                d={d}
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={0.7}
              />
            ))}
          </G>
          <Path
            d={historySpiral}
            fill="none"
            stroke="rgba(225, 255, 0, 0.12)"
            strokeWidth={1.2}
            strokeDasharray="5 12"
            strokeLinecap="round"
          />
          {routePaths.map(({ key, d }) => (
            <G key={key}>
              <Path
                d={d}
                fill="none"
                stroke="rgba(225, 255, 0, 0.1)"
                strokeWidth={5}
                strokeLinecap="round"
              />
              <Path
                d={d}
                fill="none"
                stroke={LEMON_ROUTE}
                strokeWidth={1.6}
                strokeDasharray="5 8"
                strokeLinecap="round"
              />
            </G>
          ))}
          {LANDMARKS.map((lm) => (
            <Circle
              key={lm.id}
              cx={lm.x * width}
              cy={lm.y * height}
              r={lm.r + 1.2}
              fill={
                lm.tier === 1
                  ? 'rgba(225, 255, 0, 0.16)'
                  : 'rgba(255,255,255,0.1)'
              }
            />
          ))}
          {LANDMARKS.map((lm) => (
            <Circle
              key={`${lm.id}-core`}
              cx={lm.x * width}
              cy={lm.y * height}
              r={lm.r}
              fill="rgba(255,255,255,0.32)"
            />
          ))}
        </Svg>

        {tierOneLandmarks.map((lm, i) => (
          <CityHalo
            key={`halo-${lm.id}`}
            x={lm.x * width}
            y={lm.y * height}
            size={lm.r + 14}
            delayMs={i * 400}
          />
        ))}

        {PULSE_ROUTES.map(([fromId, toId], i) => (
          <RoutePulse
            key={`pulse-${fromId}-${toId}`}
            fromId={fromId}
            toId={toId}
            width={width}
            height={height}
            delayMs={i * 480}
            duration={2800 + i * 200}
          />
        ))}

        {LANDMARKS.map((lm, i) => (
          <AnimatedDot
            key={lm.id}
            x={lm.x * width}
            y={lm.y * height}
            size={lm.r + (lm.tier === 1 ? 2.5 : 1.8)}
            delayMs={i * 220}
            color={dotColorForTier(lm.tier)}
            strong={lm.tier === 1}
          />
        ))}

        <Animated.View
          style={[
            styles.beaconOuter,
            {
              left: cx - 40,
              top: cy - 40,
              opacity: beaconOpacity,
              transform: [{ scale: beaconScale }],
            },
          ]}
        >
          <BeaconRipple delayMs={0} maxScale={3.2} size={80} />
          <BeaconRipple delayMs={700} maxScale={2.6} size={80} />
          <BeaconRipple delayMs={1400} maxScale={2.1} size={80} />
          <BeaconRipple delayMs={2100} maxScale={1.7} size={80} />
          <View style={styles.beaconRing} />
          <View style={styles.beaconRingMid} />
          <View style={styles.beaconRingInner} />
          <View style={styles.beaconCore} />
          <View style={styles.beaconCoreHot} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  ringLayer: {
    position: 'relative',
  },
  ringSpinWrap: {
    position: 'absolute',
  },
  dot: {
    position: 'absolute',
    shadowColor: LEMON,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 8,
  },
  dotStrong: {
    shadowOpacity: 1,
    shadowRadius: 18,
  },
  cityHaloRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(225, 255, 0, 0.35)',
    backgroundColor: 'rgba(225, 255, 0, 0.04)',
  },
  cityHaloArc: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(225, 255, 0, 0.55)',
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
  },
  beaconOuter: {
    position: 'absolute',
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beaconRipple: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(225, 255, 0, 0.5)',
    backgroundColor: 'transparent',
  },
  beaconRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: 'rgba(225, 255, 0, 0.48)',
    backgroundColor: 'rgba(225, 255, 0, 0.08)',
  },
  beaconRingMid: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: 'rgba(225, 255, 0, 0.55)',
    backgroundColor: 'rgba(225, 255, 0, 0.06)',
  },
  beaconRingInner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(225, 255, 0, 0.65)',
    backgroundColor: 'rgba(225, 255, 0, 0.12)',
  },
  beaconCore: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: LEMON,
    shadowColor: LEMON,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
  },
  beaconCoreHot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  shootingStarHead: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  shootingStarTail: {
    position: 'absolute',
    left: -58,
    top: 2,
    height: 2.5,
    borderRadius: 1.25,
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
});
