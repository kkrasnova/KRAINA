/**
 * Локальні шрифти KRAÏNA: e-Ukraine, e-Ukraine Head, PP Pangram Sans (особисте використання).
 * Містять лише шрифти, які реально використовуються в UI.
 * Рідкісні варіанти (~1.5MB) видалено — вони не використовувались у поточному коді.
 * Завантаження: useFonts(KRAINA_FONT_MAP) у App.js.
 */
export const KRAINA_FONT_MAP = {
  'e-Ukraine': require('./assets/fonts/e-ukraine/e-Ukraine-Regular.otf'),
  'e-Ukraine-Light': require('./assets/fonts/e-ukraine/e-Ukraine-Light.otf'),
  'e-Ukraine-Medium': require('./assets/fonts/e-ukraine/e-Ukraine-Medium.otf'),
  'e-Ukraine-Bold': require('./assets/fonts/e-ukraine/e-Ukraine-Bold.otf'),

  'e-UkraineHead': require('./assets/fonts/e-ukraine-head/e-UkraineHead-Regular.otf'),
  'e-UkraineHead-Medium': require('./assets/fonts/e-ukraine-head/e-UkraineHead-Medium.otf'),
  'e-UkraineHead-Bold': require('./assets/fonts/e-ukraine-head/e-UkraineHead-Bold.otf'),
  'e-UkraineHead-LOGO': require('./assets/fonts/e-ukraine-head/e-UkraineHead-LOGO.otf'),

  /** PP Pangram Sans — базовий текстовий накресл як «Compact Regular». */
  PangramSans: require('./assets/fonts/pangram/PPPangramSans-CompactRegular.otf'),
  'PangramSans-Bold': require('./assets/fonts/pangram/PPPangramSans-Bold.otf'),
  'PangramSans-Medium': require('./assets/fonts/pangram/PPPangramSans-Medium.otf'),
  'PangramSans-Semibold': require('./assets/fonts/pangram/PPPangramSans-Semibold.otf'),
};

/** Для зворотної сумісності */
export const KRAINA_FONT_MAP_CRITICAL = KRAINA_FONT_MAP;
export const KRAINA_FONT_MAP_DEFERRED = {};
