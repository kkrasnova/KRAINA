/**
 * Catalog + evaluation of hub achievements (local progress).
 * XP values are display rewards for the milestone (actual XP already tracked elsewhere).
 */

export const HUB_ACHIEVEMENT_CATALOG = [
  {
    id: 'first_photo',
    icon: 'camera-outline',
    titleKey: 'achFirstPhotoTitle',
    hintKey: 'achFirstPhotoHint',
    xp: 100,
    category: 'social',
    check: (p) => (p.postsCount || 0) >= 1,
    progress: (p) => ({ current: Math.min(1, p.postsCount || 0), target: 1 }),
  },
  {
    id: 'photos_5',
    icon: 'images-outline',
    titleKey: 'achPhotos5Title',
    hintKey: 'achPhotos5Hint',
    xp: 150,
    category: 'social',
    check: (p) => (p.postsCount || 0) >= 5,
    progress: (p) => ({ current: Math.min(5, p.postsCount || 0), target: 5 }),
  },
  {
    id: 'photos_10',
    icon: 'albums-outline',
    titleKey: 'achPhotos10Title',
    hintKey: 'achPhotos10Hint',
    xp: 250,
    category: 'social',
    check: (p) => (p.postsCount || 0) >= 10,
    progress: (p) => ({ current: Math.min(10, p.postsCount || 0), target: 10 }),
  },
  {
    id: 'first_quiz',
    icon: 'sparkles-outline',
    titleKey: 'achFirstQuizTitle',
    hintKey: 'achFirstQuizHint',
    xp: 100,
    category: 'quiz',
    check: (p) => (p.quizCompleted || 0) >= 1,
    progress: (p) => ({ current: Math.min(1, p.quizCompleted || 0), target: 1 }),
  },
  {
    id: 'quizzes_3',
    icon: 'school-outline',
    titleKey: 'achQuizzes3Title',
    hintKey: 'achQuizzes3Hint',
    xp: 150,
    category: 'quiz',
    check: (p) => (p.quizCompleted || 0) >= 3,
    progress: (p) => ({ current: Math.min(3, p.quizCompleted || 0), target: 3 }),
  },
  {
    id: 'quizzes_10',
    icon: 'trophy-outline',
    titleKey: 'achQuizzes10Title',
    hintKey: 'achQuizzes10Hint',
    xp: 300,
    category: 'quiz',
    check: (p) => (p.quizCompleted || 0) >= 10,
    progress: (p) => ({ current: Math.min(10, p.quizCompleted || 0), target: 10 }),
  },
  {
    id: 'first_place',
    icon: 'location-outline',
    titleKey: 'achFirstPlaceTitle',
    hintKey: 'achFirstPlaceHint',
    xp: 50,
    category: 'explore',
    check: (p) => (p.uniquePlaces || 0) >= 1,
    progress: (p) => ({ current: Math.min(1, p.uniquePlaces || 0), target: 1 }),
  },
  {
    id: 'places_5',
    icon: 'map-outline',
    titleKey: 'achPlaces5Title',
    hintKey: 'achPlaces5Hint',
    xp: 100,
    category: 'explore',
    check: (p) => (p.uniquePlaces || 0) >= 5,
    progress: (p) => ({ current: Math.min(5, p.uniquePlaces || 0), target: 5 }),
  },
  {
    id: 'places_10',
    icon: 'navigate-outline',
    titleKey: 'achPlaces10Title',
    hintKey: 'achPlaces10Hint',
    xp: 150,
    category: 'explore',
    check: (p) => (p.uniquePlaces || 0) >= 10,
    progress: (p) => ({ current: Math.min(10, p.uniquePlaces || 0), target: 10 }),
  },
  {
    id: 'places_25',
    icon: 'globe-outline',
    titleKey: 'achPlaces25Title',
    hintKey: 'achPlaces25Hint',
    xp: 300,
    category: 'explore',
    check: (p) => (p.uniquePlaces || 0) >= 25,
    progress: (p) => ({ current: Math.min(25, p.uniquePlaces || 0), target: 25 }),
  },
  {
    id: 'places_50',
    icon: 'flag-outline',
    titleKey: 'achPlaces50Title',
    hintKey: 'achPlaces50Hint',
    xp: 500,
    category: 'explore',
    check: (p) => (p.uniquePlaces || 0) >= 50,
    progress: (p) => ({ current: Math.min(50, p.uniquePlaces || 0), target: 50 }),
  },
  {
    id: 'first_physical',
    icon: 'walk-outline',
    titleKey: 'achFirstPhysicalTitle',
    hintKey: 'achFirstPhysicalHint',
    xp: 50,
    category: 'explore',
    check: (p) => (p.physicalVisits || 0) >= 1,
    progress: (p) => ({ current: Math.min(1, p.physicalVisits || 0), target: 1 }),
  },
  {
    id: 'physical_5',
    icon: 'fitness-outline',
    titleKey: 'achPhysical5Title',
    hintKey: 'achPhysical5Hint',
    xp: 150,
    category: 'explore',
    check: (p) => (p.physicalVisits || 0) >= 5,
    progress: (p) => ({ current: Math.min(5, p.physicalVisits || 0), target: 5 }),
  },
  {
    id: 'level_3',
    icon: 'ribbon-outline',
    titleKey: 'achLevel3Title',
    hintKey: 'achLevel3Hint',
    xp: 100,
    category: 'level',
    check: (p) => (p.level || 1) >= 3,
    progress: (p) => ({ current: Math.min(3, p.level || 1), target: 3 }),
  },
  {
    id: 'level_5',
    icon: 'medal-outline',
    titleKey: 'achLevel5Title',
    hintKey: 'achLevel5Hint',
    xp: 200,
    category: 'level',
    check: (p) => (p.level || 1) >= 5,
    progress: (p) => ({ current: Math.min(5, p.level || 1), target: 5 }),
  },
  {
    id: 'xp_500',
    icon: 'flash-outline',
    titleKey: 'achXp500Title',
    hintKey: 'achXp500Hint',
    xp: 50,
    category: 'level',
    check: (p) => (p.totalXp || 0) >= 500,
    progress: (p) => ({ current: Math.min(500, p.totalXp || 0), target: 500 }),
  },
  {
    id: 'xp_1000',
    icon: 'star-outline',
    titleKey: 'achXp1000Title',
    hintKey: 'achXp1000Hint',
    xp: 100,
    category: 'level',
    check: (p) => (p.totalXp || 0) >= 1000,
    progress: (p) => ({ current: Math.min(1000, p.totalXp || 0), target: 1000 }),
  },
  {
    id: 'wheel_first',
    icon: 'aperture-outline',
    titleKey: 'achWheelTitle',
    hintKey: 'achWheelHint',
    xp: 50,
    category: 'rewards',
    check: (p) => (p.wheelSpent || 0) > 0,
    progress: (p) => ({ current: (p.wheelSpent || 0) > 0 ? 1 : 0, target: 1 }),
  },
];

/**
 * @param {object} progress
 * @returns {{ unlocked: object[], locked: object[], unlockedCount: number, totalCount: number }}
 */
export function evaluateHubAchievements(progress = {}) {
  const unlocked = [];
  const locked = [];
  for (const def of HUB_ACHIEVEMENT_CATALOG) {
    const prog = typeof def.progress === 'function' ? def.progress(progress) : { current: 0, target: 1 };
    const row = {
      id: def.id,
      icon: def.icon,
      titleKey: def.titleKey,
      hintKey: def.hintKey,
      xp: def.xp,
      category: def.category,
      current: Number(prog.current) || 0,
      target: Math.max(1, Number(prog.target) || 1),
    };
    row.ratio = Math.min(1, row.current / row.target);
    if (def.check(progress)) {
      unlocked.push({ ...row, unlocked: true });
    } else {
      locked.push({ ...row, unlocked: false });
    }
  }
  // Locked: nearest to unlock first
  locked.sort((a, b) => b.ratio - a.ratio || a.target - b.target);
  return {
    unlocked,
    locked,
    unlockedCount: unlocked.length,
    totalCount: HUB_ACHIEVEMENT_CATALOG.length,
  };
}
