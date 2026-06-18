import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { StorageProvider } from './StorageProvider.js';

/**
 * LocalStorageProvider — writes files to config.uploadDir on the local
 * filesystem. URLs are generated as `${publicBaseUrl}/static/${key}`.
 *
 * This is the **legacy** provider. New deployments should use
 * S3StorageProvider for durability across deploys and multi-pod setups.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly type = 'local' as const;

  async upload(key: string, buffer: Buffer, _mime: string): Promise<string> {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const dest = path.join(config.uploadDir, key);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, buffer);
    // Normalise path separators so URLs use forward slashes on all platforms.
    const urlKey = key.replace(/\\/g, '/');
    const base = config.publicBaseUrl.replace(/\/$/, '');
    return `${base}/static/${urlKey}`;
  }

  async delete(url: string): Promise<void> {
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
    await unlink(full).catch((e: unknown) => {
      logger.warn('[localStorage] unlink failed', {
        path: full,
        error: e instanceof Error ? e.message : String(e),
      });
    });
  }

  async list(prefix: string): Promise<string[]> {
    const dir = path.join(config.uploadDir, prefix);
    try {
      const entries = await readdir(dir);
      const out: string[] = [];
      for (const name of entries) {
        if (name.startsWith('.')) continue;
        const fp = path.join(dir, name);
        const st = await stat(fp);
        if (st.isFile()) {
          out.push(`${prefix}/${name}`.replace(/\\/g, '/'));
        }
      }
      return out;
    } catch {
      return [];
    }
  }
}
