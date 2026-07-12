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
export const NAV_SPEECH_THRESHOLDS_M = [250, 120, 60, 25];

export function isSignificantManeuver(maneuver) {
  const m = String(maneuver || '').toLowerCase();
  if (!m || m.includes('straight') || m.includes('continue') || m.includes('depart')) return false;
  return true;
}

export function resolveActiveStepIndex(steps, pos) {
  if (!steps?.length || !pos) return 0;
  for (let i = 0; i < steps.length - 1; i += 1) {
    const toEndM = haversineKm(pos, steps[i].end) * 1000;
    if (toEndM > 20) return i;
  }
  return steps.length - 1;
}

export function resolveActiveNavigationStep(steps, pos) {
  if (!steps?.length || !pos) return steps?.[0] || null;
  return steps[resolveActiveStepIndex(steps, pos)] || steps[steps.length - 1];
}

/** Наступний поворот або прибуття (пропускає прямі ділянки). */
export function resolveNextManeuverStep(steps, pos) {
  if (!steps?.length) return null;
  const startIdx = resolveActiveStepIndex(steps, pos);
  for (let i = startIdx; i < steps.length; i += 1) {
    const step = steps[i];
    const toEndM = haversineKm(pos, step.end) * 1000;
    const isLast = i === steps.length - 1;
    if (isSignificantManeuver(step.maneuver) || isLast) {
      if (toEndM > 8 || isLast) return step;
    }
    if (isSignificantManeuver(step.maneuver) && toEndM <= 8) continue;
  }
  return steps[steps.length - 1];
}

export function distanceToStepMeters(step, userPos) {
  if (!step?.end || !userPos) return null;
  return Math.max(0, Math.round(haversineKm(userPos, step.end) * 1000));
}

/** Відстань уздовж кроків Directions до точки маневру. */
export function distanceToManeuverStep(steps, pos, maneuverStep) {
  if (!maneuverStep?.end || !pos || !steps?.length) return null;
  const idx = resolveActiveStepIndex(steps, pos);
  const targetIdx = steps.indexOf(maneuverStep);
  if (targetIdx < 0) return distanceToStepMeters(maneuverStep, pos);

  let total = haversineKm(pos, steps[idx].end) * 1000;
  for (let i = idx + 1; i <= targetIdx; i += 1) {
    const segM =
      steps[i].distanceM ||
      (steps[i].start ? haversineKm(steps[i].start, steps[i].end) * 1000 : 0);
    total += segM;
  }
  return Math.max(0, Math.round(total));
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

function maneuverVerb(maneuver, language) {
  const m = String(maneuver || 'straight').toLowerCase();
  const uk = {
    'turn-left': 'поверніть ліворуч',
    'turn-right': 'поверніть праворуч',
    'turn-slight-left': 'трохи поверніть ліворуч',
    'turn-slight-right': 'трохи поверніть праворуч',
    'turn-sharp-left': 'різко поверніть ліворуч',
    'turn-sharp-right': 'різко поверніть праворуч',
    'uturn-left': 'розверніться',
    'uturn-right': 'розверніться',
    roundabout: 'на кільці',
    'roundabout-left': 'на кільці поверніть ліворуч',
    'roundabout-right': 'на кільці поверніть праворуч',
    'fork-left': 'тримайтесь ліворуч',
    'fork-right': 'тримайтесь праворуч',
    'ramp-left': 'на з’їзд ліворуч',
    'ramp-right': 'на з’їзд праворуч',
    merge: 'злийтеся в потік',
    arrive: 'ви прибули',
    straight: 'рухайтесь прямо',
  };
  const en = {
    'turn-left': 'turn left',
    'turn-right': 'turn right',
    'turn-slight-left': 'bear left',
    'turn-slight-right': 'bear right',
    'turn-sharp-left': 'turn sharp left',
    'turn-sharp-right': 'turn sharp right',
    'uturn-left': 'make a U-turn',
    'uturn-right': 'make a U-turn',
    roundabout: 'at the roundabout',
    'roundabout-left': 'at the roundabout, turn left',
    'roundabout-right': 'at the roundabout, turn right',
    'fork-left': 'keep left',
    'fork-right': 'keep right',
    'ramp-left': 'take the ramp left',
    'ramp-right': 'take the ramp right',
    merge: 'merge',
    arrive: 'you have arrived',
    straight: 'continue straight',
  };
  const table = language === 'en' ? en : uk;
  for (const key of Object.keys(table)) {
    if (m.includes(key)) return table[key];
  }
  return table.straight;
}

export function formatNavDistanceM(meters, language = 'uk') {
  if (meters == null || !Number.isFinite(meters)) return '…';
  const en = language === 'en';
  if (meters >= 1000) {
    const km = meters >= 10000 ? Math.round(meters / 1000) : (meters / 1000).toFixed(1);
    return en ? `${km} km` : `${km} км`;
  }
  const rounded = Math.max(10, Math.round(meters / 10) * 10);
  return en ? `${rounded} m` : `${rounded} м`;
}

export function formatTurnInstruction(step, language, userPos, options = {}) {
  if (!step) return '';
  const base = language === 'en' ? 'en' : 'uk';
  let distM = options.distM;
  if (distM == null && options.steps?.length) {
    distM = distanceToManeuverStep(options.steps, userPos, step);
  }
  if (distM == null) distM = distanceToStepMeters(step, userPos);
  if (distM == null || !Number.isFinite(distM)) distM = step.distanceM || 0;

  const maneuver = String(step.maneuver || '').toLowerCase();
  const dist = formatNavDistanceM(distM, base);
  const verb = maneuverVerb(step.maneuver, base);

  if (maneuver.includes('arrive')) {
    if (distM <= 25) return base === 'en' ? 'You have arrived' : 'Ви прибули';
    return base === 'en' ? `${dist} to destination` : `${dist} до пункту призначення`;
  }

  if (distM <= 20) {
    return base === 'en' ? `${verb} now` : `Зараз ${verb}`;
  }

  if (base === 'en') return `In ${dist}, ${verb}`;
  return `Через ${dist} ${verb}`;
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
  const arrowIntervalM = mode === 'nav' ? 48 : 72;
  const arrowMarkers = useMemo(
    () => (showArrows && coordinates?.length >= 2 ? sampleRouteArrowMarkers(coordinates, arrowIntervalM) : []),
    [coordinates, showArrows, arrowIntervalM],
  );

  if (!coordinates || coordinates.length < 2) return null;

  const outlineColor = isLight ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.45)';
  const underColor =
    mode === 'nav'
      ? 'rgba(2,18,235,0.52)'
      : isLight
        ? 'rgba(2,18,235,0.28)'
        : 'rgba(120,210,255,0.38)';
  const dash = solid ? undefined : [7, 9];
  const mainWidth = mode === 'nav' ? 9 : mode === 'road' ? 5 : 4;
  const outlineWidth = mode === 'nav' ? 16 : mode === 'road' ? 9 : 7;

  return (
    <>
      {!solid ? (
        <Polyline coordinates={coordinates} strokeColor={underColor} strokeWidth={6} lineDashPattern={[5, 7]} />
      ) : null}
      <Polyline
        coordinates={coordinates}
        strokeColor={outlineColor}
        strokeWidth={outlineWidth}
        lineDashPattern={dash}
      />
      <Polyline
        coordinates={coordinates}
        strokeColor={accent}
        strokeWidth={mainWidth}
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
