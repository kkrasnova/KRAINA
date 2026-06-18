import React, { useMemo, useRef, useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import Svg, { Defs, ClipPath, Path, Image as SvgImage } from 'react-native-svg';

const LEMON = '#E1FF00';
const LEMON_GLOW = 'rgba(225, 255, 0, 0.5)';
export const WAVE_STROKE_PAD = 10;

let heroInstanceCounter = 0;

/** Нижній або верхній край героя — плавна хвиля. */
function buildAuthHeroPaths(width, height, waveEdge = 'bottom') {
  const w = width;
  const h = height;
  const amp = Math.max(12, Math.min(22, w * 0.045));

  if (waveEdge === 'top') {
    const baseline = 6;
    const yLeft = baseline + amp * 0.22;
    const yDip = baseline - amp * 0.38;
    const yPeak = baseline + amp * 0.72;
    const yRight = baseline - amp * 0.12;

    const topCurve = [
      `C ${(w * 0.2).toFixed(2)} ${yDip.toFixed(2)}, ${(w * 0.42).toFixed(2)} ${(yDip * 0.55 + yPeak * 0.45).toFixed(2)}, ${(w * 0.6).toFixed(2)} ${(yPeak - amp * 0.08).toFixed(2)}`,
      `C ${(w * 0.78).toFixed(2)} ${yPeak.toFixed(2)}, ${(w * 0.9).toFixed(2)} ${yRight.toFixed(2)}, ${w} ${yRight.toFixed(2)}`,
    ].join(' ');

    const strokeD = `M 0 ${yLeft.toFixed(2)} ${topCurve}`;
    const clipD = [
      `M 0 ${yLeft.toFixed(2)}`,
      topCurve,
      `L ${w} ${h}`,
      `L 0 ${h}`,
      'Z',
    ].join(' ');

    return { clipD, strokeD };
  }

  const baseline = h - 6;

  const yLeft = baseline - amp * 0.22;
  const yDip = baseline + amp * 0.38;
  const yPeak = baseline - amp * 0.72;
  const yRight = baseline + amp * 0.12;

  const bottomCurve = [
    `C ${(w * 0.2).toFixed(2)} ${yDip.toFixed(2)}, ${(w * 0.42).toFixed(2)} ${(yDip * 0.55 + yPeak * 0.45).toFixed(2)}, ${(w * 0.6).toFixed(2)} ${(yPeak + amp * 0.08).toFixed(2)}`,
    `C ${(w * 0.78).toFixed(2)} ${yPeak.toFixed(2)}, ${(w * 0.9).toFixed(2)} ${yRight.toFixed(2)}, ${w} ${yRight.toFixed(2)}`,
  ].join(' ');

  const strokeD = `M 0 ${yLeft.toFixed(2)} ${bottomCurve}`;

  const clipD = [
    `M 0 0`,
    `L ${w} 0`,
    `L ${w} ${yRight.toFixed(2)}`,
    `C ${(w * 0.9).toFixed(2)} ${yRight.toFixed(2)}, ${(w * 0.78).toFixed(2)} ${yPeak.toFixed(2)}, ${(w * 0.6).toFixed(2)} ${(yPeak + amp * 0.08).toFixed(2)}`,
    `C ${(w * 0.42).toFixed(2)} ${(yDip * 0.55 + yPeak * 0.45).toFixed(2)}, ${(w * 0.2).toFixed(2)} ${yDip.toFixed(2)}, 0 ${yLeft.toFixed(2)}`,
    'Z',
  ].join(' ');

  return { clipD, strokeD };
}

/** Лише лаймова хвиля — на межі фото й чорного фону (останній слайд онбордингу). */
export function AuthHeroWaveLine({ width, style }) {
  const bandH = Math.round(Math.max(40, Math.min(64, width * 0.14)));
  const paths = useMemo(
    () => (width > 0 ? buildAuthHeroPaths(width, bandH) : null),
    [width, bandH],
  );
  if (!paths) return null;
  return (
    <View
      pointerEvents="none"
      style={[
        {
          width,
          height: bandH + WAVE_STROKE_PAD,
          overflow: 'visible',
          backgroundColor: 'transparent',
        },
        style,
      ]}
    >
      <Svg width={width} height={bandH + WAVE_STROKE_PAD}>
        <Path
          d={paths.strokeD}
          fill="none"
          stroke={LEMON_GLOW}
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d={paths.strokeD}
          fill="none"
          stroke={LEMON}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

export default function AuthHeroHeader({
  source,
  height,
  topInset = 0,
  imageNudgeY = 0,
  bottomBleedPx = 0,
  waveEdge = 'bottom',
  style,
}) {
  const clipId = useRef(`auth-hero-${++heroInstanceCounter}`).current;
  const [width, setWidth] = useState(0);
  const href = useMemo(() => Image.resolveAssetSource(source), [source]);
  const bleedTop = Math.max(0, Math.round(topInset));
  const isTopWave = waveEdge === 'top';
  const bottomBleed = isTopWave ? Math.max(0, Math.round(bottomBleedPx)) : 0;
  const clipHeight = height + bottomBleed;
  const paths = useMemo(
    () =>
      width > 0 && height > 0 ? buildAuthHeroPaths(width, clipHeight, waveEdge) : null,
    [width, height, waveEdge, clipHeight],
  );
  const shellHeight = clipHeight + WAVE_STROKE_PAD;

  return (
    <View
      style={[styles.shell, { height: shellHeight }, style]}
      onLayout={(e) => {
        const next = Math.round(e.nativeEvent.layout.width);
        if (next > 0) setWidth(next);
      }}
      pointerEvents="none"
    >
      {width > 0 && paths ? (
        <Svg
          width={width}
          height={shellHeight}
          style={[
            styles.heroSvg,
            isTopWave ? { top: 0 } : { top: 0 },
          ]}
        >
          <Defs>
            <ClipPath id={clipId}>
              <Path d={paths.clipD} transform={isTopWave ? `translate(0, ${WAVE_STROKE_PAD})` : undefined} />
            </ClipPath>
          </Defs>
          <SvgImage
            x={0}
            y={
              isTopWave
                ? WAVE_STROKE_PAD + imageNudgeY
                : -bleedTop + imageNudgeY
            }
            width={width}
            height={isTopWave ? clipHeight : height + bleedTop}
            preserveAspectRatio={isTopWave ? 'xMidYMax slice' : 'xMidYMin slice'}
            href={href}
            clipPath={`url(#${clipId})`}
          />
          <Path
            d={paths.strokeD}
            transform={isTopWave ? `translate(0, ${WAVE_STROKE_PAD})` : undefined}
            fill="none"
            stroke={LEMON_GLOW}
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d={paths.strokeD}
            transform={isTopWave ? `translate(0, ${WAVE_STROKE_PAD})` : undefined}
            fill="none"
            stroke={LEMON}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    position: 'relative',
    overflow: 'visible',
    backgroundColor: 'transparent',
  },
  heroSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
