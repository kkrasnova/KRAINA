import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { HttpError } from '../errors/HttpError.js';
import { getStorageProvider } from '../storage/index.js';
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