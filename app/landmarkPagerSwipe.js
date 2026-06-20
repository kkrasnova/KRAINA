import { PanResponder } from 'react-native';

export const LANDMARK_SWIPE_THRESHOLD = 28;
export const LANDMARK_SWIPE_DOMINANCE = 1.25;
export const LANDMARK_SWIPE_DOWN_DISMISS_PX = 40;

export function isLandmarkHorizontalSwipe(g) {
  const ax = Math.abs(g.dx);
  const ay = Math.abs(g.dy);
  return ax > 12 && ax > ay * LANDMARK_SWIPE_DOMINANCE;
}

export function isLandmarkSwipeComplete(g, threshold = LANDMARK_SWIPE_THRESHOLD) {
  const ax = Math.abs(g.dx);
  const ay = Math.abs(g.dy);
  if (!isLandmarkHorizontalSwipe(g) || ax < ay) return false;
  if (ax >= threshold) return true;
  return Math.abs(g.vx || 0) > 0.35 && ax > 18;
}

/**
 * Горизонтальний свайп для пейджера локацій:
 * dx < 0 — наступна сторінка, dx > 0 — назад / попередня.
 */
export function createLandmarkPagerPanResponder({
  enabled = true,
  onSwipeLeft,
  onSwipeRight,
  onSwipeDown,
  onSwipeUp,
  canSwipeDown,
  canSwipeUp,
}) {
  if (!enabled) return null;
  const hasSwipeUp = typeof onSwipeUp === 'function';
  const hasSwipeDown = typeof onSwipeDown === 'function';
  return PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => {
      if (hasSwipeDown && (canSwipeDown?.() ?? true) && g.dy > 16 && Math.abs(g.dy) > Math.abs(g.dx) * 1.12) return true;
      if (hasSwipeUp && (canSwipeUp?.() ?? true) && g.dy < -16 && Math.abs(g.dy) > Math.abs(g.dx) * 1.12) return true;
      return isLandmarkHorizontalSwipe(g);
    },
    onMoveShouldSetPanResponder: (_, g) => {
      if (hasSwipeDown && (canSwipeDown?.() ?? true) && g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.05) return true;
      if (hasSwipeUp && (canSwipeUp?.() ?? true) && g.dy < -12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.05) return true;
      return isLandmarkHorizontalSwipe(g) && Math.abs(g.dx) > 16;
    },
    onPanResponderTerminationRequest: (_, g) =>
      !isLandmarkHorizontalSwipe(g) &&
      !(hasSwipeUp && (canSwipeUp?.() ?? true) && g.dy < -8 && Math.abs(g.dy) > Math.abs(g.dx)) &&
      !(hasSwipeDown && (canSwipeDown?.() ?? true) && g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx)),
    onPanResponderRelease: (_, g) => {
      const ax = Math.abs(g.dx);
      const ay = Math.abs(g.dy);
      if (hasSwipeDown && (canSwipeDown?.() ?? true) && g.dy > LANDMARK_SWIPE_DOWN_DISMISS_PX && ay > ax * 1.05) {
        onSwipeDown?.();
        return;
      }
      if (hasSwipeUp && (canSwipeUp?.() ?? true) && g.dy < -40 && ay > ax * 1.05) {
        onSwipeUp?.();
        return;
      }
      if (!isLandmarkSwipeComplete(g)) return;
      if (g.dx < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    },
  });
}
