/** In-memory draft for the feed post composer (survives screen remounts in one session). */

let sessionDraft = null;

export function buildComposerDraft({ caption, place, mapLat, mapLng, routePick } = {}) {
  return {
    caption: String(caption ?? ''),
    place: String(place ?? ''),
    mapLat:
      mapLat != null && Number.isFinite(Number(mapLat)) ? Number(mapLat) : null,
    mapLng:
      mapLng != null && Number.isFinite(Number(mapLng)) ? Number(mapLng) : null,
    routePick: routePick && typeof routePick === 'object' ? routePick : null,
  };
}

export function applyComposerDraft(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return buildComposerDraft(raw);
}

export function rememberComposerDraft(patch) {
  const next = buildComposerDraft({ ...sessionDraft, ...patch });
  sessionDraft = next;
  return next;
}

export function recallComposerDraft() {
  return sessionDraft ? { ...sessionDraft } : null;
}

export function clearComposerDraft() {
  sessionDraft = null;
}

export function composerDraftFromRouteParams(params) {
  return applyComposerDraft(params?.composerDraft);
}
