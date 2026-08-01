/**
 * Шаблон розкладки 12 внутрішніх слайдів аудіогіда (сторінки 2–13).
 * Зразок — Майдан Незалежності. Текст і фото підставляються окремо.
 *
 * Для нової локації:
 * 1. Створіть `landmarkAudioScripts/<id>.js` за зразком `_template.js`
 * 2. Додайте ключі фото в `krainaHeroThumbs.js`
 * 3. Зберіть story через `buildLandmarkIntroStory()` у `routeRegionsData.js`
 */

/** @typedef {import('./landmarkStoryBuilder').LandmarkPageMedia} LandmarkPageMedia */

/**
 * 12 пресетів верстки (слайди 2–13 після вступної сторінки 1).
 * Поля збігаються з тими, що читає LandmarkResultPage / homeLandmarkResultParams.
 */
export const LANDMARK_INTRO_LAYOUT_TEMPLATE = [
  // Слайд 2 — карта / історичний контекст + ілюстрація «як могло виглядати»
  {
    heroFit: 'cover',
    heroHeightRatio: 0.4,
    heroHeightMax: 340,
    introHeroInsetRounded: true,
    heroStackGap: 22,
  },
  // Слайд 3 — порівняння «було / стало» (під верхньою панелькою)
  {
    heroFit: 'cover',
    compareHeroHeightRatio: 0.6,
    compareHeroHeightMax: 540,
    compareHeroTopInset: 22,
    introCompareRounded: true,
    heroStackGap: 22,
  },
  // Слайд 4 — фото на всю ширину зверху
  { heroFit: 'cover', introHeroBleedTop: true },
  // Слайд 5 — високе фото зверху
  {
    heroFit: 'cover',
    introHeroBleedTop: true,
    heroHeightRatio: 0.68,
    heroHeightMax: 600,
    heroPosition: { left: '72%', top: '50%' },
  },
  // Слайд 6 — два фото одне під одним
  {
    heroFit: 'cover',
    introHeroBleedTop: true,
    heroHeightRatio: 0.48,
    heroHeightMax: 400,
    heroPosition: { left: '50%', top: '34%' },
    secondaryStackGap: 0,
    secondaryHeroPosition: { left: '50%', top: '40%' },
    secondaryHeroHeightRatio: 0.3,
    secondaryHeroHeightMax: 260,
  },
  // Слайд 7 — округле фото + текст
  {
    heroFit: 'cover',
    introHeroInsetRounded: true,
    heroHeightRatio: 0.42,
    heroHeightMax: 360,
    heroStackGap: 18,
  },
  // Слайд 8 — округле фото + текст
  {
    heroFit: 'cover',
    introHeroInsetRounded: true,
    heroHeightRatio: 0.42,
    heroHeightMax: 360,
    heroStackGap: 18,
  },
  // Слайд 9 — короткий лід, потім велике фото, далі текст
  {
    heroFit: 'cover',
    introHeroAfterText: true,
    heroHeightRatio: 0.5,
    heroHeightMax: 420,
    introHeroInsetRounded: true,
  },
  // Слайд 10 — два фото (історія / подія)
  {
    heroFit: 'cover',
    introHeroBleedTop: true,
    heroHeightRatio: 0.44,
    heroHeightMax: 380,
    secondaryStackGap: 12,
    secondaryHeroHeightRatio: 0.28,
    secondaryHeroHeightMax: 240,
  },
  // Слайд 11 — картка-факт поверх фото
  {
    heroFit: 'cover',
    introFactCard: true,
    introHeroBleedTop: true,
    heroHeightRatio: 0.55,
    heroHeightMax: 480,
  },
  // Слайд 12 — компактне округле фото
  {
    heroFit: 'cover',
    introHeroInsetRounded: true,
    heroHeightRatio: 0.36,
    heroHeightMax: 300,
    heroStackGap: 16,
    introHeroBleedTop: true,
  },
  // Слайд 13 — фінал
  {
    heroFit: 'cover',
    introHeroInsetRounded: true,
    heroHeightRatio: 0.38,
    heroHeightMax: 320,
    heroStackGap: 20,
  },
];

/** Підписи слайдів для зручності — що надсилати в чат */
export const LANDMARK_INTRO_SLIDE_LABELS_UK = [
  'Слайд 2 — історичний контекст / карта + ілюстрація',
  'Слайд 3 — порівняння «було / стало» (2 фото)',
  'Слайд 4 — одне фото зверху на всю ширину',
  'Слайд 5 — високе фото зверху',
  'Слайд 6 — два фото одне під одним',
  'Слайд 7 — округле фото + текст',
  'Слайд 8 — округле фото + текст',
  'Слайд 9 — спочатку текст, потім фото',
  'Слайд 10 — два фото (подія / епоха)',
  'Слайд 11 — картка-факт поверх фото',
  'Слайд 12 — компактне фото + текст',
  'Слайд 13 — фінал, прощання',
];
