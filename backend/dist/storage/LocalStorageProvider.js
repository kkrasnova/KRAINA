import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';
/**
 * LocalStorageProvider — writes files to config.uploadDir on the local
 * filesystem. URLs are generated as `${publicBaseUrl}/static/${key}`.
 *
 * This is the **legacy** provider. New deployments should use
 * S3StorageProvider for durability across deploys and multi-pod setups.
 */
export class LocalStorageProvider {
    type = 'local';
    async upload(key, buffer, _mime) {
        const { mkdir, writeFile } = await import('node:fs/promises');
        const dest = path.join(config.uploadDir, key);
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, buffer);
        // Normalise path separators so URLs use forward slashes on all platforms.
        const urlKey = key.replace(/\\/g, '/');
        const base = config.publicBaseUrl.replace(/\/$/, '');
        return `${base}/static/${urlKey}`;
    }
    async delete(url) {
        const base = `${config.publicBaseUrl.replace(/\/$/, '')}/static/`;
        if (!url.startsWith(base)) {
            logger.warn('[localStorage] cannot delete — URL does not match static base', {
                url,
                expectedBase: base,
            });
            return;
        }
        const rel = url.slice(base.length);
        // Basic path traversal guard
        if (!rel || rel.includes('..') || rel.includes('\\')) {
            logger.warn('[localStorage] refusing to delete — unsafe path', { rel });
            return;
        }
        const full = path.join(config.uploadDir, rel);
        await unlink(full).catch((e) => {
            logger.warn('[localStorage] unlink failed', {
                path: full,
                error: e instanceof Error ? e.message : String(e),
            });
        });
    }
    async list(prefix) {
        const dir = path.join(config.uploadDir, prefix);
        try {
            const entries = await readdir(dir);
            const out = [];
            for (const name of entries) {
                if (name.startsWith('.'))
                    continue;
                const fp = path.join(dir, name);
                const st = await stat(fp);
                if (st.isFile()) {
                    out.push(`${prefix}/${name}`.replace(/\\/g, '/'));
                }
            }
            return out;
        }
        catch {
            return [];
        }
    }
}
//# sourceMappingURL=LocalStorageProvider.js.map