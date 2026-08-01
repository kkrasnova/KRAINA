import { apiHttp } from './apiHttp';
import { useAuthStore } from './auth/authStore';

function clean(s) {
  return String(s || '').trim();
}

function authHeaders() {
  const token = useAuthStore.getState().accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function parseGoogleMapsLatLng(url) {
  const u = clean(url);
  if (!u) return null;

  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /[?&]ll=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
  ];

  for (const re of patterns) {
    const m = u.match(re);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

export function buildAiStoryDraft(input) {
  const titleUk = clean(input?.titleUk);
  const titleEn = clean(input?.titleEn);
  const descUk = clean(input?.descUk);
  const descEn = clean(input?.descEn);
  const oldUri = clean(input?.oldUri);
  const newUri = clean(input?.newUri);
  const bgUri = clean(input?.bgUri || newUri || oldUri);
  const mapsUrl = clean(input?.mapsUrl);
  const coords = parseGoogleMapsLatLng(mapsUrl);

  const placeUk = titleUk || titleEn || 'пам’ятка';
  const placeEn = titleEn || titleUk || 'landmark';

  const qUk = `Що найкраще описує "${placeUk}"?`;
  const qEn = `What best describes "${placeEn}"?`;

  const introUk = descUk || `Коротка історія про ${placeUk}.`;
  const introEn = descEn || `A short story about ${placeEn}.`;

  const factBodyUk = descUk || `${placeUk} має історичну або культурну цінність.`;
  const factBodyEn = descEn || `${placeEn} has historical or cultural value.`;

  return {
    coords,
    storyPatch: {
      builtAt: '',
      shortIntroUk: introUk,
      shortIntroEn: introEn,
      quiz: {
        questionUk: qUk,
        questionEn: qEn,
        options: [
          { textUk: 'Культурна/історична пам’ятка', textEn: 'A cultural/historical landmark', correct: true },
          { textUk: 'Сучасний бізнес-центр', textEn: 'A modern business center', correct: false },
          { textUk: 'Спортивна арена', textEn: 'A sports arena', correct: false },
        ],
        multiHintUk: `${placeUk} має історичну або культурну цінність.`,
        multiHintEn: `${placeEn} has historical or cultural value.`,
      },
      photoFact: {
        bgUri,
        titleUk: `Факт про ${placeUk}`,
        titleEn: `Fact about ${placeEn}`,
        bodyUk: factBodyUk,
        bodyEn: factBodyEn,
      },
      beforeAfter: {
        oldUri,
        newUri: newUri || bgUri,
      },
      secondFact: {
        titleUk: `Було / стало: ${placeUk}`,
        titleEn: `Before / after: ${placeEn}`,
        bodyUk: `Порівняйте історичне та сучасне фото ${placeUk}.`,
        bodyEn: `Compare historical and modern photos of ${placeEn}.`,
      },
      closingUk: `Тепер ви знаєте більше про ${placeUk}.`,
      closingEn: `Now you know more about ${placeEn}.`,
    },
  };
}

function normalizeItems(items) {
  return Array.isArray(items)
    ? items
        .map((item) => ({
          name: clean(item?.name || item),
          address: clean(item?.address),
        }))
        .filter((item) => item.name)
    : [];
}

/** Legacy sync enrich (small batches). Prefer startAiEnrichJob for bulk. */
export async function enrichLandmarksFromVerifiedSources({ country, city, items, rehostImages = true }) {
  const { data } = await apiHttp.post(
    '/api/admin/locations/ai-enrich',
    {
      country: clean(country),
      city: clean(city),
      items: normalizeItems(items),
      rehostImages: rehostImages !== false,
    },
    {
      headers: { ...authHeaders() },
      timeout: 180000,
    },
  );
  return Array.isArray(data?.landmarks) ? data.landmarks : [];
}

export async function startAiEnrichJob({
  country,
  city,
  items,
  rehostImages = true,
  autoPublish = false,
  mergeTarget,
  snapshot,
}) {
  const { data } = await apiHttp.post(
    '/api/admin/locations/ai-enrich-job',
    {
      country: clean(country),
      city: clean(city),
      items: normalizeItems(items),
      rehostImages: rehostImages !== false,
      autoPublish: !!autoPublish,
      ...(mergeTarget ? { mergeTarget } : {}),
      ...(snapshot && typeof snapshot === 'object' ? { snapshot } : {}),
    },
    {
      headers: { ...authHeaders() },
      timeout: 60000,
    },
  );
  return data;
}

export async function getAiEnrichJob(jobId) {
  const { data } = await apiHttp.get(`/api/admin/locations/ai-enrich-job/${encodeURIComponent(jobId)}`, {
    headers: { ...authHeaders() },
    timeout: 30000,
  });
  return data;
}

/**
 * Starts enrich job and polls until completed/failed.
 * onProgress({ done, total, currentName, phase, status })
 */
export async function runAiEnrichJobAndWait(input, { onProgress, pollMs = 2000, maxWaitMs = 45 * 60 * 1000 } = {}) {
  const started = await startAiEnrichJob(input);
  const jobId = started?.id;
  if (!jobId) throw new Error('job_start_failed');

  const startedAt = Date.now();
  let last = started;
  while (true) {
    if (typeof onProgress === 'function') {
      onProgress({
        status: last?.status,
        done: last?.progress?.done ?? 0,
        total: last?.progress?.total ?? 0,
        currentName: last?.progress?.currentName || '',
        phase: last?.progress?.phase || 'enrich',
        landmarkCount: last?.landmarkCount ?? 0,
        published: !!last?.published,
      });
    }
    if (last?.status === 'completed' || last?.status === 'failed') {
      if (last.status === 'failed') {
        const err = new Error(last?.error || 'enrich_job_failed');
        err.job = last;
        throw err;
      }
      return last;
    }
    if (Date.now() - startedAt > maxWaitMs) {
      const err = new Error('enrich_job_timeout');
      err.job = last;
      throw err;
    }
    await sleep(pollMs);
    last = await getAiEnrichJob(jobId);
  }
}
