import type { StorageProvider } from './StorageProvider.js';
/**
 * S3StorageProvider — uploads files to an S3-compatible bucket.
 *
 * Works with:
 *   - AWS S3          (S3_ENDPOINT left empty)
 *   - Supabase Storage (S3_ENDPOINT = https://<project>.supabase.co/storage/v1/s3)
 *   - DigitalOcean Spaces / MinIO / any S3-compatible API
 *
 * URL format:  `${S3_PUBLIC_BASE_URL}/${key}`
 * (S3_PUBLIC_BASE_URL should point to a CDN or the bucket's public endpoint)
 */
export declare class S3StorageProvider implements StorageProvider {
    readonly type: "s3";
    private readonly client;
    private readonly bucket;
    private readonly publicBaseUrl;
    constructor();
    upload(key: string, buffer: Buffer, mime: string): Promise<string>;
    delete(url: string): Promise<void>;
    list(prefix: string): Promise<string[]>;
    /**
     * Clean up the underlying S3 client connection.
     * Call during graceful shutdown if needed.
     */
    destroy(): Promise<void>;
}
//# sourceMappingURL=S3StorageProvider.d.ts.map