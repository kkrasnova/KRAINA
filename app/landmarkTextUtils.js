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

/**
 * Keep only a short lead above the mid-page photo so the image stays
 * visible in the first viewport; the rest continues under the photo.
 */
export function splitIntroBodyForMidHero(
  body,
  bodyAfterHero = '',
  { maxLeadParas = 2, maxLeadChars = 380 } = {},
) {
  const afterExisting = String(bodyAfterHero || '').trim();
  const paras = String(body || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length <= 1 && afterExisting) {
    return { body: paras.join('\n\n'), bodyAfterHero: afterExisting };
  }
  if (paras.length <= 2 && String(body || '').trim().length <= maxLeadChars && afterExisting) {
    return { body: paras.join('\n\n'), bodyAfterHero: afterExisting };
  }
  if (paras.length <= 1) {
    return { body: paras.join('\n\n'), bodyAfterHero: afterExisting };
  }

  let leadCount = 1;
  let leadChars = paras[0].length;
  while (
    leadCount < Math.min(maxLeadParas, paras.length - 1) &&
    leadChars + paras[leadCount].length + 2 <= maxLeadChars
  ) {
    leadChars += paras[leadCount].length + 2;
    leadCount += 1;
  }
  // Always leave at least one paragraph under the photo when we have 3+
  if (paras.length >= 3 && leadCount >= paras.length) {
    leadCount = Math.max(1, paras.length - 2);
  }

  const lead = paras.slice(0, leadCount).join('\n\n');
  const rest = paras.slice(leadCount).join('\n\n');
  const after = [rest, afterExisting].filter(Boolean).join('\n\n');
  return { body: lead, bodyAfterHero: after };
}
