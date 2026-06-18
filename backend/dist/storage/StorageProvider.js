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
export {};
//# sourceMappingURL=StorageProvider.js.map