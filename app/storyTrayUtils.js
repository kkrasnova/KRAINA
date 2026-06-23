import { ACCENT_BLUE, ACCENT_LEMON } from './themeAccent';
import { isNavigableSocialUsername } from './socialFollowSyncEvents';

export const STORY_TRAY_AVATAR_WRAP = 28;
export const STORY_TRAY_AVATAR_RING_BORDER = 3;
export const STORY_TRAY_AVATAR_INNER =
  STORY_TRAY_AVATAR_WRAP - STORY_TRAY_AVATAR_RING_BORDER * 2;

/** Кільце навколо аватарки: яскраве — є непереглянуті, тьмяніше — усі переглянуті, без кільця — немає історій. */
export function storyAvatarRingStyle({ hasStories = false, hasUnviewed = false, isLight = true } = {}) {
  if (!hasStories) return { borderWidth: 0 };
  const bright = !!hasUnviewed;
  if (isLight) {
    return {
      borderWidth: 3,
      borderColor: bright ? ACCENT_BLUE : 'rgba(2, 18, 235, 0.38)',
    };
  }
  return {
    borderWidth: 3,
    borderColor: bright ? ACCENT_LEMON : 'rgba(225, 255, 0, 0.45)',
  };
}

/** Перша непереглянута історія; з профілю при повному перегляді — з початку. */
export function pickStoryStartIndex(stories, { isAuthor = false, fromProfile = false } = {}) {
  if (!Array.isArray(stories) || !stories.length) return 0;
  const unseen = (s) =>
    isAuthor ? !s.own_seen_by_viewer : !s.seen_by_viewer;
  const firstUnviewed = stories.findIndex(unseen);
  if (firstUnviewed >= 0) return firstUnviewed;
  return fromProfile ? 0 : 0;
}

export function storiesHasUnviewed(stories, { isAuthor = false } = {}) {
  if (!Array.isArray(stories) || !stories.length) return false;
  return stories.some((s) => (isAuthor ? !s.own_seen_by_viewer : !s.seen_by_viewer));
}

/** Показувати рядок у стрічці «Історії» лише якщо є непереглянуті. */
export function shouldShowStoryInFeedTray(row) {
  if (!row) return false;
  const username = row.username != null ? String(row.username) : '';
  if (username.trim() && !isNavigableSocialUsername(username)) return false;
  const count = Number(row.story_count);
  if (Number.isFinite(count) && count <= 0) return false;
  if (row.has_unviewed === false) return false;
  if (row.has_unviewed === true) return true;
  return !row.seen_by_viewer;
}
