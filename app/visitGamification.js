/**
 * Локальна гейміфікація за журналом відвідувань (`visitStatsStorage`).
 * Перше відкриття локації дає більше XP, повторні — менше; рівень зростає за сумарним XP.
 */

/** Мінімальний XP для рівнів 1…10 (рівень N при XP >= XP_FOR_LEVEL[N-1]). */
const XP_FOR_LEVEL = [0, 200, 500, 1000, 1800, 3000, 4800, 7000, 10000, 14000];

const MAX_LEVEL = XP_FOR_LEVEL.length;

/** Ключ однієї «локації» для унікальних місць і бонусу за перший візит. */
export function visitPlaceKey(v) {
  const city = String(v?.city || '—').trim().toLowerCase();
  const label = String(v?.label || '').trim().toLowerCase();
  if (label) return `L:${label}|${city}`;
  return `C:${city}|${String(v?.category || 'other')}`;
}

export function computeVisitXp(visits) {
  const list = Array.isArray(visits) ? visits.filter((v) => v && v.physicalVisit === true) : [];
  const seen = new Set();
  for (const v of list) {
    seen.add(visitPlaceKey(v));
  }
  return { xp: 0, uniquePlaces: seen.size, totalVisits: list.length };
}

/**
 * @param {Array<{ at?: string, city?: string, label?: string, category?: string }>} visits
 * @returns {{
 *   totalVisits: number,
 *   uniquePlaces: number,
 *   xp: number,
 *   level: number,
 *   levelMinXp: number,
 *   nextLevelXp: number | null,
 *   progressInLevel: number,
 *   titleKey: string,
 * }}
 */
export function computeGamificationFromVisits(visits, extraXp = 0) {
  const { xp, uniquePlaces, totalVisits } = computeVisitXp(visits);
  const bonusXp = Math.max(0, Math.round(Number(extraXp) || 0));
  const totalXp = xp + bonusXp;

  let level = 1;
  for (let i = 1; i < MAX_LEVEL; i += 1) {
    if (totalXp >= XP_FOR_LEVEL[i]) level = i + 1;
  }
  level = Math.min(Math.max(1, level), MAX_LEVEL);

  const levelMinXp = XP_FOR_LEVEL[level - 1];
  const nextLevelXp = level < MAX_LEVEL ? XP_FOR_LEVEL[level] : null;

  let progressInLevel = 1;
  if (nextLevelXp != null && nextLevelXp > levelMinXp) {
    progressInLevel = Math.min(
      1,
      Math.max(0, (totalXp - levelMinXp) / (nextLevelXp - levelMinXp)),
    );
  }

  const titleKey = `gamifyRank${level}`;

  return {
    totalVisits,
    uniquePlaces,
    xp: totalXp,
    visitXp: xp,
    quizXp: bonusXp,
    level,
    levelMinXp,
    nextLevelXp,
    progressInLevel,
    titleKey,
  };
}
