import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  enrichLocationsFromVerifiedSources,
  type EnrichItemTrace,
  type EnrichLogEntry,
} from './locationAiEnrichmentService.js';
import {
  getLandmarkContentBundle,
  hasLandmarkContentBundle,
  saveLandmarkContentBundle,
} from './landmarkContentAdminService.js';
import { publishLandmarkBundleToFirestore } from './landmarkContentFirestorePublisher.js';
import {
  dedupeCityRegionsInBundle,
  resolveCanonicalCity,
} from './cityRegionCanonical.js';
import { HttpError } from '../errors/HttpError.js';
import { config } from '../config.js';

export type EnrichJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'awaiting_decisions';

export type EnrichJobProgress = {
  done: number;
  total: number;
  currentName: string;
  phase: 'enrich' | 'rehost' | 'translate' | 'publish' | 'done';
};

export type DuplicateAction = 'skip' | 'replace' | 'merge' | 'keep_both';

export type PendingDuplicate = {
  itemIndex: number;
  landmark: any;
  match: { id: string; titleUk: string; titleEn: string; index: number };
  reason: string;
};

const MAX_LOG = 800;
const MAX_JOBS = 40;

function jobsStorePath() {
  return path.join(config.uploadDir, 'landmark-content', 'ai-enrich-jobs.json');
}

export type EnrichJobMergeTarget = {
  countryId: string;
  countryUk?: string;
  countryEn?: string;
  regionId?: string;
  cityUk?: string;
  cityEn?: string;
};

export type EnrichJobCreateInput = {
  country?: string;
  city?: string;
  items: Array<{ name: string; address?: string }>;
  rehostImages?: boolean;
  autoPublish?: boolean;
  mergeTarget?: EnrichJobMergeTarget;
  /** Full admin snapshot. Used only as overlay; disk bundle is always preferred base. */
  snapshot?: Record<string, any>;
  /** Optional pre-set decisions keyed by item index. */
  duplicatePolicies?: Record<string, DuplicateAction>;
};

export type EnrichJob = {
  id: string;
  status: EnrichJobStatus;
  createdAt: string;
  updatedAt: string;
  progress: EnrichJobProgress;
  error?: string;
  landmarks?: any[];
  published?: boolean;
  firestore?: unknown;
  appliedRegionId?: string;
  log: EnrichLogEntry[];
  itemTraces: EnrichItemTrace[];
  /** Kept so a CMS client can retry after server restart. Not returned in API by default. */
  _input?: EnrichJobCreateInput;
  /** Indexes removed by admin during the run. */
  cancelledIndexes: number[];
  /** Live snapshot mutated as each landmark publishes. */
  liveSnapshot?: Record<string, any>;
  publishedCount: number;
  pendingDuplicates: PendingDuplicate[];
  duplicateDecisions: Record<string, DuplicateAction>;
};

const jobs = new Map<string, EnrichJob>();
let persistTimer: NodeJS.Timeout | null = null;
let storeLoaded = false;

function touch(job: EnrichJob) {
  job.updatedAt = new Date().toISOString();
  schedulePersist();
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistJobsNow();
  }, 400);
}

async function persistJobsNow() {
  try {
    const dir = path.dirname(jobsStorePath());
    await mkdir(dir, { recursive: true });
    const list = [...jobs.values()].map((j) => {
      const copy: any = {
        id: j.id,
        status: j.status,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
        progress: j.progress,
        error: j.error || null,
        published: !!j.published,
        firestore: j.firestore || null,
        appliedRegionId: j.appliedRegionId || null,
        log: j.log || [],
        itemTraces: j.itemTraces || [],
        landmarkCount: Array.isArray(j.landmarks) ? j.landmarks.length : 0,
        cancelledIndexes: j.cancelledIndexes || [],
        publishedCount: j.publishedCount || 0,
        pendingDuplicates: Array.isArray(j.pendingDuplicates) ? j.pendingDuplicates : [],
        duplicateDecisions: j.duplicateDecisions && typeof j.duplicateDecisions === 'object' ? j.duplicateDecisions : {},
      };
      // Keep landmarks only for completed jobs (CMS may still poll after restart).
      if ((j.status === 'completed' || j.status === 'running') && Array.isArray(j.landmarks)) {
        copy.landmarks = j.landmarks;
      }
      if (j.liveSnapshot && typeof j.liveSnapshot === 'object') {
        // skip persisting full live snapshot to keep file smaller; republish from disk bundle
      }
      if (j._input) {
        // strip huge snapshot from disk to keep file small; CMS resends it on retry
        const { snapshot: _snap, ...rest } = j._input;
        copy._input = rest;
      }
      return copy;
    });
    await writeFile(jobsStorePath(), JSON.stringify({ version: 1, jobs: list }, null, 0), 'utf8');
  } catch {
    // non-fatal
  }
}

