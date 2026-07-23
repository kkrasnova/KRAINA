import { resolveHeroThumbRef } from './krainaHeroThumbs';

/**
 * Photo slots for ProfileGamificationHub mockup UI.
 * Replace any entry with `require('./assets/your-file.webp')` when final assets arrive.
 */
export const HUB_PHOTO_SLOTS = {
  /** Level-up promo — brush-edge landmark (mockup: cathedral). TEMP: Sophia. */
  levelUpLandmark: resolveHeroThumbRef('sophiaModernBaroque') || resolveHeroThumbRef('sophia'),

  /** Balance card — gift box illustration. */
  giftBox: null,

  /** Popular reward thumbs. */
  rewardCoffee: null,
  rewardMuseum: resolveHeroThumbRef('khanenkoSalon'),
};
