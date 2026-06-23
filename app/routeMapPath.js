import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';
import Ionicons from '@expo/vector-icons/Ionicons';
import { computeBearingDegrees, haversineKm } from './routePlannerCore';

/**
 * @param {{ latitude: number, longitude: number }[]} coords
 * @param {number} intervalM
 */
export function sampleRouteArrowMarkers(coords, intervalM = 72) {
  if (!coords || coords.length < 2) return [];
  const markers = [];
  let carried = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const a = coords[i - 1];
    const b = coords[i];
    const segM = haversineKm(a, b) * 1000;
    if (segM < 1) continue;
    const bearing = computeBearingDegrees(a, b);
    let along = intervalM - carried;
    while (along <= segM) {
      const t = along / segM;
      markers.push({
        id: `a-${i}-${markers.length}`,
        latitude: a.latitude + (b.latitude - a.latitude) * t,
        longitude: a.longitude + (b.longitude - a.longitude) * t,
        bearing,
      });
      along += intervalM;
    }
    carried = segM - (along - intervalM);
    if (carried >= intervalM) carried = 0;
  }
  return markers;
}

/**
 * @param {Array<{ start: object, end: object, distanceM: number, maneuver?: string }>} steps
 * @param {{ latitude: number, longitude: number } | null} pos
 */
export function resolveActiveNavigationStep(steps, pos) {
  if (!steps?.length || !pos) return steps?.[0] || null;
  const p = { lat: pos.latitude, lng: pos.longitude };
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const toEndM = haversineKm(p, step.end) * 1000;
    if (toEndM > 18 || i === steps.length - 1) return step;
  }
  return steps[steps.length - 1];
}

function maneuverLabel(maneuver, language) {
  const m = String(maneuver || 'straight').toLowerCase();
  const uk = {
    'turn-left': 'ліворуч',
    'turn-right': 'праворуч',
    'turn-slight-left': 'трохи ліворуч',
    'turn-slight-right': 'трохи праворуч',
    'turn-sharp-left': 'різко ліворуч',
    'turn-sharp-right': 'різко праворуч',
    'uturn-left': 'розворот',
    'uturn-right': 'розворот',
    roundabout: 'на кільці',
    'roundabout-left': 'на кільці ліворуч',
    'roundabout-right': 'на кільці праворуч',
    'fork-left': 'тримайтесь ліворуч',
    'fork-right': 'тримайтесь праворуч',
    'ramp-left': 'на з’їзд ліворуч',
    'ramp-right': 'на з’їзд праворуч',
    merge: 'злиття',
    arrive: 'прибули',
    straight: 'прямо',
  };
  const en = {
    'turn-left': 'turn left',
    'turn-right': 'turn right',
    'turn-slight-left': 'slight left',
    'turn-slight-right': 'slight right',
    'turn-sharp-left': 'sharp left',
    'turn-sharp-right': 'sharp right',
    'uturn-left': 'U-turn',
    'uturn-right': 'U-turn',
    roundabout: 'at the roundabout',
    'roundabout-left': 'roundabout, exit left',
    'roundabout-right': 'roundabout, exit right',
    'fork-left': 'keep left',
    'fork-right': 'keep right',
    'ramp-left': 'ramp left',
    'ramp-right': 'ramp right',
    merge: 'merge',
    arrive: 'you have arrived',
    straight: 'straight',
  };
  const table = language === 'en' ? en : uk;
  for (const key of Object.keys(table)) {
    if (m.includes(key)) return table[key];
  }
  return table.straight;
}

export function formatTurnInstruction(step, language, userPos) {
  if (!step) return '';
  const base = language === 'en' ? 'en' : 'uk';
  let distM = step.distanceM;
  if (userPos && step.end) {
    distM = Math.max(0, Math.round(haversineKm(userPos, step.end) * 1000));
  }
  const dist =
    distM >= 1000
      ? `${(distM / 1000).toFixed(1)} ${base === 'en' ? 'km' : 'км'}`
      : `${Math.max(10, Math.round(distM / 10) * 10)} ${base === 'en' ? 'm' : 'м'}`;
  const dir = maneuverLabel(step.maneuver, base);
  if (base === 'en') return `In ${dist} ${dir}`;
  return `Через ${dist} ${dir}`;
}

export function turnIconForManeuver(maneuver) {
  const m = String(maneuver || '').toLowerCase();
  if (m.includes('left')) return 'arrow-back';
  if (m.includes('right')) return 'arrow-forward';
  if (m.includes('uturn')) return 'return-up-back';
  return 'arrow-up';
}

/**
 * @param {'preview'|'road'|'nav'} mode
 */
export function RouteMapPath({
  coordinates,
  accent,
  isLight,
  mode = 'preview',
  showArrows = false,
}) {
  const solid = mode === 'nav' || mode === 'road';
  const arrowMarkers = useMemo(
    () => (showArrows && coordinates?.length >= 2 ? sampleRouteArrowMarkers(coordinates) : []),
    [coordinates, showArrows],
  );

  if (!coordinates || coordinates.length < 2) return null;

  const outlineColor = isLight ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.42)';
  const underColor = isLight ? 'rgba(2,18,235,0.28)' : 'rgba(120,210,255,0.38)';
  const dash = solid ? undefined : [7, 9];

  return (
    <>
      {!solid ? (
        <Polyline coordinates={coordinates} strokeColor={underColor} strokeWidth={6} lineDashPattern={[5, 7]} />
      ) : null}
      <Polyline
        coordinates={coordinates}
        strokeColor={outlineColor}
        strokeWidth={mode === 'nav' ? 10 : 7}
        lineDashPattern={dash}
      />
      <Polyline
        coordinates={coordinates}
        strokeColor={accent}
        strokeWidth={mode === 'nav' ? 6 : 4}
        lineDashPattern={dash}
      />
      {arrowMarkers.map((m) => (
        <Marker key={m.id} coordinate={m} anchor={{ x: 0.5, y: 0.5 }} flat tracksViewChanges={false}>
          <View
            style={{
              width: 18,
              height: 18,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ rotate: `${m.bearing}deg` }],
            }}
          >
            <Ionicons name="caret-up" size={16} color={accent} />
          </View>
        </Marker>
      ))}
    </>
  );
}
