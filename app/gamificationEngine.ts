/**
 * Система гейміфікації для KRAINA
 * Розраховує рівні, розблоковує бейджи при проходженні маршрутів
 */

import { db } from './firebaseConfig';
import {
  doc,
  getDoc,
  setDoc,
  increment,
  Timestamp,
  arrayUnion,
} from 'firebase/firestore';

export interface Achievement {
  id: string;
  type: 'LEVEL' | 'BADGE' | 'MILESTONE';
  level: number;
  title: string;
  icon: string;
  unlockedAt?: Timestamp;
  description: string;
}

export interface UserGamificationData {
  userId: string;
  totalLocationsVisited: number;
  totalXpEarned: number;
  currentLevel: number;
  unlockedAchievements: Achievement[];
  lastLevelUpAt?: Timestamp;
}

// Конфігурація рівнів
export const LEVEL_THRESHOLDS = {
  1: { xp: 0, minLocations: 0, title: 'Мандрівник-початківець', badge: '🥾' },
  2: { xp: 150, minLocations: 5, title: 'Дослідник', badge: '🗺️' },
  3: { xp: 600, minLocations: 20, title: 'Хранитель місць', badge: '🏛️' },
  4: { xp: 1500, minLocations: 50, title: 'Легенда місця', badge: '⭐' },
  5: { xp: 3000, minLocations: 100, title: 'Амбасадор KRAINA', badge: '👑' },
};

/**
 * Розраховує поточний рівень користувача
 */
export function calculateUserLevel(
  totalLocationsVisited: number,
  totalXpEarned: number,
): number {
  // Основний критерій - кількість локацій (як у слайді)
  if (totalLocationsVisited >= 100) return 5;
  if (totalLocationsVisited >= 50) return 4;
  if (totalLocationsVisited >= 20) return 3;
  if (totalLocationsVisited >= 5) return 2;
  return 1;
}

/**
 * Перевіряє, які досягнення розблоковані
 */
export function getUnlockedAchievements(
  totalLocationsVisited: number,
  totalXpEarned: number,
): Achievement[] {
  const achievements: Achievement[] = [];
  const currentLevel = calculateUserLevel(totalLocationsVisited, totalXpEarned);

  // Розблокуємо бейджи за рівні
  for (let level = 1; level <= currentLevel; level++) {
    const levelConfig = LEVEL_THRESHOLDS[level as keyof typeof LEVEL_THRESHOLDS];
    if (!levelConfig) continue;

    achievements.push({
      id: `level_${level}`,
      type: 'LEVEL',
      level,
      title: levelConfig.title,
      badge: levelConfig.badge,
      description: `Досягніть ${levelConfig.minLocations} локацій`,
    });
  }

  // Бонусні досягнення (можна додати більше)
  if (totalLocationsVisited >= 10) {
    achievements.push({
      id: 'explorer_10',
      type: 'MILESTONE',
      level: 0,
      title: 'Перший десяток',
      badge: '🎯',
      description: '10 локацій відвідано',
    });
  }

  if (totalLocationsVisited >= 25) {
    achievements.push({
      id: 'explorer_25',
      type: 'MILESTONE',
      level: 0,
      title: 'Чверть століття',
      badge: '🌟',
      description: '25 локацій відвідано',
    });
  }

  return achievements;
}

/**
 * Завантажує або створює гейміфікаційні дані користувача
 */
export async function loadUserGamificationData(
  userId: string,
): Promise<UserGamificationData> {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const docRef = doc(db, 'userAchievements', userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as UserGamificationData;
      return {
        ...data,
        currentLevel: calculateUserLevel(
          data.totalLocationsVisited,
          data.totalXpEarned,
        ),
      };
    }

    // Створюємо новий документ для користувача
    const newData: UserGamificationData = {
      userId,
      totalLocationsVisited: 0,
      totalXpEarned: 0,
      currentLevel: 1,
      unlockedAchievements: [],
    };

    await setDoc(docRef, newData);
    return newData;
  } catch (e) {
    console.error('[gamificationEngine] Error loading user data:', e);
    throw e;
  }
}

/**
 * Оновлює прогрес після проходження маршруту
 * Повертає інформацію про нові розблоковані досягнення
 */
export async function updateRouteCompletionProgress(
  userId: string,
  newLocationsCount: number,
  xpGained: number,
): Promise<{
  previousLevel: number;
  newLevel: number;
  newAchievements: Achievement[];
  leveledUp: boolean;
}> {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const docRef = doc(db, 'userAchievements', userId);
    const docSnap = await getDoc(docRef);

    let previousData = docSnap.exists()
      ? (docSnap.data() as UserGamificationData)
      : {
          userId,
          totalLocationsVisited: 0,
          totalXpEarned: 0,
          currentLevel: 1,
          unlockedAchievements: [],
        };

    const previousLevel = previousData.currentLevel;
    const newTotalLocations = previousData.totalLocationsVisited + newLocationsCount;
    const newTotalXp = previousData.totalXpEarned + xpGained;
    const newLevel = calculateUserLevel(newTotalLocations, newTotalXp);
    const leveledUp = newLevel > previousLevel;

    // Розраховуємо нові досягнення
    const newAchievements = getUnlockedAchievements(newTotalLocations, newTotalXp);

    // Оновлюємо документ
    const updateData: UserGamificationData = {
      userId,
      totalLocationsVisited: newTotalLocations,
      totalXpEarned: newTotalXp,
      currentLevel: newLevel,
      unlockedAchievements: newAchievements,
      ...(leveledUp && { lastLevelUpAt: Timestamp.now() }),
    };

    await setDoc(docRef, updateData, { merge: true });

    return {
      previousLevel,
      newLevel,
      newAchievements,
      leveledUp,
    };
  } catch (e) {
    console.error('[gamificationEngine] Error updating progress:', e);
    throw e;
  }
}

/**
 * Отримує поточне положення користувача у системі гейміфікації
 */
export async function getUserGameStatus(userId: string) {
  try {
    const data = await loadUserGamificationData(userId);
    const progressToNextLevel = getProgressToNextLevel(
      data.totalLocationsVisited,
      data.currentLevel,
    );

    return {
      level: data.currentLevel,
      title: LEVEL_THRESHOLDS[data.currentLevel as keyof typeof LEVEL_THRESHOLDS]?.title,
      badge: LEVEL_THRESHOLDS[data.currentLevel as keyof typeof LEVEL_THRESHOLDS]?.badge,
      totalLocations: data.totalLocationsVisited,
      totalXp: data.totalXpEarned,
      achievements: data.unlockedAchievements,
      progressToNextLevel,
    };
  } catch (e) {
    console.error('[gamificationEngine] Error getting game status:', e);
    throw e;
  }
}

/**
 * Розраховує прогрес до наступного рівня (в %)
 */
export function getProgressToNextLevel(
  currentLocations: number,
  currentLevel: number,
): number {
  const current = LEVEL_THRESHOLDS[currentLevel as keyof typeof LEVEL_THRESHOLDS];
  const next = LEVEL_THRESHOLDS[(currentLevel + 1) as keyof typeof LEVEL_THRESHOLDS];

  if (!current || !next) return 100;

  const progress = Math.min(
    100,
    Math.round(
      ((currentLocations - current.minLocations) /
        (next.minLocations - current.minLocations)) *
        100,
    ),
  );

  return Math.max(0, progress);
}
