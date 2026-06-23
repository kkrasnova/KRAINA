/**
 * Локальні шрифти KRAÏNA: e-Ukraine, e-Ukraine Head, PP Pangram Sans.
 *
 * Містять лише шрифти, які реально використовуються в UI (brandFont.js/appTypography.js).
 * Рідкісні варіанти (~1.5MB) видалено — вони не використовувались у поточному коді
 * і лише сповільнювали старт додатка та збільшували бандл.
 */

/** Шрифти, що реально використовуються в UI (brandFont.js, appTypography.js). */
export const KRAINA_FONT_MAP = {
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

/**
 * Зворотна сумісність: KRAINA_FONT_MAP_CRITICAL — те саме, що KRAINA_FONT_MAP.
 * KRAINA_FONT_MAP_DEFERRED — порожній (раніше містив 19 рідкісних варіантів, які не використовувались).
 */
export const KRAINA_FONT_MAP_CRITICAL = KRAINA_FONT_MAP;
export const KRAINA_FONT_MAP_DEFERRED = {};
