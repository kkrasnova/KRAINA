import { buildSlideAudioScripts } from './landmarkSlideAudioTexts';
import { prefetchCloudTtsTexts } from './landmarkTts';
import { prefetchAudioGuideUrl } from './audioGuideCache';

function slideScriptsFromLandmarkParams(params) {
  const extract = String(params?.extract || '').trim();
  const introPages = Array.isArray(params?.introPages) ? params.introPages : [];
  if (!introPages.length) {
    const scripts = [];
    const mini = String(params?.miniExtract || '').trim();
    if (mini) scripts.push({ index: 0, text: mini });
    if (extract) scripts.push({ index: scripts.length, text: extract });
    return scripts;
  }

  const pageSections = [{ id: 'intro-1', type: 'intro', introPart: 1 }];
  introPages.forEach((page, i) => {
    pageSections.push({
      id: `intro-${i + 2}`,
      type: 'intro',
      introPart: i + 2,
      body: page?.body,
      bodyAfterHero: page?.bodyAfterHero,
    });
  });
  return buildSlideAudioScripts(pageSections, extract);
}

function prioritizedSlideTexts(slideScripts, fromIndex = 0, miniText = '') {
  const scripts = Array.isArray(slideScripts) ? slideScripts : [];
  const texts = [];
  const seen = new Set();
  const push = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    texts.push(trimmed);
  };

  push(miniText);
  const start = Math.max(0, Number(fromIndex) || 0);
  for (let i = start; i < scripts.length; i += 1) {
    push(scripts[i]?.text);
  }
  for (let i = start - 1; i >= 0; i -= 1) {
    push(scripts[i]?.text);
  }
  return texts;
}

/** Прогріває TTS перед відкриттям LandmarkResult (onPressIn / prefetchLandmarkResultParams). */
export function prefetchLandmarkAudioFromParams(params, language, fromIndex = 0) {
  if (!params || typeof params !== 'object') return Promise.resolve();
  const scripts = slideScriptsFromLandmarkParams(params);
  const texts = prioritizedSlideTexts(scripts, fromIndex, params?.miniExtract);
  const audioUrl = typeof params.audioGuideUrl === 'string' ? params.audioGuideUrl.trim() : '';
  if (audioUrl) void prefetchAudioGuideUrl(audioUrl);
  if (!texts.length) return Promise.resolve();
  return prefetchCloudTtsTexts(texts, language);
}

/** Прогріває TTS на екрані локації (поточний слайд + наступні). */
export function prefetchLandmarkSlideAudio({
  slideScripts,
  miniText,
  language,
  audioGuideUrl,
  fromIndex = 0,
}) {
  const texts = prioritizedSlideTexts(slideScripts, fromIndex, miniText);
  const audioUrl = String(audioGuideUrl || '').trim();
  if (audioUrl) void prefetchAudioGuideUrl(audioUrl);
  if (!texts.length) return Promise.resolve();
  return prefetchCloudTtsTexts(texts, language);
}
