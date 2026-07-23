import { HttpError } from '../errors/HttpError.js';
import { aiRouteConfig } from '../config.js';

export type WalkNarrateInput = {
  title: string;
  extract: string;
  street?: string;
  city?: string;
  language?: 'uk' | 'en';
};

function fallbackScript(input: WalkNarrateInput): string {
  const uk = input.language !== 'en';
  const title = String(input.title || '').trim();
  const street = String(input.street || '').trim();
  const extract = String(input.extract || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 420);
  if (uk) {
    const lead = street
      ? `Ви проходите повз ${title || 'цю локацію'} на вулиці ${street}.`
      : `Ви проходите повз ${title || 'цю локацію'}.`;
    return extract ? `${lead} ${extract}` : lead;
  }
  const lead = street
    ? `You’re passing ${title || 'this place'} on ${street}.`
    : `You’re passing ${title || 'this place'}.`;
  return extract ? `${lead} ${extract}` : lead;
}

async function callChatCompletions(system: string, user: string): Promise<string> {
  const { apiKey, baseUrl, model } = aiRouteConfig;
  if (!apiKey) throw new HttpError(503, 'ai_not_configured');
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.35,
      max_tokens: 420,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new HttpError(502, 'ai_upstream_error', text.slice(0, 200));
  }
  let body: { choices?: { message?: { content?: string } }[] };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    throw new HttpError(502, 'ai_bad_response');
  }
  const content = body.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') throw new HttpError(502, 'ai_empty_content');
  return content.trim();
}

/**
 * Перетворює Wikipedia extract + вулицю на короткий усний аудіогід (1–3 речення).
 * Без OPENAI_API_KEY повертає deterministic fallback (усе одно з реальних wiki-фактів).
 */
export async function narrateWalkGuide(
  input: WalkNarrateInput,
): Promise<{ script: string; usedAi: boolean }> {
  const title = String(input.title || '').trim();
  const extract = String(input.extract || '').trim();
  if (!title && !extract) {
    throw new HttpError(400, 'walk_narrate_empty');
  }

  const language = input.language === 'en' ? 'en' : 'uk';
  const fallback = fallbackScript({ ...input, language });

  if (!aiRouteConfig.apiKey) {
    return { script: fallback, usedAi: false };
  }

  const system =
    language === 'uk'
      ? `Ти аудіогід KRAÏNA для пішоходів. Говори українською, тепло й коротко (2–4 речення, до 90 слів).
Використовуй ЛИШЕ факти з наданого тексту Wikipedia. Не вигадуй імена, дати чи події.
Формат: звертайся до слухача як до людини, що саме зараз проходить повз місце («Ви проходите…»).
Можна згадати вулицю/район, якщо дані. Без маркдауну, без емодзі, без посилань.`
      : `You are the KRAÏNA walking audio guide. Speak English, warmly and briefly (2–4 sentences, ≤90 words).
Use ONLY facts from the provided Wikipedia text. Do not invent names, dates, or events.
Address the listener as someone walking past now (“You’re passing…”).
Mention the street/area if given. No markdown, emoji, or URLs.`;

  const user = JSON.stringify({
    title,
    street: input.street || '',
    city: input.city || '',
    wikipediaExtract: extract.slice(0, 1600),
  });

  try {
    const script = await callChatCompletions(system, user);
    if (!script || script.length < 24) {
      return { script: fallback, usedAi: false };
    }
    return { script: script.slice(0, 900), usedAi: true };
  } catch {
    return { script: fallback, usedAi: false };
  }
}
