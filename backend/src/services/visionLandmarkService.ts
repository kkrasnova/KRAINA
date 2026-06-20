import { config } from '../config.js';

export async function detectVisionLandmarkTitle(base64Image: string): Promise<string | null> {
  const key = config.googleVisionApiKey;
  const content = base64Image.replace(/^data:image\/\w+;base64,/, '').trim();
  if (!key || !content) return null;

  const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`;
  const body = {
    requests: [
      {
        image: { content },
        features: [{ type: 'LANDMARK_DETECTION', maxResults: 8 }],
      },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    responses?: Array<{
      error?: unknown;
      landmarkAnnotations?: Array<{ description?: string; score?: number }>;
    }>;
  };
  if (json?.responses?.[0]?.error) return null;
  const list = json?.responses?.[0]?.landmarkAnnotations;
  if (!Array.isArray(list) || list.length === 0) return null;
  const best = list.reduce((a, b) => ((b.score || 0) > (a.score || 0) ? b : a));
  const title = best?.description?.trim();
  return title || null;
}
