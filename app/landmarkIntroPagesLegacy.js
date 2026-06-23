import { Image } from 'react-native';
import { resolveHeroThumbRef } from './krainaHeroThumbs';
import { resolveOfflineUriSync } from './offline/localCacheStore';
import { splitIntroBodyAtHero } from './landmarkTextUtils';

/** Uk/En-only intro pages from story object (legacy). */
export function introPagesFromStoryLegacy(story, langUk) {
  const key = langUk ? 'introPagesUk' : 'introPagesEn';
  const raw = story?.[key];
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const pages = raw
    .map((page) => {
      const compareBeforeThumb =
        typeof page?.compareBeforeThumb === 'string' ? page.compareBeforeThumb.trim() : '';
      const compareAfterThumb =
        typeof page?.compareAfterThumb === 'string' ? page.compareAfterThumb.trim() : '';
      const compareBeforeAsset = resolveHeroThumbRef(compareBeforeThumb);
      const compareAfterAsset = resolveHeroThumbRef(compareAfterThumb);
      const hasCompare =
        typeof compareBeforeAsset === 'number' && typeof compareAfterAsset === 'number';
      const body = typeof page?.body === 'string' ? page.body.trim() : '';
      if (!body && hasCompare) {
        return {
          compareOnly: true,
          compareBeforeAsset,
          compareAfterAsset,
          compareBeforeThumb,
          compareAfterThumb,
        };
      }
      if (!body) return null;
      const bodyAfterHeroFromPage =
        typeof page?.bodyAfterHero === 'string' ? page.bodyAfterHero.trim() : '';
      const { body: leadBody, bodyAfterHero: bodyAfterHeroSplit } = splitIntroBodyAtHero(body);
      const bodyAfterHero = bodyAfterHeroFromPage || bodyAfterHeroSplit;
      const heroThumb = typeof page?.heroThumb === 'string' ? page.heroThumb.trim() : '';
      const secondaryHeroThumb =
        typeof page?.secondaryHeroThumb === 'string' ? page.secondaryHeroThumb.trim() : '';
      const photoAsset =
        typeof page?.photoAsset === 'number'
          ? page.photoAsset
          : resolveHeroThumbRef(heroThumb);
      const secondaryPhotoAsset = resolveHeroThumbRef(secondaryHeroThumb);
      const illustrationThumb =
        typeof page?.illustrationThumb === 'string' ? page.illustrationThumb.trim() : '';
      const illustrationAsset = resolveHeroThumbRef(illustrationThumb);
      const illustrationLink = langUk
        ? String(page?.illustrationLinkUk || page?.illustrationLinkEn || '').trim()
        : String(page?.illustrationLinkEn || page?.illustrationLinkUk || '').trim();
      const illustrationCaption = langUk
        ? String(page?.illustrationCaptionUk || page?.illustrationCaptionEn || '').trim()
        : String(page?.illustrationCaptionEn || page?.illustrationCaptionUk || '').trim();
      const heroCaption = langUk
        ? String(page?.heroCaptionUk || page?.heroCaptionEn || '').trim()
        : String(page?.heroCaptionEn || page?.heroCaptionUk || '').trim();
      const secondaryHeroCaption = langUk
        ? String(page?.secondaryHeroCaptionUk || page?.secondaryHeroCaptionEn || '').trim()
        : String(page?.secondaryHeroCaptionEn || page?.secondaryHeroCaptionUk || '').trim();
      const tertiaryHeroThumb =
        typeof page?.tertiaryHeroThumb === 'string' ? page.tertiaryHeroThumb.trim() : '';
      const tertiaryPhotoAsset = resolveHeroThumbRef(tertiaryHeroThumb);
      const tertiaryHeroCaption = langUk
        ? String(page?.tertiaryHeroCaptionUk || page?.tertiaryHeroCaptionEn || '').trim()
        : String(page?.tertiaryHeroCaptionEn || page?.tertiaryHeroCaptionUk || '').trim();
      const photoUri =
        typeof page?.photoUri === 'string' && page.photoUri.trim()
          ? resolveOfflineUriSync(page.photoUri.trim())
          : photoAsset
            ? Image.resolveAssetSource(photoAsset)?.uri || undefined
            : undefined;
      const compareHeroHeightRatio = Number(page?.compareHeroHeightRatio);
      const compareHeroHeightMax = Number(page?.compareHeroHeightMax);
      const compareHeroTopInset = Number(page?.compareHeroTopInset);
      const heroHeightRatio = Number(page?.heroHeightRatio);
      const heroHeightMax = Number(page?.heroHeightMax);
      const secondaryHeroHeightRatio = Number(page?.secondaryHeroHeightRatio);
      const secondaryHeroHeightMax = Number(page?.secondaryHeroHeightMax);
      const heroStackGap = Number(page?.heroStackGap);
      const secondaryStackGap = Number(page?.secondaryStackGap);
      return {
        body: leadBody,
        ...(bodyAfterHero
          ? { bodyAfterHero, introHeroAfterText: true }
          : {}),
        ...(hasCompare
          ? {
              compareBeforeAsset,
              compareAfterAsset,
              compareBeforeThumb,
              compareAfterThumb,
              ...(Number.isFinite(compareHeroHeightRatio) && compareHeroHeightRatio > 0
                ? { compareHeroHeightRatio }
                : {}),
              ...(Number.isFinite(compareHeroHeightMax) && compareHeroHeightMax > 0
                ? { compareHeroHeightMax }
                : {}),
              ...(Number.isFinite(compareHeroTopInset) && compareHeroTopInset > 0
                ? { compareHeroTopInset }
                : {}),
            }
          : {}),
        ...(heroThumb ? { heroThumb } : {}),
        ...(secondaryHeroThumb ? { secondaryHeroThumb } : {}),
        ...(photoAsset ? { photoAsset } : {}),
        ...(secondaryPhotoAsset ? { secondaryPhotoAsset } : {}),
        ...(Number.isFinite(heroHeightRatio) && heroHeightRatio > 0 ? { heroHeightRatio } : {}),
        ...(Number.isFinite(heroHeightMax) && heroHeightMax > 0 ? { heroHeightMax } : {}),
        ...(Number.isFinite(secondaryHeroHeightRatio) && secondaryHeroHeightRatio > 0
          ? { secondaryHeroHeightRatio }
          : {}),
        ...(Number.isFinite(secondaryHeroHeightMax) && secondaryHeroHeightMax > 0
          ? { secondaryHeroHeightMax }
          : {}),
        ...(Number.isFinite(heroStackGap) && heroStackGap >= 0 ? { heroStackGap } : {}),
        ...(Number.isFinite(secondaryStackGap) && secondaryStackGap >= 0
          ? { secondaryStackGap }
          : {}),
        ...(photoUri ? { photoUri } : {}),
        ...(typeof illustrationAsset === 'number' ? { illustrationAsset } : {}),
        ...(illustrationLink ? { illustrationLink } : {}),
        ...(illustrationCaption ? { illustrationCaption } : {}),
        ...(heroCaption ? { heroCaption } : {}),
        ...(secondaryHeroCaption ? { secondaryHeroCaption } : {}),
        ...(tertiaryHeroThumb ? { tertiaryHeroThumb } : {}),
        ...(typeof tertiaryPhotoAsset === 'number' ? { tertiaryPhotoAsset } : {}),
        ...(tertiaryHeroCaption ? { tertiaryHeroCaption } : {}),
        ...(page?.introNoHero ? { introNoHero: true } : {}),
        ...(page?.introFullBleedPhoto ? { introFullBleedPhoto: true } : {}),
        ...(page?.introHeroAfterText ? { introHeroAfterText: true } : {}),
        ...(page?.introHeroBleedTop ? { introHeroBleedTop: true } : {}),
        ...(page?.introFactCard ? { introFactCard: true } : {}),
        ...(page?.introHeroInsetRounded ? { introHeroInsetRounded: true } : {}),
        ...(page?.introCompareRounded ? { introCompareRounded: true } : {}),
        ...(page?.introHeroSideBySide ? { introHeroSideBySide: true } : {}),
        ...(page?.heroPosition && typeof page.heroPosition === 'object'
          ? { heroPosition: page.heroPosition }
          : {}),
        ...(page?.compareBeforePosition && typeof page.compareBeforePosition === 'object'
          ? { compareBeforePosition: page.compareBeforePosition }
          : {}),
        ...(page?.compareAfterPosition && typeof page.compareAfterPosition === 'object'
          ? { compareAfterPosition: page.compareAfterPosition }
          : {}),
        ...(page?.secondaryHeroPosition && typeof page.secondaryHeroPosition === 'object'
          ? { secondaryHeroPosition: page.secondaryHeroPosition }
          : {}),
        ...(page?.tertiaryHeroPosition && typeof page.tertiaryHeroPosition === 'object'
          ? { tertiaryHeroPosition: page.tertiaryHeroPosition }
          : {}),
        ...(typeof page?.heroFit === 'string' && page.heroFit.trim()
          ? { heroFit: page.heroFit.trim() }
          : {}),
      };
    })
    .filter(Boolean);
  return pages.length > 0 ? pages : undefined;
}
