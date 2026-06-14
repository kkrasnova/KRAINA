export type LandmarkFirestoreWrite = {
    docId: string;
    data: Record<string, unknown>;
};
export type PublishResult = {
    status: 'published';
    written: number;
} | {
    status: 'empty';
} | {
    status: 'skipped';
    reason: 'no_admin' | 'init_failed' | 'skip_flag';
} | {
    status: 'error';
    message: string;
};
export declare function bundleSnapshotToFirestoreWrites(snapshot: unknown): LandmarkFirestoreWrite[];
export declare function publishLandmarkBundleToFirestore(snapshot: unknown): Promise<PublishResult>;
//# sourceMappingURL=landmarkContentFirestorePublisher.d.ts.map