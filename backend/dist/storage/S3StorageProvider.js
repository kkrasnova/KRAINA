import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, } from '@aws-sdk/client-s3';
import { config } from '../config.js';
import { logger } from '../logger.js';
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
export class S3StorageProvider {
    type = 's3';
    client;
    bucket;
    publicBaseUrl;
    constructor() {
        const region = config.s3Region;
        const endpoint = config.s3Endpoint;
        const opts = {
            region,
            credentials: {
                accessKeyId: config.s3AccessKeyId,
                secretAccessKey: config.s3SecretAccessKey,
            },
        };
        // Custom endpoint for S3-compatible services (Supabase, DO Spaces, MinIO…)
        if (endpoint) {
            opts.endpoint = endpoint;
            // S3-compatible services often require path-style addressing and
            // may not support virtual-hosted-style URLs.
            opts.forcePathStyle = true;
        }
        this.client = new S3Client(opts);
        this.bucket = config.s3Bucket;
        this.publicBaseUrl = config.s3PublicBaseUrl.replace(/\/$/, '');
    }
    async upload(key, buffer, mime) {
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: buffer,
            ContentType: mime,
            // 1-year browser cache — the CDN or S3 public URL is the source of truth
            CacheControl: 'public, max-age=31536000, immutable',
        });
        try {
            await this.client.send(command);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.error('[s3Storage] upload failed', { key, bucket: this.bucket, error: msg });
            throw new Error(`S3 upload failed for ${key}: ${msg}`);
        }
        return `${this.publicBaseUrl}/${key}`;
    }
    async delete(url) {
        const prefix = `${this.publicBaseUrl}/`;
        if (!url.startsWith(prefix)) {
            logger.warn('[s3Storage] cannot delete — URL does not match public base', {
                url,
                expectedBase: prefix,
            });
            return;
        }
        const key = url.slice(prefix.length);
        if (!key || key.includes('..')) {
            logger.warn('[s3Storage] refusing to delete — unsafe key', { key });
            return;
        }
        try {
            await this.client.send(new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key,
            }));
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.warn('[s3Storage] delete failed', { key, bucket: this.bucket, error: msg });
        }
    }
    async list(prefix) {
        try {
            const cmd = new ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: prefix.endsWith('/') ? prefix : `${prefix}/`,
            });
            const resp = await this.client.send(cmd);
            return (resp.Contents ?? [])
                .map((o) => o.Key ?? '')
                .filter(Boolean);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.warn('[s3Storage] list failed', { prefix, bucket: this.bucket, error: msg });
            return [];
        }
    }
    /**
     * Clean up the underlying S3 client connection.
     * Call during graceful shutdown if needed.
     */
    async destroy() {
        this.client.destroy();
    }
}
//# sourceMappingURL=S3StorageProvider.js.map