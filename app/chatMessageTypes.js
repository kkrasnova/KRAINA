import { normalizeBackendAssetUrl } from './auth/config';

export function firstUrl(text) {
  const s = String(text || '');
  const m = s.match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : '';
}

export function isImageUrl(url) {
  return /\.(png|jpe?g|webp|gif|heic|heif)(\?|$)/i.test(String(url || ''));
}

export function isAudioUrl(url) {
  return /\.(m4a|mp3|wav|aac|ogg|caf|webm)(\?|$)/i.test(String(url || ''));
}

export function formatVoiceDuration(ms) {
  const sec = Math.max(1, Math.round(Number(ms || 0) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
}

export function mapBackendMessage(raw, language) {
  const content = String(raw?.content || '');
  const url = firstUrl(content);
  try {
    const parsed = JSON.parse(content);
    if (parsed?.type === 'kraina_voice' && parsed.url) {
      return {
        id: raw.id,
        createdAt: new Date(raw.sent_at).getTime(),
        fromMe: raw.from_me,
        type: 'voice',
        voiceUri: normalizeBackendAssetUrl(String(parsed.url)),
        durationMs: Number(parsed.durationMs) || 0,
      };
    }
    if (parsed && parsed.type === 'kraina_saved_route' && parsed.plan) {
      const plan = parsed.plan || {};
      const regionId = String(plan.regionId || plan?.meta?.regionId || 'kyiv');
      return {
        id: raw.id,
        createdAt: new Date(raw.sent_at).getTime(),
        fromMe: raw.from_me,
        type: 'route',
        routeCard: {
          regionId,
          title: String(parsed.title || 'Route'),
          subtitle: language?.startsWith('uk') ? 'Маршрут' : 'Route',
          // Keep the shared plan so tapping the card opens the exact route.
          plan,
        },
      };
    }
  } catch {
    /* not json */
  }
  if (url && isImageUrl(url)) {
    return {
      id: raw.id,
      createdAt: new Date(raw.sent_at).getTime(),
      fromMe: raw.from_me,
      type: 'image',
      imageUri: normalizeBackendAssetUrl(url),
    };
  }
  if (url && isAudioUrl(url)) {
    return {
      id: raw.id,
      createdAt: new Date(raw.sent_at).getTime(),
      fromMe: raw.from_me,
      type: 'voice',
      voiceUri: normalizeBackendAssetUrl(url),
      durationMs: 0,
    };
  }
  return {
    id: raw.id,
    createdAt: new Date(raw.sent_at).getTime(),
    fromMe: raw.from_me,
    type: 'text',
    text: content,
  };
}
