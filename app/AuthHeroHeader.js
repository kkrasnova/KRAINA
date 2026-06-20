import React, { useMemo, useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Path } from 'react-native-svg';

const LEMON = '#E1FF00';
const LEMON_GLOW = 'rgba(225, 255, 0, 0.5)';
export const WAVE_STROKE_PAD = 10;

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
    const aboveWaveFillD = [
      `M 0 0`,
      `L ${w} 0`,
      `L ${w} ${yRight.toFixed(2)}`,
      `C ${(w * 0.9).toFixed(2)} ${yRight.toFixed(2)}, ${(w * 0.78).toFixed(2)} ${yPeak.toFixed(2)}, ${(w * 0.6).toFixed(2)} ${(yPeak - amp * 0.08).toFixed(2)}`,
      `C ${(w * 0.42).toFixed(2)} ${(yDip * 0.55 + yPeak * 0.45).toFixed(2)}, ${(w * 0.2).toFixed(2)} ${yDip.toFixed(2)}, 0 ${yLeft.toFixed(2)}`,
      'Z',
    ].join(' ');

    return { clipD, strokeD, belowWaveFillD: aboveWaveFillD };
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

  /** Зона під хвилею — чорна маска поверх фото. */
  const belowWaveFillD = [
    `M 0 ${h}`,
    `L ${w} ${h}`,
    `L ${w} ${yRight.toFixed(2)}`,
    `C ${(w * 0.9).toFixed(2)} ${yRight.toFixed(2)}, ${(w * 0.78).toFixed(2)} ${yPeak.toFixed(2)}, ${(w * 0.6).toFixed(2)} ${(yPeak + amp * 0.08).toFixed(2)}`,
    `C ${(w * 0.42).toFixed(2)} ${(yDip * 0.55 + yPeak * 0.45).toFixed(2)}, ${(w * 0.2).toFixed(2)} ${yDip.toFixed(2)}, 0 ${yLeft.toFixed(2)}`,
    'Z',
  ].join(' ');

  return { clipD, strokeD, belowWaveFillD };
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
  width: widthProp = 0,
  topInset = 0,
  imageNudgeY = 0,
  bottomBleedPx = 0,
  waveEdge = 'bottom',
  imageContentPosition = 'top',
  waveFillColor = '#000000',
  style,
}) {
  const [layoutWidth, setLayoutWidth] = useState(0);
  const width = widthProp > 0 ? Math.round(widthProp) : layoutWidth;
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
  const imageKey = useMemo(() => {
    const resolved = Image.resolveAssetSource(source);
    return resolved?.uri ?? String(source);
  }, [source]);
  const imageTop = (isTopWave ? WAVE_STROKE_PAD : -bleedTop) + imageNudgeY;
  const topWaveImageExtend =
    isTopWave && imageNudgeY < 0 ? -imageNudgeY : 0;
  const imageHeight = isTopWave ? clipHeight + topWaveImageExtend : height + bleedTop;
  const clipTop = isTopWave ? WAVE_STROKE_PAD : 0;
  const waveTransform = isTopWave ? `translate(0, ${WAVE_STROKE_PAD})` : undefined;

  return (
    <View
      style={[
        styles.shell,
        { height: shellHeight, backgroundColor: isTopWave ? waveFillColor : 'transparent' },
        style,
      ]}
      onLayout={(e) => {
        const next = Math.round(e.nativeEvent.layout.width);
        if (next > 0) setLayoutWidth(next);
      }}
      pointerEvents="none"
    >
      {width > 0 && paths ? (
        <>
          <View
            style={[
              styles.heroPhotoClip,
              {
                width,
                height: clipHeight,
                top: clipTop,
              },
            ]}
          >
            <ExpoImage
              key={imageKey}
              source={source}
              style={{
                position: 'absolute',
                left: 0,
                width,
                top: imageTop - clipTop,
                height: imageHeight,
              }}
              contentFit="cover"
              contentPosition={imageContentPosition}
              cachePolicy="memory-disk"
              transition={0}
              accessibilityIgnoresInvertColors
              accessible={false}
            />
            <Svg
              width={width}
              height={clipHeight}
              style={styles.heroBelowWaveMask}
              pointerEvents="none"
            >
              <Path
                d={paths.belowWaveFillD}
                fill={waveFillColor}
                transform={isTopWave ? undefined : waveTransform}
              />
            </Svg>
          </View>
          <Svg width={width} height={shellHeight} style={styles.heroSvg} pointerEvents="none">
            <Path
              d={paths.strokeD}
              transform={waveTransform}
              fill="none"
              stroke={LEMON_GLOW}
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d={paths.strokeD}
              transform={waveTransform}
              fill="none"
              stroke={LEMON}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  heroPhotoClip: {
    position: 'absolute',
    left: 0,
    overflow: 'hidden',
  },
  heroBelowWaveMask: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  heroSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
