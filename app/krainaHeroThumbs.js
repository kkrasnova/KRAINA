/**
 * Спільні прев’ю для головної каруселі країн / міста та пам’яток (адмін-панель).
 * Окремий модуль без залежностей від homeExploreData / adminLocationData.
 */
export const HERO_THUMB_MAP = {
  t1: require('./assets/kling_20260405_IMAGE____________5495_1.png'),
  t2: require('./assets/Снимок экрана 2026-04-05 в 15.52.15.png'),
  t3: require('./assets/Снимок экрана 2026-04-05 в 15.55.36.png'),
  t4: require('./assets/Снимок экрана 2026-04-05 в 15.59.46.png'),
  /** Повноекранне фото на LandmarkResult (захід сонця). */
  maidan: require('./assets/maidan-nezalezhnosti-hero.jpg'),
  /** Прев’ю на головній у списку локацій (синя година). */
  maidanHome: require('./assets/maidan-home-thumb.jpg'),
  /** Історична мапа «Козье болото» — друга сторінка аудіогіда Майдану. */
  maidanKozyeBolotoMap: require('./assets/maidan-kozye-boloto-map.png'),
  /** Водяний млин — ілюстрація «як це могло виглядати» (портрет). */
  maidanWatermillIllustration: require('./assets/maidan-watermill-illustration.png'),
  /** Водяний млин і болото — третя сторінка аудіогіда Майдану. */
  maidanWatermill: require('./assets/maidan-watermill-hero.png'),
  /** Історична гравюра Хрещатика — порівняння «було / стало». */
  maidanHistoric: require('./assets/maidan-historic-engraving.png'),
  /** Сучасний вигляд Майдану зверху — порівняння «було / стало». */
  maidanModern: require('./assets/maidan-modern-aerial.png'),
  /** Будинок Гудовського на історичній гравюрі — четверта сторінка аудіогіда. */
  maidanGudovskyHistoric: require('./assets/maidan-gudovsky-historic.png'),
  /** Обвал колон Головпоштамту, 1989 — п’ята сторінка аудіогіда. */
  maidanHolovposhtamtTragedy: require('./assets/maidan-holovposhtamt-tragedy.png'),
  /** Руїни Хрещатика після війни — шоста сторінка аудіогіда. */
  maidanKhreshchatykRuins: require('./assets/maidan-khreshchatyk-ruins.png'),
  /** Міська дума на листівці — шоста сторінка аудіогіда. */
  maidanCityDumaPostcard: require('./assets/maidan-city-duma-postcard.png'),
  /** Лядські ворота з Архангелом — восьма сторінка аудіогіда. */
  maidanLyadskiGates: require('./assets/maidan-lyadski-gates.png'),
  /** Нульовий кілометр (глобус) — дев’ята сторінка аудіогіда. */
  maidanZeroKilometerGlobe: require('./assets/maidan-zero-kilometer-globe.png'),
  /** Революція на граніті, 1990 — десята сторінка аудіогіда. */
  maidanRevolutionGranite1990: require('./assets/maidan-revolution-granite-1990.png'),
  /** Табір студентів на граніті, 1990 — десята сторінка аудіогіда. */
  maidanRevolutionGraniteCamp: require('./assets/maidan-revolution-granite-camp.png'),
  /** Помаранчева революція, 2004 — одинадцята сторінка (картка поверх фото). */
  maidanOrangeRevolution2004: require('./assets/maidan-orange-revolution-2004.png'),
};

export const HERO_THUMB_KEYS = [
  't1',
  't2',
  't3',
  't4',
  'maidan',
  'maidanHome',
  'maidanKozyeBolotoMap',
  'maidanWatermillIllustration',
  'maidanWatermill',
  'maidanHistoric',
  'maidanModern',
  'maidanGudovskyHistoric',
  'maidanHolovposhtamtTragedy',
  'maidanKhreshchatykRuins',
  'maidanCityDumaPostcard',
  'maidanLyadskiGates',
  'maidanZeroKilometerGlobe',
  'maidanRevolutionGranite1990',
  'maidanRevolutionGraniteCamp',
  'maidanOrangeRevolution2004',
];

export function isValidHeroThumbRef(ref) {
  return typeof ref === 'string' && HERO_THUMB_KEYS.includes(ref);
}

export function resolveHeroThumbRef(ref) {
  if (!isValidHeroThumbRef(ref)) return null;
  return HERO_THUMB_MAP[ref] || null;
}

/** Повертає image source для RN Image: number (asset) або { uri } або null. */
export function normalizeHeroImageSource(ref, uri) {
  const u = typeof uri === 'string' ? uri.trim() : '';
  if (u && /^https?:\/\//i.test(u)) return { uri: u };
  const img = resolveHeroThumbRef(ref);
  return img || null;
}

export function heroThumbRefFromImageSource(img) {
  if (!img) return 't1';
  for (const [k, v] of Object.entries(HERO_THUMB_MAP)) {
    if (v === img) return k;
  }
  return 't1';
}
