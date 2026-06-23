import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { pf } from './profileI18n';
import { brandFontSansSemibold } from './brandFont';

function clampDisplayLevel(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 1;
  return Math.min(10, Math.max(1, v));
}

/** Іконка змінюється з рівнем — від мандрівника до легенди. */
const LEVEL_ICONS = [
  'footsteps-outline',
  'compass-outline',
  'git-branch-outline',
  'navigate-outline',
  'rocket-outline',
  'flame-outline',
  'map-outline',
  'earth-outline',
  'diamond-outline',
  'trophy',
];

export function levelIconName(level) {
  return LEVEL_ICONS[clampDisplayLevel(level) - 1] || LEVEL_ICONS[0];
}

/**
 * Компактний значок рівня для шапки профілю (без окремої картки).
 */
export default function ProfileLevelBadge({ level, language, accent, isLight, onPress }) {
  const lvl = clampDisplayLevel(level);
  const icon = levelIconName(lvl);
  const title = pf(language, `gamifyRank${lvl}`);
  const ring = isLight ? 'rgba(2, 18, 235, 0.22)' : 'rgba(255, 255, 255, 0.28)';
  const fill = isLight ? '#FFFFFF' : 'rgba(0,0,0,0.35)';

  const inner = (
    <View style={[styles.badge, { borderColor: accent, backgroundColor: fill }]}>
      <Ionicons name={icon} size={16} color={accent} />
      <View style={[styles.levelPip, { backgroundColor: accent, borderColor: ring }]}>
        <Text style={[styles.levelNum, brandFontSansSemibold]}>{lvl}</Text>
      </View>
    </View>
  );

  if (!onPress) return inner;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.hit, pressed && { opacity: Platform.OS === 'ios' ? 0.82 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${pf(language, 'gamifyOpenStatsA11y')}`}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    marginLeft: 8,
    alignSelf: 'flex-start',
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelPip: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  levelNum: {
    fontSize: 10,
    lineHeight: 12,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