function loadJobsFromDisk() {
  if (storeLoaded) return;
  storeLoaded = true;
  try {
    if (!existsSync(jobsStorePath())) return;
    const raw = readFileSync(jobsStorePath(), 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.jobs) ? parsed.jobs : [];
    for (const row of list) {
      if (!row?.id) continue;
      const job: EnrichJob = {
        id: String(row.id),
        status: row.status || 'failed',
        createdAt: row.createdAt || new Date().toISOString(),
        updatedAt: row.updatedAt || new Date().toISOString(),
        progress: row.progress || { done: 0, total: 0, currentName: '', phase: 'enrich' },
        error: row.error || undefined,
        landmarks: Array.isArray(row.landmarks) ? row.landmarks : undefined,
        published: !!row.published,
        firestore: row.firestore || null,
        appliedRegionId: row.appliedRegionId || undefined,
        log: Array.isArray(row.log) ? row.log : [],
        itemTraces: Array.isArray(row.itemTraces) ? row.itemTraces : [],
        _input: row._input,
        cancelledIndexes: Array.isArray(row.cancelledIndexes) ? row.cancelledIndexes : [],
        publishedCount: Number(row.publishedCount) || 0,
        pendingDuplicates: Array.isArray(row.pendingDuplicates) ? row.pendingDuplicates : [],
        duplicateDecisions:
          row.duplicateDecisions && typeof row.duplicateDecisions === 'object'
            ? row.duplicateDecisions
            : {},
        liveSnapshot:
          row.liveSnapshot && typeof row.liveSnapshot === 'object' ? row.liveSnapshot : undefined,
      };
      if (job.status === 'running' || job.status === 'queued') {
        job.status = 'failed';
        job.error = 'server_restarted';
        job.log.push({
          ts: new Date().toISOString(),
          level: 'err',
          step: 'skip',
          message: 'Сервер перезапустився під час імпорту. Запусти знову.',
        });
        job.progress = { ...job.progress, phase: 'done' };
      }
      jobs.set(job.id, job);
    }
  } catch {
    // no store yet
  }
}

loadJobsFromDisk();

