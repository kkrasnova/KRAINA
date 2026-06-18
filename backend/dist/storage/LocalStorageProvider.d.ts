import type { StorageProvider } from './StorageProvider.js';
/**
 * LocalStorageProvider — writes files to config.uploadDir on the local
 * filesystem. URLs are generated as `${publicBaseUrl}/static/${key}`.
 *
 * This is the **legacy** provider. New deployments should use
 * S3StorageProvider for durability across deploys and multi-pod setups.
 */
export declare class LocalStorageProvider implements StorageProvider {
    readonly type: "local";
    upload(key: string, buffer: Buffer, _mime: string): Promise<string>;
    delete(url: string): Promise<void>;
    list(prefix: string): Promise<string[]>;
}
//# sourceMappingURL=LocalStorageProvider.d.ts.map