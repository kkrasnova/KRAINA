/**
 * Нижня смуга останнього слайду онбордингу: Spline.
 *
 * iOS: нативно splineswift. Android: лише WebView + splineswift (нативний splinecontent давав crash).
 * Фолбек WebView: публічний Web-URL з Spline (Export → Web / Public URL) — інший формат, ніж build.
 */
export const SPLINE_BUILD_SCENE_PATH = 'BtmP-85CLdCeHSuPryE2';

const buildBase = (ext) =>
  `https://build.spline.design/${SPLINE_BUILD_SCENE_PATH}/scene.${ext}`;

/**
 * Фолбек WebView, якщо нативний Spline недоступний.
 * Раніше тут була інша сцена («кімната») — через це Android відрізнявся від iPhone.
 * Залиш порожнім або встав публічний Web-URL саме цієї ж сцени (SPLINE_BUILD_SCENE_PATH).
 */
export const FINAL_ONBOARD_SPLINE_LOWER_URL = '';

/** iOS — SplineRuntime (SplineView(sceneFileURL:)) */
export const FINAL_ONBOARD_SPLINE_NATIVE_IOS = buildBase('splineswift');

/** Залишено для сумісності; на Android нативний Spline не використовується (див. OnboardingSplineLowerBand). */
export const FINAL_ONBOARD_SPLINE_NATIVE_ANDROID = buildBase('splinecontent');

/** Слайд «цікаві пам’ятки»: iOS — нативний splineswift; Android — WebView (див. LandmarksSplineBand). */
export const LANDMARKS_SPLINE_NATIVE_IOS = buildBase('splineswift');
/** @deprecated Не використовується — нативний Android Spline вимкнено. */
export const LANDMARKS_SPLINE_NATIVE_ANDROID = buildBase('splinecontent');
