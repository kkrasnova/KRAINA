/** Прибирає **виділення** з тексту для TTS / аудіоскрипта. */
export function stripIntroEmphasis(text) {
  return String(text || '').replace(/\*\*([^*]+)\*\*/g, '$1');
}

/** Розділювач: текст до фото | фото | текст після фото (слайди аудіогіда). */
export const INTRO_BODY_HERO_MARKER = '|||HERO|||';

export function splitIntroBodyAtHero(text) {
  const raw = String(text || '');
  const i = raw.indexOf(INTRO_BODY_HERO_MARKER);
  if (i < 0) {
    return { body: raw.trim(), bodyAfterHero: '' };
  }
  return {
    body: raw.slice(0, i).trim(),
    bodyAfterHero: raw.slice(i + INTRO_BODY_HERO_MARKER.length).trim(),
  };
}
