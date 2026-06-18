import { WAVE_STROKE_PAD } from './AuthHeroHeader';

/** Єдиний помірний зазор «лаймова хвиля / фото → текст» на Android (усі екрани й мови). */
export const ANDROID_HERO_TEXT_GAP_MIN_PX = 10;
export const ANDROID_HERO_TEXT_GAP_MAX_PX = 14;

/** Android: зсув фото й лаймової хвилі вниз (+translateY) на всіх баннерах. */
export const ANDROID_HERO_BANNER_DOWN_MIN_PX = 24;
export const ANDROID_HERO_BANNER_DOWN_MAX_PX = 36;

export function androidHeroBannerExtraDownPx(screenHeight) {
  return Math.round(
    Math.max(
      ANDROID_HERO_BANNER_DOWN_MIN_PX,
      Math.min(ANDROID_HERO_BANNER_DOWN_MAX_PX, screenHeight * 0.032),
    ),
  );
}

export function androidHeroTextGapPx(screenHeight) {
  return Math.round(
    Math.max(
      ANDROID_HERO_TEXT_GAP_MIN_PX,
      Math.min(ANDROID_HERO_TEXT_GAP_MAX_PX, screenHeight * 0.014),
    ),
  );
}

/** Нижня межа героя (лаймова хвиля) у координатах екрана, y зверху. */
export function authHeroBannerBottomY({
  heroHeight,
  topInset = 0,
  heroLiftPx = 0,
}) {
  return -topInset + heroHeight + WAVE_STROKE_PAD + heroLiftPx;
}

/**
 * paddingTop для блоку копії / форми під героєм (Android).
 * Гарантує невеликий однаковий зазор після хвилі незалежно від зсуву фото.
 */
export function androidCopyPaddingTopFromHero({
  bannerBottomY,
  overlayTopPad,
  textGapPx,
  maxTopReservePx = Number.POSITIVE_INFINITY,
}) {
  const raw = Math.round(bannerBottomY - overlayTopPad + textGapPx);
  return Math.min(Math.max(textGapPx, raw), maxTopReservePx);
}