function pruneJobs() {
  if (jobs.size <= MAX_JOBS) return;
  const sorted = [...jobs.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  while (jobs.size > MAX_JOBS && sorted.length) {
    const old = sorted.shift();
    if (!old) break;
    if (old.status === 'running' || old.status === 'queued') continue;
    jobs.delete(old.id);
  }
  schedulePersist();
}

function normalizeTextKey(v: unknown) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[\s'’`".,;:()\-_/\\]+/g, '');
}

function emptySnapshot(): Record<string, any> {
  return {
    homeCountryOrder: [],
    homeRegionIdsByCountry: {},
    regions: {},
    homeCountryHeroRefs: {},
    homeCountryHeroUris: {},
  };
}

/** Prefer primary; add any countries/cities/landmarks from secondary that are missing. */
function unionSnapshots(primary: Record<string, any>, secondary: Record<string, any> | null | undefined) {
  const next = dedupeCityRegionsInBundle(
    JSON.parse(JSON.stringify(primary && typeof primary === 'object' ? primary : emptySnapshot())),
  );
  if (!secondary || typeof secondary !== 'object' || Array.isArray(secondary)) return next;

  if (!next.regions || typeof next.regions !== 'object') next.regions = {};
  if (!Array.isArray(next.homeCountryOrder)) next.homeCountryOrder = [];
  if (!next.homeRegionIdsByCountry || typeof next.homeRegionIdsByCountry !== 'object') {
    next.homeRegionIdsByCountry = {};
  }

  const secOrder = Array.isArray(secondary.homeCountryOrder) ? secondary.homeCountryOrder : [];
  for (const raw of secOrder) {
    const cid = String(raw || '').trim().toUpperCase();
    if (cid && !next.homeCountryOrder.includes(cid)) next.homeCountryOrder.push(cid);
  }

  const secMap =
    secondary.homeRegionIdsByCountry && typeof secondary.homeRegionIdsByCountry === 'object'
      ? secondary.homeRegionIdsByCountry
      : {};
  for (const [cidRaw, arr] of Object.entries(secMap)) {
    const cid = String(cidRaw || '').trim().toUpperCase();
    if (!cid) continue;
    if (!Array.isArray(next.homeRegionIdsByCountry[cid])) next.homeRegionIdsByCountry[cid] = [];
    const list = Array.isArray(arr) ? arr : [];
    for (const rid of list) {
      const id = String(rid || '').trim();
      if (id && !next.homeRegionIdsByCountry[cid].includes(id)) {
        next.homeRegionIdsByCountry[cid].push(id);
      }
    }
  }

  const secRegions = secondary.regions && typeof secondary.regions === 'object' ? secondary.regions : {};
  for (const [rid, src] of Object.entries(secRegions)) {
    if (!src || typeof src !== 'object') continue;
    if (!next.regions[rid]) {
      next.regions[rid] = JSON.parse(JSON.stringify(src));
      continue;
    }
    const dst = next.regions[rid];
    dst.landmarks = Array.isArray(dst.landmarks) ? dst.landmarks : [];
    const existingIds = new Set(dst.landmarks.map((lm: any) => String(lm?.id || '')));
    const existingTitles = new Set(
      dst.landmarks
        .flatMap((lm: any) => [normalizeTextKey(lm?.titleUk), normalizeTextKey(lm?.titleEn)])
        .filter(Boolean),
    );
    for (const lm of Array.isArray((src as any).landmarks) ? (src as any).landmarks : []) {
      if (!lm || typeof lm !== 'object') continue;
      const titleKey = normalizeTextKey(lm.titleUk || lm.titleEn);
      if ((lm.id && existingIds.has(String(lm.id))) || (titleKey && existingTitles.has(titleKey))) {
        continue;
      }
      dst.landmarks.push(JSON.parse(JSON.stringify(lm)));
      if (lm.id) existingIds.add(String(lm.id));
      if (titleKey) existingTitles.add(titleKey);
    }
  }

  for (const heroKey of ['homeCountryHeroRefs', 'homeCountryHeroUris'] as const) {
    if (!next[heroKey] || typeof next[heroKey] !== 'object') next[heroKey] = {};
    const secHero = (secondary as any)[heroKey];
    if (secHero && typeof secHero === 'object') {
      for (const [k, v] of Object.entries(secHero)) {
        if (v != null && next[heroKey][k] == null) next[heroKey][k] = v;
      }
    }
  }

  return dedupeCityRegionsInBundle(next);
}

function titlesLookSimilar(a: unknown, b: unknown) {
  const na = normalizeTextKey(a);
  const nb = normalizeTextKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 6 && nb.length >= 6 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

function coordsClose(a: any, b: any) {
  const latA = Number(a?.lat);
  const lngA = Number(a?.lng);
  const latB = Number(b?.lat);
  const lngB = Number(b?.lng);
  if (![latA, lngA, latB, lngB].every(Number.isFinite)) return false;
  return Math.abs(latA - latB) < 0.0025 && Math.abs(lngA - lngB) < 0.0025;
}

function findSimilarLandmark(landmarks: any[], candidate: any) {
  const list = Array.isArray(landmarks) ? landmarks : [];
  let best: { index: number; lm: any; reason: string; score: number } | null = null;
  for (let i = 0; i < list.length; i += 1) {
    const lm = list[i];
    if (!lm || typeof lm !== 'object') continue;
    let score = 0;
    let reason = '';
    if (
      titlesLookSimilar(candidate?.titleUk, lm.titleUk) ||
      titlesLookSimilar(candidate?.titleUk, lm.titleEn) ||
      titlesLookSimilar(candidate?.titleEn, lm.titleUk) ||
      titlesLookSimilar(candidate?.titleEn, lm.titleEn)
    ) {
      score += 10;
      reason = 'схожа назва';
    }
    if (coordsClose(candidate, lm)) {
      score += 6;
      reason = reason ? reason + ' + поруч на карті' : 'поруч на карті';
    }
    if (candidate?.id && lm.id && String(candidate.id) === String(lm.id)) {
      score += 20;
      reason = 'той самий id';
    }
    if (score >= 10 && (!best || score > best.score)) {
      best = { index: i, lm, reason, score };
    }
  }
  return best;
}

function mergeLandmarkFields(existing: any, incoming: any) {
  const out = { ...(existing && typeof existing === 'object' ? existing : {}) };
  if (!incoming || typeof incoming !== 'object') return out;
  for (const [k, v] of Object.entries(incoming)) {
    if (k === 'id') continue;
    if (v == null || v === '') continue;
    if (k === 'story' && typeof v === 'object') {
      out.story = {
        ...(out.story && typeof out.story === 'object' ? out.story : {}),
        ...v,
      };
      continue;
    }
    if (k.endsWith('I18n') && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = {
        ...(out[k] && typeof out[k] === 'object' ? out[k] : {}),
        ...v,
      };
      continue;
    }
    if (k === 'galleryUris' && Array.isArray(v)) {
      const prev = Array.isArray(out.galleryUris) ? out.galleryUris : [];
      const seen = new Set(prev.map(String));
      const merged = [...prev];
      for (const u of v) {
        const s = String(u || '').trim();
        if (!s || seen.has(s)) continue;
        seen.add(s);
        merged.push(s);
      }
      out.galleryUris = merged;
      continue;
    }
    out[k] = v;
  }
  return out;
}

function mergeLandmarksIntoSnapshot(
  base: Record<string, any>,
  mergeTarget: EnrichJobMergeTarget,
  landmarks: any[],
  opts?: {
    actions?: Array<DuplicateAction | undefined | null>;
    defaultAction?: DuplicateAction | 'ask';
    itemIndexes?: number[];
  },
) {
  const next = dedupeCityRegionsInBundle(
    JSON.parse(JSON.stringify(base && typeof base === 'object' ? base : emptySnapshot())),
  );
  if (!next.regions || typeof next.regions !== 'object') next.regions = {};
  if (!Array.isArray(next.homeCountryOrder)) next.homeCountryOrder = [];
  if (!next.homeRegionIdsByCountry || typeof next.homeRegionIdsByCountry !== 'object') {
    next.homeRegionIdsByCountry = {};
  }

  const countryId = String(mergeTarget.countryId || '').trim().toUpperCase();
  if (!countryId) throw new HttpError(400, 'country_required');

  if (!next.homeCountryOrder.includes(countryId)) next.homeCountryOrder.push(countryId);
  if (!Array.isArray(next.homeRegionIdsByCountry[countryId])) {
    next.homeRegionIdsByCountry[countryId] = [];
  }

  const cityUkIn = String(mergeTarget.cityUk || mergeTarget.cityEn || '').trim();
  const cityEnIn = String(mergeTarget.cityEn || mergeTarget.cityUk || '').trim();
  const can = resolveCanonicalCity({
    regionId: mergeTarget.regionId,
    cityUk: cityUkIn,
    cityEn: cityEnIn,
  });
  const regionId = can.id;
  const cityUk = can.titleUk;
  const cityEn = can.titleEn;

  if (!next.regions[regionId]) {
    next.regions[regionId] = {
      id: regionId,
      titleUk: cityUk,
      titleEn: cityEn,
      countryUk: mergeTarget.countryUk || countryId,
      countryEn: mergeTarget.countryEn || countryId,
      flag: '🏳️',
      center: { latitude: 0, longitude: 0, latitudeDelta: 0.12, longitudeDelta: 0.12 },
      heroThumbRef: 't1',
      landmarks: [],
    };
  } else {
    next.regions[regionId].id = regionId;
    next.regions[regionId].titleUk = cityUk || next.regions[regionId].titleUk;
    next.regions[regionId].titleEn = cityEn || next.regions[regionId].titleEn;
  }

  if (!next.homeRegionIdsByCountry[countryId].includes(regionId)) {
    next.homeRegionIdsByCountry[countryId].push(regionId);
  }

  const region = next.regions[regionId];
  region.landmarks = Array.isArray(region.landmarks) ? region.landmarks : [];
  const existingIds = new Set(region.landmarks.map((lm: any) => String(lm?.id || '')));
  const pending: PendingDuplicate[] = [];
  const defaultAction = opts?.defaultAction || 'ask';

  for (let idx = 0; idx < landmarks.length; idx += 1) {
    const lm = landmarks[idx];
    if (!lm || typeof lm !== 'object') continue;
    const itemIndex = Array.isArray(opts?.itemIndexes) ? Number(opts!.itemIndexes![idx]) : idx;
    const actionRaw = Array.isArray(opts?.actions) ? opts!.actions![idx] : undefined;
    let action: DuplicateAction | 'ask' = defaultAction;
    if (
      actionRaw === 'skip' ||
      actionRaw === 'replace' ||
      actionRaw === 'merge' ||
      actionRaw === 'keep_both'
    ) {
      action = actionRaw;
    }

    const similar = findSimilarLandmark(region.landmarks, lm);
    if (similar) {
      if (action === 'ask') {
        pending.push({
          itemIndex: Number.isFinite(itemIndex) ? itemIndex : idx,
          landmark: lm,
          match: {
            id: String(similar.lm.id || ''),
            titleUk: String(similar.lm.titleUk || ''),
            titleEn: String(similar.lm.titleEn || ''),
            index: similar.index,
          },
          reason: similar.reason,
        });
        continue;
      }
      if (action === 'skip') continue;
      if (action === 'replace') {
        const keptId = String(similar.lm.id || lm.id || `lm_${Date.now().toString(36)}`);
        region.landmarks[similar.index] = { ...lm, id: keptId };
        existingIds.add(keptId);
        continue;
      }
      if (action === 'merge') {
        region.landmarks[similar.index] = mergeLandmarkFields(similar.lm, lm);
        continue;
      }
      // keep_both → fall through with forced unique id
    }

    let id = String(lm?.id || `lm_${Date.now().toString(36)}_${idx}`).trim();
    let suffix = 1;
    while (existingIds.has(id)) {
      suffix += 1;
      id = `${lm?.id || 'lm'}_${suffix}`;
    }
    existingIds.add(id);
    region.landmarks.push({ ...lm, id });

    if (!region.heroUri && lm?.thumbUri) region.heroUri = lm.thumbUri;
    if (!region.center?.latitude && Number(lm?.lat) && Number(lm?.lng)) {
      region.center = {
        latitude: Number(lm.lat),
        longitude: Number(lm.lng),
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
    }
  }

  next._meta = {
    ...(next._meta && typeof next._meta === 'object' ? next._meta : {}),
    publishedAt: new Date().toISOString(),
    source: 'ai_enrich_job',
  };

  return { snapshot: next, regionId, pending };
}

async function resolvePublishBase(input: EnrichJobCreateInput) {
  let disk: Record<string, any> | null = null;
  if (await hasLandmarkContentBundle()) {
    const bundle = await getLandmarkContentBundle();
    if (bundle && typeof bundle === 'object' && !Array.isArray(bundle)) {
      disk = bundle as Record<string, any>;
    }
  }
  const client =
    input.snapshot && typeof input.snapshot === 'object' && !Array.isArray(input.snapshot)
      ? input.snapshot
      : null;

  // Always prefer disk as primary so a thin CMS editor never wipes Europe.
  if (disk) return unionSnapshots(disk, client);
  if (client) return dedupeCityRegionsInBundle(JSON.parse(JSON.stringify(client)));
  throw new HttpError(400, 'snapshot_required_for_publish');
}

function pushLog(job: EnrichJob, entry: EnrichLogEntry) {
  job.log.push(entry);
  if (job.log.length > MAX_LOG) {
    job.log.splice(0, job.log.length - MAX_LOG);
  }
}

function upsertItemTrace(job: EnrichJob, trace: EnrichItemTrace) {
  const idx = job.itemTraces.findIndex((t) => t.index === trace.index);
  const copy = JSON.parse(JSON.stringify(trace)) as EnrichItemTrace;
  if (idx >= 0) job.itemTraces[idx] = copy;
  else job.itemTraces.push(copy);
  job.itemTraces.sort((a, b) => a.index - b.index);
}

async function runJob(job: EnrichJob, input: EnrichJobCreateInput) {
  job.status = 'running';
  job.landmarks = [];
  job.publishedCount = 0;
  touch(job);

  let liveSnapshot: Record<string, any> | null = null;
  if (input.autoPublish) {
    if (!input.mergeTarget?.countryId) {
      job.status = 'failed';
      job.error = 'merge_target_required';
      touch(job);
      return;
    }
    try {
      liveSnapshot = await resolvePublishBase(input);
      job.liveSnapshot = liveSnapshot;
    } catch (e: any) {
      job.status = 'failed';
      job.error = e?.message || String(e);
      touch(job);
      return;
    }
  }

  try {
    const { landmarks } = await enrichLocationsFromVerifiedSources({
      country: input.country,
      city: input.city,
      items: input.items,
      rehostImages: input.rehostImages !== false,
      shouldSkipItem: (itemIndex) => (job.cancelledIndexes || []).includes(itemIndex),
      onProgress: async (p) => {
        job.progress = {
          done: p.done,
          total: p.total,
          currentName: p.currentName,
          phase: p.phase,
        };
        touch(job);
      },
      onEvent: async (event) => {
        pushLog(job, event);
        touch(job);
      },
      onItemTrace: async (trace) => {
        upsertItemTrace(job, trace);
        touch(job);
      },
      onLandmarkReady: async (landmark, itemIndex) => {
        if (!Array.isArray(job.landmarks)) job.landmarks = [];
        job.landmarks.push(landmark);

        if (input.autoPublish && input.mergeTarget && liveSnapshot) {
          const decided = job.duplicateDecisions?.[String(itemIndex)];
          const { snapshot, regionId, pending } = mergeLandmarksIntoSnapshot(
            liveSnapshot,
            input.mergeTarget,
            [landmark],
            {
              actions: [decided],
              defaultAction: decided || 'ask',
              itemIndexes: [itemIndex],
            },
          );

          if (pending.length) {
            if (!Array.isArray(job.pendingDuplicates)) job.pendingDuplicates = [];
            for (const p of pending) {
              if (!job.pendingDuplicates.some((x) => x.itemIndex === p.itemIndex)) {
                job.pendingDuplicates.push(p);
              }
            }
            const tr = job.itemTraces.find((t) => t.index === itemIndex);
            if (tr) {
              tr.status = 'needs_decision';
              tr.duplicateMatch = {
                id: pending[0].match.id,
                titleUk: pending[0].match.titleUk,
                titleEn: pending[0].match.titleEn,
                reason: pending[0].reason,
              };
              tr.titleUk = landmark?.titleUk || tr.name;
              tr.titleEn = landmark?.titleEn || '';
              tr.thumbUri = landmark?.thumbUri || tr.thumbUri || '';
              tr.landmarkId = landmark?.id || null;
              upsertItemTrace(job, tr);
            }
            pushLog(job, {
              ts: new Date().toISOString(),
              level: 'warn',
              step: 'publish',
              itemIndex,
              itemName: landmark?.titleUk || landmark?.titleEn || '',
              message: `Схожа локація вже є («${pending[0].match.titleUk || pending[0].match.titleEn}»). Обери в інспекторі: додати / замінити / окремо / пропустити.`,
              data: pending[0].match,
            });
            touch(job);
            return;
          }

          pushLog(job, {
            ts: new Date().toISOString(),
            level: 'info',
            step: 'publish',
            itemIndex,
            itemName: landmark?.titleUk || landmark?.titleEn || '',
            message: `Одразу публікую в ${input.mergeTarget.countryId} / ${input.mergeTarget.cityUk || input.mergeTarget.cityEn || ''}…`,
          });
          liveSnapshot = snapshot;
          job.liveSnapshot = snapshot;
          await saveLandmarkContentBundle(snapshot);
          const firestore = await publishLandmarkBundleToFirestore(snapshot);
          job.published = true;
          job.firestore = firestore;
          job.appliedRegionId = regionId;
          job.publishedCount = (job.publishedCount || 0) + 1;

          const tr = job.itemTraces.find((t) => t.index === itemIndex);
          if (tr) {
            tr.published = true;
            tr.publishedRegionId = regionId;
            tr.status = 'ok';
            tr.thumbUri = landmark?.thumbUri || tr.thumbUri || '';
            tr.landmarkId = landmark?.id || null;
            tr.titleUk = landmark?.titleUk || tr.name;
            tr.titleEn = landmark?.titleEn || '';
            tr.duplicateMatch = null;
            upsertItemTrace(job, tr);
          }
          pushLog(job, {
            ts: new Date().toISOString(),
            level: 'ok',
            step: 'publish',
            itemIndex,
            itemName: landmark?.titleUk || landmark?.titleEn || '',
            message: `Уже в бандлі · регіон «${regionId}» (опубліковано ${job.publishedCount})`,
            data: { regionId, publishedCount: job.publishedCount },
          });
        }
        touch(job);
      },
    });

    job.landmarks = landmarks;
    job.progress = {
      done: input.items.length,
      total: input.items.length,
      currentName: '',
      phase: 'done',
    };

    // Fallback: if autoPublish but nothing incremental (e.g. empty), still ok
    if (input.autoPublish && landmarks.length && !job.publishedCount && !(job.pendingDuplicates || []).length) {
      pushLog(job, {
        ts: new Date().toISOString(),
        level: 'info',
        step: 'publish',
        message: 'Публікую зібрані локації…',
      });
      const base = liveSnapshot || (await resolvePublishBase(input));
      const actions = landmarks.map((_, i) => job.duplicateDecisions?.[String(i)]);
      const { snapshot, regionId, pending } = mergeLandmarksIntoSnapshot(
        base,
        input.mergeTarget!,
        landmarks,
        {
          actions,
          defaultAction: 'ask',
          itemIndexes: landmarks.map((_, i) => i),
        },
      );
      if (pending.length) {
        job.pendingDuplicates = pending;
        for (const p of pending) {
          const tr = job.itemTraces.find((t) => t.index === p.itemIndex);
          if (tr) {
            tr.status = 'needs_decision';
            tr.duplicateMatch = {
              id: p.match.id,
              titleUk: p.match.titleUk,
              titleEn: p.match.titleEn,
              reason: p.reason,
            };
            upsertItemTrace(job, tr);
          }
        }
      } else {
        await saveLandmarkContentBundle(snapshot);
        const firestore = await publishLandmarkBundleToFirestore(snapshot);
        job.published = true;
        job.firestore = firestore;
        job.appliedRegionId = regionId;
        job.publishedCount = landmarks.length;
        job.liveSnapshot = snapshot;
      }
    }

    job.progress.phase = 'done';
    if ((job.pendingDuplicates || []).length) {
      job.status = 'awaiting_decisions';
      pushLog(job, {
        ts: new Date().toISOString(),
        level: 'warn',
        step: 'done',
        message: `Збір готовий. Чекаю рішення по ${(job.pendingDuplicates || []).length} схожих локаціях у адмін-панелі.`,
      });
    } else {
      job.status = 'completed';
      pushLog(job, {
        ts: new Date().toISOString(),
        level: 'ok',
        step: 'done',
        message: `Імпорт завершено: ${landmarks.length} готово, видалено ${(job.cancelledIndexes || []).length}, опубліковано ${job.publishedCount || 0}`,
      });
    }
    touch(job);
  } catch (e: any) {
    job.status = 'failed';
    job.error = e?.message || String(e);
    pushLog(job, {
      ts: new Date().toISOString(),
      level: 'err',
      step: 'skip',
      message: String(job.error || 'failed'),
    });
    touch(job);
  }
}

export function getEnrichJob(jobId: string): EnrichJob | null {
  loadJobsFromDisk();
  return jobs.get(String(jobId || '')) || null;
}

export function createEnrichJob(input: EnrichJobCreateInput): EnrichJob {
  loadJobsFromDisk();
  pruneJobs();
  const id = `job_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();
  const job: EnrichJob = {
    id,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    progress: {
      done: 0,
      total: Array.isArray(input.items) ? input.items.length : 0,
      currentName: '',
      phase: 'enrich',
    },
    log: [
      {
        ts: now,
        level: 'info',
        step: 'start',
        message: `Job створено · ${Array.isArray(input.items) ? input.items.length : 0} локацій`,
      },
    ],
    itemTraces: (Array.isArray(input.items) ? input.items : []).map((item, index) => ({
      index,
      name: String(item?.name || ''),
      address: String(item?.address || ''),
      status: 'pending',
      queries: [],
      wikiEn: null,
      wikiUk: null,
      extractUkPreview: '',
      extractEnPreview: '',
      extractUkChars: 0,
      extractEnChars: 0,
      lat: null,
      lng: null,
      imagesFound: [],
      imagesHosted: [],
      thumbUri: '',
      sources: [],
      translatedLangs: [],
      published: false,
    })),
    _input: input,
    cancelledIndexes: [],
    publishedCount: 0,
    pendingDuplicates: [],
    duplicateDecisions: {
      ...(input.duplicatePolicies && typeof input.duplicatePolicies === 'object'
        ? input.duplicatePolicies
        : {}),
    },
  };
  jobs.set(id, job);
  schedulePersist();
  setImmediate(() => {
    void runJob(job, input);
  });
  return job;
}

export function removeEnrichJobItem(jobId: string, itemIndex: number): EnrichJob {
  loadJobsFromDisk();
  const job = jobs.get(String(jobId || ''));
  if (!job) throw new HttpError(404, 'job_not_found');
  const idx = Number(itemIndex);
  if (!Number.isFinite(idx) || idx < 0) throw new HttpError(400, 'invalid_item_index');

  if (!Array.isArray(job.cancelledIndexes)) job.cancelledIndexes = [];
  if (!job.cancelledIndexes.includes(idx)) job.cancelledIndexes.push(idx);

  if (Array.isArray(job.pendingDuplicates)) {
    job.pendingDuplicates = job.pendingDuplicates.filter((p) => p.itemIndex !== idx);
  }

  const existing = job.itemTraces.find((t) => t.index === idx);
  const trace: EnrichItemTrace = existing
    ? { ...existing, status: 'removed', skipReason: 'видалено в інспекторі' }
    : {
        index: idx,
        name: `item_${idx}`,
        address: '',
        status: 'removed',
        queries: [],
        wikiEn: null,
        wikiUk: null,
        extractUkPreview: '',
        extractEnPreview: '',
        extractUkChars: 0,
        extractEnChars: 0,
        lat: null,
        lng: null,
        imagesFound: [],
        imagesHosted: [],
        thumbUri: '',
        sources: [],
        translatedLangs: [],
        skipReason: 'видалено в інспекторі',
      };
  upsertItemTrace(job, trace);
  pushLog(job, {
    ts: new Date().toISOString(),
    level: 'warn',
    step: 'skip',
    itemIndex: idx,
    itemName: trace.name,
    message: `Видалено з черги: «${trace.name}»`,
  });
  touch(job);
  return job;
}

export async function resolveEnrichJobDuplicate(
  jobId: string,
  itemIndex: number,
  action: DuplicateAction,
): Promise<EnrichJob> {
  loadJobsFromDisk();
  const job = jobs.get(String(jobId || ''));
  if (!job) throw new HttpError(404, 'job_not_found');
  const idx = Number(itemIndex);
  if (!Number.isFinite(idx) || idx < 0) throw new HttpError(400, 'invalid_item_index');
  if (!['skip', 'replace', 'merge', 'keep_both'].includes(action)) {
    throw new HttpError(400, 'invalid_duplicate_action');
  }

  const pendingIdx = (job.pendingDuplicates || []).findIndex((p) => p.itemIndex === idx);
  if (pendingIdx < 0) throw new HttpError(404, 'duplicate_not_pending');
  const pending = job.pendingDuplicates[pendingIdx];
  job.duplicateDecisions = {
    ...(job.duplicateDecisions || {}),
    [String(idx)]: action,
  };

  const input = job._input;
  if (!input?.mergeTarget?.countryId) {
    throw new HttpError(400, 'merge_target_required');
  }

  let liveSnapshot = job.liveSnapshot;
  if (!liveSnapshot) {
    liveSnapshot = await resolvePublishBase(input);
  }

  if (action === 'skip') {
    job.pendingDuplicates.splice(pendingIdx, 1);
    const tr = job.itemTraces.find((t) => t.index === idx);
    if (tr) {
      tr.status = 'skipped';
      tr.skipReason = 'пропущено: схожа локація вже є';
      tr.duplicateMatch = null;
      upsertItemTrace(job, tr);
    }
    pushLog(job, {
      ts: new Date().toISOString(),
      level: 'info',
      step: 'publish',
      itemIndex: idx,
      itemName: pending.landmark?.titleUk || pending.landmark?.titleEn || '',
      message: 'Пропущено (залишили існуючу локацію)',
    });
  } else {
    const { snapshot, regionId } = mergeLandmarksIntoSnapshot(
      liveSnapshot,
      input.mergeTarget,
      [pending.landmark],
      {
        actions: [action],
        defaultAction: action,
        itemIndexes: [idx],
      },
    );
    job.liveSnapshot = snapshot;
    await saveLandmarkContentBundle(snapshot);
    const firestore = await publishLandmarkBundleToFirestore(snapshot);
    job.published = true;
    job.firestore = firestore;
    job.appliedRegionId = regionId;
    job.publishedCount = (job.publishedCount || 0) + 1;
    job.pendingDuplicates.splice(pendingIdx, 1);

    const tr = job.itemTraces.find((t) => t.index === idx);
    if (tr) {
      tr.status = 'ok';
      tr.published = true;
      tr.publishedRegionId = regionId;
      tr.thumbUri = pending.landmark?.thumbUri || tr.thumbUri || '';
      tr.landmarkId = pending.landmark?.id || tr.landmarkId || null;
      tr.titleUk = pending.landmark?.titleUk || tr.titleUk || tr.name;
      tr.titleEn = pending.landmark?.titleEn || tr.titleEn || '';
      tr.duplicateMatch = null;
      tr.skipReason = undefined;
      upsertItemTrace(job, tr);
    }
    const actionLabel =
      action === 'replace'
        ? 'замінено існуючу'
        : action === 'merge'
          ? 'додано в існуючу'
          : 'залишено окремою';
    pushLog(job, {
      ts: new Date().toISOString(),
      level: 'ok',
      step: 'publish',
      itemIndex: idx,
      itemName: pending.landmark?.titleUk || pending.landmark?.titleEn || '',
      message: `Рішення: ${actionLabel} · регіон «${regionId}»`,
    });
  }

  if (!(job.pendingDuplicates || []).length) {
    if (job.status === 'awaiting_decisions' || job.progress?.phase === 'done') {
      job.status = 'completed';
      pushLog(job, {
        ts: new Date().toISOString(),
        level: 'ok',
        step: 'done',
        message: `Усі рішення прийняті. Опубліковано ${job.publishedCount || 0}.`,
      });
    }
  } else if (job.progress?.phase === 'done') {
    job.status = 'awaiting_decisions';
  }

  touch(job);
  return job;
}

export function listEnrichJobs(): EnrichJob[] {
  loadJobsFromDisk();
  return [...jobs.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function serializeEnrichJobSummary(job: EnrichJob) {
  const input = job._input || ({} as EnrichJobCreateInput);
  const landmarks = Array.isArray(job.landmarks) ? job.landmarks : [];
  const landmarkByIndex = new Map<number, any>();
  // Best-effort map: traces order matches items; landmarks only for successful ones
  const okTraces = (job.itemTraces || []).filter((t) => t.status === 'ok');
  okTraces.forEach((t, i) => {
    if (landmarks[i]) landmarkByIndex.set(t.index, landmarks[i]);
  });
  // Prefer match by title
  for (const lm of landmarks) {
    const key = normalizeTextKey(lm?.titleUk || lm?.titleEn);
    const tr = (job.itemTraces || []).find(
      (t) => t.status === 'ok' && normalizeTextKey(t.name) === key,
    );
    if (tr) landmarkByIndex.set(tr.index, lm);
  }

  return {
    ok: true,
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error || null,
    published: !!job.published,
    publishedCount: job.publishedCount || 0,
    landmarkCount: landmarks.length,
    appliedRegionId: job.appliedRegionId || null,
    country: input.country || input.mergeTarget?.countryEn || input.mergeTarget?.countryUk || '',
    city: input.city || input.mergeTarget?.cityUk || input.mergeTarget?.cityEn || '',
    countryId: input.mergeTarget?.countryId || '',
    regionId: job.appliedRegionId || input.mergeTarget?.regionId || '',
    items: (job.itemTraces || []).map((t) => {
      const lm = landmarkByIndex.get(t.index);
      return {
        index: t.index,
        name: t.name,
        address: t.address || '',
        status: t.status,
        published: !!t.published,
        landmarkId: t.landmarkId || lm?.id || null,
        titleUk: t.titleUk || lm?.titleUk || t.name,
        titleEn: t.titleEn || lm?.titleEn || '',
        thumbUri: t.thumbUri || lm?.thumbUri || '',
        regionId: t.publishedRegionId || job.appliedRegionId || input.mergeTarget?.regionId || null,
        wikiUk: t.wikiUk?.title || null,
        wikiEn: t.wikiEn?.title || null,
      };
    }),
    retry: {
      country: input.country || input.mergeTarget?.countryEn || input.mergeTarget?.countryUk || '',
      city: input.city || input.mergeTarget?.cityUk || input.mergeTarget?.cityEn || '',
      countryId: input.mergeTarget?.countryId || '',
      countryUk: input.mergeTarget?.countryUk || '',
      countryEn: input.mergeTarget?.countryEn || '',
      cityUk: input.mergeTarget?.cityUk || input.city || '',
      cityEn: input.mergeTarget?.cityEn || input.city || '',
      regionId: input.mergeTarget?.regionId || job.appliedRegionId || '',
      itemsAll: (Array.isArray(input.items) && input.items.length
        ? input.items
        : (job.itemTraces || []).map((t) => ({ name: t.name, address: t.address || '' }))
      ).map((it) => ({
        name: String(it?.name || '').trim(),
        address: String(it?.address || '').trim(),
      })).filter((it) => it.name),
      itemsFailed: (job.itemTraces || [])
        .filter((t) => t.status === 'error' || t.status === 'skipped' || t.status === 'removed' || t.status === 'pending')
        .map((t) => ({
          name: String(t.name || '').trim(),
          address: String(t.address || '').trim(),
        }))
        .filter((it) => it.name),
    },
  };
}

export function serializeEnrichJob(job: EnrichJob, opts?: { includeLandmarks?: boolean }) {
  const includeLandmarks = opts?.includeLandmarks !== false;
  const summary = serializeEnrichJobSummary(job);
  return {
    ...summary,
    progress: job.progress,
    firestore: job.firestore || null,
    cancelledIndexes: job.cancelledIndexes || [],
    pendingDuplicates: job.pendingDuplicates || [],
    duplicateDecisions: job.duplicateDecisions || {},
    log: job.log || [],
    itemTraces: job.itemTraces || [],
    ...(includeLandmarks && landmarksPresent(job) ? { landmarks: job.landmarks || [] } : {}),
  };
}

function landmarksPresent(job: EnrichJob) {
  return Array.isArray(job.landmarks) && job.landmarks.length > 0;
}
