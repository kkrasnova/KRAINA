import { listPublishedLocations, searchPublishedLocationsFTS } from './locationsCrudService.js';
import { travelMinutes, haversineKm } from '../utils/geoHaversine.js';
import { HttpError } from '../errors/HttpError.js';
import { aiRouteConfig } from '../config.js';

export type AiSuggestInput = {
  place: string;
  hours: number;
  transport: 'walk' | 'car' | 'bus' | 'train';
  interests?: {
    landmark?: boolean;
    park?: boolean;
    museum?: boolean;
    cafe?: boolean;
    architecture?: boolean;
    secret?: boolean;
  } | null;
  budgetTier?: 'free' | 'budget' | 'medium';
  language?: string;
  userOrigin?: { lat: number; lng: number } | null;
};

type LocRow = {
  id: string;
  title: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  category: string;
  cover_image_url: string | null;
};

function interestFilter(row: LocRow, interests: AiSuggestInput['interests']): boolean {
  if (!interests) return true;
  const anyOn =
    interests.landmark === true ||
    interests.park === true ||
    interests.museum === true ||
    interests.cafe === true ||
    interests.architecture === true ||
    interests.secret === true;
  if (!anyOn) return true;
  const c = String(row.category || '').toLowerCase();
  const title = String(row.title || '');
  const titleLower = title.toLowerCase();
  if (interests.museum && c === 'museum') return true;
  if (interests.park && c === 'park') return true;
  if (interests.landmark && (c === 'monument' || c === 'church' || c === 'art')) return true;
  if (interests.cafe && /café|cafe|coffee|ресторан/i.test(row.title)) return true;
  if (interests.cafe && c === 'other') return true;
  if (
    interests.architecture &&
    (c === 'art' || c === 'monument' || c === 'church' || /архітектур|фасад|площ|вулиц/i.test(titleLower))
  ) {
    return true;
  }
  if (interests.secret && (c === 'other' || /прихован|таємн|secret|маловідом|hidden/i.test(titleLower))) {
    return true;
  }
  return false;
}

const STOP_MINUTES_DEFAULT = 38;

function thumbForClient(row: LocRow) {
  const u = row.cover_image_url?.trim();
  if (u && /^https?:\/\//i.test(u)) return { uri: u };
  return null;
}

function budgetPreferenceText(tier: AiSuggestInput['budgetTier']): string {
  switch (tier) {
    case 'free':
      return 'free / no paid entries when possible';
    case 'budget':
      return 'low spend (around up to 200 UAH total) when choosing cafes or paid venues';
    case 'medium':
    default:
      return 'moderate spend (around up to 500 UAH) when relevant';
  }
}

function parseAssistantJson(content: string): { orderedIds: string[]; rationale?: string } | null {
  const t = content.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fence ? fence[1] : t).trim();
  try {
    const j = JSON.parse(raw) as { orderedIds?: unknown; rationale?: unknown };
    if (!Array.isArray(j.orderedIds)) return null;
    const orderedIds = j.orderedIds.filter((x): x is string => typeof x === 'string' && x.length > 0);
    const rationale = typeof j.rationale === 'string' ? j.rationale : undefined;
    return { orderedIds, rationale };
  } catch {
    return null;
  }
}

async function callChatCompletions(system: string, user: string): Promise<string> {
  const { apiKey, baseUrl, model } = aiRouteConfig;
  if (!apiKey) throw new HttpError(503, 'ai_not_configured', 'Set OPENAI_API_KEY or use heuristic-only catalog.');
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
      temperature: 0.25,
      max_tokens: 700,
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
  return content;
}

function greedyOrder(
  pool: LocRow[],
  budgetMin: number,
  transport: string,
  userOrigin: { lat: number; lng: number } | null,
): LocRow[] {
  if (!pool.length) return [];
  const speed = transport === 'car' ? 28 : transport === 'bus' ? 18 : transport === 'train' ? 35 : 5;
  const remaining = [...pool];
  const stops: LocRow[] = [];
  let used = 0;
  let prev: { lat: number; lng: number } | null = userOrigin;

  const tryAdd = (lm: LocRow) => {
    const travelMin = prev ? (haversineKm(prev, lm) / speed) * 60 : 0;
    const need = travelMin + STOP_MINUTES_DEFAULT;
    if (used + need <= budgetMin) {
      stops.push(lm);
      used += need;
      prev = lm;
      return true;
    }
    return false;
  };

  if (userOrigin) {
    remaining.sort((a, b) => haversineKm(userOrigin, a) - haversineKm(userOrigin, b));
  } else {
    remaining.sort((a, b) => a.title.localeCompare(b.title, 'uk'));
  }
  const first = remaining.shift();
  if (first) tryAdd(first);

  while (remaining.length && stops.length) {
    const last = stops[stops.length - 1];
    remaining.sort((a, b) => haversineKm(last, a) - haversineKm(last, b));
    let added = false;
    for (let i = 0; i < remaining.length; i += 1) {
      if (tryAdd(remaining[i])) {
        remaining.splice(i, 1);
        added = true;
        break;
      }
    }
    if (!added) break;
  }
  return stops;
}

function boundsMapRegion(stops: LocRow[]) {
  if (!stops.length) {
    return { latitude: 48.45, longitude: 31.18, latitudeDelta: 4, longitudeDelta: 4 };
  }
  let minLat = stops[0].lat;
  let maxLat = stops[0].lat;
  let minLng = stops[0].lng;
  let maxLng = stops[0].lng;
  for (const s of stops) {
    minLat = Math.min(minLat, s.lat);
    maxLat = Math.max(maxLat, s.lat);
    minLng = Math.min(minLng, s.lng);
    maxLng = Math.max(maxLng, s.lng);
  }
  const pad = 0.02;
  const latD = Math.max((maxLat - minLat) * 1.4 + pad, 0.06);
  const lngD = Math.max((maxLng - minLng) * 1.4 + pad, 0.06);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latD,
    longitudeDelta: lngD,
  };
}

