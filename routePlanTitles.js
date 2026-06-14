import { appLangBase } from './appLang';

/** Backend/demo plans usually ship Ukrainian + English titles only. */
export function routePreferredUkEn(lang, ukText, enText) {
  const b = appLangBase(lang);
  if (b === 'uk') return ukText || enText || '';
  return enText || ukText || '';
}

export function routeRegionTitle(lang, plan) {
  return routePreferredUkEn(lang, plan?.regionTitleUk, plan?.regionTitleEn);
}

export function routeCountryTitle(lang, plan) {
  return routePreferredUkEn(lang, plan?.countryUk, plan?.countryEn);
}

export function landmarkBlurb(lang, lm) {
  return routePreferredUkEn(lang, lm?.descUk, lm?.descEn);
}
