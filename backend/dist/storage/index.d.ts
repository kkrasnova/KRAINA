import type { StorageProvider } from './StorageProvider.js';
/**
 * Must be called once during app startup (from `index.ts`) before any
 * upload endpoint is hit.
 */
export declare function initStorageProvider(): StorageProvider;
/**
 * Returns the active provider. Throws if `initStorageProvider()` has not
 * been called yet.
 */
export declare function getStorageProvider(): StorageProvider;
/**
 * Cleanup — close S3 client connections, etc.
 * Called during graceful shutdown.
 */
export declare function destroyStorageProvider(): Promise<void>;
//# sourceMappingURL=index.d.ts.map