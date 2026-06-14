/**
 * Спільні прев’ю для головної каруселі країн / міста та пам’яток (адмін-панель).
 * Окремий модуль без залежностей від homeExploreData / adminLocationData.
 */
export const HERO_THUMB_MAP = {
  t1: require('./assets/kling_20260405_IMAGE____________5495_1.png'),
  t2: require('./assets/Снимок экрана 2026-04-05 в 15.52.15.png'),
  t3: require('./assets/Снимок экрана 2026-04-05 в 15.55.36.png'),
  t4: require('./assets/Снимок экрана 2026-04-05 в 15.59.46.png'),
};

export const HERO_THUMB_KEYS = ['t1', 't2', 't3', 't4'];

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
