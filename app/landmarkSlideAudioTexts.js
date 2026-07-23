import { stripIntroEmphasis } from './landmarkTextUtils';

/** Текст озвучки для одного слайду пейджера. */
export function slideAudioTextFromPage(page, fullBodyText) {
  if (!page || page.type === 'quiz' || page.type === 'compare' || page.type === 'actions') return '';
  if (page.type === 'fact') {
    return stripIntroEmphasis(page.slide?.fact || '');
  }
  if (page.type === 'intro') {
    if (Number(page.introPart || 1) <= 1) {
      return stripIntroEmphasis(fullBodyText || '');
    }
    const parts = [page.body, page.bodyAfterHero].filter((t) => typeof t === 'string' && t.trim());
    return stripIntroEmphasis(parts.join('\n\n'));
  }
  return '';
}

/** Масив { index, pageId, text } — індекс збігається з pageSections. */
export function buildSlideAudioScripts(pageSections, fullBodyText) {
  const pages = Array.isArray(pageSections) ? pageSections : [];
  return pages.map((page, index) => ({
    index,
    pageId: page?.id || `slide-${index}`,
    text: slideAudioTextFromPage(page, fullBodyText).trim(),
  }));
}

export function firstNarratableSlideIndex(slideScripts, fromIndex = 0) {
  for (let i = Math.max(0, fromIndex); i < slideScripts.length; i += 1) {
    if (slideScripts[i]?.text) return i;
  }
  return -1;
}

export function lastNarratableSlideIndex(slideScripts, fromIndex) {
  const start = Number.isFinite(fromIndex) ? fromIndex : slideScripts.length - 1;
  for (let i = Math.min(start, slideScripts.length - 1); i >= 0; i -= 1) {
    if (slideScripts[i]?.text) return i;
  }
  return -1;
}
