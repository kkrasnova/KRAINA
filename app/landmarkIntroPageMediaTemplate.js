/**
 * Розміщення фото на 12 слайдах (2–13) — ідентично Майдану Незалежності.
 * Для нової локації замініть ключі на свої в krainaHeroThumbs.js.
 */
export const LANDMARK_INTRO_PAGE_MEDIA_TEMPLATE = [
  {
    heroThumb: 'maidanKozyeBolotoMap',
    illustrationThumb: 'maidanWatermillIllustration',
    illustrationLinkUk: 'Подивитися, як це могло виглядати',
    illustrationLinkEn: 'See how it might have looked',
    illustrationCaptionUk:
      'Наше уявлення на основі історичних схем — офіційних фото того часу не існує.',
    illustrationCaptionEn:
      'Our reconstruction based on historic maps — no official photos from that era exist.',
  },
  { compareBeforeThumb: 'maidanHistoric', compareAfterThumb: 'maidanModern' },
  { heroThumb: 'maidanGudovskyHistoric' },
  { heroThumb: 'maidanHolovposhtamtTragedy' },
  { heroThumb: 'maidanCityDumaPostcard', secondaryHeroThumb: 'maidanKhreshchatykRuins' },
  { heroThumb: 'maidanIndependenceMonumentDay' },
  { heroThumb: 'maidanLyadskiGates' },
  { heroThumb: 'maidanZeroKilometerGlobe' },
  { heroThumb: 'maidanRevolutionGranite1990', secondaryHeroThumb: 'maidanRevolutionGraniteCamp' },
  { heroThumb: 'maidanOrangeRevolution2004' },
  { heroThumb: 'maidanDignityRevolution2013' },
  { heroThumb: 'maidanModernReflection' },
];
