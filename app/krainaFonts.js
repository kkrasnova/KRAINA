/**
 * Локальні шрифти KRAÏNA: e-Ukraine, e-Ukraine Head, PP Pangram Sans (особисте використання).
 *
 * CRITICAL — шрифти, які реально використовуються в brandFont.js/appTypography.js.
 * DEFERRED — рідкісні варіанти, що не використовуються в поточному UI.
 *
 * Завантаження: критичні через useFonts(KRAINA_FONT_MAP_CRITICAL) у App.js;
 * відкладені завантажуються після першого рендера (InteractionManager).
 */

/** Шрифти, що реально використовуються в UI (brandFont.js, appTypography.js). */
export const KRAINA_FONT_MAP_CRITICAL = {
  'e-Ukraine': require('./assets/fonts/e-ukraine/e-Ukraine-Regular.otf'),
  'e-Ukraine-Medium': require('./assets/fonts/e-ukraine/e-Ukraine-Medium.otf'),
  'e-Ukraine-Bold': require('./assets/fonts/e-ukraine/e-Ukraine-Bold.otf'),
  'e-Ukraine-Light': require('./assets/fonts/e-ukraine/e-Ukraine-Light.otf'),

  'e-UkraineHead': require('./assets/fonts/e-ukraine-head/e-UkraineHead-Regular.otf'),
  'e-UkraineHead-Medium': require('./assets/fonts/e-ukraine-head/e-UkraineHead-Medium.otf'),
  'e-UkraineHead-Bold': require('./assets/fonts/e-ukraine-head/e-UkraineHead-Bold.otf'),
  'e-UkraineHead-LOGO': require('./assets/fonts/e-ukraine-head/e-UkraineHead-LOGO.otf'),

  PangramSans: require('./assets/fonts/pangram/PPPangramSans-CompactRegular.otf'),
  'PangramSans-Medium': require('./assets/fonts/pangram/PPPangramSans-Medium.otf'),
  'PangramSans-Bold': require('./assets/fonts/pangram/PPPangramSans-Bold.otf'),
  'PangramSans-Semibold': require('./assets/fonts/pangram/PPPangramSans-Semibold.otf'),
};

/** Рідкісні варіанти, які не використовуються в поточному UI — завантажуються у фоновому режимі. */
export const KRAINA_FONT_MAP_DEFERRED = {
  'e-Ukraine-Thin': require('./assets/fonts/e-ukraine/e-Ukraine-Thin.otf'),
  'e-Ukraine-UltraLight': require('./assets/fonts/e-ukraine/e-Ukraine-UltraLight.otf'),

  'e-UkraineHead-Light': require('./assets/fonts/e-ukraine-head/e-UkraineHead-Light.otf'),
  'e-UkraineHead-Thin': require('./assets/fonts/e-ukraine-head/e-UkraineHead-Thin.otf'),
  'e-UkraineHead-UltraLight': require('./assets/fonts/e-ukraine-head/e-UkraineHead-UltraLight.otf'),

  'PangramSans-Light': require('./assets/fonts/pangram/PPPangramSans-Light.otf'),
  'PangramSans-Thin': require('./assets/fonts/pangram/PPPangramSans-Thin.otf'),
  'PangramSans-CompactExtralightReclined': require('./assets/fonts/pangram/PPPangramSans-CompactExtralightReclined.otf'),
  'PangramSans-CompactThinItalic': require('./assets/fonts/pangram/PPPangramSans-CompactThinItalic.otf'),
  'PangramSans-CompressedExtrabold': require('./assets/fonts/pangram/PPPangramSans-CompressedExtrabold.otf'),
  'PangramSans-CompressedMediumReclined': require('./assets/fonts/pangram/PPPangramSans-CompressedMediumReclined.otf'),
  'PangramSans-CondensedThin': require('./assets/fonts/pangram/PPPangramSans-CondensedThin.otf'),
  'PangramSans-ExtraboldItalic': require('./assets/fonts/pangram/PPPangramSans-ExtraboldItalic.otf'),
  'PangramSans-NarrowExtraboldItalic': require('./assets/fonts/pangram/PPPangramSans-NarrowExtraboldItalic.otf'),
  'PangramSans-NarrowExtralightReclined': require('./assets/fonts/pangram/PPPangramSans-NarrowExtralightReclined.otf'),
  'PangramSans-NarrowSemibold': require('./assets/fonts/pangram/PPPangramSans-NarrowSemibold.otf'),
  'PangramSans-NarrowSemiboldItalic': require('./assets/fonts/pangram/PPPangramSans-NarrowSemiboldItalic.otf'),
  'PangramSans-SlimExtralight': require('./assets/fonts/pangram/PPPangramSans-SlimExtralight.otf'),
  'PangramSans-SlimMediumReclined': require('./assets/fonts/pangram/PPPangramSans-SlimMediumReclined.otf'),
  'PangramSans-SlimSemiboldItalic': require('./assets/fonts/pangram/PPPangramSans-SlimSemiboldItalic.otf'),
};

/** Для зворотної сумісності — повний мап (критичні + відкладені). */
export const KRAINA_FONT_MAP = { ...KRAINA_FONT_MAP_CRITICAL, ...KRAINA_FONT_MAP_DEFERRED };
