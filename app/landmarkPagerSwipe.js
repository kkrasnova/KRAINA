import { PanResponder } from 'react-native';

export const LANDMARK_SWIPE_THRESHOLD = 28;
export const LANDMARK_SWIPE_DOMINANCE = 1.55;
export const LANDMARK_SWIPE_DOWN_DISMISS_PX = 40;
export const LANDMARK_SWIPE_UP_DISMISS_PX = 40;
export const LANDMARK_SCROLL_PULL_DISMISS_PX = 36;

export function isLandmarkVerticalDismissSwipe(g, direction = 'down') {
  const ax = Math.abs(g.dx);
  const ay = Math.abs(g.dy);
  if (direction === 'down') {
    return g.dy > 8 && ay > ax * 0.9;
  }
  return g.dy < -8 && ay > ax * 0.9;
}

export function isLandmarkVerticalDismissComplete(g, direction = 'down') {
  const ax = Math.abs(g.dx);
  const ay = Math.abs(g.dy);
  const threshold =
    direction === 'down' ? LANDMARK_SWIPE_DOWN_DISMISS_PX : LANDMARK_SWIPE_UP_DISMISS_PX;
  if (direction === 'down') {
    return g.dy > threshold && ay > ax * 1.02;
  }
  return g.dy < -threshold && ay > ax * 1.02;
}

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
  horizontalEnabled = true,
  onSwipeLeft,
  onSwipeRight,
  onSwipeDown,
  onSwipeUp,
  canSwipeDown,
  canSwipeUp,
  /** When true, predominantly vertical drags stay with ScrollView (intro/quiz pages). */
  preferVerticalScroll,
}) {
  if (!enabled) return null;
  const hasSwipeUp = typeof onSwipeUp === 'function';
  const hasSwipeDown = typeof onSwipeDown === 'function';
  const hasSwipeLeft = typeof onSwipeLeft === 'function';
  const hasSwipeRight = typeof onSwipeRight === 'function';
  const captureHorizontal =
    horizontalEnabled && (hasSwipeLeft || hasSwipeRight);
  const shouldDeferToVerticalScroll = (g) => {
    if (typeof preferVerticalScroll !== 'function' || !preferVerticalScroll()) return false;
    const ax = Math.abs(g.dx);
    const ay = Math.abs(g.dy);
    // Будь-який помітно вертикальний рух одразу віддаємо скролу — менше випадкових
    // перегортань і смикань під час читання.
    return ay > 3 && ay >= ax * 0.5;
  };
  const isStrongHorizontalSwipe = (g) => {
    const ax = Math.abs(g.dx);
    const ay = Math.abs(g.dy);
    if (typeof preferVerticalScroll === 'function' && preferVerticalScroll()) {
      // Перегортаємо лише на явно горизонтальний жест (домінування 2×),
      // інакше вертикальний скрол лишається у ScrollView.
      return ax > 22 && ax > ay * 2;
    }
    return isLandmarkHorizontalSwipe(g);
  };
  const isStrongHorizontalSwipeComplete = (g, threshold = LANDMARK_SWIPE_THRESHOLD) => {
    const ax = Math.abs(g.dx);
    const ay = Math.abs(g.dy);
    if (!isStrongHorizontalSwipe(g)) return false;
    if (ax >= threshold) return true;
    return Math.abs(g.vx || 0) > 0.32 && ax > 16;
  };
  return PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponderCapture: (_, g) => {
      if (shouldDeferToVerticalScroll(g)) return false;
      if (hasSwipeDown && (canSwipeDown?.() ?? true) && isLandmarkVerticalDismissSwipe(g, 'down')) return true;
      if (hasSwipeUp && (canSwipeUp?.() ?? true) && isLandmarkVerticalDismissSwipe(g, 'up')) return true;
      return captureHorizontal && isStrongHorizontalSwipe(g);
    },
    onMoveShouldSetPanResponder: (_, g) => {
      if (shouldDeferToVerticalScroll(g)) return false;
      if (hasSwipeDown && (canSwipeDown?.() ?? true) && isLandmarkVerticalDismissSwipe(g, 'down')) return true;
      if (hasSwipeUp && (canSwipeUp?.() ?? true) && isLandmarkVerticalDismissSwipe(g, 'up')) return true;
      return captureHorizontal && isStrongHorizontalSwipe(g) && Math.abs(g.dx) > 16;
    },
    onPanResponderTerminationRequest: (_, g) =>
      !(captureHorizontal && isStrongHorizontalSwipe(g)) &&
      !(hasSwipeUp && (canSwipeUp?.() ?? true) && isLandmarkVerticalDismissSwipe(g, 'up')) &&
      !(hasSwipeDown && (canSwipeDown?.() ?? true) && isLandmarkVerticalDismissSwipe(g, 'down')),
    onPanResponderRelease: (_, g) => {
      if (hasSwipeDown && (canSwipeDown?.() ?? true) && isLandmarkVerticalDismissComplete(g, 'down')) {
        onSwipeDown?.();
        return;
      }
      if (hasSwipeUp && (canSwipeUp?.() ?? true) && isLandmarkVerticalDismissComplete(g, 'up')) {
        onSwipeUp?.();
        return;
      }
      if (!captureHorizontal || !isStrongHorizontalSwipeComplete(g)) return;
      if (g.dx < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    },
  });
}
