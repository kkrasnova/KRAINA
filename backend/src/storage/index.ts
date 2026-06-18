import { config } from '../config.js';
import { logger } from '../logger.js';
import type { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { S3StorageProvider } from './S3StorageProvider.js';

/**
 * The singleton provider instance used by all upload paths.
 * Initialised once at startup via `initStorageProvider()`.
 */
let provider: StorageProvider | null = null;

/**
 * Must be called once during app startup (from `index.ts`) before any
 * upload endpoint is hit.
 */
export function initStorageProvider(): StorageProvider {
  if (provider) return provider;

  const kind = config.storageProvider;

  switch (kind) {
    case 's3': {
      const s3 = new S3StorageProvider();
      logger.info('[storage] using S3StorageProvider', {
        bucket: config.s3Bucket,
        region: config.s3Region,
        endpoint: config.s3Endpoint || '(AWS default)',
        publicBaseUrl: config.s3PublicBaseUrl,
      });
      provider = s3;
      break;
    }
    case 'local':
    default: {
      logger.info('[storage] using LocalStorageProvider', {
        uploadDir: config.uploadDir,
      });
      provider = new LocalStorageProvider();
      break;
    }
  }

  return provider;
}

/**
 * Returns the active provider. Throws if `initStorageProvider()` has not
 * been called yet.
 */
export function getStorageProvider(): StorageProvider {
  if (!provider) {
    throw new Error(
      'StorageProvider not initialised. Call initStorageProvider() during startup.',
    );
  }
  return provider;
}

/**
 * Cleanup — close S3 client connections, etc.
 * Called during graceful shutdown.
 */
export async function destroyStorageProvider(): Promise<void> {
  if (provider instanceof S3StorageProvider) {
    await provider.destroy();
  }
  provider = null;
}
