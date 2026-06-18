/**
 * StorageProvider — common interface for file storage.
 *
 * Two implementations exist:
 *   - LocalStorageProvider  (STORAGE_PROVIDER=local, default)
 *   - S3StorageProvider     (STORAGE_PROVIDER=s3)
 *
 * The active provider is selected at startup in `factory.ts` based on the
 * STORAGE_PROVIDER environment variable. All file-upload paths go through
 * this interface so that switching between local disk and S3 is transparent
 * to the rest of the application.
 *
 * Existing URLs stored in the database continue to work after migration
 * (local URLs stay local; new uploads go to S3). Only new writes are
 * affected.
 */

export interface StorageProvider {
  /** Human-readable provider type — used for logging / debugging. */
  readonly type: 'local' | 's3';

  /**
   * Upload a file and return its **public** URL.
   *
   * @param key  — Virtual path inside the store, e.g. `avatars/abc.jpg`,
   *              `feed/def.mp4`, `landmark-content/media/ghi.png`.
   *              The provider is responsible for ensuring the parent
   *              "directory" exists (local mkdir / S3 no-op).
   * @param buffer — Raw file bytes.
   * @param mime   — MIME type (e.g. `image/jpeg`, `video/mp4`).
   */
  upload(key: string, buffer: Buffer, mime: string): Promise<string>;

  /**
   * Delete a file by its public URL.
   *
   * Used by `clearAvatar` and the landmark-media delete endpoint.
   * Implementations strip the public base URL to recover the key.
   */
  delete(url: string): Promise<void>;

  /**
   * List all stored keys under a prefix.
   *
   * Used by the landmark CMS admin to browse uploaded media.
   * LocalStorageProvider reads the filesystem; S3StorageProvider uses
   * ListObjectsV2. Returns an empty array when listing is unavailable.
   */
  list(prefix: string): Promise<string[]>;
}
