import { useCallback, useEffect, useRef, useState } from 'react';
import { playSlideNarration } from './landmarkTts';
import { firstNarratableSlideIndex } from './landmarkSlideAudioTexts';

/**
 * Аудіогід по слайдах: пауза зберігає слайд, свайп сторінки → інша озвучка,
 * автоперехід після завершення слайду.
 */
export function useLandmarkSlideAudioguide({
  Speech,
  language,
  phase,
  slideScripts,
  miniText,
  activeSectionIndex,
  activeSectionIndexRef,
  goToSectionIndex,
  playFileAudioUntilDone,
  stopFileAudio,
  onPlaybackError,
}) {
  const [status, setStatus] = useState('idle');
  const [uiSlideIndex, setUiSlideIndex] = useState(0);
  const genRef = useRef(0);
  const playingIndexRef = useRef(-1);
  const pausedIndexRef = useRef(0);
  const autoNavRef = useRef(false);
  const statusRef = useRef('idle');

  const setAudioguideStatus = useCallback((next) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const bumpGen = useCallback(() => {
    genRef.current += 1;
    return genRef.current;
  }, []);

  const stopPlayback = useCallback(async () => {
    bumpGen();
    Speech.stop?.();
    await stopFileAudio?.();
    setAudioguideStatus('idle');
    playingIndexRef.current = -1;
  }, [Speech, stopFileAudio, bumpGen, setAudioguideStatus]);

  const playAtIndex = useCallback(
    async (index, gen) => {
      const isMini = phase === 'mini';
      const text = isMini
        ? String(miniText || '').trim()
        : String(slideScripts[index]?.text || '').trim();

      if (!text) {
        if (isMini) {
          setAudioguideStatus('idle');
          playingIndexRef.current = -1;
          return;
        }
        // Silent slides (quiz / compare / actions): always land on the requested page.
        if (index >= 0) {
          autoNavRef.current = true;
          goToSectionIndex(index);
          setUiSlideIndex(index);
          pausedIndexRef.current = index;
        }
        setAudioguideStatus('idle');
        playingIndexRef.current = -1;
        return;
      }

      playingIndexRef.current = index;
      pausedIndexRef.current = index;
      setUiSlideIndex(index);

      if (!isMini && index >= 0) {
        autoNavRef.current = true;
        goToSectionIndex(index);
      }

      try {
        const ok = await playSlideNarration({
          Speech,
          text,
          appLanguage: language,
          playFileAudio: playFileAudioUntilDone,
          isCancelled: () => gen !== genRef.current,
        });

        if (gen !== genRef.current) return;
        if (!ok) {
          onPlaybackError?.();
          setAudioguideStatus('idle');
          playingIndexRef.current = -1;
          return;
        }

        if (isMini) {
          setAudioguideStatus('idle');
          playingIndexRef.current = -1;
          return;
        }

        const nextNarratable = firstNarratableSlideIndex(slideScripts, index + 1);
        if (nextNarratable >= 0) {
          autoNavRef.current = true;
          goToSectionIndex(nextNarratable);
          setUiSlideIndex(nextNarratable);
          return playAtIndex(nextNarratable, gen);
        }
        // No more narratable audio — still advance to the next page (e.g. actions).
        const nextPage = index + 1;
        if (nextPage < slideScripts.length) {
          autoNavRef.current = true;
          goToSectionIndex(nextPage);
          setUiSlideIndex(nextPage);
          pausedIndexRef.current = nextPage;
        }
        setAudioguideStatus('idle');
        playingIndexRef.current = -1;
      } catch (e) {
        if (gen === genRef.current) {
          if (__DEV__) console.warn('[audioguide]', e?.message || e);
          onPlaybackError?.();
          setAudioguideStatus('idle');
          playingIndexRef.current = -1;
        }
      }
    },
    [
      phase,
      miniText,
      slideScripts,
      language,
      Speech,
      playFileAudioUntilDone,
      goToSectionIndex,
      onPlaybackError,
      setAudioguideStatus,
    ],
  );

  const start = useCallback(
    async (fromIndex) => {
      await stopFileAudio?.();
      Speech.stop?.();
      const gen = bumpGen();
      setAudioguideStatus('playing');
      const idx =
        phase === 'mini'
          ? 0
          : Number.isFinite(fromIndex)
            ? fromIndex
            : pausedIndexRef.current >= 0
              ? pausedIndexRef.current
              : activeSectionIndexRef.current ?? activeSectionIndex ?? 0;
      pausedIndexRef.current = idx;
      setUiSlideIndex(idx);
      await playAtIndex(idx, gen);
    },
    [stopFileAudio, Speech, bumpGen, phase, activeSectionIndexRef, activeSectionIndex, playAtIndex, setAudioguideStatus],
  );

  const pause = useCallback(async () => {
    if (statusRef.current !== 'playing') return;
    if (playingIndexRef.current >= 0) {
      pausedIndexRef.current = playingIndexRef.current;
      setUiSlideIndex(playingIndexRef.current);
    }
    bumpGen();
    Speech.stop?.();
    await stopFileAudio?.();
    playingIndexRef.current = -1;
    setAudioguideStatus('paused');
  }, [Speech, stopFileAudio, bumpGen, setAudioguideStatus]);

  const toggle = useCallback(async () => {
    if (statusRef.current === 'playing') {
      await pause();
      return;
    }
    if (statusRef.current === 'paused') {
      await start(pausedIndexRef.current);
      return;
    }
    const startIdx =
      phase === 'mini' ? 0 : activeSectionIndexRef.current ?? activeSectionIndex ?? 0;
    await start(startIdx);
  }, [pause, start, phase, activeSectionIndex, activeSectionIndexRef]);

  const seekToSlide = useCallback(
    async (index) => {
      const maxIdx = Math.max(0, slideScripts.length - 1);
      const idx = Math.max(0, Math.min(maxIdx, Number(index) || 0));
      pausedIndexRef.current = idx;
      setUiSlideIndex(idx);
      goToSectionIndex(idx);
      if (statusRef.current === 'playing') {
        const text = String(slideScripts[idx]?.text || '').trim();
        if (!text) {
          // Land on silent page and stop narration.
          bumpGen();
          Speech.stop?.();
          await stopFileAudio?.();
          setAudioguideStatus('idle');
          playingIndexRef.current = -1;
          return;
        }
        await start(idx);
      }
    },
    [slideScripts, start, goToSectionIndex, bumpGen, Speech, stopFileAudio, setAudioguideStatus],
  );

  const seekRelative = useCallback(
    async (delta) => {
      const current =
        phase === 'mini'
          ? 0
          : playingIndexRef.current >= 0
            ? playingIndexRef.current
            : pausedIndexRef.current;
      // Page-step (±1), including silent slides like actions — not narratable-only skip.
      const maxIdx = Math.max(0, slideScripts.length - 1);
      const next = Math.max(0, Math.min(maxIdx, current + (delta > 0 ? 1 : -1)));
      if (next === current) return;
      await seekToSlide(next);
    },
    [phase, slideScripts.length, seekToSlide],
  );

  const syncPausedIndex = useCallback((index) => {
    const idx = Math.max(0, Math.min(slideScripts.length - 1, Number(index) || 0));
    pausedIndexRef.current = idx;
    setUiSlideIndex(idx);
  }, [slideScripts.length]);

  useEffect(() => {
    if (status !== 'playing' || phase === 'mini') return;
    if (autoNavRef.current) {
      autoNavRef.current = false;
      return;
    }
    if (activeSectionIndex === playingIndexRef.current) return;
    const gen = bumpGen();
    setAudioguideStatus('playing');
    void playAtIndex(activeSectionIndex, gen);
  }, [activeSectionIndex, status, phase, playAtIndex, bumpGen, setAudioguideStatus]);

  useEffect(
    () => () => {
      bumpGen();
      Speech.stop?.();
      void stopFileAudio?.();
    },
    [Speech, stopFileAudio, bumpGen],
  );

  return {
    status,
    isSpeaking: status === 'playing',
    isPaused: status === 'paused',
    isActive: status !== 'idle',
    slideIndex: uiSlideIndex,
    toggle,
    pause,
    seekToSlide,
    seekRelative,
    syncPausedIndex,
    stop: stopPlayback,
  };
}
