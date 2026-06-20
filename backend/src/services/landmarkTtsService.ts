import { aiRouteConfig, config } from '../config.js';
import { HttpError } from '../errors/HttpError.js';

type ContentLang = 'uk' | 'en';

const GOOGLE_VOICES: Record<ContentLang, { languageCode: string; name: string }> = {
  uk: { languageCode: 'uk-UA', name: 'uk-UA-Wavenet-A' },
  en: { languageCode: 'en-US', name: 'en-US-Neural2-F' },
};

const OPENAI_VOICES: Record<ContentLang, string> = {
  uk: 'nova',
  en: 'nova',
};

function normalizeContentLang(raw: string): ContentLang {
  const b = String(raw || 'en').split(/[-_]/)[0].toLowerCase();
  return b === 'uk' ? 'uk' : 'en';
}

/** Google TTS ~5 KB/chunk; OpenAI ~4 KB/chunk — split on paragraphs/sentences. */
export function splitTextForTts(text: string, maxBytes: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (Buffer.byteLength(trimmed, 'utf8') <= maxBytes) return [trimmed];

  const chunks: string[] = [];
  let buf = '';

  const flush = () => {
    const t = buf.trim();
    if (t) chunks.push(t);
    buf = '';
  };

  for (const para of trimmed.split(/\n\n+/)) {
    const next = buf ? `${buf}\n\n${para}` : para;
    if (Buffer.byteLength(next, 'utf8') <= maxBytes) {
      buf = next;
      continue;
    }
    flush();
    if (Buffer.byteLength(para, 'utf8') <= maxBytes) {
      buf = para;
      continue;
    }
    const sentences = para.match(/[^.!?…]+[.!?…]+(\s|$)|[^.!?…]+$/g) || [para];
    for (const s of sentences) {
      const seg = s.trim();
      if (!seg) continue;
      const candidate = buf ? `${buf} ${seg}` : seg;
      if (Buffer.byteLength(candidate, 'utf8') <= maxBytes) {
        buf = candidate;
        continue;
      }
      flush();
      if (Buffer.byteLength(seg, 'utf8') <= maxBytes) {
        buf = seg;
        continue;
      }
      let rest = seg;
      while (rest) {
        let slice = rest;
        while (slice && Buffer.byteLength(slice, 'utf8') > maxBytes) {
          slice = slice.slice(0, Math.max(1, Math.floor(slice.length * 0.85)));
        }
        chunks.push(slice.trim());
        rest = rest.slice(slice.length).trim();
      }
    }
  }
  flush();
  return chunks.filter(Boolean);
}

async function googleSynthesizeChunk(text: string, contentLang: ContentLang): Promise<Buffer> {
  const apiKey = config.googleTtsApiKey || config.googleVisionApiKey;
  if (!apiKey) throw new HttpError(503, 'tts_not_configured');
  const voice = GOOGLE_VOICES[contentLang];
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: voice.languageCode, name: voice.name },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: 0.96,
          pitch: 0,
          effectsProfileId: ['headphone-class-device'],
        },
      }),
    },
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new HttpError(502, 'tts_provider_error', errText.slice(0, 240));
  }
  const json = (await res.json()) as { audioContent?: string };
  if (!json.audioContent) throw new HttpError(502, 'tts_empty_audio');
  return Buffer.from(json.audioContent, 'base64');
}

async function openAiSynthesizeChunk(text: string, contentLang: ContentLang): Promise<Buffer> {
  const { apiKey, baseUrl } = aiRouteConfig;
  if (!apiKey) throw new HttpError(503, 'tts_not_configured');
  const res = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL?.trim() || 'tts-1-hd',
      input: text,
      voice: OPENAI_VOICES[contentLang],
      response_format: 'mp3',
      speed: 0.96,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new HttpError(502, 'tts_provider_error', errText.slice(0, 240));
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function synthesizeLandmarkSpeech(
  text: string,
  rawLang: string,
): Promise<{ audioBase64: string; provider: 'google' | 'openai' }> {
  const contentLang = normalizeContentLang(rawLang);
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new HttpError(400, 'tts_empty_text');
  if (trimmed.length > 20_000) throw new HttpError(400, 'tts_text_too_long');

  const googleKey = config.googleTtsApiKey || config.googleVisionApiKey;
  if (googleKey) {
    try {
      const chunks = splitTextForTts(trimmed, 4500);
      const parts = await Promise.all(chunks.map((c) => googleSynthesizeChunk(c, contentLang)));
      return { audioBase64: Buffer.concat(parts).toString('base64'), provider: 'google' };
    } catch (e) {
      if (!aiRouteConfig.apiKey) throw e;
      if (config.nodeEnv !== 'production') {
        console.warn('[landmarkTts] google failed, trying openai', e);
      }
    }
  }

  if (aiRouteConfig.apiKey) {
    const chunks = splitTextForTts(trimmed, 3800);
    const parts = await Promise.all(chunks.map((c) => openAiSynthesizeChunk(c, contentLang)));
    return { audioBase64: Buffer.concat(parts).toString('base64'), provider: 'openai' };
  }

  throw new HttpError(503, 'tts_not_configured');
}