export async function suggestAiRoute(input: AiSuggestInput): Promise<{
  routePlan: Record<string, unknown>;
  usedAi: boolean;
  rationale?: string;
}> {
  const hours = Math.min(Math.max(Number(input.hours) || 4, 1), 12);
  const budgetMin = hours * 60;
  const transport = input.transport || 'walk';
  const q = input.place.trim().slice(0, 200);

  let catalog: LocRow[] = [];
  if (q.length >= 2) {
    const hits = await searchPublishedLocationsFTS(q, 40);
    catalog = hits as LocRow[];
  }
  if (catalog.length < 8) {
    const more = await listPublishedLocations({ limit: 55 });
    const merged = new Map<string, LocRow>();
    for (const r of catalog) merged.set(r.id, r);
    for (const r of more as LocRow[]) {
      if (!merged.has(r.id)) merged.set(r.id, r);
    }
    catalog = Array.from(merged.values());
  }

  catalog = catalog.filter((r) => interestFilter(r, input.interests));
  if (catalog.length > 32) catalog = catalog.slice(0, 32);

  let usedAi = false;
  let ordered: LocRow[] = [];
  let rationale: string | undefined;

  if (aiRouteConfig.apiKey && catalog.length >= 2) {
    const compact = catalog.map((c) => ({
      id: c.id,
      title: c.title,
      city: c.city,
      category: c.category,
      lat: c.lat,
      lng: c.lng,
    }));
    const budgetHint = budgetPreferenceText(input.budgetTier);
    const system = `You are KRAÏNA travel assistant. Output ONLY valid JSON, no markdown if possible. Schema: {"orderedIds":["uuid",...],"rationale":"one short sentence in Ukrainian or English"}. Pick 3–10 location ids for a coherent ${transport} route within about ${hours} hours total (including ~${STOP_MINUTES_DEFAULT} min per venue + travel). Respect user interests and budget preference (${budgetHint}). Use only ids from the provided list. Order by visiting sequence.`;
    const userMsg = `User query: ${q}\nBudget tier: ${input.budgetTier ?? 'medium'}\nInterests: ${JSON.stringify(input.interests || {})}\nLocations:\n${JSON.stringify(compact)}`;
    try {
      const raw = await callChatCompletions(system, userMsg);
      const parsed = parseAssistantJson(raw);
      if (parsed?.orderedIds?.length) {
        const byId = new Map(catalog.map((c) => [c.id, c]));
        for (const id of parsed.orderedIds) {
          const row = byId.get(id);
          if (row && !ordered.find((x) => x.id === row.id)) ordered.push(row);
        }
        if (ordered.length >= 2) {
          usedAi = true;
          rationale = parsed.rationale;
        }
      }
    } catch {
      ordered = [];
    }
  }

  if (ordered.length < 2) {
    ordered = greedyOrder(catalog, budgetMin, transport, input.userOrigin ?? null);
  }

  if (ordered.length < 2) {
    throw new HttpError(400, 'ai_no_stops', 'Not enough published locations for this query.');
  }

  const userOrigin = input.userOrigin;
  const coordinates: { latitude: number; longitude: number }[] = [];
  if (userOrigin) coordinates.push({ latitude: userOrigin.lat, longitude: userOrigin.lng });
  for (const s of ordered) coordinates.push({ latitude: s.lat, longitude: s.lng });

  let totalKm = 0;
  if (userOrigin && ordered[0]) totalKm += haversineKm(userOrigin, ordered[0]);
  for (let i = 1; i < ordered.length; i += 1) totalKm += haversineKm(ordered[i - 1], ordered[i]);

  let totalMinutes = 0;
  let prev: { lat: number; lng: number } | null = userOrigin ?? null;
  for (const s of ordered) {
    if (prev) totalMinutes += travelMinutes(prev, s, transport);
    totalMinutes += STOP_MINUTES_DEFAULT;
    prev = s;
  }

  const cityLabel = ordered[0]?.city || q || 'KRAÏNA';
  const countryLabel = ordered[0]?.country || '';
  const flag = /ukraine|україн/i.test(countryLabel) ? '🇺🇦' : '📍';

  const stopsOut = ordered.map((s, idx) => {
    const thumb = thumbForClient(s);
    return {
      order: idx + 1,
      id: s.id,
      titleUk: s.title,
      titleEn: s.title,
      title: s.title,
      lat: s.lat,
      lng: s.lng,
      minutes: STOP_MINUTES_DEFAULT,
      category: s.category,
      thumb,
    };
  });

  const mapRegion = boundsMapRegion(ordered);
  const resolvedBudget = input.budgetTier ?? 'medium';

  const routePlan = {
    regionId: 'catalog-ai',
    regionTitleUk: cityLabel,
    regionTitleEn: cityLabel,
    countryUk: countryLabel || 'Україна',
    countryEn: countryLabel || 'Ukraine',
    flag,
    stops: stopsOut,
    coordinates,
    totalKm,
    totalMinutes: Math.round(totalMinutes),
    transport,
    budgetTier: resolvedBudget,
    interests: input.interests || null,
    userOrigin: userOrigin || null,
    mapRegion,
    aiGenerated: true,
    freeOnly: resolvedBudget === 'free',
  };

  return { routePlan, usedAi, rationale };
}
