import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { HttpError } from '../errors/HttpError.js';
import { getStorageProvider } from '../storage/index.js';
import { dedupeCityRegionsInBundle } from './cityRegionCanonical.js';
const SUB = 'landmark-content';
const BUNDLE_FILE = 'landmark_bundle.json';
const MEDIA_PREFIX = 'landmark-content/media';
function rootDir() {
    return path.join(config.uploadDir, SUB);
}
function bundlePath() {
    return path.join(rootDir(), BUNDLE_FILE);
}
export async function ensureLandmarkContentDirs() {
    await mkdir(rootDir(), { recursive: true });
    // local provider needs the media subdirectory created upfront
    if (getStorageProvider().type === 'local') {
        await mkdir(path.join(rootDir(), 'media'), { recursive: true });
    }
}
export async function hasLandmarkContentBundle() {
    try {
        const st = await stat(bundlePath());
        return st.isFile();
    }
    catch {
        return false;
    }
}
export async function getLandmarkContentBundle() {
    const raw = await readFile(bundlePath(), 'utf8');
    return JSON.parse(raw);
}
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
function extFromName(orig) {
    const e = path.extname(orig).toLowerCase();
    if (ALLOWED_EXT.has(e))
        return e;
    return '.jpg';
}
function mergeIncomingOverDiskCatalog(disk, incoming) {
    if (!disk || typeof disk !== 'object')
        return incoming;
    const next = {
        ...incoming,
        regions: { ...(incoming.regions && typeof incoming.regions === 'object' ? incoming.regions : {}) },
        homeCountryOrder: Array.isArray(incoming.homeCountryOrder) ? [...incoming.homeCountryOrder] : [],
        homeRegionIdsByCountry: {
            ...(incoming.homeRegionIdsByCountry && typeof incoming.homeRegionIdsByCountry === 'object'
                ? incoming.homeRegionIdsByCountry
                : {}),
        },
        homeCountryHeroRefs: {
            ...(disk.homeCountryHeroRefs && typeof disk.homeCountryHeroRefs === 'object'
                ? disk.homeCountryHeroRefs
                : {}),
            ...(incoming.homeCountryHeroRefs && typeof incoming.homeCountryHeroRefs === 'object'
                ? incoming.homeCountryHeroRefs
                : {}),
        },
        homeCountryHeroUris: {
            ...(disk.homeCountryHeroUris && typeof disk.homeCountryHeroUris === 'object'
                ? disk.homeCountryHeroUris
                : {}),
            ...(incoming.homeCountryHeroUris && typeof incoming.homeCountryHeroUris === 'object'
                ? incoming.homeCountryHeroUris
                : {}),
        },
    };
    const seenCountries = new Set(next.homeCountryOrder.map((x) => String(x || '').trim().toUpperCase()).filter(Boolean));
    for (const raw of Array.isArray(disk.homeCountryOrder) ? disk.homeCountryOrder : []) {
        const cid = String(raw || '').trim().toUpperCase();
        if (!cid || seenCountries.has(cid))
            continue;
        seenCountries.add(cid);
        next.homeCountryOrder.push(cid);
    }
    const diskMap = disk.homeRegionIdsByCountry && typeof disk.homeRegionIdsByCountry === 'object'
        ? disk.homeRegionIdsByCountry
        : {};
    for (const [cidRaw, arr] of Object.entries(diskMap)) {
        const cid = String(cidRaw || '').trim().toUpperCase();
        if (!cid)
            continue;
        if (!Array.isArray(next.homeRegionIdsByCountry[cid]))
            next.homeRegionIdsByCountry[cid] = [];
        const seen = new Set(next.homeRegionIdsByCountry[cid].map(String));
        for (const rid of Array.isArray(arr) ? arr : []) {
            const id = String(rid || '').trim();
            if (!id || seen.has(id))
                continue;
            seen.add(id);
            next.homeRegionIdsByCountry[cid].push(id);
        }
    }
    const diskRegions = disk.regions && typeof disk.regions === 'object' ? disk.regions : {};
    for (const [rid, src] of Object.entries(diskRegions)) {
        if (next.regions[rid])
            continue; // incoming wins for overlapping cities
        next.regions[rid] = src;
    }
    return next;
}
export async function saveLandmarkContentBundle(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new HttpError(400, 'invalid_body');
    }
    let disk = null;
    try {
        if (await hasLandmarkContentBundle()) {
            const existing = await getLandmarkContentBundle();
            if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
                disk = existing;
            }
        }
    }
    catch {
        disk = null;
    }
    const merged = mergeIncomingOverDiskCatalog(disk, data);
    const deduped = dedupeCityRegionsInBundle(merged);
    const payload = {
        ...deduped,
        _meta: {
            ...(deduped._meta && typeof deduped._meta === 'object' ? deduped._meta : {}),
            publishedAt: new Date().toISOString(),
            version: randomBytes(8).toString('hex'),
        },
    };
    const s = JSON.stringify(payload);
    if (Buffer.byteLength(s, 'utf8') > config.maxLandmarkBundleJsonBytes) {
        throw new HttpError(413, 'bundle_too_large');
    }
    await ensureLandmarkContentDirs();
    await writeFile(bundlePath(), s, 'utf8');
    return payload;
}
export async function getLandmarkContentBundleMeta() {
    try {
        const st = await stat(bundlePath());
        if (!st.isFile())
            return null;
        let version = `${st.size}:${Math.trunc(st.mtimeMs)}`;
        try {
            const raw = await readFile(bundlePath(), 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed?._meta?.version)
                version = String(parsed._meta.version);
        }
        catch {
            /* use size:mtime fallback */
        }
        return {
            version,
            size: st.size,
            mtimeMs: st.mtimeMs,
            publishedAt: new Date(st.mtimeMs).toISOString(),
        };
    }
    catch {
        return null;
    }
}
export async function saveLandmarkMedia(buffer, origName) {
    if (buffer.length > config.maxLandmarkMediaBytes) {
        throw new HttpError(413, 'file_too_large');
    }
    if (buffer.length < 8) {
        throw new HttpError(400, 'empty_file');
    }
    const ext = extFromName(origName);
    const name = `${Date.now()}_${randomBytes(5).toString('hex')}${ext}`;
    const key = `${MEDIA_PREFIX}/${name}`;
    const mime = ext === '.gif' ? 'image/gif' : `image/${ext.replace('.', '')}`;
    const url = await getStorageProvider().upload(key, buffer, mime);
    return { fileName: name, url };
}
export async function listLandmarkMedia() {
    const keys = await getStorageProvider().list(MEDIA_PREFIX);
    const out = [];
    for (const key of keys) {
        const name = path.basename(key);
        const base = getStorageProvider().type === 'local'
            ? `${config.publicBaseUrl.replace(/\/$/, '')}/static/`
            : config.s3PublicBaseUrl.replace(/\/$/, '') + '/';
        out.push({
            fileName: name,
            url: `${base}${key}`,
            size: 0,
            mtimeMs: 0,
        });
    }
    return out;
}
export async function removeLandmarkMedia(url) {
    if (url && typeof url === 'string') {
        await getStorageProvider().delete(url).catch(() => { });
    }
}
//# sourceMappingURL=landmarkContentAdminService.js.map