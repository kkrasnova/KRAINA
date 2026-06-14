import { randomBytes } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { HttpError } from '../errors/HttpError.js';
const SUB = 'landmark-content';
const BUNDLE_FILE = 'landmark_bundle.json';
const MEDIA = 'media';
function rootDir() {
    return path.join(config.uploadDir, SUB);
}
function bundlePath() {
    return path.join(rootDir(), BUNDLE_FILE);
}
function mediaPath() {
    return path.join(rootDir(), MEDIA);
}
export async function ensureLandmarkContentDirs() {
    await mkdir(rootDir(), { recursive: true });
    await mkdir(mediaPath(), { recursive: true });
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
export async function saveLandmarkContentBundle(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new HttpError(400, 'invalid_body');
    }
    const s = JSON.stringify(data);
    if (Buffer.byteLength(s, 'utf8') > config.maxLandmarkBundleJsonBytes) {
        throw new HttpError(413, 'bundle_too_large');
    }
    await ensureLandmarkContentDirs();
    await writeFile(bundlePath(), s, 'utf8');
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
    await ensureLandmarkContentDirs();
    const fp = path.join(mediaPath(), name);
    await writeFile(fp, buffer);
    const rel = `static/${SUB}/${MEDIA}/${name}`.replace(/\\/g, '/');
    const base = config.publicBaseUrl.replace(/\/$/, '');
    return { fileName: name, url: `${base}/${rel}` };
}
export async function listLandmarkMedia() {
    await ensureLandmarkContentDirs();
    const names = await readdir(mediaPath());
    const out = [];
    const base = config.publicBaseUrl.replace(/\/$/, '');
    for (const f of names) {
        if (f.startsWith('.'))
            continue;
        const fp = path.join(mediaPath(), f);
        const st = await stat(fp);
        if (!st.isFile())
            continue;
        out.push({
            fileName: f,
            url: `${base}/static/${SUB}/${MEDIA}/${f}`,
            size: st.size,
            mtimeMs: st.mtimeMs,
        });
    }
    out.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return out;
}
export async function removeLandmarkMedia(fileName) {
    const base = path.basename(String(fileName || ''));
    if (base !== fileName || !base) {
        throw new HttpError(400, 'invalid_name');
    }
    const fp = path.join(mediaPath(), base);
    try {
        await unlink(fp);
    }
    catch {
        throw new HttpError(404, 'not_found');
    }
}
//# sourceMappingURL=landmarkContentAdminService.js.map